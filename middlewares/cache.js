/**
 * middlewares/cache.js — Redis-powered HTTP response caching for StudyNotion
 *
 * Provides three exported helpers:
 *
 *  1. cacheMiddleware(ttlSeconds)  — caches full JSON responses in Redis.
 *     Use on read-heavy, public GET endpoints (course catalogue, categories).
 *
 *  2. invalidateCache(...patterns) — call inside write handlers to bust
 *     matching cached keys (glob patterns supported).
 *
 *  3. cacheOtp(email, otp, ttl)   — stores OTP in Redis instead of MongoDB,
 *     giving automatic expiry and removing the need for a separate OTP model.
 *
 *  4. verifyOtp(email, otp)        — verifies and deletes the stored OTP.
 *
 * Design goals
 * ────────────
 *  - Graceful degradation: if Redis is unavailable, requests pass through
 *    without error so the app keeps working (just without caching).
 *  - Key namespacing: all keys are prefixed with `sn:` to avoid collisions.
 *  - No stale data: cache is skipped for authenticated requests (Authorization
 *    header present) so private data is never accidentally cached.
 */

const { getRedisClient } = require('../config/redis');

const KEY_PREFIX = 'sn:';

// ── Helpers ───────────────────────────────────────────────────────────────

function buildKey(req) {
  // Key = prefix + HTTP method + full URL (path + query string)
  return `${KEY_PREFIX}${req.method}:${req.originalUrl}`;
}

function safeClient() {
  try {
    return getRedisClient();
  } catch {
    return null; // Redis not yet initialised (test env or startup)
  }
}

// ── 1. Response cache middleware ──────────────────────────────────────────

/**
 * cacheMiddleware(ttlSeconds = 60)
 *
 * Intercepts GET responses and stores the JSON body in Redis.
 * Subsequent identical requests are served from Redis, bypassing Express
 * routing and Mongoose queries entirely.
 *
 * Skips caching when:
 *   - Request carries an Authorization header (private / user-specific data)
 *   - Redis client is unavailable
 *   - Response status is not 2xx
 */
function cacheMiddleware(ttlSeconds = 60) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    // Skip for authenticated requests to avoid leaking private data
    if (req.headers.authorization) return next();

    const client = safeClient();
    if (!client) return next();

    const key = buildKey(req);

    try {
      const cached = await client.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).send(cached);
      }
    } catch (err) {
      console.error('[Cache] Redis GET error:', err.message);
      return next(); // degrade gracefully
    }

    // Intercept res.json to store the response in Redis
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          await client.set(key, JSON.stringify(body), { EX: ttlSeconds });
        } catch (err) {
          console.error('[Cache] Redis SET error:', err.message);
        }
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

// ── 2. Cache invalidation ─────────────────────────────────────────────────

/**
 * invalidateCache(...patterns)
 *
 * Deletes all Redis keys matching any of the provided glob patterns.
 * Call this inside POST / PUT / DELETE handlers after writing to MongoDB.
 *
 * Example:
 *   await invalidateCache('sn:GET:/api/v1/course*');
 */
async function invalidateCache(...patterns) {
  const client = safeClient();
  if (!client) return;

  for (const pattern of patterns) {
    try {
      const keys = await client.keys(pattern);
      if (keys.length) {
        await client.del(keys);
        console.log(`[Cache] Invalidated ${keys.length} key(s) for pattern: ${pattern}`);
      }
    } catch (err) {
      console.error('[Cache] Invalidation error:', err.message);
    }
  }
}

// ── 3. OTP helpers ────────────────────────────────────────────────────────

const OTP_TTL = 5 * 60; // 5 minutes

/**
 * cacheOtp(email, otp, ttlSeconds?)
 * Stores the OTP in Redis with automatic expiry.
 * Replaces the MongoDB OTP document approach.
 */
async function cacheOtp(email, otp, ttlSeconds = OTP_TTL) {
  const client = safeClient();
  if (!client) return false;

  const key = `${KEY_PREFIX}otp:${email}`;
  try {
    await client.set(key, String(otp), { EX: ttlSeconds });
    return true;
  } catch (err) {
    console.error('[Cache] OTP SET error:', err.message);
    return false;
  }
}

/**
 * verifyOtp(email, otp)
 * Returns true if the stored OTP matches, and deletes it immediately
 * (one-time use).  Returns false if expired or not found.
 */
async function verifyOtp(email, otp) {
  const client = safeClient();
  if (!client) return false;

  const key = `${KEY_PREFIX}otp:${email}`;
  try {
    const stored = await client.get(key);
    if (!stored) return false;
    if (String(stored) !== String(otp)) return false;
    await client.del(key); // consume the OTP
    return true;
  } catch (err) {
    console.error('[Cache] OTP verify error:', err.message);
    return false;
  }
}

module.exports = { cacheMiddleware, invalidateCache, cacheOtp, verifyOtp };
