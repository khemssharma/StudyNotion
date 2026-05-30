/**
 * config/redis.js — Redis client for StudyNotion
 *
 * Uses the official `redis` v4 package (node-redis).
 * Exposes a singleton client that connects once on startup.
 *
 * Usage:
 *   const { redisClient, connectRedis } = require('./config/redis');
 *   await connectRedis();          // call once in index.js
 *   await redisClient.set('key', 'value', { EX: 60 });
 *   const val = await redisClient.get('key');
 */

const { createClient } = require('redis');

let redisClient;

/**
 * Build the Redis client from environment variables.
 * Falls back to a TLS-enabled URL if REDIS_URL is set (Render / Railway style),
 * otherwise uses individual host/port/password vars.
 */
function buildClient() {
  if (process.env.REDIS_URL) {
    // Render injects REDIS_URL automatically when you attach a Redis instance
    return createClient({ url: process.env.REDIS_URL });
  }

  return createClient({
    username: process.env.REDIS_USERNAME || 'default',
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT) || 6379,
      tls: process.env.REDIS_TLS === 'true',
    },
  });
}

/**
 * connectRedis()
 * Initialises the singleton and connects.  Safe to await in index.js.
 * In test environments (NODE_ENV=test) the connection is skipped so unit
 * tests don't need a live Redis instance.
 */
async function connectRedis() {
  if (process.env.NODE_ENV === 'test') return;

  redisClient = buildClient();

  redisClient.on('error', (err) =>
    console.error('[Redis] Client error:', err.message)
  );

  redisClient.on('reconnecting', () =>
    console.warn('[Redis] Reconnecting…')
  );

  await redisClient.connect();
  console.log('[Redis] Connected successfully');
}

/**
 * getRedisClient()
 * Returns the active client.  Throws if connectRedis() was never called.
 */
function getRedisClient() {
  if (!redisClient) {
    throw new Error(
      '[Redis] Client not initialised. Call connectRedis() first.'
    );
  }
  return redisClient;
}

module.exports = { connectRedis, getRedisClient };
