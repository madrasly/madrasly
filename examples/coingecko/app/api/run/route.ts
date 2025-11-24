import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { validateEnvironment } from '@/lib/env-validation'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limiter'
import { generateIdempotencyKey, checkDuplicate, storeResponse } from '@/lib/request-deduplication'

// Validate environment on module load
const envValidation = validateEnvironment()
if (!envValidation.valid) {
  console.error('Environment validation failed:', envValidation.errors)
  // In production, we might want to exit, but for now just log
  if (process.env.NODE_ENV === 'production') {
    console.error('Critical: Environment validation failed in production')
  }
}
if (envValidation.warnings.length > 0 && process.env.NODE_ENV === 'development') {
  console.warn('Environment warnings:', envValidation.warnings)
}

// Request timeout in milliseconds (30 seconds)
const REQUEST_TIMEOUT = 30000

// Maximum request body size (10MB)
const MAX_BODY_SIZE = 10 * 1024 * 1024

// Maximum response body size (10MB)
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024

// Allowed HTTP methods
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

// SSRF protection: Blocked hostnames and IPs
// In development mode, we allow localhost for testing
// In production, we block all private IPs and localhost for security
const isDevelopment = process.env.NODE_ENV === 'development'

const BLOCKED_HOSTNAMES = new Set(
  isDevelopment
    ? [
      // In development, only block cloud metadata endpoints
      'metadata.google.internal',
      '169.254.169.254', // AWS, GCP, Azure metadata endpoint
    ]
    : [
      // In production, block everything private
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
      'metadata.google.internal',
      '169.254.169.254', // AWS, GCP, Azure metadata endpoint
      'fd00::', // IPv6 ULA prefix
    ]
)

// SSRF protection: Check if hostname is a private IPv4 address
function isPrivateIPv4(hostname: string): boolean {
  // In development mode, allow private IPs for local testing
  if (isDevelopment) return false

  // Check for private IP ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  if (/^10\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true
  // Check for link-local: 169.254.0.0/16
  if (/^169\.254\./.test(hostname)) return true
  return false
}

// SSRF protection: Check if hostname is a private IPv6 address
function isPrivateIPv6(hostname: string): boolean {
  // In development mode, allow private IPs for local testing
  if (isDevelopment) return false

  // IPv6 localhost
  if (hostname === '::1' || hostname === '::') return true
  // IPv6 link-local: fe80::/10
  if (/^fe80:/i.test(hostname)) return true
  // IPv6 unique local address: fc00::/7 (fc00::/8 and fd00::/8)
  if (/^fc[0-9a-f]{2}:/i.test(hostname) || /^fd[0-9a-f]{2}:/i.test(hostname)) return true
  // IPv6 loopback
  if (/^::1$/.test(hostname)) return true
  return false
}

// SSRF protection: Check if hostname is blocked
function isBlockedHostname(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase()

  // Check exact matches
  if (BLOCKED_HOSTNAMES.has(lowerHostname)) return true

  // Check if it's a blocked hostname with port
  for (const blocked of BLOCKED_HOSTNAMES) {
    if (lowerHostname.startsWith(blocked + ':') || lowerHostname.startsWith('[' + blocked + ']')) {
      return true
    }
  }

  // Check for cloud metadata endpoints (always blocked, even in development)
  if (lowerHostname.includes('metadata') &&
    (lowerHostname.includes('google') || lowerHostname.includes('aws') || lowerHostname.includes('azure'))) {
    return true
  }

  // Check IPv4 private ranges
  if (isPrivateIPv4(lowerHostname)) return true

  // Check IPv6 private ranges
  if (isPrivateIPv6(lowerHostname)) return true

  return false
}

// SSRF protection: Validate URL is safe (no SSRF)
function isSafeUrl(url: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(url)

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, reason: 'Invalid protocol' }
    }

    const hostname = parsed.hostname
    // In development, allow localhost and private IPs for testing
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      return { safe: true }
    }

    // Check blocked hostnames
    if (isBlockedHostname(hostname)) {
      return { safe: false, reason: 'Blocked hostname or private IP' }
    }

    return { safe: true }
  } catch {
    return { safe: false, reason: 'Invalid URL format' }
  }
}

// Validation schema
const requestSchema = z.object({
  method: z.enum([...ALLOWED_METHODS] as [string, ...string[]], {
    errorMap: () => ({ message: 'Invalid HTTP method' })
  }),
  path: z.string()
    .min(1, 'Path is required')
    .max(2048, 'Path too long')
    .refine(
      (path) => !path.includes('..'),
      'Path must not contain path traversal sequences (..)'
    ),
  baseUrl: z.string()
    .url('Invalid base URL')
    .refine(
      (url) => {
        const validation = isSafeUrl(url)
        return validation.safe
      },
      (url) => {
        const validation = isSafeUrl(url)
        return { message: `Base URL must be a valid public HTTP/HTTPS URL${validation.reason ? `: ${validation.reason}` : ''}` }
      }
    ),
  data: z.record(z.any()).optional(),
  contentType: z.string().optional().refine(
    (val) => {
      if (!val) return true
      // Validate MIME type format to prevent MIME type confusion attacks
      // Must match pattern: type/subtype or type/subtype;parameter=value
      const mimeTypePattern = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*(;[\s]*[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*=[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*)*$/
      if (!mimeTypePattern.test(val)) {
        return false
      }
      // Block dangerous MIME types that could be used for attacks
      const dangerousTypes = [
        'text/html',
        'text/xml',
        'application/xml',
        'application/xhtml+xml',
        'image/svg+xml',
      ]
      const lowerVal = val.toLowerCase().split(';')[0].trim()
      // Only block if it's exactly a dangerous type (not application/json which is safe)
      if (dangerousTypes.includes(lowerVal) && lowerVal !== 'application/json') {
        return false
      }
      return true
    },
    { message: 'Invalid or unsafe content type' }
  ),
  securityScheme: z.record(z.any()).nullable().optional().refine(
    (val) => {
      if (!val) return true
      // Prevent prototype pollution - ensure it's a plain object
      if (Object.getPrototypeOf(val) !== Object.prototype && Object.getPrototypeOf(val) !== null) {
        return false
      }
      // Validate expected structure
      const allowedKeys = ['type', 'name', 'in', 'scheme', 'bearerFormat', 'description']
      const keys = Object.keys(val)
      // All keys must be strings and in allowed list
      return keys.every(key => typeof key === 'string' && allowedKeys.includes(key))
    },
    { message: 'Invalid securityScheme structure' }
  ),
  operation: z.record(z.any()).nullable().optional().refine(
    (val) => {
      if (!val) return true
      // Prevent prototype pollution
      if (Object.getPrototypeOf(val) !== Object.prototype && Object.getPrototypeOf(val) !== null) {
        return false
      }
      // Validate expected structure for OpenAPI operation
      const allowedTopLevelKeys = ['operationId', 'summary', 'description', 'tags', 'parameters', 'requestBody', 'responses', 'security', 'deprecated', 'externalDocs']
      const keys = Object.keys(val)
      // All keys must be strings
      if (!keys.every(key => typeof key === 'string')) {
        return false
      }
      // Validate parameters if present
      if (val.parameters && Array.isArray(val.parameters)) {
        return val.parameters.every((param: any) => {
          if (typeof param !== 'object' || param === null) return false
          // Check for prototype pollution
          if (Object.getPrototypeOf(param) !== Object.prototype && Object.getPrototypeOf(param) !== null) {
            return false
          }
          // Basic parameter structure validation
          return typeof param.name === 'string' && typeof param.in === 'string'
        })
      }
      return true
    },
    { message: 'Invalid operation structure' }
  ),
  endpointKey: z.string().optional(), // Optional endpoint key for deduplication
})

// Error response structure
interface ErrorResponse {
  error: string
  message: string
  code?: string
  requestId: string
  details?: string | string[]
  statusCode: number
}

// Helper function to create consistent error responses
function createErrorResponse(
  error: string,
  message: string,
  requestId: string,
  statusCode: number,
  code?: string,
  details?: string | string[]
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error,
      message,
      code: code || `ERR_${statusCode}`,
      requestId,
      details,
      statusCode,
    },
    { status: statusCode }
  )
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()

  try {
    // Get client information for logging and rate limiting
    const clientIp = getClientIdentifier(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Get endpointKey from header (set by client) for better idempotency key generation
    const endpointKeyFromHeader = request.headers.get('x-endpoint-key')

    // Generate idempotency key - will be updated after parsing body to include endpointKey
    let idempotencyKey = request.headers.get('idempotency-key') || generateIdempotencyKey('POST', '/api/run', '', {}, endpointKeyFromHeader || undefined)

    // Check rate limiting
    const rateLimit = checkRateLimit(clientIp, {
      maxRequests: 100, // 100 requests per minute
      windowMs: 60000,
    })

    if (!rateLimit.allowed) {
      logger.warn('Rate limit exceeded', {
        requestId,
        clientIp,
        userAgent,
      })
      return createErrorResponse(
        'Rate limit exceeded',
        `Too many requests. Please try again after ${new Date(rateLimit.resetTime).toISOString()}`,
        requestId,
        429,
        'ERR_RATE_LIMIT_EXCEEDED'
      )
    }

    // Check for duplicate requests (idempotency)
    const duplicateCheck = checkDuplicate(idempotencyKey)
    if (duplicateCheck.isDuplicate && duplicateCheck.cachedResponse) {
      logger.info('Duplicate request detected, returning cached response', {
        requestId,
        idempotencyKey,
        clientIp,
      })
      return NextResponse.json(duplicateCheck.cachedResponse)
    }

    logger.info('API request received', {
      requestId,
      method: 'POST',
      path: '/api/run',
      clientIp,
      userAgent,
      rateLimitRemaining: rateLimit.remaining,
    })

    // Validate request body size before parsing to prevent memory exhaustion
    const contentLength = request.headers.get('content-length')
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (size > MAX_BODY_SIZE) {
        logger.warn('Request body too large (Content-Length check)', {
          requestId,
          contentLength: size,
          maxSize: MAX_BODY_SIZE,
        })
        return createErrorResponse(
          'Request body too large',
          `Request body exceeds maximum size of ${MAX_BODY_SIZE / 1024 / 1024}MB`,
          requestId,
          413,
          'ERR_PAYLOAD_TOO_LARGE'
        )
      }
    }

    // Read and parse body with size limit
    let body: any
    try {
      // For serverless environments, we need to read the body stream
      // and check size as we read it
      const bodyText = await request.text()
      const bodySize = Buffer.byteLength(bodyText, 'utf8')

      if (bodySize > MAX_BODY_SIZE) {
        logger.warn('Request body too large', {
          requestId,
          bodySize,
          maxSize: MAX_BODY_SIZE,
        })
        return createErrorResponse(
          'Request body too large',
          `Request body exceeds maximum size of ${MAX_BODY_SIZE / 1024 / 1024}MB`,
          requestId,
          413,
          'ERR_PAYLOAD_TOO_LARGE'
        )
      }

      // Parse JSON only after size validation
      body = JSON.parse(bodyText)
    } catch (error) {
      if (error instanceof SyntaxError) {
        logger.warn('Invalid JSON in request body', {
          requestId,
        })
        return createErrorResponse(
          'Invalid JSON in request body',
          'The request body contains invalid JSON',
          requestId,
          400,
          'ERR_INVALID_JSON'
        )
      }
      // Re-throw unexpected errors
      throw error
    }

    // Validate input
    const validationResult = requestSchema.safeParse(body)
    if (!validationResult.success) {
      logger.warn('Validation failed', {
        requestId,
        errors: validationResult.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      })
      return createErrorResponse(
        'Validation failed',
        'The request data failed validation',
        requestId,
        400,
        'ERR_VALIDATION_FAILED',
        validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      )
    }

    const { method, path, baseUrl, data, contentType, securityScheme, operation, endpointKey } = validationResult.data

    // Debug: log incoming request fields (after validation)
    console.log('[Debug] /api/run request body:', {
      baseUrl,
      securityScheme,
      operation,
    })

    // Regenerate idempotency key with endpointKey from body (more reliable than header)
    // This ensures different endpoints don't collide in the deduplication cache
    if (endpointKey) {
      idempotencyKey = generateIdempotencyKey(method, path, baseUrl || '', data || {}, endpointKey)
      // Re-check for duplicates with the correct key
      const duplicateCheck = checkDuplicate(idempotencyKey)
      if (duplicateCheck.isDuplicate && duplicateCheck.cachedResponse) {
        logger.info('Duplicate request detected (with endpoint key), returning cached response', {
          requestId,
          idempotencyKey,
          endpointKey,
          clientIp,
        })
        return NextResponse.json(duplicateCheck.cachedResponse)
      }
    }

    logger.debug('Request validated', {
      requestId,
      method,
      path,
      baseUrl: baseUrl ? (() => {
        try {
          return new URL(baseUrl).hostname
        } catch {
          return null
        }
      })() : null,
      hasData: !!data,
      contentType,
      clientIp,
      userAgent,
    })

    // Require baseUrl from the spec
    const apiBaseUrl = baseUrl
    if (!apiBaseUrl) {
      logger.warn('No base URL configured', { requestId })
      return createErrorResponse(
        'No base URL configured',
        'Please specify a server URL in the OpenAPI spec',
        requestId,
        400,
        'ERR_NO_BASE_URL'
      )
    }

    // Extract parameter names to identify which data fields are parameters
    const headerParamNames = new Set<string>()
    const queryParamNames = new Set<string>()
    const pathParamNames = new Set<string>()

    if (operation?.parameters && Array.isArray(operation.parameters)) {
      for (const param of operation.parameters) {
        if (param.in === 'header') {
          headerParamNames.add(param.name)
        } else if (param.in === 'query') {
          queryParamNames.add(param.name)
        } else if (param.in === 'path') {
          pathParamNames.add(param.name)
        }
      }
    }

    // Construct URL safely
    let url: string
    try {
      const baseUrlObj = new URL(apiBaseUrl)
      // Ensure path starts with / for proper URL construction
      let cleanPath = path.startsWith('/') ? path : `/${path}`

      // Replace path parameters with values from data
      if (pathParamNames.size > 0) {
        pathParamNames.forEach(paramName => {
          const paramValue = data?.[paramName]
          if (paramValue !== undefined && paramValue !== null && paramValue !== '') {
            // Replace {paramName} with value
            cleanPath = cleanPath.replace(`{${paramName}}`, String(paramValue))
          }
        })
      }

      // If baseUrl already has a path, append to it instead of replacing
      // This handles cases like baseUrl: "https://api.example.com/v1" + path: "/messages"
      // Should result in: "https://api.example.com/v1/messages" not "https://api.example.com/messages"
      if (baseUrlObj.pathname && baseUrlObj.pathname !== '/') {
        // Base URL has a path, append the endpoint path
        const basePath = baseUrlObj.pathname.endsWith('/')
          ? baseUrlObj.pathname.slice(0, -1)
          : baseUrlObj.pathname
        const endpointPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`
        baseUrlObj.pathname = `${basePath}${endpointPath}`
        url = baseUrlObj.toString()
      } else {
        // Base URL has no path, use standard URL constructor
        url = new URL(cleanPath, baseUrlObj).toString()
      }

      // Final SSRF check on constructed URL with enhanced protection
      const finalUrl = new URL(url)
      const urlValidation = isSafeUrl(url)

      if (!urlValidation.safe) {
        logger.warn('SSRF attempt blocked', {
          requestId,
          reason: urlValidation.reason,
          hostname: finalUrl.hostname,
          url,
        })
        return createErrorResponse(
          'Invalid target URL',
          urlValidation.reason || 'URL is not allowed',
          requestId,
          400,
          'ERR_INVALID_URL'
        )
      }

      // Additional DNS rebinding protection: verify hostname matches what we validated
      // (This is a defense-in-depth measure - the hostname should already be validated)
      const hostname = finalUrl.hostname
      if (isBlockedHostname(hostname)) {
        logger.warn('SSRF attempt blocked: blocked hostname detected', {
          requestId,
          hostname,
          url,
        })
        return createErrorResponse(
          'Invalid target hostname',
          'The target hostname is blocked for security reasons',
          requestId,
          400,
          'ERR_BLOCKED_HOSTNAME'
        )
      }
    } catch (error) {
      logger.error('Failed to construct valid URL', error, {
        requestId,
        baseUrl: apiBaseUrl,
        path,
      })
      return createErrorResponse(
        'Failed to construct valid URL',
        'Unable to construct a valid URL from the provided base URL and path',
        requestId,
        400,
        'ERR_URL_CONSTRUCTION_FAILED'
      )
    }

    // Build request body from data (only for methods that support body)
    // Exclude header, query, and path parameters - they don't belong in the body


    const requestBody: Record<string, any> = {}
    const methodUpper = method.toUpperCase()
    const methodsWithBody = ['POST', 'PUT', 'PATCH', 'DELETE']
    const hasBody = methodsWithBody.includes(methodUpper)

    if (hasBody) {
      Object.entries(data || {}).forEach(([key, value]) => {
        // Skip header, query, and path parameters - they don't belong in request body
        if (headerParamNames.has(key) || queryParamNames.has(key) || pathParamNames.has(key)) {
          return
        }

        if (value !== undefined && value !== null && value !== '') {
          // Preserve the value type as-is
          requestBody[key] = value
        }
      })
    }

    // Get API key: from environment variable (automatic mode) or request headers (manual mode)
    // Manual mode: API key comes from request headers (sent from form)
    // Automatic mode: API key comes from environment variable
    const securitySchemeInfo = securityScheme || {}
    const authHeaderName = securitySchemeInfo.name || 'x-api-key'
    const authType = securitySchemeInfo.type || 'apiKey'
    const authScheme = securitySchemeInfo.scheme || null
    const authIn = securitySchemeInfo.in || 'header'

    // Try to get API key from the correct header based on security scheme
    let manualApiKey: string | null = null
    if (authType === 'apiKey' && authIn === 'header') {
      // For apiKey in header, use the specified header name
      manualApiKey = request.headers.get(authHeaderName) || null
    } else if (authType === 'apiKey' && authIn === 'query') {
      // For apiKey in query, try to get from a special header (we'll add it to URL later)
      manualApiKey = request.headers.get(authHeaderName) || null
    } else if (authType === 'http' && authScheme === 'bearer') {
      // For Bearer token, extract from Authorization header
      const authHeader = request.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        manualApiKey = authHeader.replace('Bearer ', '')
      }
    } else {
      // Fallback: try common header names
      manualApiKey = request.headers.get(authHeaderName) ||
        request.headers.get('authorization')?.replace('Bearer ', '') ||
        null
    }

    const automaticApiKey = process.env.API_KEY || null

    // Use manual key if provided, otherwise fall back to automatic
    const apiKey = manualApiKey || automaticApiKey

    // Determine content type from spec or default to application/json (only if there's a body)
    const requestContentType = contentType || 'application/json'

    const headers: Record<string, string> = {}

    // Only set Content-Type if there's a body
    if (hasBody && Object.keys(requestBody).length > 0) {
      headers['Content-Type'] = requestContentType
    }

    // Add header parameters from operation (OpenAPI spec)
    if (operation?.parameters && Array.isArray(operation.parameters)) {
      for (const param of operation.parameters) {
        if (param.in === 'header') {
          // Get value from data, or use default/example from spec
          const paramValue = data?.[param.name]
          const defaultValue = param.schema?.default ?? param.example ?? param.schema?.example

          if (paramValue !== undefined && paramValue !== null && paramValue !== '') {
            headers[param.name] = String(paramValue)
          } else if (defaultValue !== undefined && defaultValue !== null) {
            headers[param.name] = String(defaultValue)
          } else if (param.required) {
            // Required header with no value - this will fail, but we'll let the API handle it
            // Log a warning
            logger.warn('Required header parameter missing', {
              requestId,
              headerName: param.name,
            })
          }
        }
      }
    }

    // Apply auth based on API key availability and security scheme
    if (apiKey) {
      if (authType === 'apiKey' && authIn === 'header') {
        // For apiKey in header, use the specified header name with just the key
        headers[authHeaderName] = apiKey
      } else if (authType === 'apiKey' && authIn === 'query') {
        // For apiKey in query, we'll add it to the URL below
        // Don't add to headers
      } else if (authType === 'http' && authScheme === 'bearer') {
        // For Bearer token, use Authorization header
        headers['Authorization'] = `Bearer ${apiKey}`
      } else if (authType === 'http' && authScheme === 'basic') {
        // For Basic auth, properly base64 encode username:password
        // The apiKey should be in format "username:password" or already base64 encoded
        let basicAuthValue: string

        // Check if apiKey contains ':' (username:password format)
        if (apiKey.includes(':')) {
          // It's in username:password format, encode it
          basicAuthValue = Buffer.from(apiKey, 'utf8').toString('base64')
        } else {
          // Assume it's already base64 encoded, use as-is
          // (If it's not valid base64, the API will reject it, which is fine)
          basicAuthValue = apiKey
        }

        headers['Authorization'] = `Basic ${basicAuthValue}`
      } else {
        // Fallback: check if it's already formatted
        if (manualApiKey && request.headers.get('authorization')?.startsWith('Bearer ')) {
          headers['Authorization'] = request.headers.get('authorization')!
        } else {
          // Default fallback
          headers['Authorization'] = `Bearer ${apiKey}`
        }
      }
    }

    // Build final URL (may include query parameters for API key auth or other query params)
    let fullUrl = url

    // Handle query parameters from data (for GET requests and query param auth)
    const queryParams: string[] = []

    // Add query parameter authentication if needed
    if (apiKey && authType === 'apiKey' && authIn === 'query') {
      queryParams.push(`${encodeURIComponent(authHeaderName)}=${encodeURIComponent(apiKey)}`)
    }

    // Add other query parameters from data (for GET requests)
    // Also ensure required query parameters are included even if not in data
    const dataParams: Record<string, any> = { ...(data || {}) }

    if (!hasBody && operation?.parameters) {
      // Check for required query parameters that might be missing
      for (const param of operation.parameters) {
        if (param.in === 'query' && param.required && !(param.name in dataParams)) {
          // Add required parameter with its default value if available
          const defaultValue = param.schema?.default ?? param.example ?? param.schema?.example
          if (defaultValue !== undefined) {
            dataParams[param.name] = defaultValue
          }
        }
      }
    }

    if (!hasBody && Object.keys(dataParams).length > 0) {
      Object.entries(dataParams).forEach(([key, value]) => {
        // Include all values, even empty strings for query params (let the API decide)
        // But skip undefined and null
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            // For arrays, add multiple query parameters
            value.forEach(item => {
              if (item !== undefined && item !== null && item !== '') {
                queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
              }
            })
          } else {
            // Include the value even if it's an empty string (some APIs use empty strings as valid values)
            queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
          }
        }
      })
    }

    if (queryParams.length > 0) {
      const separator = fullUrl.includes('?') ? '&' : '?'
      fullUrl = `${fullUrl}${separator}${queryParams.join('&')}`
    }

    try {
      logger.info('Making API request', {
        requestId,
        method: methodUpper,
        url: fullUrl,
        hasBody: hasBody && Object.keys(requestBody).length > 0,
        clientIp,
        userAgent,
      })

      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

      const fetchOptions: RequestInit = {
        method: methodUpper,
        headers,
        signal: controller.signal,
      }

      // Only add body if there's actual body data
      if (hasBody && Object.keys(requestBody).length > 0) {
        fetchOptions.body = JSON.stringify(requestBody)
      }

      const response = await fetch(fullUrl, fetchOptions)
      clearTimeout(timeoutId)

      const duration = Date.now() - startTime

      // Check Content-Length header if available
      const contentLength = response.headers.get('content-length')
      if (contentLength) {
        const size = parseInt(contentLength, 10)
        if (size > MAX_RESPONSE_SIZE) {
          logger.warn('Response too large (Content-Length check)', {
            requestId,
            contentLength: size,
            maxSize: MAX_RESPONSE_SIZE,
            url: fullUrl,
          })
          return createErrorResponse(
            'Response too large',
            `Response exceeds maximum size of ${MAX_RESPONSE_SIZE / 1024 / 1024}MB`,
            requestId,
            413,
            'ERR_RESPONSE_TOO_LARGE'
          )
        }
      }

      logger.info('API request completed', {
        requestId,
        status: response.status,
        statusText: response.statusText,
        duration,
        url: fullUrl,
        contentLength: contentLength ? parseInt(contentLength, 10) : null,
        clientIp,
        userAgent,
      })

      // Read response body with size limit
      const reader = response.body?.getReader()
      if (!reader) {
        logger.error('No response body reader available', undefined, {
          requestId,
          url: fullUrl,
        })
        return createErrorResponse(
          'Failed to read response body',
          'Unable to read the response body from the target API',
          requestId,
          500,
          'ERR_RESPONSE_READ_FAILED'
        )
      }

      const decoder = new TextDecoder()
      let rawText = ''
      let totalSize = 0
      let truncated = false

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) break

          // Track byte size before decoding
          const chunkByteSize = value.length
          totalSize += chunkByteSize

          if (totalSize > MAX_RESPONSE_SIZE) {
            truncated = true
            const remainingBytes = MAX_RESPONSE_SIZE - (totalSize - chunkByteSize)
            if (remainingBytes > 0) {
              // Decode only the portion we can keep
              const truncatedChunk = value.slice(0, remainingBytes)
              rawText += decoder.decode(truncatedChunk, { stream: false })
            }
            logger.warn('Response truncated due to size limit', {
              requestId,
              totalSize,
              maxSize: MAX_RESPONSE_SIZE,
              url: fullUrl,
            })
            // Cancel the reader to free resources
            await reader.cancel()
            break
          }

          // Decode the full chunk
          rawText += decoder.decode(value, { stream: true })
        }

        // Decode any remaining stream data
        rawText += decoder.decode()
      } catch (readError) {
        // If reading fails, log and handle gracefully
        logger.error('Error reading response body', readError, {
          requestId,
          url: fullUrl,
          totalSize,
          clientIp,
          userAgent,
        })
        // Cancel reader on error
        try {
          await reader.cancel()
        } catch (cancelError) {
          // Ignore cancel errors
        }
        throw readError
      }

      // Try to parse as JSON, but keep raw text available
      let parsedData: any
      let prettyRaw: string = rawText

      if (truncated) {
        // If truncated, don't try to parse as JSON
        parsedData = rawText + '\n\n[Response truncated - exceeds maximum size]'
        prettyRaw = rawText + '\n\n[Response truncated - exceeds maximum size]'
      } else {
        try {
          parsedData = JSON.parse(rawText)
          // Pretty-print the raw JSON for display
          prettyRaw = JSON.stringify(parsedData, null, 2)
        } catch (parseError) {
          // If not JSON, use raw text as-is
          parsedData = rawText
          prettyRaw = rawText
        }
      }

      const successResponse = {
        requestId,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: parsedData,
        raw: prettyRaw, // Pretty-printed response for display
      }

      // Store response for deduplication (only for successful responses)
      if (response.status >= 200 && response.status < 300) {
        storeResponse(idempotencyKey, successResponse)
      }

      // Create response with compression support
      const nextResponse = NextResponse.json(successResponse)

      // Enable compression for large responses (Next.js handles this automatically,
      // but we can set headers to hint compression)
      const responseSize = Buffer.byteLength(JSON.stringify(successResponse), 'utf8')
      if (responseSize > 1024) { // Only compress responses larger than 1KB
        // Next.js will automatically compress if Accept-Encoding: gzip is present
        // We just ensure the response is eligible
        nextResponse.headers.set('Vary', 'Accept-Encoding')
      }

      return nextResponse
    } catch (error: unknown) {
      const duration = Date.now() - startTime

      // Handle timeout specifically
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('Request timeout', {
          requestId,
          duration,
          timeout: REQUEST_TIMEOUT,
          url: fullUrl,
          clientIp,
          userAgent,
        })
        return createErrorResponse(
          'Request timeout',
          `Request exceeded ${REQUEST_TIMEOUT / 1000} second timeout`,
          requestId,
          504,
          'ERR_REQUEST_TIMEOUT'
        )
      }

      // Log error with full context (but don't expose to client)
      logger.error('Failed to make API request', error, {
        requestId,
        duration,
        method: methodUpper,
        url: fullUrl,
        clientIp,
        userAgent,
      })

      // Return sanitized error message (never expose internal error details)
      return createErrorResponse(
        'Failed to make API request',
        'An error occurred while processing your request',
        requestId,
        500,
        'ERR_API_REQUEST_FAILED'
      )
    }
  }
  catch (topLevelError: unknown) {
    // Catch any unexpected errors that occur before the fetch try-catch
    const duration = Date.now() - startTime
    logger.error('Unexpected error in POST handler', topLevelError, {
      requestId,
      duration,
    })
    return createErrorResponse(
      'Internal server error',
      'An unexpected error occurred while processing your request',
      requestId,
      500,
      'ERR_INTERNAL_SERVER_ERROR'
    )
  }
}

