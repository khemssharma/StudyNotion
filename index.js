/**
 * server/index.js — StudyNotion Express Server
 *
 * Added in this revision
 * ──────────────────────
 * • Data Engineering Pipeline  (/api/v1/pipeline)
 * • Scalability middleware stack (compression, helmet, rate-limiting, timeouts)
 * • MongoDB connection pool tuning (maxPoolSize: 20)
 * • Nightly ETL cron (node-schedule)
 * • Graceful shutdown
 * • Redis caching & OTP (config/redis.js, middlewares/cache.js)
 * • Redis-backed rate limiters (rate-limit-redis)
 */

const express        = require("express");
const path           = require("path");
const cookieParser   = require("cookie-parser");
const cors           = require("cors");
const fileUpload     = require("express-fileupload");
const dotenv         = require("dotenv");
const schedule       = require("node-schedule");

dotenv.config();

// ── Scalability middleware (compression, helmet, rate-limits, timeout) ────
const {
  compressionMiddleware,
  helmetMiddleware,
  globalLimiter,
  authLimiter,
  aiLimiter,
  timeoutMiddleware,
  JSON_BODY_LIMIT,
  setPublicCache,
  mongooseOptions,
  registerGracefulShutdown,
} = require("./pipeline/scalability");

// ── Redis integration ─────────────────────────────────────────────────
const { connectRedis }       = require("./config/redis");
const { cacheMiddleware }    = require("./middlewares/cache");

// ── Data Engineering Pipeline ────────────────────────────────────────
const pipelineRoutes          = require("./pipeline/pipelineRoutes");
const { runNightlyAggregation } = require("./pipeline/eventIngestion");

// ── Application routes ────────────────────────────────────────────────
const userRoutes      = require("./routes/User");
const profileRoutes   = require("./routes/Profile");
const paymentRoutes   = require("./routes/Payments");
const courseRoutes    = require("./routes/Course");
const contactUsRoute  = require("./routes/Contact");
const analyticsRoutes = require("./routes/Analytics");
const aiRoutes        = require("./routes/AI");

// ── Infrastructure ────────────────────────────────────────────────────
const database           = require("./config/database");
const { cloudinaryConnect } = require("./config/cloudinary");
const searchIndex        = require("./services/searchIndex");

const app  = express();
const PORT = process.env.PORT || 4000;

// ──────────────────────────────────────────────────────────────────────────
// 1. CORS
// ──────────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => callback(null, true),
  credentials: true,
};
app.use(cors(corsOptions));

// ──────────────────────────────────────────────────────────────────────────
// 2. Security & Compression (must come before routes)
// ──────────────────────────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(compressionMiddleware);

// ──────────────────────────────────────────────────────────────────────────
// 3. Body parsing & file uploads
// ──────────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
app.use(cookieParser());
app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp" }));

// ──────────────────────────────────────────────────────────────────────────
// 4. Request timeout (30 s)
// ──────────────────────────────────────────────────────────────────────────
app.use(timeoutMiddleware);

// ──────────────────────────────────────────────────────────────────────────
// 5. Global rate-limiter (500 req / 15 min per IP)
// ──────────────────────────────────────────────────────────────────────────
app.use(globalLimiter);

// ──────────────────────────────────────────────────────────────────────────
// 6. Database & Cloudinary & Redis (skip in tests)
// ──────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  // Connect MongoDB with tuned pool (maxPoolSize: 20)
  const mongoose = require("mongoose");
  mongoose
    .connect(process.env.MONGODB_URL, mongooseOptions)
    .then(async () => {
      console.log("DB Connected Successfully");
      try {
        const count = await searchIndex.rebuild();
        console.log(`[SearchIndex] Indexed ${count} published courses`);
      } catch (err) {
        console.error("[SearchIndex] Initial build failed:", err.message);
      }
    })
    .catch((err) => {
      console.error("DB Connection Failed:", err);
      process.exit(1);
    });

  cloudinaryConnect();

  // Connect Redis
  connectRedis().catch((err) => {
    console.error("[Redis] Connection failed:", err.message);
    console.warn("[Redis] Continuing without cache / rate-limit Redis store.");
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 7. Routes — with per-path rate limiters & caching where needed
// ──────────────────────────────────────────────────────────────────────────

// Auth routes get a stricter limiter (brute-force protection)
app.use("/api/v1/auth", authLimiter, userRoutes);

// AI routes get their own limiter (LLM cost protection)
app.use("/api/v1/ai", aiLimiter, aiRoutes);

// Public course catalogue routes: Cache-Control + Redis response cache (30 s TTL)
app.use(
  "/api/v1/course",
  setPublicCache(30),
  cacheMiddleware(30),
  courseRoutes
);

app.use("/api/v1/profile",   profileRoutes);
app.use("/api/v1/payment",   paymentRoutes);
app.use("/api/v1/reach",     contactUsRoute);
app.use("/api/v1/analytics", analyticsRoutes);

// ── Data Engineering Pipeline ────────────────────────────────────────
app.use("/api/v1/pipeline", pipelineRoutes);

// ──────────────────────────────────────────────────────────────────────────
// 8. Health check
// ──────────────────────────────────────────────────────────────────────────
// Moved off "/" so the root path is free to serve the React app below.
// Render's default health check accepts any 2xx response, so serving
// index.html at "/" satisfies it too — this route is for explicit pings.
app.get("/api/v1/health", (req, res) =>
  res.json({ success: true, message: "StudyNotion server is running." })
);

// ──────────────────────────────────────────────────────────────────────────
// 8b. Serve the built React app (ui/build) — single-server deployment
// ──────────────────────────────────────────────────────────────────────────
const uiBuildPath = path.join(__dirname, "ui", "build");

if (!require("fs").existsSync(path.join(uiBuildPath, "index.html"))) {
  console.warn(
    "⚠ ui/build not found — run `npm run build` (or `npm install --prefix ui && npm run build --prefix ui`) first."
  );
}

app.use(express.static(uiBuildPath));

// SPA fallback: anything not already matched above and not an /api/* route
// gets index.html so React Router can handle client-side routing. Must be
// registered LAST — after every API route — so API paths are never swallowed.
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, message: `Route '${req.path}' not found` });
  }
  res.sendFile(path.join(uiBuildPath, "index.html"));
});

// ──────────────────────────────────────────────────────────────────────────
// 9. Nightly ETL cron (runs at 01:00 UTC every day)
// ──────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  schedule.scheduleJob("0 1 * * *", async () => {
    console.log("[Cron] Starting nightly ETL aggregation…");
    try {
      const result = await runNightlyAggregation();
      console.log("[Cron] ETL complete:", result);
    } catch (err) {
      console.error("[Cron] ETL failed:", err.message);
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────
// 10. Start server & register graceful shutdown
// ──────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () =>
    console.log(`StudyNotion running on port ${PORT}`)
  );
  registerGracefulShutdown(server);
}

module.exports = app;
