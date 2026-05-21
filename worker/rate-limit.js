import { DEFAULTS } from './config.js';

const store = new Map();
let cleanupTimer = null;

function startCleanup(intervalMs) {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, intervalMs);
}

export function createRateLimiter(config) {
  const limits = {
    '/api/generate': { max: config.GENERATIONS_PER_HOUR || DEFAULTS.GENERATIONS_PER_HOUR, window: 3600 },
    '/api/validate': { max: DEFAULTS.VALIDATIONS_PER_HOUR, window: 3600 },
    '/api/lesson': { max: DEFAULTS.LESSON_RETRIEVALS_PER_HOUR, window: 3600 }
  };

  startCleanup(DEFAULTS.RATE_LIMIT_CLEANUP_MS);

  function getLimit(path) {
    for (const [prefix, limit] of Object.entries(limits)) {
      if (path.startsWith(prefix)) return limit;
    }
    return null;
  }

  return {
    check(ip, path) {
      const limit = getLimit(path);
      if (!limit) return { allowed: true };

      const key = `${ip}:${path.split('/').slice(0, 3).join('/')}`;
      const now = Math.floor(Date.now() / 1000);

      let entry = store.get(key);
      if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + limit.window };
        store.set(key, entry);
        return { allowed: true, remaining: limit.max - 1 };
      }

      entry.count++;
      if (entry.count > limit.max) {
        return {
          allowed: false,
          retryAfter: entry.resetAt - now,
          remaining: 0
        };
      }

      return { allowed: true, remaining: limit.max - entry.count };
    },

    getStats() {
      return { size: store.size };
    }
  };
}
