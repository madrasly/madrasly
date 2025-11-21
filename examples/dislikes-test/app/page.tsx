'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/api-playground/sidebar'
import { parseSidebarConfig } from '@/lib/openapi-sidebar-parser'
import { generateSlugFromEndpoint } from '@/lib/slug-utils'
import { useOpenAPISpec } from '@/lib/use-openapi-spec'
import LandingPage from './landing-page'

export default function ApiPlaygroundPage() {
  const router = useRouter()
  const { spec: openApiSpec, loading } = useOpenAPISpec()
  const [sidebarConfig, setSidebarConfig] = useState<any>(null)
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null)

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
  }, [router, openApiSpec, loading])

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  // Show landing page if no active endpoint
  if (!activeEndpoint && sidebarConfig) {
    return <LandingPage />
  }

  // This should not be reached, but kept for compatibility
  return <LandingPage />
}
