import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract documentation URL from OpenAPI spec using heuristics.
 * Checks in order:
 * 1. externalDocs.url (root level)
 * 2. info.externalDocs.url
 * 3. info.contact.url
 * 4. Parse URLs from info.description
 * 5. Fallback: Extract base URL from servers array
 */
export function extractDocsUrl(spec: any): string | null {
  // 1. Check root-level externalDocs
  if (spec.externalDocs?.url) {
    return ensureHttps(spec.externalDocs.url)
  }

  // 2. Check info.externalDocs
  if (spec.info?.externalDocs?.url) {
    return ensureHttps(spec.info.externalDocs.url)
  }

  // 3. Check info.contact.url
  if (spec.info?.contact?.url) {
    return ensureHttps(spec.info.contact.url)
  }

  // 4. Parse URLs from info.description
  if (spec.info?.description) {
    const urlMatch = spec.info.description.match(/https?:\/\/[^\s\)]+/i)
    if (urlMatch) {
      return urlMatch[0]
    }
  }

  // 5. Fallback: Extract base URL from servers array
  if (spec.servers && Array.isArray(spec.servers) && spec.servers.length > 0) {
    const serverUrl = spec.servers[0].url
    if (serverUrl) {
      return extractBaseUrl(serverUrl)
    }
  }

  return null
}

/**
 * Extract base URL from server URL, removing path and version segments
 * Examples:
 * - https://api.example.com/v1 -> https://api.example.com
 * - https://api.example.com/v1/ -> https://api.example.com
 * - https://api.example.com/api/v2 -> https://api.example.com
 */
function extractBaseUrl(serverUrl: string): string {
  if (!serverUrl) return serverUrl
  
  try {
    const url = new URL(serverUrl)
    // Return just the origin (protocol + hostname + port)
    return url.origin
  } catch {
    // If URL parsing fails, try to extract manually
    const match = serverUrl.match(/^(https?:\/\/[^\/]+)/i)
    if (match) {
      return match[1]
    }
    return ensureHttps(serverUrl)
  }
}

/**
 * Ensure URL has https:// protocol
 */
function ensureHttps(url: string): string {
  if (!url) return url
  url = url.trim()
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}
