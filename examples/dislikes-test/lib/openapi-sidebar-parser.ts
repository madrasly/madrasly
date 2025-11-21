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

      // Helper to group endpoints by path and pick the best one (GET > POST > etc)
      const processEndpoints = (endpoints: Array<{ endpointKey: string; endpoint: any }>) => {
        const pathGroups = new Map<string, Array<{ endpointKey: string; endpoint: any }>>()

        endpoints.forEach(item => {
          const path = item.endpoint.path
          if (!pathGroups.has(path)) pathGroups.set(path, [])
          pathGroups.get(path)!.push(item)
        })

        const methodPriority = ['get', 'post', 'put', 'patch', 'delete']

        return Array.from(pathGroups.entries()).map(([path, items]) => {
          // Sort by method priority
          items.sort((a, b) => {
            const indexA = methodPriority.indexOf(a.endpoint.method.toLowerCase())
            const indexB = methodPriority.indexOf(b.endpoint.method.toLowerCase())
            const pA = indexA === -1 ? 999 : indexA
            const pB = indexB === -1 ? 999 : indexB
            return pA - pB
          })

          const bestItem = items[0]

          return {
            label: path,
            icon: undefined,
            active: false,
            endpointKey: bestItem.endpointKey,
            onClick: onEndpointClick ? () => onEndpointClick(bestItem.endpointKey) : undefined,
          }
        })
      }

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
      // But still group by path
      const endpoints = Object.entries(config.endpoints).map(([endpointKey, endpoint]) => ({
        endpointKey,
        endpoint
      }))

      const pathGroups = new Map<string, Array<{ endpointKey: string; endpoint: any }>>()
      endpoints.forEach(item => {
        const path = item.endpoint.path
        if (!pathGroups.has(path)) pathGroups.set(path, [])
        pathGroups.get(path)!.push(item)
      })

      const methodPriority = ['get', 'post', 'put', 'patch', 'delete']

      const endpointItems = Array.from(pathGroups.entries()).map(([path, items]) => {
        items.sort((a, b) => {
          const indexA = methodPriority.indexOf(a.endpoint.method.toLowerCase())
          const indexB = methodPriority.indexOf(b.endpoint.method.toLowerCase())
          const pA = indexA === -1 ? 999 : indexA
          const pB = indexB === -1 ? 999 : indexB
          return pA - pB
        })

        const bestItem = items[0]

        return {
          label: path,
          icon: undefined,
          active: false,
          endpointKey: bestItem.endpointKey,
          onClick: onEndpointClick ? () => onEndpointClick(bestItem.endpointKey) : undefined,
        }
      })

      navItems.unshift({
        title: 'API Playground',
        items: endpointItems,
      })
    }
  }

  return {
    navItems,
    workspace: config.workspace,
  }
}

