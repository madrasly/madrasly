/**
 * Simple in-memory rate limiter for serverless environments
 * Uses a sliding window approach
 */

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RequestRecord {
  count: number
  resetTime: number
}

// In-memory store (cleared on serverless function restart)
// In production, consider using Redis or a distributed cache
const requestStore = new Map<string, RequestRecord>()

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60000 // 1 minute
let cleanupTimer: NodeJS.Timeout | null = null

function startCleanup(): void {
  if (cleanupTimer) return
  
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, record] of requestStore.entries()) {
      if (record.resetTime < now) {
        requestStore.delete(key)
      }
    }
  }, CLEANUP_INTERVAL)
}

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (e.g., IP address or API key)
 * @param config - Rate limit configuration
 * @returns Object with allowed status and remaining requests
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60000 } // 100 requests per minute default
): { allowed: boolean; remaining: number; resetTime: number } {
  startCleanup()
  
  const now = Date.now()
  const key = identifier
  
  let record = requestStore.get(key)
  
  // If no record or window expired, create new record
  if (!record || record.resetTime < now) {
    record = {
      count: 1,
      resetTime: now + config.windowMs,
    }
    requestStore.set(key, record)
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: record.resetTime,
    }
  }
  
  // Increment count
  record.count++
  
  // Check if limit exceeded
  if (record.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    }
  }
  
  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetTime: record.resetTime,
  }
}

/**
 * Get client identifier from request (IP address or API key)
 */
export function getClientIdentifier(request: Request): string {
  // Try to get IP from headers (common in serverless/proxy environments)
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take first IP if multiple
    return forwardedFor.split(',')[0].trim()
  }
  
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  
  // Fallback to a default identifier (not ideal, but works)
  return 'unknown'
}

