'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/api-playground/sidebar'
import { ApiPageHeader } from '@/components/api-playground/api-page-header'
import { ApiForm } from '@/components/api-playground/api-form'
import { CodeEditor } from '@/components/api-playground/code-editor'
import { ResizablePanel } from '@/components/api-playground/resizable-panel'
import { ErrorBoundary } from '@/components/error-boundary'
import { parseOpenAPIToConfig } from '@/lib/openapi-parser'
import { parseSidebarConfig } from '@/lib/openapi-sidebar-parser'
import { findEndpointBySlug, generateSlugFromEndpoint } from '@/lib/slug-utils'
import { extractDocsUrl } from '@/lib/utils'
import { FileText, Menu, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
// Note: openApiSpec should be dereferenced (all $refs resolved) at generation time
// using @apidevtools/swagger-parser. The generator script should handle this.
import { useOpenAPISpec } from '@/lib/use-openapi-spec'
import LandingPage from '../landing-page'

export default function SlugPage() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const methodParam = searchParams.get('method')
  const slug = params?.slug as string[] | undefined
  const { spec: openApiSpec, loading: specLoading } = useOpenAPISpec()

  // If we're on the root path, show landing page instead
  if (pathname === '/') {
    return <LandingPage />
  }

  const [endpointConfig, setEndpointConfig] = useState<any>(null)
  const [sidebarConfig, setSidebarConfig] = useState<any>(null)
  const [apiResponse, setApiResponse] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [endpointKey, setEndpointKey] = useState<string | undefined>(undefined)
  const [availableMethods, setAvailableMethods] = useState<string[]>([])
  const [methodToKeyMap, setMethodToKeyMap] = useState<Record<string, string>>({})
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const previousEndpointKeyRef = useRef<string | undefined>(undefined)
  const currentEndpointKeyRef = useRef<string | undefined>(undefined) // Track current endpoint for race condition checks
  const abortControllerRef = useRef<AbortController | null>(null) // Track in-flight requests
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Close mobile menu when pathname changes (navigation happens)
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    // Wait for spec to load
    if (!openApiSpec || specLoading) return

    // Don't handle empty slug - redirect to root to let page.tsx handle it (landing page)
    if (!slug || slug.length === 0) {
      router.replace('/')
      return
    }

    // Find endpoint by slug
    const foundEndpointKey = findEndpointBySlug(openApiSpec as any, slug)
    const slugString = Array.isArray(slug) ? slug.join('/') : String(slug)
    const previousEndpointKey = previousEndpointKeyRef.current
    console.log('[DEBUG] Slug changed:', slugString, 'Found endpoint key:', foundEndpointKey, 'Previous endpoint key:', previousEndpointKey, 'Current endpoint key:', endpointKey)

    if (!foundEndpointKey) {
      // If not found, redirect to landing page
      router.replace('/')
      return
    }

    // Calculate available methods for this path
    const endpoints = openApiSpec['x-ui-config']?.endpoints || {}
    const foundEndpointConfig = endpoints[foundEndpointKey]
    const currentPath = foundEndpointConfig?.path

    const methods: string[] = []
    const methodMap: Record<string, string> = {}

    if (currentPath) {
      // Normalize path for comparison
      let normPath = currentPath
      if (!normPath.startsWith('/')) normPath = '/' + normPath
      if (normPath.endsWith('/') && normPath.length > 1) normPath = normPath.slice(0, -1)

      Object.entries(endpoints).forEach(([key, config]: [string, any]) => {
        let p = config.path
        if (!p.startsWith('/')) p = '/' + p
        if (p.endsWith('/') && p.length > 1) p = p.slice(0, -1)

        if (p === normPath) {
          const m = config.method.toUpperCase()
          methods.push(m)
          methodMap[m] = key
        }
      })
    }

    // Sort methods: GET, POST, PUT, PATCH, DELETE, others
    const methodPriority = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
    methods.sort((a, b) => {
      const idxA = methodPriority.indexOf(a)
      const idxB = methodPriority.indexOf(b)
      const pA = idxA === -1 ? 999 : idxA
      const pB = idxB === -1 ? 999 : idxB
      return pA - pB
    })

    setAvailableMethods(methods)
    setMethodToKeyMap(methodMap)

    // Determine final endpoint key based on method param
    let finalEndpointKey = foundEndpointKey
    const requestedMethod = methodParam?.toUpperCase()

    if (requestedMethod && methodMap[requestedMethod]) {
      finalEndpointKey = methodMap[requestedMethod]
    }

    // Only update if endpoint actually changed (not just a re-render)
    if (finalEndpointKey !== previousEndpointKey) {
      console.log('[DEBUG] Endpoint changed from', previousEndpointKey, 'to', finalEndpointKey, '- resetting state')
      previousEndpointKeyRef.current = finalEndpointKey

      // IMMEDIATELY clear all state before setting new endpoint
      // Use functional updates to ensure we're clearing the latest state
      setApiResponse(() => null)
      setError(() => null)
      setIsLoading(() => false)
      setFormValues(() => ({}))

      // Cancel any in-flight requests for the previous endpoint
      if (abortControllerRef.current) {
        console.log('[DEBUG] Cancelling in-flight request for previous endpoint')
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }

      // Set new endpoint key and config
      setEndpointKey(() => finalEndpointKey)
      currentEndpointKeyRef.current = finalEndpointKey // Update ref immediately
      const config = parseOpenAPIToConfig(openApiSpec as any, finalEndpointKey)
      setEndpointConfig(() => config)

      console.log('[DEBUG] State cleared and new endpoint set:', finalEndpointKey)
    } else {
      console.log('[DEBUG] Endpoint unchanged, skipping state reset')
    }

    const sidebar = parseSidebarConfig(
      {
        ...openApiSpec['x-ui-config']?.sidebar,
        endpoints: openApiSpec['x-ui-config']?.endpoints
      },
      (key: string) => {
        const endpointSlug = generateSlugFromEndpoint(openApiSpec as any, key)
        if (endpointSlug) {
          router.push(endpointSlug)
        } else {
          router.push(`/${key}`)
        }
      },
      openApiSpec as any
    )

    // Update active state in sidebar
    if (sidebar.navItems) {
      sidebar.navItems.forEach(section => {
        section.items.forEach(item => {
          // Active if it matches the current endpoint OR if it matches any endpoint in the current group (same path)
          // But since we grouped by path in the sidebar, the item.endpointKey is just one of them (the default).
          // We should check if the item's endpointKey is in our available methods map?
          // Actually, sidebar items are now unique per path.
          // The sidebar parser picks the "best" endpoint key for the item.
          // We should check if that "best" key corresponds to our current path.

          // Simple check: does the item's endpointKey match any of our available methods?
          // Or better: does the item's label match our current path?
          // But label might be title.

          // Let's check if the item's endpointKey is in our methodMap values
          const itemKey = item.endpointKey
          if (itemKey && Object.values(methodMap).includes(itemKey)) {
            item.active = true
          } else {
            item.active = false
          }
        })
      })
    }

    setSidebarConfig(sidebar)
  }, [slug, router, openApiSpec, specLoading, methodParam])

  // Extract operation and spec for CodeEditor (must be before any conditional returns)
  const operation = useMemo(() => {
    if (!endpointKey || !openApiSpec || !openApiSpec['x-ui-config']?.endpoints) {
      return undefined
    }
    const endpoints = openApiSpec['x-ui-config'].endpoints as Record<string, any>
    if (!endpoints[endpointKey]) {
      return undefined
    }
    const uiConfig = endpoints[endpointKey]
    const path = uiConfig.path as string
    const method = uiConfig.method.toLowerCase() as string
    const paths = openApiSpec.paths as Record<string, Record<string, any>> | undefined
    const openApiOperation = paths?.[path]?.[method]

    if (!openApiOperation) {
      return undefined
    }

    // Structure operation object to match what generateCodeSamples expects
    return {
      method: uiConfig.method, // Use the method from UI config (uppercase)
      path: path,
      parameters: openApiOperation.parameters,
      requestBody: openApiOperation.requestBody,
      security: openApiOperation.security,
    }
  }, [endpointKey, openApiSpec])

  const spec = useMemo(() => openApiSpec as any, [openApiSpec])

  // Get auth config and security scheme
  const authConfig = useMemo(() => {
    if (!openApiSpec) return { mode: 'manual' } as { mode?: 'automatic' | 'manual'; schemeName?: string }
    const config = openApiSpec['x-ui-config']?.auth || { mode: 'manual' }
    return config as { mode?: 'automatic' | 'manual'; schemeName?: string }
  }, [openApiSpec])

  const securityScheme = useMemo(() => {
    if (!openApiSpec) return undefined
    const securitySchemes = openApiSpec.components?.securitySchemes as Record<string, any> | undefined

    // First try to get scheme from config
    if (authConfig.schemeName && securitySchemes) {
      const scheme = securitySchemes[authConfig.schemeName]
      if (scheme) return scheme
    }

    // Fall back to checking operation security or global security
    if (operation?.security && operation.security.length > 0) {
      // Get first security scheme from operation
      const firstSecurity = operation.security[0]
      const schemeName = Object.keys(firstSecurity)[0]
      if (schemeName && securitySchemes) {
        return securitySchemes[schemeName]
      }
    }

    // Check global security
    if (openApiSpec.security && openApiSpec.security.length > 0) {
      const firstSecurity = openApiSpec.security[0]
      const schemeName = Object.keys(firstSecurity)[0]
      if (schemeName && securitySchemes) {
        return securitySchemes[schemeName]
      }
    }

    // If security schemes exist, use the first one
    if (securitySchemes && Object.keys(securitySchemes).length > 0) {
      const firstSchemeName = Object.keys(securitySchemes)[0]
      return securitySchemes[firstSchemeName]
    }

    return undefined
  }, [authConfig.schemeName, operation, openApiSpec])

  // Don't render anything if slug is empty - let root page handle it
  if (!slug || slug.length === 0) {
    return null
  }

  if (specLoading || !openApiSpec || !endpointConfig || !sidebarConfig) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  const handleSubmit = async (data: Record<string, any>, apiKey?: string) => {
    // Guard: ensure we have endpointKey and endpointConfig
    if (!endpointKey || !endpointConfig) {
      setError('Endpoint not loaded. Please wait...')
      return
    }

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    // Store current endpointKey at the start of the request to prevent race conditions
    // Use ref to get the most current value, not stale closure
    const currentEndpointKey = currentEndpointKeyRef.current || endpointKey
    console.log('[DEBUG] handleSubmit called for endpoint:', currentEndpointKey, 'Ref:', currentEndpointKeyRef.current)

    setIsLoading(true)
    setError(null)
    setApiResponse(null)

    try {
      // Get method and path from endpointKey to ensure we use the correct endpoint
      const endpoints = openApiSpec['x-ui-config']?.endpoints as Record<string, any> | undefined
      if (!endpoints || !endpoints[endpointKey]) {
        setError('Endpoint configuration not found')
        setIsLoading(false)
        return
      }

      const uiConfig = endpoints[endpointKey]
      const method = uiConfig.method as string
      const path = uiConfig.path as string

      // Get content type from requestBody content (default to application/json)
      const requestBodyContent = operation?.requestBody?.content
      const contentType = requestBodyContent
        ? Object.keys(requestBodyContent)[0] || 'application/json'
        : 'application/json'

      // Get security scheme info
      let securityScheme: any = null
      const securitySchemes = openApiSpec.components?.securitySchemes as Record<string, any> | undefined
      if (securitySchemes) {
        // Try to get from operation security first
        if (operation?.security && operation.security.length > 0) {
          const firstSecurity = operation.security[0]
          const schemeName = Object.keys(firstSecurity)[0]
          if (schemeName && securitySchemes[schemeName]) {
            securityScheme = securitySchemes[schemeName]
          }
        }
        // Fall back to global security
        if (!securityScheme && openApiSpec.security && openApiSpec.security.length > 0) {
          const firstSecurity = openApiSpec.security[0]
          const schemeName = Object.keys(firstSecurity)[0]
          if (schemeName && securitySchemes[schemeName]) {
            securityScheme = securitySchemes[schemeName]
          }
        }
        // Fall back to first security scheme
        if (!securityScheme) {
          const schemeName = Object.keys(securitySchemes)[0]
          if (schemeName) {
            securityScheme = securitySchemes[schemeName]
          }
        }
      }

      // Determine the correct header name for API key based on security scheme
      // For query parameter auth, we still pass it via a header to the API route,
      // which will then add it to the query string
      let authHeaderName: string | null = null
      if (securityScheme?.type === 'apiKey') {
        // For apiKey auth, use the security scheme name (works for both header and query)
        authHeaderName = securityScheme.name || 'x-api-key'
      } else if (securityScheme?.type === 'http' && securityScheme?.scheme === 'bearer') {
        authHeaderName = 'authorization'
      } else if (securityScheme) {
        authHeaderName = 'x-api-key'
      }

      // API key is passed separately, not in form data
      let response: Response
      try {
        response = await fetch('/api/run', {
          method: 'POST',
          signal: abortController.signal, // Add abort signal to cancel if endpoint changes
          headers: {
            'Content-Type': 'application/json',
            'X-Endpoint-Key': currentEndpointKey, // Include endpoint key in header for deduplication
            ...(apiKey && authHeaderName ? { [authHeaderName]: securityScheme?.type === 'http' && securityScheme?.scheme === 'bearer' ? `Bearer ${apiKey}` : apiKey } : {}),
          },
          body: JSON.stringify({
            method: method,
            path: path,
            data: data,
            baseUrl: openApiSpec.servers?.[0]?.url || '',
            contentType,
            securityScheme,
            operation, // Pass the operation so API route can check for required params
            endpointKey: currentEndpointKey, // Include endpoint key in body for deduplication
          }),
        })
      } catch (networkError: unknown) {
        // Check if request was aborted (endpoint changed)
        if (abortController.signal.aborted) {
          console.log('[DEBUG] Request aborted - endpoint changed during request')
          return // Don't set error or response, just return silently
        }

        // Handle network errors (fetch failed - no connection, CORS, etc.)
        let errorMessage = 'Network error: Could not reach the server'

        if (networkError instanceof TypeError) {
          if (networkError.message.includes('fetch')) {
            errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection.'
          } else {
            errorMessage = `Network error: ${networkError.message}`
          }
        } else if (networkError instanceof Error) {
          errorMessage = `Network error: ${networkError.message}`
        } else if (typeof networkError === 'string') {
          errorMessage = `Network error: ${networkError}`
        }

        // Only set error if we're still on the same endpoint
        if (currentEndpointKey === currentEndpointKeyRef.current) {
          setError(errorMessage)
        }
        return
      }

      // Parse JSON response
      let result: any
      try {
        result = await response.json()
      } catch (jsonError: unknown) {
        // Handle JSON parse errors
        let errorMessage = 'Invalid response: Server returned non-JSON data'
        const requestId = response.headers.get('x-request-id') || 'unknown'

        if (jsonError instanceof SyntaxError) {
          errorMessage = `Invalid response format: ${jsonError.message}`
        } else if (jsonError instanceof Error) {
          errorMessage = `Failed to parse response: ${jsonError.message}`
        }

        setError(`${errorMessage} (Request ID: ${requestId})`)
        return
      }

      // Check if response is ok
      if (!response.ok) {
        // Extract error details from response
        const errorMessage = result.error || result.message || 'API request failed'
        const requestId = result.requestId || 'unknown'
        const details = result.details ? ` Details: ${Array.isArray(result.details) ? result.details.join(', ') : result.details}` : ''

        // Handle specific error types
        if (response.status === 504) {
          setError(`Request timeout: ${errorMessage} (Request ID: ${requestId})`)
        } else if (response.status === 413) {
          setError(`Request too large: ${errorMessage} (Request ID: ${requestId})`)
        } else if (response.status === 400) {
          setError(`Invalid request: ${errorMessage}${details} (Request ID: ${requestId})`)
        } else if (response.status >= 500) {
          setError(`Server error: ${errorMessage} (Request ID: ${requestId})`)
        } else {
          setError(`${errorMessage}${details} (Request ID: ${requestId})`)
        }
        return
      }

      // Only set response if we're still on the same endpoint (prevent race conditions)
      // Check if request was aborted
      if (abortController.signal.aborted) {
        console.log('[DEBUG] Request was aborted - ignoring response')
        return
      }

      // Double-check by comparing with the ref (most reliable source of truth)
      const currentRefEndpoint = currentEndpointKeyRef.current
      if (currentEndpointKey === currentRefEndpoint) {
        console.log('[DEBUG] Setting API response for endpoint:', currentEndpointKey, 'Method:', method, 'Path:', path, 'Response status:', result?.status)
        setApiResponse(() => result)
        abortControllerRef.current = null // Clear abort controller on success
      } else {
        console.log('[DEBUG] Ignoring API response - endpoint changed. Request was for:', currentEndpointKey, 'Current ref:', currentRefEndpoint)
      }
    } catch (err: unknown) {
      // Handle any other unexpected errors
      let errorMessage = 'An unexpected error occurred while making the API request'

      if (err instanceof Error) {
        errorMessage = err.message || errorMessage
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String(err.message)
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyForAI = () => {
    if (!endpointConfig) return

    const baseUrl = openApiSpec.servers?.[0]?.url || ''
    const method = endpointConfig.method
    const path = endpointConfig.path
    const paths = openApiSpec.paths as Record<string, Record<string, any>> | undefined
    const operation = paths?.[path]?.[method.toLowerCase()]

    // Build example URL with path parameters (use examples/defaults, not form values)
    let fullPath = path
    const pathParams: Record<string, any> = {}

    if (operation?.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'path') {
          const value = param.schema?.example ||
            param.example ||
            param.schema?.default ||
            `{${param.name}}`
          pathParams[param.name] = value
          fullPath = fullPath.replace(`{${param.name}}`, String(value))
        }
      }
    }

    // Build example query string (use examples/defaults, not form values)
    const exampleQueryParams: Array<[string, any]> = []
    if (operation?.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'query') {
          const value = param.schema?.example ||
            param.example ||
            param.schema?.default
          if (value !== undefined && value !== null && value !== '') {
            exampleQueryParams.push([param.name, value])
          }
        }
      }
    }

    const queryString = exampleQueryParams
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`).join('&')
        }
        return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      })
      .join('&')

    const fullUrl = queryString
      ? `${baseUrl}${fullPath}?${queryString}`
      : `${baseUrl}${fullPath}`

    // Generate markdown
    let markdown = `# ${endpointConfig.title}\n\n`

    if (endpointConfig.description) {
      markdown += `${endpointConfig.description}\n\n`
    }

    markdown += `## Endpoint\n\n`
    markdown += `**Method:** \`${method}\`\n\n`
    markdown += `**Path:** \`${path}\`\n\n`
    markdown += `**Full URL:** \`${fullUrl}\`\n\n`

    // Authentication
    if (operation?.security || openApiSpec.security) {
      const security = operation?.security || openApiSpec.security
      const securitySchemes = openApiSpec.components?.securitySchemes as Record<string, any> | undefined
      markdown += `## Authentication\n\n`
      if (security && security.length > 0) {
        for (const sec of security) {
          for (const [schemeName] of Object.entries(sec)) {
            const scheme = securitySchemes?.[schemeName]
            if (scheme) {
              if (scheme.type === 'http' && scheme.scheme === 'bearer') {
                markdown += `**Required:** Bearer token authentication\n\n`
                markdown += `Include header: \`Authorization: Bearer YOUR_API_KEY\`\n\n`
              } else if (scheme.type === 'apiKey') {
                if (scheme.in === 'header') {
                  markdown += `**Required:** API key in header\n\n`
                  markdown += `Include header: \`${scheme.name}: YOUR_API_KEY\`\n\n`
                } else if (scheme.in === 'query') {
                  markdown += `**Required:** API key in query parameter\n\n`
                  markdown += `Add to URL: \`?${scheme.name}=YOUR_API_KEY\`\n\n`
                }
              }
            }
          }
        }
      }
    }

    // Path Parameters
    const pathParamsList = operation?.parameters?.filter((p: any) => p.in === 'path') || []
    if (pathParamsList.length > 0) {
      markdown += `## Path Parameters\n\n`
      for (const param of pathParamsList) {
        markdown += `### \`${param.name}\`\n\n`
        if (param.description) {
          markdown += `${param.description}\n\n`
        }
        markdown += `**Type:** \`${param.schema?.type || 'string'}\`\n\n`
        markdown += `**Required:** Yes\n\n`
        if (param.schema?.example !== undefined) {
          markdown += `**Example:** \`${JSON.stringify(param.schema.example)}\`\n\n`
        } else if (param.example !== undefined) {
          markdown += `**Example:** \`${JSON.stringify(param.example)}\`\n\n`
        }
      }
    }

    // Query Parameters
    const queryParamsList = operation?.parameters?.filter((p: any) => p.in === 'query') || []
    if (queryParamsList.length > 0) {
      markdown += `## Query Parameters\n\n`
      for (const param of queryParamsList) {
        markdown += `### \`${param.name}\`\n\n`
        if (param.description) {
          markdown += `${param.description}\n\n`
        }

        let paramSchema = param.schema
        if (paramSchema?.$ref) {
          const refPath = paramSchema.$ref.replace('#/components/schemas/', '')
          const schemas = openApiSpec.components?.schemas as Record<string, any> | undefined
          paramSchema = schemas?.[refPath] || paramSchema
        }

        let typeDisplay = paramSchema?.type || 'string'
        if (paramSchema?.type === 'object' && paramSchema.properties) {
          const propKeys = Object.keys(paramSchema.properties)
          if (propKeys.length > 0) {
            typeDisplay = `object (${propKeys.join(', ')})`
          }
        }

        markdown += `**Type:** \`${typeDisplay}\`\n\n`
        markdown += `**Required:** ${param.required ? 'Yes' : 'No'}\n\n`
        if (paramSchema?.enum) {
          markdown += `**Options:** ${paramSchema.enum.map((v: any) => `\`${v}\``).join(', ')}\n\n`
        }
        if (paramSchema?.default !== undefined) {
          markdown += `**Default:** \`${JSON.stringify(paramSchema.default)}\`\n\n`
        }
        if (paramSchema?.example !== undefined) {
          markdown += `**Example:** \`${JSON.stringify(paramSchema.example)}\`\n\n`
        } else if (param.example !== undefined) {
          markdown += `**Example:** \`${JSON.stringify(param.example)}\`\n\n`
        }
      }
    }

    // Request Body
    if (operation?.requestBody) {
      markdown += `## Request Body\n\n`
      const requestBodyContent = operation.requestBody.content
      const contentType = requestBodyContent
        ? (requestBodyContent['application/json'] ? 'application/json' : Object.keys(requestBodyContent)[0])
        : 'application/json'
      const jsonContent = requestBodyContent?.[contentType]
      const bodySchema = jsonContent?.schema

      if (bodySchema) {
        let resolvedSchema = bodySchema
        if (bodySchema.$ref) {
          const refPath = bodySchema.$ref.replace('#/components/schemas/', '')
          const schemas = openApiSpec.components?.schemas as Record<string, any> | undefined
          resolvedSchema = schemas?.[refPath] || bodySchema
        }

        if (resolvedSchema.description) {
          markdown += `${resolvedSchema.description}\n\n`
        } else if (operation.requestBody.description) {
          markdown += `${operation.requestBody.description}\n\n`
        }

        markdown += `**Content-Type:** \`${contentType}\`\n\n`

        if (resolvedSchema.properties) {
          const required = resolvedSchema.required || []
          markdown += `### Fields\n\n`

          for (const [name, prop] of Object.entries(resolvedSchema.properties)) {
            let propSchema = prop as any
            if (propSchema.$ref) {
              const refPath = propSchema.$ref.replace('#/components/schemas/', '')
              const schemas = openApiSpec.components?.schemas as Record<string, any> | undefined
              const refSchema = schemas?.[refPath]
              if (refSchema) {
                propSchema = { ...refSchema, description: propSchema.description || refSchema.description }
              }
            }

            if (propSchema.anyOf && Array.isArray(propSchema.anyOf)) {
              const nonNullType = propSchema.anyOf.find((s: any) => s.type !== 'null' && s.type !== undefined)
              if (nonNullType) {
                propSchema = { ...nonNullType, description: propSchema.description || nonNullType.description }
              }
            }

            markdown += `#### \`${name}\`\n\n`
            if (propSchema.description) {
              markdown += `${propSchema.description}\n\n`
            }
            markdown += `**Type:** \`${propSchema.type || 'object'}\`\n\n`
            markdown += `**Required:** ${required.includes(name) ? 'Yes' : 'No'}\n\n`
            if (propSchema.enum) {
              markdown += `**Options:** ${propSchema.enum.map((v: any) => `\`${v}\``).join(', ')}\n\n`
            }
            if (propSchema.example !== undefined) {
              markdown += `**Example:** \`${JSON.stringify(propSchema.example)}\`\n\n`
            }
            if (propSchema.default !== undefined) {
              markdown += `**Default:** \`${JSON.stringify(propSchema.default)}\`\n\n`
            }
          }
        }

        if (jsonContent.example) {
          markdown += `### Example Request Body\n\n`
          markdown += `\`\`\`json\n${JSON.stringify(jsonContent.example, null, 2)}\n\`\`\`\n\n`
        } else if (resolvedSchema.example) {
          markdown += `### Example Request Body\n\n`
          markdown += `\`\`\`json\n${JSON.stringify(resolvedSchema.example, null, 2)}\n\`\`\`\n\n`
        }
      } else {
        markdown += `**Content-Type:** \`${contentType}\`\n\n`
      }
    }

    // Response
    if (operation?.responses) {
      markdown += `## Response\n\n`
      const successResponse = operation.responses['200'] || operation.responses['201'] || operation.responses['204']
      if (successResponse) {
        const responseContentTypes = successResponse.content ? Object.keys(successResponse.content) : []
        const responseContentType = responseContentTypes.includes('application/json')
          ? 'application/json'
          : (responseContentTypes[0] || 'application/json')
        const responseContent = successResponse.content?.[responseContentType]
        if (responseContent?.schema) {
          let responseSchema = responseContent.schema
          if (responseSchema.$ref) {
            const refPath = responseSchema.$ref.replace('#/components/schemas/', '')
            const schemas = openApiSpec.components?.schemas as Record<string, any> | undefined
            responseSchema = schemas?.[refPath] || responseSchema
          }

          if (responseSchema.description) {
            markdown += `${responseSchema.description}\n\n`
          } else if (successResponse.description) {
            markdown += `${successResponse.description}\n\n`
          }

          if (responseContent.example) {
            markdown += `**Example Response:**\n\n`
            markdown += `\`\`\`json\n${JSON.stringify(responseContent.example, null, 2)}\n\`\`\`\n\n`
          } else if (responseSchema.example) {
            markdown += `**Example Response:**\n\n`
            markdown += `\`\`\`json\n${JSON.stringify(responseSchema.example, null, 2)}\n\`\`\`\n\n`
          }
        }
        markdown += `**Status Code:** \`${Object.keys(operation.responses).find(k => ['200', '201', '204'].includes(k)) || '200'}\`\n\n`
      }
    }

    // Code Examples
    const hasSpecExamples = operation['x-oaiMeta']?.examples?.request
    const hasGeneratedSamples = endpointConfig?.codeSamples && endpointConfig.codeSamples.length > 0

    if (hasSpecExamples || hasGeneratedSamples) {
      markdown += `## Code Examples\n\n`

      if (hasSpecExamples) {
        const requestExamples = operation['x-oaiMeta'].examples.request

        if (requestExamples.python) {
          markdown += `### Python\n\n`
          markdown += `\`\`\`python\n${requestExamples.python}\n\`\`\`\n\n`
        }

        if (requestExamples['node.js']) {
          markdown += `### Node.js\n\n`
          markdown += `\`\`\`javascript\n${requestExamples['node.js']}\n\`\`\`\n\n`
        } else if (requestExamples.node) {
          markdown += `### Node.js\n\n`
          markdown += `\`\`\`javascript\n${requestExamples.node}\n\`\`\`\n\n`
        }

        if (requestExamples.curl) {
          markdown += `### cURL\n\n`
          markdown += `\`\`\`bash\n${requestExamples.curl}\n\`\`\`\n\n`
        }
      }

      if (hasGeneratedSamples) {
        for (const sample of endpointConfig.codeSamples) {
          const lang = sample.language
          const code = sample.code

          if (lang === 'python') {
            markdown += `### Python\n\n`
            markdown += `\`\`\`python\n${code}\n\`\`\`\n\n`
          } else if (lang === 'javascript') {
            markdown += `### Node.js\n\n`
            markdown += `\`\`\`javascript\n${code}\n\`\`\`\n\n`
          } else if (lang === 'curl') {
            markdown += `### cURL\n\n`
            markdown += `\`\`\`bash\n${code}\n\`\`\`\n\n`
          }
        }
      }
    }

    navigator.clipboard.writeText(markdown)
  }

  const docsUrl = extractDocsUrl(openApiSpec as any)

  const handleDocs = () => {
    if (docsUrl) {
      window.open(docsUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const handleFormChange = (data: Record<string, any>, apiKey?: string) => {
    setFormValues(data)
    // API key is handled separately, not stored in formValues
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-background">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-default bg-sidebar">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 hover:bg-hover rounded transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-primary" />
          </button>
          {sidebarConfig?.workspace && (
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {sidebarConfig.workspace.image ? (
                <img
                  src={sidebarConfig.workspace.image}
                  alt={sidebarConfig.workspace.name}
                  className="w-5 h-5 rounded object-contain"
                />
              ) : (
                <div className="w-5 h-5 bg-primary rounded flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {sidebarConfig.workspace.icon}
                </div>
              )}
              <span className="text-sm font-medium text-primary">{sidebarConfig.workspace.name}</span>
            </Link>
          )}
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Desktop Sidebar */}
          <div className="hidden md:flex">
            <Sidebar
              navItems={sidebarConfig.navItems}
              activeEndpoint={endpointKey}
              workspace={sidebarConfig.workspace}
              openApiSpec={openApiSpec}
            />
          </div>

          {/* Mobile Sheet Sidebar */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetContent side="left" className="p-0 w-[280px]">
              <Sidebar
                navItems={sidebarConfig.navItems}
                activeEndpoint={endpointKey}
                workspace={sidebarConfig.workspace}
                openApiSpec={openApiSpec}
                onClose={() => setIsMobileMenuOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <ResizablePanel
            left={({ onRunClick }) => (
              <div className="p-8 max-w-[896px] w-full mx-auto min-w-0">
                <ApiPageHeader
                  title={endpointConfig.title}
                  description={endpointConfig.description}
                  actions={[
                    {
                      label: 'Copy for AI',
                      icon: (
                        <div className="flex items-center -space-x-1 mr-2 h-6 shrink-0">
                          <img
                            src="https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg"
                            alt="ChatGPT"
                            className="w-6 h-6 object-contain relative z-10 shrink-0 flex-shrink-0"
                            onLoad={() => console.log('[DEBUG] ChatGPT logo loaded')}
                            onError={(e) => {
                              console.error('[DEBUG] ChatGPT logo failed to load', e)
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                            }}
                          />
                          <img
                            src="https://www.anthropic.com/images/anthropic-logo.svg"
                            alt="Anthropic"
                            className="w-6 h-6 object-contain relative z-0 shrink-0 flex-shrink-0"
                            onLoad={() => console.log('[DEBUG] Anthropic logo loaded')}
                            onError={(e) => {
                              console.error('[DEBUG] Anthropic logo failed, trying favicon', e)
                              const target = e.target as HTMLImageElement
                              target.src = 'https://www.anthropic.com/favicon.ico'
                              target.onload = () => console.log('[DEBUG] Anthropic favicon loaded')
                              target.onerror = () => {
                                console.error('[DEBUG] Anthropic favicon also failed')
                                target.style.display = 'none'
                              }
                            }}
                          />
                          <img
                            src="https://www.gstatic.com/lamda/images/gemini_sparkle_v2_delta_v2.svg"
                            alt="Gemini"
                            className="w-6 h-6 object-contain relative shrink-0 flex-shrink-0"
                            onLoad={() => console.log('[DEBUG] Gemini logo loaded')}
                            onError={(e) => {
                              console.error('[DEBUG] Gemini logo failed, trying favicon', e)
                              const target = e.target as HTMLImageElement
                              target.src = 'https://www.google.com/favicon.ico'
                              target.onload = () => console.log('[DEBUG] Gemini favicon loaded')
                              target.onerror = () => {
                                console.error('[DEBUG] Gemini favicon also failed')
                                target.style.display = 'none'
                              }
                            }}
                          />
                        </div>
                      ),
                      onClick: handleCopyForAI,
                    },
                  ]}
                />

                <ApiForm
                  key={`form-${endpointKey}`} // Force remount when endpoint changes
                  urlField={endpointConfig.urlField}
                  formFields={endpointConfig.formFields}
                  onSubmit={handleSubmit}
                  onFormChange={handleFormChange}
                  isLoading={isLoading}
                  examples={endpointConfig.examples}
                  authConfig={authConfig}
                  securityScheme={securityScheme}
                  onRunClick={onRunClick}
                />
              </div>
            )}
            right={
              (() => {
                console.log('[DEBUG] Rendering CodeEditor with endpointKey:', endpointKey, 'apiResponse:', apiResponse ? 'has response' : 'null', 'isLoading:', isLoading)
                return (
                  <CodeEditor
                    key={endpointKey} // Force remount when endpoint changes
                    endpointKey={endpointKey} // Pass endpointKey as prop for internal use
                    codeSamples={endpointConfig.codeSamples}
                    defaultLanguage="python"
                    formValues={formValues}
                    operation={operation}
                    spec={spec}
                    apiResponse={apiResponse}
                    isLoading={isLoading}
                    error={error}
                  />
                )
              })()
            }
          />
        </div>
      </div>
    </ErrorBoundary>
  )
}
