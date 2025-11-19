'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/api-playground/sidebar'
import { parseSidebarConfig } from '@/lib/openapi-sidebar-parser'
import { generateSlugFromEndpoint } from '@/lib/slug-utils'
import { extractDocsUrl } from '@/lib/utils'
import { ArrowRight, ExternalLink, Search, Menu, X } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import openApiSpec from '../openapi.json'
import { createSearchableEndpoints, createSearchIndex, searchEndpoints } from '@/lib/endpoint-search'

interface PopularEndpoint {
  key: string
  title: string
  description: string
  method: string
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

// Helper to generate visual preview from example data
function generateVisualPreview(endpoint: PopularEndpoint, operation: any, spec: any): React.ReactNode {
  const { exampleContent, responseExample } = extractExampleContent(operation, spec)
  const data = responseExample || exampleContent

  if (!data) {
    return (
      <div className="space-y-1.5">
        <div className="h-1.5 bg-default rounded w-3/4"></div>
        <div className="h-1.5 bg-default rounded w-1/2"></div>
      </div>
    )
  }

  if (Array.isArray(data)) {
    return (
      <div className="space-y-1.5">
        {data.slice(0, 3).map((item: any, idx: number) => {
          if (typeof item === 'string') {
            return (
              <div key={idx} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-primary' : 'bg-primary/70'}`}></div>
                <span className="text-xs text-secondary truncate">{item}</span>
              </div>
            )
          } else if (typeof item === 'object') {
            const firstKey = Object.keys(item)[0]
            return (
              <div key={idx} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-primary' : 'bg-primary/70'}`}></div>
                <span className="text-xs text-secondary truncate">
                  {firstKey}: {String(item[firstKey]).substring(0, 25)}
                </span>
              </div>
            )
          }
          return null
        })}
      </div>
    )
  } else if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data)
    if (keys.length > 0) {
      return (
        <div className="space-y-1.5">
          {keys.slice(0, 4).map((key, idx) => {
            const value = data[key]
            if (Array.isArray(value)) {
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-primary' : 'bg-primary/70'}`}></div>
                  <span className="text-xs text-secondary">{key}: [{value.length} items]</span>
                </div>
              )
            } else if (typeof value === 'string') {
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-primary' : 'bg-primary/70'}`}></div>
                  <span className="text-xs text-secondary truncate">{value.substring(0, 35)}</span>
                </div>
              )
            } else {
              return (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-primary' : idx === 1 ? 'bg-primary' : 'bg-primary/70'}`}></div>
                  <span className="text-xs text-secondary">{key}</span>
                </div>
              )
            }
          })}
        </div>
      )
    }
  } else if (typeof data === 'string') {
    return (
      <div className="text-xs text-secondary line-clamp-2">{data}</div>
    )
  }

  return null
}

export default function LandingPage() {
  const router = useRouter()
  const [sidebarConfig, setSidebarConfig] = useState<any>(null)
  const [popularEndpoints, setPopularEndpoints] = useState<PopularEndpoint[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PopularEndpoint[]>([])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Create search index
  const searchableEndpoints = useMemo(() => {
    if (!sidebarConfig?.navItems) return []
    return createSearchableEndpoints(sidebarConfig.navItems, openApiSpec)
  }, [sidebarConfig])

  const searchIndex = useMemo(() => {
    if (searchableEndpoints.length === 0) return null
    return createSearchIndex(searchableEndpoints)
  }, [searchableEndpoints])

  useEffect(() => {
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
      endpointsToShow = popularKeys
        .map((key: string) => {
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
  }, [router])

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

  if (!sidebarConfig) {
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
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-background border-b border-default px-4 py-3 flex items-center justify-between">
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
                    const operation = paths?.[endpoint.path]?.[endpoint.method.toLowerCase()]
                    const summary = operation?.summary || endpoint.title
                    const description = operation?.description || endpoint.description

                    return (
                      <div
                        key={endpoint.key}
                        onClick={() => handleEndpointClick(endpoint.key)}
                        className="bg-card border border-default rounded-lg p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded">
                              {endpoint.method}
                            </span>
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
      </div>
    </div>
  )
}
