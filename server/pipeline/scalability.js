/**
 * scalability.js — Middleware stack for 10 000+ requests/day scalability
 *
 * What this file adds
 * ───────────────────
 * 1. Response compression    — reduces bandwidth by ~70 % for JSON/HTML
 * 2. Security headers        — helmet (XSS, clickjacking, MIME-sniffing)
 * 3. Request rate-limiting   — Redis-backed (rate-limit-redis) for multi-instance safety
 *    • Global:      500 req / 15 min per IP
 *    • Auth routes:  20 req / 15 min per IP  (brute-force protection)
 *    • AI routes:    30 req / 15 min per IP  (LLM cost protection)
 * 4. Request timeout         — kills hanging requests after 30 s
 * 5. Payload size guard      — reject bodies > 10 MB
 * 6. Cache-Control helpers   — short-TTL caching for public catalogue APIs
 * 7. MongoDB connection pool — bumped to 20 concurrent sockets
 * 8. Graceful shutdown       — drains connections before process exits
 *
 * Redis rate-limit store
 * ──────────────────────
 * Uses `rate-limit-redis` with the shared Redis client from config/redis.js.
 * This means rate-limit counters are shared across all Node.js processes /
 * Render instances, preventing users from bypassing limits by hitting
 * a different dyno.  Falls back to in-memory store when Redis is unavailable.
 */

const rateLimit  = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const compression = require('compression');
const helmet     = require('helmet');

// Lazy-load Redis client so this module can be required before connectRedis()
function getStore(prefix) {
  try {
    const { getRedisClient } = require('../config/redis');
    const client = getRedisClient();
    return new RedisStore({
      sendCommand: (...args) => client.sendCommand(args),
      prefix: `sn:rl:${prefix}:`,
    });
  } catch {
    // Redis not ready yet (test env or cold start) — use in-memory fallback
    return undefined;
  }
}

// ── 1. Compression ──────────────────────────────────────────────────

const compressionMiddleware = compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
});

// ── 2. Security headers ─────────────────────────────────────────────

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:', 'https://res.cloudinary.com'],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'https://api.openrouter.ai'],
      frameSrc:   ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// ── 3. Rate Limiters (Redis-backed) ──────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore('global'),
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore('auth'),
  message: { success: false, message: 'Too many auth attempts. Please wait 15 minutes.' },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore('ai'),
  message: { success: false, message: 'AI rate limit reached. Please try again in 15 minutes.' },
});

// ── 4. Request timeout ───────────────────────────────────────────────

const timeoutMiddleware = (req, res, next) => {
  const TIMEOUT_MS = 30_000;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ success: false, message: 'Request timeout. Please retry.' });
    }
  }, TIMEOUT_MS);
  res.on('finish', () => clearTimeout(timer));
  res.on('close',  () => clearTimeout(timer));
  next();
};

// ── 5. Payload size guard ─────────────────────────────────────────────

const JSON_BODY_LIMIT = '10mb';

// ── 6. Cache-Control helper ────────────────────────────────────────────

const setPublicCache = (seconds = 60) => (req, res, next) => {
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
  next();
};

const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

// ── 7. MongoDB pool config ─────────────────────────────────────────────

const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
};

// ── 8. Graceful shutdown ──────────────────────────────────────────────

const { shutdown: pipelineShutdown } = require('./eventIngestion');
const mongoose = require('mongoose');

function registerGracefulShutdown(server) {
  const doShutdown = async (signal) => {
    console.log(`[Shutdown] Received ${signal}. Draining connections…`);

    // Also disconnect Redis gracefully
    let redisClient;
    try {
      const { getRedisClient } = require('../config/redis');
      redisClient = getRedisClient();
    } catch { /* Redis not initialised */ }

    server.close(async () => {
      await pipelineShutdown();
      await mongoose.connection.close();
      if (redisClient) {
        await redisClient.quit();
        console.log('[Shutdown] Redis disconnected.');
      }
      console.log('[Shutdown] Clean exit.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout.');
      process.exit(1);
    }, 15_000);
  };

  process.on('SIGTERM', () => doShutdown('SIGTERM'));
  process.on('SIGINT',  () => doShutdown('SIGINT'));
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
