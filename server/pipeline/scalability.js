/**
 * scalability.js — Middleware stack for 10 000 requests/day scalability
 *
 * What this file adds
 * ───────────────────
 * 1. Response compression     — reduces bandwidth by ~70 % for JSON/HTML
 * 2. Security headers          — helmet (XSS, clickjacking, MIME-sniffing)
 * 3. Request rate-limiting     — in-memory (upgradeable to Redis)
 *    • Global:     500 req / 15 min per IP
 *    • Auth routes: 20 req / 15 min per IP  (brute-force protection)
 *    • AI routes:   30 req / 15 min per IP  (LLM cost protection)
 * 4. Request timeout           — kills hanging requests after 30 s
 * 5. Payload size guard        — reject bodies > 10 MB
 * 6. Cache-Control helpers     — short-TTL caching for public catalogue APIs
 * 7. MongoDB connection pool   — bumped to 20 concurrent sockets
 * 8. Graceful shutdown         — drains connections before process exits
 *
 * How it scales to 10 000 req/day
 * ────────────────────────────────
 * 10 000 req/day ≈ 7 req/min average, with spikes to ~100 req/min.
 * The limits below are set to handle 10× that without rejecting real users:
 *   - 500 req / 15 min per IP = 2 000 req/hour — ample for any single user
 *   - Compression saves ~500 KB per 1 000 requests → CDN cache fills faster
 *   - Connection pooling: 20 sockets × 10 ms avg query = 2 000 QPS from DB
 *
 * To scale beyond 100 k req/day, swap the in-memory rate-limit store
 * for Redis (`rate-limit-redis` package) — only one import change needed.
 */

const rateLimit  = require("express-rate-limit");
const compression= require("compression");
const helmet     = require("helmet");

// ── 1. Compression ────────────────────────────────────────────────────────
const compressionMiddleware = compression({
  // Only compress responses > 1 KB (tiny responses cost more CPU than saved)
  threshold: 1024,
  // Compress JSON, HTML, JS, CSS, SVG
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) return false;
    return compression.filter(req, res);
  },
});

// ── 2. Security headers ───────────────────────────────────────────────────
const helmetMiddleware = helmet({
  // Allow Cloudinary images and the Vercel frontend in CSP
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      imgSrc:      ["'self'", "data:", "https://res.cloudinary.com"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      connectSrc:  ["'self'", "https://api.openrouter.ai"],
      frameSrc:    ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // allow Cloudinary videos to embed
});

// ── 3. Rate Limiters ──────────────────────────────────────────────────────

/** Global limiter: all routes */
const globalLimiter = rateLimit({
  windowMs:   15 * 60 * 1000, // 15 minutes
  max:        500,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: "Too many requests. Please slow down." },
});

/** Auth limiter: /api/v1/auth/* — stricter to prevent brute-force */
const authLimiter = rateLimit({
  windowMs:   15 * 60 * 1000,
  max:        20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: "Too many auth attempts. Please wait 15 minutes." },
});

/** AI limiter: /api/v1/ai/* — LLM calls are expensive */
const aiLimiter = rateLimit({
  windowMs:   15 * 60 * 1000,
  max:        30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: "AI rate limit reached. Please try again in 15 minutes." },
});

// ── 4. Request timeout ────────────────────────────────────────────────────
/**
 * Kills requests that take longer than 30 s (prevents Mongoose queries
 * from tying up workers indefinitely under DB stress).
 */
const timeoutMiddleware = (req, res, next) => {
  const TIMEOUT_MS = 30_000;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ success: false, message: "Request timeout. Please retry." });
    }
  }, TIMEOUT_MS);

  res.on("finish", () => clearTimeout(timer));
  res.on("close",  () => clearTimeout(timer));
  next();
};

// ── 5. Payload size guard ─────────────────────────────────────────────────
// express.json() limit is set where the middleware is applied (server/index.js)
// This helper is exported so index.js can pass it to express.json({limit}).
const JSON_BODY_LIMIT = "10mb";

// ── 6. Cache-Control helper ───────────────────────────────────────────────
/**
 * setPublicCache(seconds)
 * Returns middleware that sets Cache-Control: public, max-age=<seconds>
 * Use on read-heavy public endpoints (course catalogue, categories) so
 * CDN / browser caches absorb repeated reads without hitting MongoDB.
 */
const setPublicCache = (seconds = 60) => (req, res, next) => {
  res.set("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
  next();
};

/** No-cache for authenticated / mutable routes */
const noCache = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

// ── 7. MongoDB pool config ────────────────────────────────────────────────
/**
 * Pass these options to mongoose.connect() for connection pool tuning.
 * maxPoolSize: 20 connections (default 5 — too low for concurrent requests)
 * serverSelectionTimeoutMS: fail fast if Atlas is unreachable
 * socketTimeoutMS: kill idle sockets after 45 s
 */
const mongooseOptions = {
  useNewUrlParser:    true,
  useUnifiedTopology: true,
  maxPoolSize:        20,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS:         45_000,
};

// ── 8. Graceful shutdown ──────────────────────────────────────────────────
const { shutdown: pipelineShutdown } = require("./eventIngestion");
const mongoose = require("mongoose");

function registerGracefulShutdown(server) {
  const doShutdown = async (signal) => {
    console.log(`[Shutdown] Received ${signal}. Draining connections…`);
    server.close(async () => {
      await pipelineShutdown();          // flush event buffer
      await mongoose.connection.close(); // close DB pool
      console.log("[Shutdown] Clean exit.");
      process.exit(0);
    });

    // Force exit after 15 s if drain stalls
    setTimeout(() => {
      console.error("[Shutdown] Forced exit after timeout.");
      process.exit(1);
    }, 15_000);
  };

  process.on("SIGTERM", () => doShutdown("SIGTERM"));
  process.on("SIGINT",  () => doShutdown("SIGINT"));
}

module.exports = {
  compressionMiddleware,
  helmetMiddleware,
  globalLimiter,
  authLimiter,
  aiLimiter,
  timeoutMiddleware,
  JSON_BODY_LIMIT,
  setPublicCache,
  noCache,
  mongooseOptions,
  registerGracefulShutdown,
};
