type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'
  private isLoggingEnabled: boolean
  
  constructor() {
    // Check environment variable to disable logging if needed
    const loggingEnv = process.env.ENABLE_LOGGING
    if (loggingEnv === 'false' || loggingEnv === '0') {
      this.isLoggingEnabled = false
    } else {
      // Default: enable logging in development, allow it in production unless explicitly disabled
      this.isLoggingEnabled = true
    }
  }

  // Sanitize strings to prevent log injection attacks
  private sanitizeString(value: string, maxLength: number = 1000): string {
    // Truncate to prevent log flooding
    let sanitized = value.length > maxLength ? value.substring(0, maxLength) + '...[truncated]' : value
    // Remove control characters that could break log parsing
    sanitized = sanitized.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    // Escape newlines to prevent log injection
    sanitized = sanitized.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
    return sanitized
  }

  // Sanitize URLs to prevent sensitive data leakage
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url)
      // Remove sensitive query parameters (common patterns)
      const sensitiveParams = ['password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey', 'auth', 'authorization', 'key']
      const params = new URLSearchParams(parsed.search)
      
      sensitiveParams.forEach(param => {
        if (params.has(param)) {
          params.set(param, '[REDACTED]')
        }
      })
      
      parsed.search = params.toString()
      return parsed.toString()
    } catch {
      // If URL parsing fails, sanitize as string
      return this.sanitizeString(url, 500)
    }
  }

  // Sanitize context values to prevent log injection
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {}
    
    for (const [key, value] of Object.entries(context)) {
      if (value === null || value === undefined) {
        sanitized[key] = value
      } else if (typeof value === 'string') {
        // Special handling for URLs
        if (key.toLowerCase().includes('url') || key.toLowerCase().includes('endpoint')) {
          sanitized[key] = this.sanitizeUrl(value)
        } else {
          sanitized[key] = this.sanitizeString(value)
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value
      } else if (value instanceof Error) {
        sanitized[key] = {
          name: this.sanitizeString(value.name),
          message: this.sanitizeString(value.message),
          stack: value.stack ? this.sanitizeString(value.stack, 2000) : undefined,
        }
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? this.sanitizeString(item, 200) : item
        )
      } else if (typeof value === 'object') {
        // Recursively sanitize nested objects (with depth limit)
        sanitized[key] = this.sanitizeContext(value as LogContext)
      } else {
        sanitized[key] = this.sanitizeString(String(value))
      }
    }
    
    return sanitized
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString()
    const sanitizedMessage = this.sanitizeString(message)
    const sanitizedContext = context ? this.sanitizeContext(context) : {}
    
    const logEntry = {
      timestamp,
      level,
      message: sanitizedMessage,
      ...sanitizedContext,
    }
    return JSON.stringify(logEntry)
  }

  private writeLog(level: LogLevel, message: string, context?: LogContext): void {
    // Skip logging if disabled via environment variable
    if (!this.isLoggingEnabled) {
      return
    }
    
    const formatted = this.formatLog(level, message, context)
    
    if (this.isDevelopment) {
      console.log(formatted)
    } else {
      switch (level) {
        case 'error':
          console.error(formatted)
          break
        case 'warn':
          console.warn(formatted)
          break
        default:
          console.log(formatted)
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      this.writeLog('debug', message, context)
    }
  }

  info(message: string, context?: LogContext): void {
    this.writeLog('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.writeLog('warn', message, context)
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext: LogContext = {
      ...context,
    }

    if (error instanceof Error) {
      errorContext.errorName = error.name
      errorContext.errorMessage = error.message
      if (this.isDevelopment && error.stack) {
        errorContext.stack = error.stack
      }
    } else if (error) {
      errorContext.error = String(error)
    }

    this.writeLog('error', message, errorContext)
  }
}

export const logger = new Logger()

