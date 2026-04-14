// src/ratelimit.js
// ─── Sliding window rate limiter (per end-user per bot) ───
// Prevents spam and abuse. No external deps.

class RateLimiter {
  constructor(maxRequests = 20, windowMs = 60_000) {
    this._windows = new Map(); // key -> [timestamps]
    this._maxRequests = maxRequests;
    this._windowMs = windowMs;

    // Cleanup stale entries every 5 minutes
    this._cleanupInterval = setInterval(() => this._cleanup(), 300_000);
  }

  // Returns { allowed: true } or { allowed: false, retryAfterMs: N }
  check(key) {
    const now = Date.now();
    const cutoff = now - this._windowMs;

    let timestamps = this._windows.get(key);
    if (!timestamps) {
      timestamps = [];
      this._windows.set(key, timestamps);
    }

    // Remove expired timestamps
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this._maxRequests) {
      const retryAfterMs = timestamps[0] + this._windowMs - now;
      return { allowed: false, retryAfterMs };
    }

    timestamps.push(now);
    return { allowed: true };
  }

  _cleanup() {
    const cutoff = Date.now() - this._windowMs;
    for (const [key, timestamps] of this._windows) {
      while (timestamps.length > 0 && timestamps[0] <= cutoff) {
        timestamps.shift();
      }
      if (timestamps.length === 0) {
        this._windows.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this._windows.clear();
  }

  get activeKeys() {
    return this._windows.size;
  }
}

module.exports = { RateLimiter };
