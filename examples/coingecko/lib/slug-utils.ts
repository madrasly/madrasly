/**
 * Utility functions for generating and resolving slugs from OpenAPI spec
 */

/**
 * Generate a slug from endpoint path
 * Format: /path/to/resource
 */
export function generateSlugFromEndpoint(
  spec: any,
  endpointKey: string
): string | null {
  const uiConfig = spec['x-ui-config']?.endpoints?.[endpointKey]
  if (!uiConfig) return null

  // Use the path as the slug
  // Ensure it starts with / and doesn't have trailing /
  let path = uiConfig.path
  if (!path.startsWith('/')) path = '/' + path
  if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1)

  return `${path}?method=${uiConfig.method}`
}

/**
 * Find endpoint key from slug
 * Format: /path/to/resource
 */
export function findEndpointBySlug(
  spec: any,
  slug: string[]
): string | null {
  if (!slug || slug.length === 0) {
    return null
  }

  // Reconstruct path from slug segments (URL-decode each segment)
  const path = '/' + slug.map(segment => decodeURIComponent(segment)).join('/')

  // Find endpoint with this path
  const endpoints = spec['x-ui-config']?.endpoints || {}

  // We want to find the "best" endpoint for this path.
  // Preference: GET > POST > PUT > PATCH > DELETE > others
  const methodPriority = ['get', 'post', 'put', 'patch', 'delete']

  let bestEndpointKey: string | null = null
  let bestMethodIndex = Infinity

  for (const [key, config] of Object.entries(endpoints)) {
    const endpoint = config as any
    // Normalize endpoint path for comparison
    let endpointPath = endpoint.path
    if (!endpointPath.startsWith('/')) endpointPath = '/' + endpointPath
    if (endpointPath.endsWith('/') && endpointPath.length > 1) endpointPath = endpointPath.slice(0, -1)

    if (endpointPath === path) {
      const method = endpoint.method.toLowerCase()
      const index = methodPriority.indexOf(method)

      if (index !== -1 && index < bestMethodIndex) {
        bestMethodIndex = index
        bestEndpointKey = key
      } else if (index === -1 && bestEndpointKey === null) {
        // If method not in priority list, take it if we haven't found anything else
        bestEndpointKey = key
      }
    }
  }

  return bestEndpointKey
}

