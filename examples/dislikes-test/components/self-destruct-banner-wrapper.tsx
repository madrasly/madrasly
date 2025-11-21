'use client'

import { useState, useEffect } from 'react'
import { SelfDestructBanner } from './self-destruct-banner'

export function SelfDestructBannerWrapper() {
  const [isTempPlayground, setIsTempPlayground] = useState(false)

  useEffect(() => {
    const checkIsTemp = async () => {
      const searchParams = new URLSearchParams(window.location.search)

      // 1. Check for explicit query param (useful for testing)
      if (searchParams.get('demo') === 'true') {
        setIsTempPlayground(true)
        return
      }

      // 2. Check for environment variable (set by backend generation)
      if (process.env.NEXT_PUBLIC_IS_TEMP_DEMO === 'true') {
        setIsTempPlayground(true)
        return
      }

      // 3. Check for destruct config file existence
      // Only temporary playgrounds have this file injected
      try {
        const response = await fetch('/destruct-config.json')
        if (response.ok) {
          // IMPORTANT: Verify it's valid JSON and has the expected property
          // Vercel/SPAs often return index.html (200 OK) for 404s, so a simple status check isn't enough
          const config = await response.json()
          if (config && config.destructDate) {
            setIsTempPlayground(true)
            return
          }
        }
      } catch (e) {
        // Ignore error (fetch failed or JSON parse failed means not a valid config)
      }

      setIsTempPlayground(false)
    }

    checkIsTemp()
  }, [])

  if (!isTempPlayground) {
    return null
  }

  return <SelfDestructBanner destructTime={15} />
}

