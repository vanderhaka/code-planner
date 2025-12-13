/**
 * Simple in-memory rate limiter for API endpoints.
 * 
 * Tracks requests per key (e.g., session ID or IP) within a time window.
 * For production, consider using a distributed cache like Redis.
 */

const limits = new Map<string, number[]>();

/**
 * Check if a request is within rate limits.
 * 
 * @param key - Unique identifier for the requester (e.g., session ID, IP)
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  maxRequests = 10,
  windowMs = 60000
): boolean {
  const now = Date.now();
  const timestamps = limits.get(key) ?? [];
  
  // Filter out timestamps outside the window
  const valid = timestamps.filter((t) => now - t < windowMs);
  
  if (valid.length >= maxRequests) {
    return false;
  }
  
  // Add current request timestamp
  limits.set(key, [...valid, now]);
  
  return true;
}

/**
 * Get remaining requests for a key.
 * 
 * @param key - Unique identifier for the requester
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Number of remaining requests
 */
export function getRemainingRequests(
  key: string,
  maxRequests = 10,
  windowMs = 60000
): number {
  const now = Date.now();
  const timestamps = limits.get(key) ?? [];
  const valid = timestamps.filter((t) => now - t < windowMs);
  return Math.max(0, maxRequests - valid.length);
}

/**
 * Clear rate limit data for a key (useful for testing or manual reset).
 */
export function clearRateLimit(key: string): void {
  limits.delete(key);
}

/**
 * Clean up expired entries periodically (call this from a background job in production).
 */
export function cleanupExpiredEntries(windowMs = 60000): void {
  const now = Date.now();
  for (const [key, timestamps] of limits.entries()) {
    const valid = timestamps.filter((t) => now - t < windowMs);
    if (valid.length === 0) {
      limits.delete(key);
    } else {
      limits.set(key, valid);
    }
  }
}

