/**
 * Environment variable validation
 * Validates required and optional environment variables on startup
 */

interface EnvVarConfig {
  name: string
  required: boolean
  description?: string
  validator?: (value: string) => boolean
  errorMessage?: string
}

const ENV_VARS: EnvVarConfig[] = [
  {
    name: 'API_KEY',
    required: false,
    description: 'API key for automatic authentication mode (optional - can use manual mode)',
  },
  {
    name: 'NODE_ENV',
    required: false,
    description: 'Node environment (development, production, test)',
    validator: (value) => ['development', 'production', 'test'].includes(value),
    errorMessage: 'NODE_ENV must be one of: development, production, test',
  },
  {
    name: 'ENABLE_LOGGING',
    required: false,
    description: 'Enable or disable logging (set to "false" or "0" to disable)',
    validator: (value) => ['true', 'false', '1', '0', ''].includes(value.toLowerCase()),
    errorMessage: 'ENABLE_LOGGING must be one of: true, false, 1, 0',
  },
]

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate environment variables
 * Should be called on application startup
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name]

    if (envVar.required && !value) {
      errors.push(
        `Required environment variable ${envVar.name} is not set. ${envVar.description || ''}`
      )
    } else if (value && envVar.validator && !envVar.validator(value)) {
      errors.push(
        envVar.errorMessage || `Invalid value for environment variable ${envVar.name}`
      )
    } else if (!value && envVar.description) {
      // Optional but documented - show as info, not error
      // Only log in development to avoid noise
      if (process.env.NODE_ENV === 'development') {
        warnings.push(
          `Optional environment variable ${envVar.name} is not set. ${envVar.description}`
        )
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Get environment variable with validation
 */
export function getEnvVar(name: string, defaultValue?: string): string | undefined {
  return process.env[name] || defaultValue
}

/**
 * Get required environment variable (throws if missing)
 */
export function getRequiredEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`)
  }
  return value
}

