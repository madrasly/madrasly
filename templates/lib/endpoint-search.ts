import Fuse from 'fuse.js'
import { SidebarNavItem } from '@/components/api-playground/types'

export interface SearchableEndpoint {
  endpointKey: string
  label: string
  path: string
  method: string
  description: string
  tags: string[]
  sectionTitle: string
  sectionIndex: number
  itemIndex: number
  subItemIndex?: number
  searchText: string // Combined searchable text
}

interface OpenAPISpec {
  paths?: {
    [path: string]: {
      [method: string]: {
        summary?: string
        description?: string
        tags?: string[]
      }
    }
  }
  tags?: Array<{
    name: string
    description?: string
  }>
  'x-ui-config'?: {
    endpoints?: Record<string, {
      title: string
      description?: string
      method: string
      path: string
    }>
  }
}

export function createSearchableEndpoints(
  navItems: SidebarNavItem[],
  openApiSpec?: OpenAPISpec
): SearchableEndpoint[] {
  const searchable: SearchableEndpoint[] = []

  navItems.forEach((section, sectionIndex) => {
    const sectionTitle = section.title || ''
    
    section.items.forEach((item, itemIndex) => {
      // Get endpoint info from OpenAPI spec if available
      const endpointKey = item.endpointKey
      let path = ''
      let method = ''
      let description = item.label
      let tags: string[] = []
      
      if (endpointKey && openApiSpec?.['x-ui-config']?.endpoints?.[endpointKey]) {
        const endpoint = openApiSpec['x-ui-config'].endpoints[endpointKey]
        path = endpoint.path || ''
        method = endpoint.method || ''
        description = endpoint.description || endpoint.title || item.label
        
        // Get tags from OpenAPI operation
        if (openApiSpec.paths?.[path]?.[method.toLowerCase()]) {
          const operation = openApiSpec.paths[path][method.toLowerCase()]
          tags = operation.tags || []
        }
      }
      
      // Build searchable text
      const searchParts = [
        item.label,
        endpointKey || '',
        path,
        method,
        description,
        sectionTitle,
        ...tags
      ].filter(Boolean)
      
      const searchText = searchParts.join(' ').toLowerCase()
      
      // Add main item
      searchable.push({
        endpointKey: endpointKey || '',
        label: item.label,
        path,
        method,
        description,
        tags,
        sectionTitle,
        sectionIndex,
        itemIndex,
        searchText
      })
      
      // Add sub-items if they exist
      if (item.items && item.items.length > 0) {
        item.items.forEach((subItem, subItemIndex) => {
          const subEndpointKey = subItem.endpointKey
          let subPath = ''
          let subMethod = ''
          let subDescription = subItem.label
          let subTags: string[] = []
          
          if (subEndpointKey && openApiSpec?.['x-ui-config']?.endpoints?.[subEndpointKey]) {
            const subEndpoint = openApiSpec['x-ui-config'].endpoints[subEndpointKey]
            subPath = subEndpoint.path || ''
            subMethod = subEndpoint.method || ''
            subDescription = subEndpoint.description || subEndpoint.title || subItem.label
            
            if (openApiSpec.paths?.[subPath]?.[subMethod.toLowerCase()]) {
              const operation = openApiSpec.paths[subPath][subMethod.toLowerCase()]
              subTags = operation.tags || []
            }
          }
          
          const subSearchParts = [
            subItem.label,
            subEndpointKey || '',
            subPath,
            subMethod,
            subDescription,
            sectionTitle,
            ...subTags
          ].filter(Boolean)
          
          const subSearchText = subSearchParts.join(' ').toLowerCase()
          
          searchable.push({
            endpointKey: subEndpointKey || '',
            label: subItem.label,
            path: subPath,
            method: subMethod,
            description: subDescription,
            tags: subTags,
            sectionTitle,
            sectionIndex,
            itemIndex,
            subItemIndex,
            searchText: subSearchText
          })
        })
      }
    })
  })
  
  return searchable
}

export function createSearchIndex(searchableEndpoints: SearchableEndpoint[]): Fuse<SearchableEndpoint> {
  return new Fuse(searchableEndpoints, {
    keys: [
      { name: 'label', weight: 0.4 },
      { name: 'endpointKey', weight: 0.3 },
      { name: 'path', weight: 0.2 },
      { name: 'method', weight: 0.1 },
      { name: 'description', weight: 0.15 },
      { name: 'tags', weight: 0.1 },
      { name: 'sectionTitle', weight: 0.05 },
      { name: 'searchText', weight: 0.2 }
    ],
    threshold: 0.4, // 0 = exact match, 1 = match anything
    distance: 100, // Maximum distance for a match
    includeScore: true,
    minMatchCharLength: 1,
    ignoreLocation: true,
    shouldSort: true
  })
}

export function searchEndpoints(
  searchIndex: Fuse<SearchableEndpoint>,
  query: string
): SearchableEndpoint[] {
  if (!query.trim()) {
    return []
  }
  
  const results = searchIndex.search(query)
  return results.map(result => result.item)
}

