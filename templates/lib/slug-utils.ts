/**
 * Utility functions for generating and resolving slugs from OpenAPI spec
 */

/**
 * Normalize a summary string for slug generation and matching.
 * This ensures consistent normalization in both directions.
 */
function normalizeSummaryForSlug(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .replace(/[.,;:!?]+$/, '') // Remove trailing punctuation
    .trim()
}

/**
 * Convert a normalized summary to a URL slug segment.
 */
function summaryToSlugSegment(summary: string): string {
  const normalized = normalizeSummaryForSlug(summary)
  return normalized.replace(/\s+/g, '-') // Replace spaces with hyphens
}

/**
 * Convert a slug segment back to normalized summary for comparison.
 */
function slugSegmentToNormalizedSummary(slugSegment: string): string {
  return slugSegment
    .replace(/-/g, ' ') // Replace hyphens with spaces
    .toLowerCase()
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .replace(/[.,;:!?]+$/, '') // Remove trailing punctuation
    .trim()
}

/**
 * Generate a slug from tag and summary
 * Format: /{tag}/{summary-slug}
 */
export function generateSlugFromEndpoint(
  spec: any,
  endpointKey: string
): string | null {
  const uiConfig = spec['x-ui-config']?.endpoints?.[endpointKey]
  if (!uiConfig) return null

  const path = uiConfig.path
  const method = uiConfig.method.toLowerCase()
  const operation = spec.paths?.[path]?.[method]
  if (!operation) return null

  const tags = operation.tags || []
  const summary = operation.summary || ''

  if (tags.length === 0 || !summary) {
    // Fallback to endpoint key if no tag/summary
    return `/${endpointKey}`
  }

  const tag = tags[0].toLowerCase().replace(/\s+/g, '-')
  const summarySlug = summaryToSlugSegment(summary)

  return `/${tag}/${summarySlug}`
}

/**
 * Find endpoint key from slug
 * Format: /{tag}/{summary-slug}
 */
export function findEndpointBySlug(
  spec: any,
  slug: string[]
): string | null {
  if (!slug || slug.length === 0) {
    return null
  }

  // Try to find by endpoint key if single segment
  if (slug.length === 1) {
    const endpointKey = slug[0]
    if (endpointKey && spec['x-ui-config']?.endpoints?.[endpointKey]) {
      return endpointKey
    }
    return null
  }

  // For two-or-more-segment slugs: [tag, summary-slug, ...]
  // We only use the first two segments (tag and summary-slug)
  const [tag, summarySlug] = slug
  if (!tag || !summarySlug) {
    return null
  }

  const tagLower = tag.toLowerCase()
  const normalizedSummaryFromSlug = slugSegmentToNormalizedSummary(summarySlug)

  // Search through all endpoints
  const endpoints = spec['x-ui-config']?.endpoints || {}
  for (const [endpointKey, uiConfig] of Object.entries(endpoints)) {
    const endpoint = uiConfig as any
    const path = endpoint.path
    const method = endpoint.method.toLowerCase()
    const operation = spec.paths?.[path]?.[method]

    if (!operation) continue

    const tags = operation.tags || []
    const operationSummary = operation.summary || ''

    // Check if tag matches (case-insensitive, with spaces converted to hyphens)
    const matchesTag = tags.length > 0 && tags.some((t: string) =>
      t.toLowerCase().replace(/\s+/g, '-') === tagLower
    )

    if (!matchesTag) continue

    // Normalize operation summary using the same function
    const normalizedOperationSummary = normalizeSummaryForSlug(operationSummary)
    const matchesSummary = normalizedOperationSummary === normalizedSummaryFromSlug

    if (matchesSummary) {
      return endpointKey
    }
  }

  return null
}

