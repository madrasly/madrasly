'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-secondary rounded text-sm">
        <span className="text-xs">Theme</span>
        <div className="ml-auto w-20 h-8 bg-hover rounded" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <span className="text-xs text-tertiary whitespace-nowrap">Theme</span>
      <Select value={theme} onValueChange={setTheme}>
        <SelectTrigger className="ml-auto h-8 w-24 text-xs">
          <SelectValue placeholder="Select theme" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="light">Light</SelectItem>
          <SelectItem value="dark">Dark</SelectItem>
          <SelectItem value="coffee">Coffee</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

