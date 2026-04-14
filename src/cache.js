// src/cache.js
// ─── LRU cache with TTL expiration ───
// No external deps. O(1) get/set via Map insertion order.

class Cache {
  constructor(maxSize = 5000, ttlMs = 300_000) {
    this._map = new Map();
    this._maxSize = maxSize;
    this._ttlMs = ttlMs;
    this._hits = 0;
    this._misses = 0;
  }

  get(key) {
    const entry = this._map.get(key);
    if (!entry) {
      this._misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this._map.delete(key);
      this._misses++;
      return undefined;
    }
    // Move to end (most recently used)
    this._map.delete(key);
    this._map.set(key, entry);
    this._hits++;
    return entry.value;
  }

  set(key, value, customTtlMs) {
    // Delete first to reset position
    this._map.delete(key);
    // Evict oldest if at capacity
    if (this._map.size >= this._maxSize) {
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
    this._map.set(key, {
      value,
      expiresAt: Date.now() + (customTtlMs || this._ttlMs),
    });
  }

  invalidate(key) {
    this._map.delete(key);
  }

  clear() {
    this._map.clear();
  }

  get stats() {
    return {
      size: this._map.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: this._hits + this._misses > 0
        ? (this._hits / (this._hits + this._misses) * 100).toFixed(1) + '%'
        : 'N/A',
    };
  }
}

module.exports = { Cache };
