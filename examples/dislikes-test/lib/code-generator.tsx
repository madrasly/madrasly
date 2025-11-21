'use client'

import React from 'react'
import { CodeSample } from '@/components/api-playground/types'

interface OpenAPIOperation {
  method: string
  path: string
  parameters?: Array<{
    name: string
    in: string
    required?: boolean
    schema?: {
      type?: string
      example?: any
      default?: any
      enum?: any[]
      format?: string
    }
    example?: any
  }>
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: {
          properties?: Record<string, any>
          required?: string[]
          example?: any
        }
        example?: any
      }
    }
  }
  security?: Array<Record<string, string[]>>
}

interface OpenAPISpec {
  servers?: Array<{ url: string }>
  security?: Array<Record<string, string[]>>
  components?: {
    securitySchemes?: Record<string, any>
    schemas?: Record<string, any>
  }
}

// Schema resolution functions removed - spec is already dereferenced by @apidevtools/swagger-parser
// All $refs are handled by the library

export function generateCodeSamples(
  operation: OpenAPIOperation,
  spec: OpenAPISpec,
  endpointTitle?: string,
  formValues?: Record<string, any>
): CodeSample[] {
  const samples: CodeSample[] = []
  const baseUrl = spec.servers?.[0]?.url || ''
  const method = operation.method.toLowerCase()
  const path = operation.path
  
  // Build path with path parameters (use form values if available)
  let fullPath = path
  const pathParams: Record<string, any> = {}
  if (operation.parameters) {
    for (const param of operation.parameters) {
      if (param.in === 'path') {
        // Use form value if available, otherwise use example/default
        const value = formValues?.[param.name] || 
                     param.schema?.example || 
                     param.example || 
                     param.schema?.default || 
                     'example-id'
        pathParams[param.name] = value
        fullPath = fullPath.replace(`{${param.name}}`, String(value))
      }
    }
  }
  
  // Build query parameters (use form values if available)
  const queryParams: Record<string, any> = {}
  if (operation.parameters) {
    for (const param of operation.parameters) {
      if (param.in === 'query') {
        // Use form value if available, otherwise use example/default
        const value = formValues?.[param.name] !== undefined 
          ? formValues[param.name]
          : (param.schema?.example || param.example || param.schema?.default)
        if (value !== undefined && value !== '') {
          // Keep arrays as arrays for proper formatting in code generation
          queryParams[param.name] = value
        }
      }
    }
  }
  
  // Get content type from requestBody (default to application/json)
  const requestBodyContent = operation.requestBody?.content
  const contentType = requestBodyContent 
    ? Object.keys(requestBodyContent)[0] || 'application/json'
    : 'application/json'
  
  // Build request body (use form values if available)
  let requestBody: any = null
  if (requestBodyContent && (requestBodyContent as Record<string, any>)[contentType]) {
    const jsonContent = (requestBodyContent as Record<string, any>)[contentType]
    
    // Schema is already dereferenced (no $refs)
    const requestBodySchema = jsonContent.schema
    const resolvedSchema = requestBodySchema
    
    // If we have form values, use them to build the request body
    if (formValues && Object.keys(formValues).length > 0) {
      // Form values are already stored in nested structure by ApiForm
      // Filter out internal keys and empty values
      requestBody = {}
      
      for (const [key, value] of Object.entries(formValues)) {
        // Skip any keys starting with __ (internal/reserved)
        if (key.startsWith('__')) continue
        
        // Skip empty values
        if (value === undefined || value === null || value === '') continue
        
        // Skip empty arrays (they cause API errors for fields like functions/tools)
        if (Array.isArray(value) && value.length === 0) continue
        
        // For arrays, filter out empty items
        if (Array.isArray(value)) {
          const filteredArray = value.filter(item => {
            if (typeof item === 'object' && item !== null) {
              // For objects, check if they have any non-empty values
              return Object.values(item).some(v => v !== undefined && v !== null && v !== '')
            }
            return item !== undefined && item !== null && item !== ''
          })
          // Only include array if it has at least one valid item
          if (filteredArray.length > 0) {
            requestBody[key] = filteredArray
          }
        } else if (typeof value === 'object' && value !== null) {
          // For objects, check if they have any non-empty values
          const filteredObj: Record<string, any> = {}
          let hasValues = false
          for (const [objKey, objValue] of Object.entries(value)) {
            if (objValue !== undefined && objValue !== null && objValue !== '') {
              filteredObj[objKey] = objValue
              hasValues = true
            }
          }
          if (hasValues) {
            requestBody[key] = filteredObj
          }
        } else {
          // Primitive values
          requestBody[key] = value
        }
      }
    }
    
    // If no form values or empty body, fall back to examples/defaults
    if (!requestBody || Object.keys(requestBody).length === 0) {
      requestBody = jsonContent.example || resolvedSchema?.example || {}
      
      // If no example, build from schema properties
      if (!requestBody || Object.keys(requestBody).length === 0) {
        const properties = resolvedSchema?.properties || {}
        const required = resolvedSchema?.required || []
        requestBody = {}
        
        for (const [name, prop] of Object.entries(properties)) {
          // Schema is already dereferenced (no $refs)
          let schema = prop as any
          
          // Handle anyOf
          if (schema.anyOf && Array.isArray(schema.anyOf)) {
            const nonNullType = schema.anyOf.find((s: any) => s.type !== 'null' && s.type !== undefined)
            if (nonNullType) {
              schema = { ...nonNullType, description: schema.description || nonNullType.description }
            }
          }
          
          // Include required fields and fields with examples/defaults
          if (required.includes(name) || schema.example !== undefined || schema.default !== undefined) {
            requestBody[name] = schema.example || schema.default || getDefaultValue(schema.type, schema.format)
          }
        }
        
        // If still empty but has required fields, include all required
        if (Object.keys(requestBody).length === 0 && required.length > 0) {
          for (const name of required) {
            const prop = properties[name]
            if (prop) {
              // Schema is already dereferenced (no $refs)
              let schema = prop as any
              
              // Handle anyOf
              if (schema.anyOf && Array.isArray(schema.anyOf)) {
                const nonNullType = schema.anyOf.find((s: any) => s.type !== 'null' && s.type !== undefined)
                if (nonNullType) {
                  schema = { ...nonNullType, description: schema.description || nonNullType.description }
                }
              }
              
              requestBody[name] = schema.example || schema.default || getDefaultValue(schema.type, schema.format)
            }
          }
        }
      }
    }
    
    // Final cleanup: recursively remove any empty arrays that might have been added from examples/defaults
    // Empty arrays cause API errors for fields like functions/tools
    const cleanEmptyArrays = (obj: any): any => {
      if (Array.isArray(obj)) {
        // Filter out empty arrays
        if (obj.length === 0) {
          return undefined // Signal to remove this
        }
        // Filter out empty items and clean nested structures
        const filtered = obj
          .map(item => cleanEmptyArrays(item))
          .filter(item => {
            if (item === undefined) return false
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              return Object.values(item).some(v => v !== undefined && v !== null && v !== '')
            }
            return item !== undefined && item !== null && item !== ''
          })
        return filtered.length > 0 ? filtered : undefined
      } else if (typeof obj === 'object' && obj !== null) {
        const cleaned: Record<string, any> = {}
        let hasValues = false
        for (const [key, value] of Object.entries(obj)) {
          const cleanedValue = cleanEmptyArrays(value)
          if (cleanedValue !== undefined) {
            cleaned[key] = cleanedValue
            hasValues = true
          }
        }
        return hasValues ? cleaned : undefined
      }
      return obj
    }
    
    if (requestBody) {
      const cleaned = cleanEmptyArrays(requestBody)
      requestBody = cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned) ? cleaned : {}
    }
  }
  
  // Check for authentication - check both operation security and global security
  const hasAuth: boolean = !!(operation.security && operation.security.length > 0) || 
                  !!(spec.security && spec.security.length > 0) ||
                  !!(spec.components?.securitySchemes && Object.keys(spec.components.securitySchemes).length > 0)
  
  // Get auth type and scheme details from security schemes
  let authType: string | null = null
  let authScheme: any = null
  if (hasAuth) {
    // Try to get from operation security first
    if (operation.security && operation.security.length > 0) {
      const firstSecurity = operation.security[0]
      authType = Object.keys(firstSecurity)[0] || null
    }
    // Fall back to global security
    if (!authType && spec.security && spec.security.length > 0) {
      const firstSecurity = spec.security[0]
      authType = Object.keys(firstSecurity)[0] || null
    }
    // Fall back to first security scheme
    if (!authType && spec.components?.securitySchemes) {
      authType = Object.keys(spec.components.securitySchemes)[0] || null
    }
    
    // Get the actual security scheme details
    if (authType && spec.components?.securitySchemes?.[authType]) {
      authScheme = spec.components.securitySchemes[authType]
    }
  }
  
  // API key is not part of form values - use placeholder
  const apiKeyDisplay = 'YOUR_API_KEY'
  
  // Generate Python code
  samples.push({
    language: 'python',
    code: generatePythonCode(method, fullPath, baseUrl, queryParams, requestBody, hasAuth, authType, authScheme, apiKeyDisplay, contentType),
    icon: getLanguageIcon('python'),
  })

  // Generate JavaScript code
  samples.push({
    language: 'javascript',
    code: generateJavaScriptCode(method, fullPath, baseUrl, queryParams, requestBody, hasAuth, authType, authScheme, apiKeyDisplay, contentType),
    icon: getLanguageIcon('javascript'),
  })

  // Generate cURL code
  samples.push({
    language: 'curl',
    code: generateCurlCode(method, fullPath, baseUrl, queryParams, requestBody, hasAuth, authType, authScheme, apiKeyDisplay, contentType),
    icon: getLanguageIcon('curl'),
  })
  
  return samples
}

function generatePythonCode(
  method: string,
  path: string,
  baseUrl: string,
  queryParams: Record<string, any>,
  requestBody: any,
  hasAuth: boolean,
  authType: string | null,
  authScheme: any,
  apiKeyDisplay: string = 'YOUR_API_KEY',
  contentType: string = 'application/json'
): string {
  const url = `${baseUrl}${path}`
  const hasQuery = Object.keys(queryParams).length > 0
  const hasBody = requestBody && Object.keys(requestBody).length > 0
  
  let code = 'import requests\n\n'
  
  if (hasQuery) {
    // Format arrays properly for Python requests
    const formattedParams: Record<string, any> = {}
    for (const [key, value] of Object.entries(queryParams)) {
      if (Array.isArray(value)) {
        // Python requests handles arrays as lists, which will be formatted as multiple params
        formattedParams[key] = value
      } else {
        formattedParams[key] = value
      }
    }
    const paramsStr = JSON.stringify(formattedParams, null, 2).replace(/"/g, "'")
    code += `params = ${paramsStr}\n\n`
  }
  
  if (hasBody) {
    const bodyStr = JSON.stringify(requestBody, null, 2).replace(/"/g, "'")
    code += `payload = ${bodyStr}\n\n`
  }
  
  if (hasAuth || hasBody) {
    code += `headers = {\n`
    if (hasBody) {
      code += `    'Content-Type': '${contentType}',\n`
    }
    if (hasAuth) {
      const headerName = getAuthHeaderName(authScheme)
      const headerValue = getAuthHeaderValue(authScheme, apiKeyDisplay)
      code += `    '${headerName}': '${headerValue}'\n`
    }
    code += `}\n\n`
  }
  
  code += `response = requests.${method}(`
  code += `'${url}'`
  
  if (hasQuery) {
    code += `,\n    params=params`
  }
  
  if (hasBody) {
    code += `,\n    json=payload`
  }
  
  if (hasAuth) {
    code += `,\n    headers=headers`
  }
  
  code += `\n)\n\n`
  code += `print(response.json())`
  
  return code
}

function generateJavaScriptCode(
  method: string,
  path: string,
  baseUrl: string,
  queryParams: Record<string, any>,
  requestBody: any,
  hasAuth: boolean,
  authType: string | null,
  authScheme: any,
  apiKeyDisplay: string = 'YOUR_API_KEY',
  contentType: string = 'application/json'
): string {
  const url = `${baseUrl}${path}`
  const hasQuery = Object.keys(queryParams).length > 0
  const hasBody = requestBody && Object.keys(requestBody).length > 0
  
  let code = ''
  
  if (hasQuery) {
    const paramsStr = JSON.stringify(queryParams, null, 2)
    code += `const params = ${paramsStr};\n\n`
  }
  
  if (hasBody) {
    const bodyStr = JSON.stringify(requestBody, null, 2)
    code += `const payload = ${bodyStr};\n\n`
  }
  
  code += `const url = '${url}'`
  if (hasQuery) {
    // Build query string with proper array handling
    const queryParts: string[] = []
    for (const [k, v] of Object.entries(queryParams)) {
      if (Array.isArray(v)) {
        // For arrays, add multiple query parameters
        v.forEach(item => {
          queryParts.push(`${k}=${encodeURIComponent(String(item))}`)
        })
      } else {
        queryParts.push(`${k}=${encodeURIComponent(String(v))}`)
      }
    }
    if (queryParts.length > 0) {
      code += ` + '?${queryParts.join('&')}'`
    }
  }
  code += `;\n\n`
  
  code += `const options = {\n`
  code += `  method: '${method.toUpperCase()}',\n`
  
  if (hasAuth || hasBody) {
    code += `  headers: {\n`
    if (hasBody) {
      code += `    'Content-Type': '${contentType}',\n`
    }
    if (hasAuth) {
      const headerName = getAuthHeaderName(authScheme)
      const headerValue = getAuthHeaderValue(authScheme, apiKeyDisplay)
      code += `    '${headerName}': '${headerValue}'\n`
    }
    code += `  }`
  }
  
  if (hasBody) {
    code += `,\n  body: JSON.stringify(payload)`
  }
  
  code += `\n};\n\n`
  code += `fetch(url, options)\n`
  code += `  .then(response => response.json())\n`
  code += `  .then(data => console.log(data));`
  
  return code
}

function generateCurlCode(
  method: string,
  path: string,
  baseUrl: string,
  queryParams: Record<string, any>,
  requestBody: any,
  hasAuth: boolean,
  authType: string | null,
  authScheme: any,
  apiKeyDisplay: string = 'YOUR_API_KEY',
  contentType: string = 'application/json'
): string {
  const url = `${baseUrl}${path}`
  const hasQuery = Object.keys(queryParams).length > 0
  const hasBody = requestBody && Object.keys(requestBody).length > 0
  
  let code = `curl -X ${method.toUpperCase()} \\\n`
  code += `  '${url}`
  
  if (hasQuery) {
    // Build query string with proper array handling
    const queryParts: string[] = []
    for (const [k, v] of Object.entries(queryParams)) {
      if (Array.isArray(v)) {
        // For arrays, add multiple query parameters
        v.forEach(item => {
          queryParts.push(`${k}=${encodeURIComponent(String(item))}`)
        })
      } else {
        queryParts.push(`${k}=${encodeURIComponent(String(v))}`)
      }
    }
    if (queryParts.length > 0) {
      code += `?${queryParts.join('&')}`
    }
  }
  code += `' \\\n`
  
  if (hasBody) {
    const bodyStr = JSON.stringify(requestBody)
    code += `  -H 'Content-Type: ${contentType}' \\\n`
    code += `  -d '${bodyStr}' \\\n`
  }
  
  if (hasAuth) {
    const headerName = getAuthHeaderName(authScheme)
    const headerValue = getAuthHeaderValue(authScheme, apiKeyDisplay)
    code += `  -H '${headerName}: ${headerValue}'`
  } else if (!hasBody) {
    code = code.trim().slice(0, -2) // Remove trailing backslash
  }
  
  return code
}

/**
 * Get the header name for authentication from the security scheme
 */
function getAuthHeaderName(authScheme: any): string {
  if (!authScheme) {
    return 'Authorization' // Default fallback
  }
  
  // For apiKey type, use the 'name' field
  if (authScheme.type === 'apiKey' && authScheme.in === 'header') {
    return authScheme.name || 'Authorization'
  }
  
  // For http type with bearer scheme
  if (authScheme.type === 'http' && authScheme.scheme === 'bearer') {
    return 'Authorization'
  }
  
  // For http type with basic scheme
  if (authScheme.type === 'http' && authScheme.scheme === 'basic') {
    return 'Authorization'
  }
  
  // Default fallback
  return 'Authorization'
}

/**
 * Get the header value format for authentication from the security scheme
 */
function getAuthHeaderValue(authScheme: any, apiKey: string): string {
  if (!authScheme) {
    return apiKey // Default fallback
  }
  
  // For apiKey type, just use the key directly (no Bearer prefix)
  if (authScheme.type === 'apiKey') {
    return apiKey
  }
  
  // For http type with bearer scheme
  if (authScheme.type === 'http' && authScheme.scheme === 'bearer') {
    return `Bearer ${apiKey}`
  }
  
  // For http type with basic scheme (would need base64 encoding in real usage)
  if (authScheme.type === 'http' && authScheme.scheme === 'basic') {
    return `Basic ${apiKey}` // Note: In real usage, this should be base64 encoded
  }
  
  // Default fallback
  return apiKey
}

function getDefaultValue(type?: string, format?: string): any {
  if (format === 'email') {
    return 'user@example.com'
  }
  if (format === 'password') {
    return 'password'
  }
  if (format === 'uuid') {
    return '123e4567-e89b-12d3-a456-426614174000'
  }
  if (format === 'date-time') {
    return '2024-01-01T00:00:00Z'
  }
  
  switch (type) {
    case 'string':
      return 'string'
    case 'integer':
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return 'value'
  }
}

function getLanguageIcon(language: string): React.ReactNode {
  const lang = language.toLowerCase()
  if (lang === 'python') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.09-.32.05-.24.02-.16-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.24.38-.2.44-.18.51-.15.58-.13-.64-.09-.71-.07-.77-.04-.84-.01-1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01.21.03zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z"/>
      </svg>
    )
  } else if (lang === 'javascript' || lang === 'js') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <text x="12" y="15" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="bold" fill="currentColor" textAnchor="middle">JS</text>
      </svg>
    )
  } else if (lang === 'curl') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2H12V4H14V14H6V12H4V2Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M2 4H10V12H2V4Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    )
  }
  return null
}

