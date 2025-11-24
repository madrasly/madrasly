import { SidebarNavItem } from '@/components/api-playground/types'
import { ExternalLink } from 'lucide-react'

interface OpenAPISidebarConfig {
  workspace?: {
    name: string
    icon: string
    image?: string
  }
  navItems?: Array<{
    title?: string
    items: Array<{
      label: string
      icon?: string
      active?: boolean
      badge?: string
      external?: boolean
      endpointKey?: string
    }>
  }>
  user?: {
    name: string
    initials: string
  }
  endpoints?: Record<string, {
    title: string
    description?: string
    method: string
    path: string
  }>
}

interface OpenAPISpec {
  tags?: Array<{
    name: string
    description?: string
  }>
  paths?: {
    [path: string]: {
      [method: string]: {
        tags?: string[]
      }
    }
  }
}

export function parseSidebarConfig(
  config: OpenAPISidebarConfig,
  onEndpointClick?: (endpointKey: string) => void,
  openApiSpec?: OpenAPISpec
): {
  navItems: SidebarNavItem[]
  workspace?: { name: string; icon: string; image?: string }
} {
  const navItems: SidebarNavItem[] = (config.navItems || []).map(section => ({
    title: section.title,
    items: section.items.map(item => ({
      label: item.label,
      icon: undefined,
      active: item.active,
      badge: item.badge,
      external: item.external ? ExternalLink : undefined,
      endpointKey: item.endpointKey,
      onClick: item.endpointKey && onEndpointClick ? () => onEndpointClick(item.endpointKey!) : undefined,
    })),
  }))

  // If no "API Playground" section exists and we have endpoints, auto-generate it
  const hasApiPlaygroundSection = navItems.some(section =>
    section.title === 'API Playground' || section.title === undefined
  )

  if (!hasApiPlaygroundSection && config.endpoints && Object.keys(config.endpoints).length > 0) {
    // Helper to format path into a readable title
    const formatPathToTitle = (path: string) => {
      return path
        .replace(/^\//, '') // Remove leading slash
        .replace(/[\/_]/g, ' ') // Replace slashes and underscores with spaces
        .replace(/-/g, ' ') // Replace dashes with spaces
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize words
        .join(' ')
    }

    // Helper to process endpoints: group by path and select representative
    const processEndpoints = (endpoints: Array<{ endpointKey: string; endpoint: any }>) => {
      const methodPriority = ['get', 'post', 'put', 'patch', 'delete']

      // Group by path
      const byPath = new Map<string, Array<{ endpointKey: string; endpoint: any }>>()
      endpoints.forEach(item => {
        const path = item.endpoint.path
        if (!byPath.has(path)) {
          byPath.set(path, [])
        }
        byPath.get(path)!.push(item)
      })

      // Create items from groups
      const navItems: SidebarNavItem['items'] = []

      byPath.forEach((groupEndpoints) => {
        // Sort within group to find representative (GET preferred)
        groupEndpoints.sort((a, b) => {
          const indexA = methodPriority.indexOf(a.endpoint.method.toLowerCase())
          const indexB = methodPriority.indexOf(b.endpoint.method.toLowerCase())
          const pA = indexA === -1 ? 999 : indexA
          const pB = indexB === -1 ? 999 : indexB
          return pA - pB
        })

        const representative = groupEndpoints[0]

        navItems.push({
          label: representative.endpoint.title || formatPathToTitle(representative.endpoint.path),
          icon: undefined,
          active: false,
          endpointKey: representative.endpointKey,
          onClick: onEndpointClick ? () => onEndpointClick(representative.endpointKey) : undefined,
        })
      })

      // Sort final items by label/path
      return navItems.sort((a, b) => a.label.localeCompare(b.label))
    }

    // Group endpoints by tags if OpenAPI spec is provided
    if (openApiSpec?.paths && openApiSpec?.tags) {
      // Create a map of tag name to endpoints
      const tagMap = new Map<string, Array<{ endpointKey: string; endpoint: any }>>()

      // Process each endpoint and get its tag from the OpenAPI spec
      Object.entries(config.endpoints).forEach(([endpointKey, endpoint]) => {
        const operation = openApiSpec.paths?.[endpoint.path]?.[endpoint.method.toLowerCase()]
        const tags = operation?.tags || []

        // Use the first tag, or "Other" if no tags
        const tagName = tags.length > 0 ? tags[0] : 'Other'

        if (!tagMap.has(tagName)) {
          tagMap.set(tagName, [])
        }
        tagMap.get(tagName)!.push({ endpointKey, endpoint })
      })

      // Get tag order from OpenAPI spec tags array
      const tagOrder = openApiSpec.tags.map(tag => tag.name)

      // Create sections for each tag
      tagOrder.forEach(tagName => {
        const endpoints = tagMap.get(tagName)
        if (endpoints && endpoints.length > 0) {
          navItems.push({
            title: tagName,
            items: processEndpoints(endpoints),
          })
        }
      })

      // Add any remaining endpoints that don't match spec tags
      tagMap.forEach((endpoints, tagName) => {
        if (!tagOrder.includes(tagName)) {
          navItems.push({
            title: tagName,
            items: processEndpoints(endpoints),
          })
        }
      })
    } else {
      // Fallback: if no OpenAPI spec, just group everything under "API Playground"
      const endpoints = Object.entries(config.endpoints).map(([endpointKey, endpoint]) => ({
        endpointKey,
        endpoint
      }))

      navItems.unshift({
        title: 'API Playground',
        items: processEndpoints(endpoints),
      })
    }
  }

  return {
    navItems,
    workspace: config.workspace,
  }
}

