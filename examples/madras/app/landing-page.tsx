'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/api-playground/sidebar'
import { parseSidebarConfig } from '@/lib/openapi-sidebar-parser'
import { generateSlugFromEndpoint } from '@/lib/slug-utils'
import { extractDocsUrl } from '@/lib/utils'
import { ArrowRight, ExternalLink, Search, Menu, X } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useOpenAPISpec } from '@/lib/use-openapi-spec'
import { createSearchableEndpoints, createSearchIndex, searchEndpoints } from '@/lib/endpoint-search'

interface PopularEndpoint {
  key: string
  title: string
  description: string
  method: string | string[] // Support single method or array of methods for merged endpoints
  path: string
  exampleContent?: any
  responseExample?: any
}

// Helper to extract example content from OpenAPI spec
function extractExampleContent(operation: any, spec: any): { exampleContent?: any; responseExample?: any } {
  let exampleContent: any = null
  let responseExample: any = null

  // Try to get request body example
  const requestBodyContent = operation.requestBody?.content
  const contentType = requestBodyContent
    ? (requestBodyContent['application/json'] ? 'application/json' : Object.keys(requestBodyContent)[0])
    : null
  if (contentType && requestBodyContent?.[contentType]) {
    const jsonContent = requestBodyContent[contentType]
    if (jsonContent.example) {
      exampleContent = jsonContent.example
    } else if (jsonContent.schema?.example) {
      exampleContent = jsonContent.schema.example
    } else if (jsonContent.schema?.properties) {
      const example: any = {}
      for (const [key, prop] of Object.entries(jsonContent.schema.properties)) {
        const propSchema = prop as any
        if (propSchema.example !== undefined) {
          example[key] = propSchema.example
        } else if (propSchema.type === 'string') {
          example[key] = 'example'
        } else if (propSchema.type === 'array' && propSchema.items?.type === 'string') {
          example[key] = ['example1', 'example2']
        }
      }
      if (Object.keys(example).length > 0) {
        exampleContent = example
      }
    }
  }

  // Try to get response example
  const successResponse = operation.responses?.['200'] || operation.responses?.['201'] || operation.responses?.['204']
  const responseContentTypes = successResponse?.content ? Object.keys(successResponse.content) : []
  const responseContentType = responseContentTypes.includes('application/json')
    ? 'application/json'
    : (responseContentTypes[0] || null)
  if (responseContentType && successResponse?.content?.[responseContentType]) {
    const responseContent = successResponse.content[responseContentType]
    if (responseContent.example) {
      responseExample = responseContent.example
    } else if (responseContent.schema?.example) {
      responseExample = responseContent.schema.example
    } else if (responseContent.schema?.$ref) {
      const refPath = responseContent.schema.$ref.replace('#/components/schemas/', '')
      const refSchema = spec.components?.schemas?.[refPath]
      if (refSchema?.example) {
        responseExample = refSchema.example
      }
    }
  }

  return { exampleContent, responseExample }
}

// Helper to extract schema information for preview
function extractSchemaInfo(operation: any, spec: any): Array<{ name: string; description: string; type?: string }> {
  const items: Array<{ name: string; description: string; type?: string }> = []

  // First, try to get response schema (what the endpoint returns)
  const successResponse = operation.responses?.['200'] || operation.responses?.['201'] || operation.responses?.['204']
  const responseContent = successResponse?.content?.['application/json']

  if (responseContent?.schema) {
    let schema = responseContent.schema

    // Handle $ref
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/components/schemas/', '')
      schema = spec.components?.schemas?.[refPath]
    }

    // Extract properties from response schema
    if (schema?.properties) {
      const props = schema.properties
      const propKeys = Object.keys(props).slice(0, 4) // Show up to 4 properties

      for (const key of propKeys) {
        const prop = props[key]
        items.push({
          name: key,
          description: prop.description || `${key} value`,
          type: prop.type
        })
      }
    }
  }

  // If no response schema, fall back to parameters (what the endpoint accepts)
  if (items.length === 0 && operation.parameters) {
    const params = operation.parameters.slice(0, 4)
    for (const param of params) {
      items.push({
        name: param.name,
        description: param.description || `${param.name} parameter`,
        type: param.schema?.type
      })
    }
  }

  // If still no items, try request body schema
  if (items.length === 0) {
    const requestBodyContent = operation.requestBody?.content?.['application/json']
    if (requestBodyContent?.schema) {
      let schema = requestBodyContent.schema

      // Handle $ref
      if (schema.$ref) {
        const refPath = schema.$ref.replace('#/components/schemas/', '')
        schema = spec.components?.schemas?.[refPath]
      }

      if (schema?.properties) {
        const props = schema.properties
        const propKeys = Object.keys(props).slice(0, 4)

        for (const key of propKeys) {
          const prop = props[key]
          items.push({
            name: key,
            description: prop.description || `${key} field`,
            type: prop.type
          })
        }
      }
    }
  }

  return items
}

// Helper to generate visual preview from schema information
function generateVisualPreview(endpoint: PopularEndpoint, operation: any, spec: any): React.ReactNode {
  const schemaItems = extractSchemaInfo(operation, spec)

  if (schemaItems.length === 0) {
    return (
      <div className="space-y-1.5">
        <div className="h-1.5 bg-default rounded w-3/4"></div>
        <div className="h-1.5 bg-default rounded w-1/2"></div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {schemaItems.map((item, idx) => (
        <div key={item.name} className="flex items-start gap-2">
          <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-primary' : 'bg-primary/70'}`}></div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-primary">{item.name}</span>
            {item.type && <span className="text-xs text-tertiary ml-1">({item.type})</span>}
            <p className="text-xs text-secondary truncate">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const { spec: openApiSpec, loading } = useOpenAPISpec()
  const [sidebarConfig, setSidebarConfig] = useState<any>(null)
  const [popularEndpoints, setPopularEndpoints] = useState<PopularEndpoint[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PopularEndpoint[]>([])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Create search index
  const searchableEndpoints = useMemo(() => {
    if (!sidebarConfig?.navItems || !openApiSpec) return []
    return createSearchableEndpoints(sidebarConfig.navItems, openApiSpec)
  }, [sidebarConfig, openApiSpec])

  const searchIndex = useMemo(() => {
    if (searchableEndpoints.length === 0) return null
    return createSearchIndex(searchableEndpoints)
  }, [searchableEndpoints])

  useEffect(() => {
    if (!openApiSpec || loading) return

    const sidebar = parseSidebarConfig(
      {
        ...openApiSpec['x-ui-config']?.sidebar,
        endpoints: openApiSpec['x-ui-config']?.endpoints
      },
      (key: string) => {
        const slug = generateSlugFromEndpoint(openApiSpec as any, key)
        if (slug) {
          router.push(slug)
        } else {
          router.push(`/${key}`)
        }
      },
      openApiSpec as any
    )
    setSidebarConfig(sidebar)

    // Get popular endpoints
    const endpoints = openApiSpec['x-ui-config']?.endpoints || {}
    const uiConfig = openApiSpec['x-ui-config'] as any
    const popularKeys = uiConfig?.popularEndpoints || []

    let endpointsToShow: PopularEndpoint[] = []

    if (popularKeys.length > 0) {
      const endpointsRecord = endpoints as Record<string, any>
      const paths = openApiSpec.paths as Record<string, Record<string, any>> | undefined

      // Process each popular key
      const processedPaths = new Set<string>() // Track which paths we've already processed

      endpointsToShow = popularKeys
        .map((popularKey: string) => {
          // Check if this is a full endpoint key (contains --) or a path-based key
          const isFullKey = popularKey.includes('--')

          if (isFullKey) {
            // Full endpoint key - use existing behavior
            const endpoint = endpointsRecord[popularKey]
            if (!endpoint) return null
            const operation = paths?.[endpoint.path]?.[endpoint.method.toLowerCase()]
            const { exampleContent, responseExample } = extractExampleContent(operation, openApiSpec)

            return {
              key: popularKey,
              title: endpoint.title,
              description: endpoint.description || operation?.summary || '',
              method: endpoint.method,
              path: endpoint.path,
              exampleContent,
              responseExample
            }
          } else {
            // Path-based key - find all endpoints matching this path
            const matchingEndpoints = Object.entries(endpointsRecord)
              .filter(([key, endpoint]) => endpoint.path === popularKey)
              .map(([key, endpoint]) => ({ key, ...endpoint }))

            if (matchingEndpoints.length === 0) return null

            // Skip if we've already processed this path
            const firstEndpoint = matchingEndpoints[0]
            if (processedPaths.has(firstEndpoint.path)) return null
            processedPaths.add(firstEndpoint.path)

            // Get all methods for this path
            const methods = matchingEndpoints.map(e => e.method)

            // Use the first endpoint's operation for examples
            const operation = paths?.[firstEndpoint.path]?.[firstEndpoint.method.toLowerCase()]
            const { exampleContent, responseExample } = extractExampleContent(operation, openApiSpec)

            // Create a merged endpoint with all methods
            return {
              key: matchingEndpoints[0].key, // Use first endpoint key for navigation
              title: firstEndpoint.path.split('/').pop() || firstEndpoint.title,
              description: firstEndpoint.description || operation?.summary || '',
              method: methods, // Array of methods
              path: firstEndpoint.path,
              exampleContent,
              responseExample
            }
          }
        })
        .filter(Boolean) as PopularEndpoint[]
    } else {
      const endpointsRecord = endpoints as Record<string, any>
      const paths = openApiSpec.paths as Record<string, Record<string, any>> | undefined
      const endpointKeys = Object.keys(endpointsRecord)
      endpointsToShow = endpointKeys.slice(0, 4).map(key => {
        const endpoint = endpointsRecord[key]
        const operation = paths?.[endpoint.path]?.[endpoint.method.toLowerCase()]
        const { exampleContent, responseExample } = extractExampleContent(operation, openApiSpec)

        return {
          key,
          title: endpoint.title,
          description: endpoint.description || operation?.summary || '',
          method: endpoint.method,
          path: endpoint.path,
          exampleContent,
          responseExample
        }
      })
    }

    setPopularEndpoints(endpointsToShow)
  }, [router, openApiSpec, loading])

  // Handle search
  useEffect(() => {
    if (!searchQuery.trim() || !searchIndex) {
      setSearchResults([])
      return
    }

    const results = searchEndpoints(searchIndex, searchQuery)
    const endpointKeys = new Set(results.map(r => r.endpointKey).filter(Boolean))

    const endpoints = openApiSpec['x-ui-config']?.endpoints || {}
    const endpointsRecord = endpoints as Record<string, any>
    const paths = openApiSpec.paths as Record<string, Record<string, any>> | undefined
    const matchedEndpoints = Array.from(endpointKeys)
      .slice(0, 4)
      .map(key => {
        const endpoint = endpointsRecord[key]
        if (!endpoint) return null
        const operation = paths?.[endpoint.path]?.[endpoint.method.toLowerCase()]
        const { exampleContent, responseExample } = extractExampleContent(operation, openApiSpec)

        return {
          key,
          title: endpoint.title,
          description: endpoint.description || operation?.summary || '',
          method: endpoint.method,
          path: endpoint.path,
          exampleContent,
          responseExample
        }
      })
      .filter(Boolean) as PopularEndpoint[]

    setSearchResults(matchedEndpoints)
  }, [searchQuery, searchIndex])

  if (loading || !openApiSpec || !sidebarConfig) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  const apiTitle = openApiSpec.info?.title || 'API Playground'
  const apiInfo = openApiSpec.info as any
  const apiDescription = apiInfo?.description || ''
  const apiVersion = openApiSpec.info?.version || '1.0.0'
  const docsUrl = extractDocsUrl(openApiSpec as any)

  const handleEndpointClick = (endpointKey: string) => {
    const slug = generateSlugFromEndpoint(openApiSpec as any, endpointKey)
    if (slug) {
      router.push(slug)
    } else {
      router.push(`/${endpointKey}`)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchResults.length > 0) {
      handleEndpointClick(searchResults[0].key)
    }
  }

  const displayedEndpoints = searchQuery.trim() ? searchResults : popularEndpoints
  const showSearchResults = searchQuery.trim() && searchResults.length > 0

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile Header with Hamburger Menu */}
      <div className="md:hidden fixed left-0 right-0 top-0 z-40 bg-background border-b border-default px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 hover:bg-hover rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu size={24} className="text-secondary" />
        </button>
        <h1 className="text-lg font-semibold text-primary">{apiTitle}</h1>
        <div className="w-10" /> {/* Spacer for balance */}
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          navItems={sidebarConfig.navItems}
          workspace={sidebarConfig.workspace}
          openApiSpec={openApiSpec}
        />
      </div>

      {/* Mobile Sheet Sidebar */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="p-0 w-[280px]">
          <Sidebar
            navItems={sidebarConfig.navItems}
            workspace={sidebarConfig.workspace}
            openApiSpec={openApiSpec}
            onClose={() => setIsMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex-1 overflow-hidden flex flex-col bg-background pt-16 md:pt-0">
        {/* Top Bar - Compact */}
        <div className="px-8 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-primary">{apiTitle}</h1>
            <div className="flex items-center gap-4">
              {apiVersion && (
                <span className="text-xs text-tertiary">v{apiVersion}</span>
              )}
              {docsUrl && (
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-link flex items-center gap-1"
                >
                  Docs
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
          {apiDescription && (
            <p className="text-sm text-secondary max-w-2xl line-clamp-2">
              {apiDescription.split('\n')[0]}
            </p>
          )}
        </div>

        {/* Centered Search - Google Style */}
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="w-full max-w-2xl">
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
                <input
                  type="text"
                  placeholder="Search endpoints..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 text-base border-2 border-default rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent shadow-sm hover:shadow-md transition-shadow"
                  autoFocus
                />
              </div>
            </form>

            {/* Endpoints Grid - Below Search */}
            {displayedEndpoints.length > 0 && (
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-secondary mb-4 uppercase tracking-wide">
                  {showSearchResults ? 'Search Results' : 'Popular Endpoints'}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {displayedEndpoints.map((endpoint) => {
                    const paths = openApiSpec.paths as Record<string, Record<string, any>> | undefined
                    // For merged endpoints with multiple methods, use the first method for operation lookup
                    const firstMethod = Array.isArray(endpoint.method) ? endpoint.method[0] : endpoint.method
                    const operation = paths?.[endpoint.path]?.[firstMethod.toLowerCase()]
                    const summary = operation?.summary || endpoint.title
                    const description = operation?.description || endpoint.description

                    return (
                      <div
                        key={endpoint.key}
                        onClick={() => handleEndpointClick(endpoint.key)}
                        className="bg-card border border-default rounded-lg p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Render method badge(s) */}
                            {Array.isArray(endpoint.method) ? (
                              endpoint.method.map((method) => (
                                <span key={method} className="px-2 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded">
                                  {method}
                                </span>
                              ))
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded">
                                {endpoint.method}
                              </span>
                            )}
                            <code className="text-xs font-mono text-secondary">
                              {endpoint.path}
                            </code>
                          </div>
                          <ArrowRight
                            size={14}
                            className="text-tertiary group-hover:text-link transition-colors flex-shrink-0"
                          />
                        </div>
                        <h3 className="text-sm font-semibold text-primary mb-1">
                          {summary}
                        </h3>
                        {description && (
                          <p className="text-xs text-secondary mb-2 line-clamp-1">
                            {description}
                          </p>
                        )}
                        {/* Compact Visual Preview */}
                        <div className="mt-2 pt-2 border-t border-default">
                          {generateVisualPreview(endpoint, operation, openApiSpec)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => {
                  const endpoints = openApiSpec['x-ui-config']?.endpoints || {}
                  const firstKey = Object.keys(endpoints)[0]
                  if (firstKey) {
                    handleEndpointClick(firstKey)
                  }
                }}
                className="px-4 py-2 bg-hover text-secondary rounded-lg hover:bg-active transition-colors text-sm font-medium"
              >
                Try an Endpoint
              </button>
              {docsUrl && (
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-hover text-secondary rounded-lg hover:bg-active transition-colors text-sm font-medium flex items-center gap-1.5"
                >
                  View Documentation
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div >
    </div >
  )
}
