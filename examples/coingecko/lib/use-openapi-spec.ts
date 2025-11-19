'use client'
import { useState, useEffect } from 'react'

export function useOpenAPISpec() {
  const [spec, setSpec] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/openapi-spec')
      .then(r => r.json())
      .then(setSpec)
      .catch(err => {
        console.error('Failed to load OpenAPI spec:', err)
        setSpec(null)
      })
      .finally(() => setLoading(false))
  }, [])

  return { spec, loading }
}
