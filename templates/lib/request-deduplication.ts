/**
 * Request deduplication using idempotency keys
 * Prevents duplicate requests within a time window
 */

interface DeduplicationRecord {
  response: any
  timestamp: number
  expiresAt: number
}

// In-memory store for deduplication
// In production, consider using Redis or a distributed cache
const deduplicationStore = new Map<string, DeduplicationRecord>()

// Cleanup expired entries periodically
const CLEANUP_INTERVAL = 60000 // 1 minute
const DEFAULT_TTL = 300000 // 5 minutes
let cleanupTimer: NodeJS.Timeout | null = null

function startCleanup(): void {
  if (cleanupTimer) return
  
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, record] of deduplicationStore.entries()) {
      if (record.expiresAt < now) {
        deduplicationStore.delete(key)
      }
    }
  }, CLEANUP_INTERVAL)
}

/**
 * Generate idempotency key from request
 */
export function generateIdempotencyKey(
  method: string,
  path: string,
  baseUrl: string,
  data: Record<string, any>,
  endpointKey?: string // Add endpoint key to ensure uniqueness
): string {
  // Create a hash-like key from request parameters
  // Include endpointKey to ensure different endpoints don't collide
  const keyData = {
    method: method.toUpperCase(),
    path,
    baseUrl,
    endpointKey: endpointKey || '', // Include endpoint key for uniqueness
    data: JSON.stringify(data || {}),
  }
  // Simple hash (in production, use crypto.createHash)
  const keyString = JSON.stringify(keyData)
  // Use a simple hash function
  let hash = 0
  for (let i = 0; i < keyString.length; i++) {
    const char = keyString.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return `idempotency:${Math.abs(hash).toString(36)}`
}

/**
 * Check if request is duplicate and return cached response if available
 */
export function checkDuplicate(
  idempotencyKey: string,
  ttl: number = DEFAULT_TTL
): { isDuplicate: boolean; cachedResponse?: any } {
  startCleanup()
  
  const record = deduplicationStore.get(idempotencyKey)
  const now = Date.now()
  
  if (record && record.expiresAt > now) {
    return {
      isDuplicate: true,
      cachedResponse: record.response,
    }
  }
  
  return { isDuplicate: false }
}

/**
 * Store response for deduplication
 */
export function storeResponse(
  idempotencyKey: string,
  response: any,
  ttl: number = DEFAULT_TTL
): void {
  const now = Date.now()
  deduplicationStore.set(idempotencyKey, {
    response,
    timestamp: now,
    expiresAt: now + ttl,
  })
}

