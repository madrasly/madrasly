'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronDown, Search, X } from 'lucide-react'
import { SidebarNavItem } from './types'
import { createSearchableEndpoints, createSearchIndex, searchEndpoints, SearchableEndpoint } from '@/lib/endpoint-search'
import { ThemeSwitcher } from '@/components/theme-switcher'

interface SidebarProps {
  navItems: SidebarNavItem[]
  activeEndpoint?: string
  workspace?: {
    name: string
    icon: string
    image?: string
  }
  openApiSpec?: any
  onClose?: () => void  // Callback to close mobile menu
}

const STORAGE_KEY_SECTIONS = 'sidebar-expanded-sections'
const STORAGE_KEY_SUBSECTIONS = 'sidebar-expanded-subsections'

function loadExpandedSections(): Set<number> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SECTIONS)
    if (stored) {
      const array = JSON.parse(stored) as number[]
      return new Set(array)
    }
  } catch (error) {
    console.error('Failed to load expanded sections from localStorage:', error)
  }
  return new Set()
}

function loadExpandedSubsections(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SUBSECTIONS)
    if (stored) {
      const array = JSON.parse(stored) as string[]
      return new Set(array)
    }
  } catch (error) {
    console.error('Failed to load expanded subsections from localStorage:', error)
  }
  return new Set()
}

function saveExpandedSections(sections: Set<number>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_SECTIONS, JSON.stringify(Array.from(sections)))
  } catch (error) {
    console.error('Failed to save expanded sections to localStorage:', error)
  }
}

function saveExpandedSubsections(subsections: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_SUBSECTIONS, JSON.stringify(Array.from(subsections)))
  } catch (error) {
    console.error('Failed to save expanded subsections to localStorage:', error)
  }
}

export function Sidebar({ navItems, activeEndpoint, workspace, openApiSpec, onClose }: SidebarProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  // Track which sections are expanded - load from localStorage on mount
  const [expandedSections, setExpandedSections] = useState<Set<number>>(() => loadExpandedSections())
  // Track which subsections (nested items) are expanded - load from localStorage on mount
  const [expandedSubsections, setExpandedSubsections] = useState<Set<string>>(() => loadExpandedSubsections())
  // Track if this is the initial mount
  const isInitialMount = useRef(true)
  // Save expanded state before search
  const savedExpandedSections = useRef<Set<number> | null>(null)
  const savedExpandedSubsections = useRef<Set<string> | null>(null)

  // Create searchable endpoints and search index
  const searchableEndpoints = useMemo(() => {
    return createSearchableEndpoints(navItems, openApiSpec)
  }, [navItems, openApiSpec])

  const searchIndex = useMemo(() => {
    return createSearchIndex(searchableEndpoints)
  }, [searchableEndpoints])

  // Save expanded state before search starts
  useEffect(() => {
    const isSearching = debouncedSearchQuery.trim().length > 0
    const wasSearching = savedExpandedSections.current !== null

    // Save state when starting to search (before it gets modified)
    if (isSearching && !wasSearching) {
      savedExpandedSections.current = new Set(expandedSections)
      savedExpandedSubsections.current = new Set(expandedSubsections)
    }
  }, [debouncedSearchQuery, expandedSections, expandedSubsections])

  // Restore expanded state when search ends
  useEffect(() => {
    const isSearching = debouncedSearchQuery.trim().length > 0

    // Restore state when clearing search
    if (!isSearching && savedExpandedSections.current !== null && savedExpandedSubsections.current !== null) {
      setExpandedSections(savedExpandedSections.current)
      setExpandedSubsections(savedExpandedSubsections.current)
      saveExpandedSections(savedExpandedSections.current)
      saveExpandedSubsections(savedExpandedSubsections.current)
      savedExpandedSections.current = null
      savedExpandedSubsections.current = null
    }
  }, [debouncedSearchQuery])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 200)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Perform search
  const searchResults = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return new Set<string>()
    }

    const results = searchEndpoints(searchIndex, debouncedSearchQuery)
    return new Set(results.map(r => r.endpointKey).filter(Boolean))
  }, [searchIndex, debouncedSearchQuery])

  // Auto-expand sections with matching results (only during search)
  useEffect(() => {
    if (!debouncedSearchQuery.trim()) {
      return
    }

    const matchingSections = new Set<number>()
    const matchingSubsections = new Set<string>()

    searchableEndpoints.forEach(endpoint => {
      if (searchResults.has(endpoint.endpointKey)) {
        matchingSections.add(endpoint.sectionIndex)
        if (endpoint.subItemIndex !== undefined) {
          matchingSubsections.add(`${endpoint.sectionIndex}-${endpoint.itemIndex}`)
        }
      }
    })

    // Only expand matching sections during search (don't merge with existing)
    setExpandedSections(matchingSections)
    setExpandedSubsections(matchingSubsections)
  }, [debouncedSearchQuery, searchResults, searchableEndpoints])

  // Filter navItems based on search
  const filteredNavItems = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return navItems
    }

    return navItems.map((section, sectionIndex) => {
      const filteredItems = section.items
        .map((item, itemIndex) => {
          const itemMatches = item.endpointKey && searchResults.has(item.endpointKey)
          const hasMatchingSubItems = item.items?.some(subItem =>
            subItem.endpointKey && searchResults.has(subItem.endpointKey)
          )

          if (itemMatches || hasMatchingSubItems) {
            const filteredSubItems = item.items?.filter(subItem =>
              !subItem.endpointKey || searchResults.has(subItem.endpointKey)
            )

            return {
              ...item,
              items: filteredSubItems
            }
          }

          return null
        })
        .filter(Boolean) as typeof section.items

      // Only include section if it has matching items
      if (filteredItems.length === 0) {
        return null
      }

      return {
        ...section,
        items: filteredItems
      }
    }).filter(Boolean) as SidebarNavItem[]
  }, [navItems, searchResults, debouncedSearchQuery])

  // Helper function to check if an item matches search
  const itemMatchesSearch = (endpointKey?: string) => {
    if (!debouncedSearchQuery.trim() || !endpointKey) {
      return true
    }
    return searchResults.has(endpointKey)
  }

  const toggleSection = (sectionIndex: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionIndex)) {
        next.delete(sectionIndex)
      } else {
        next.add(sectionIndex)
      }
      saveExpandedSections(next)
      return next
    })
  }

  const toggleSubsection = (sectionIndex: number, itemIndex: number) => {
    const key = `${sectionIndex}-${itemIndex}`
    setExpandedSubsections(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      saveExpandedSubsections(next)
      return next
    })
  }

  // Find and ensure the section containing the active endpoint is expanded
  // This preserves existing expanded state while ensuring the active endpoint is visible
  // Only runs when not searching (search state is handled separately)
  useEffect(() => {
    // Skip on initial mount - use loaded state from localStorage
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // Don't modify expansion state during search
    if (debouncedSearchQuery.trim()) {
      return
    }

    // Only run if we have navItems and an activeEndpoint
    if (!navItems || navItems.length === 0 || !activeEndpoint) {
      return
    }

    // Find which section contains the active endpoint
    let sectionIndexToExpand: number | null = null
    let subsectionKeyToExpand: string | null = null

    navItems.forEach((section, sIndex) => {
      section.items.forEach((item, iIndex) => {
        // Check if this item is the active endpoint
        if (item.endpointKey === activeEndpoint) {
          sectionIndexToExpand = sIndex
        }
        // Check if any sub-item is the active endpoint
        if (item.items) {
          item.items.forEach((subItem) => {
            if (subItem.endpointKey === activeEndpoint) {
              sectionIndexToExpand = sIndex
              subsectionKeyToExpand = `${sIndex}-${iIndex}`
            }
          })
        }
      })
    })

    // Ensure ONLY the section containing the active endpoint is expanded
    // Merge with existing state instead of replacing it
    if (sectionIndexToExpand !== null) {
      setExpandedSections(prev => {
        const next = new Set(prev)
        next.add(sectionIndexToExpand!)
        saveExpandedSections(next)
        return next
      })

      if (subsectionKeyToExpand) {
        setExpandedSubsections(prev => {
          const next = new Set(prev)
          next.add(subsectionKeyToExpand!)
          saveExpandedSubsections(next)
          return next
        })
      }
    }
  }, [navItems, activeEndpoint, debouncedSearchQuery])

  return (
    <div
      className={`${isExpanded ? 'w-[240px]' : 'w-[60px]'} border-r border-default flex flex-col transition-all duration-200 ease-in-out h-full relative`}
      style={{ backgroundColor: 'var(--sidebar)' }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="hidden md:flex absolute -right-2.5 top-[60px] w-5 h-5 border border-default rounded-full items-center justify-center hover:border-hover z-10 shadow-sm transition-colors"
        style={{ backgroundColor: 'var(--sidebar)' }}
      >
        {isExpanded ? (
          <ChevronLeft size={12} className="text-primary" />
        ) : (
          <ChevronRight size={12} className="text-primary" />
        )}
      </button>

      {workspace && (
        <div className="px-4 py-4 flex-shrink-0">
          {isExpanded ? (
            <button
              onClick={() => {
                onClose?.()
                router.push('/')
              }}
              className="flex items-center gap-2.5 w-full px-2 py-2 rounded hover:bg-hover transition-colors group overflow-hidden"
            >
              {workspace.image ? (
                <img
                  src={workspace.image}
                  alt={workspace.name}
                  className="w-5 h-5 rounded flex-shrink-0 object-contain"
                  onError={(e) => {
                    // Fallback to icon if image fails to load
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const fallback = target.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
              ) : null}
              <div
                className={`w-5 h-5 bg-primary rounded flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0 ${workspace.image ? 'hidden' : ''}`}
              >
                {workspace.icon}
              </div>
              <span className="text-sm font-medium whitespace-nowrap">{workspace.name}</span>
            </button>
          ) : (
            <button
              onClick={() => {
                onClose?.()
                router.push('/')
              }}
              className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground text-sm font-bold mx-auto hover:bg-primary/90 transition-colors overflow-hidden"
            >
              {workspace.image ? (
                <img
                  src={workspace.image}
                  alt={workspace.name}
                  className="w-full h-full object-contain rounded"
                  onError={(e) => {
                    // Fallback to icon if image fails to load
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    const fallback = target.nextElementSibling as HTMLElement
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
              ) : null}
              <span className={workspace.image ? 'hidden' : ''}>{workspace.icon}</span>
            </button>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="px-3 pb-3 flex-shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" />
            <input
              type="text"
              placeholder="Search endpoints..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-2 text-sm border border-default rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              style={{
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tertiary hover:text-secondary"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 overflow-y-auto overflow-x-hidden pb-2">
        {filteredNavItems.map((section, filteredIndex) => {
          // Find the original section index in navItems by matching title and items
          const originalSectionIndex = navItems.findIndex(s => {
            if (s.title !== section.title) return false
            // If both have items, check if they share at least one endpoint
            if (section.items.length > 0 && s.items.length > 0) {
              return section.items.some(item =>
                s.items.some(origItem => origItem.endpointKey === item.endpointKey)
              )
            }
            return true
          })
          const sectionIndex = originalSectionIndex >= 0 ? originalSectionIndex : filteredIndex
          const isSectionExpanded = expandedSections.has(sectionIndex)

          return (
            <div key={sectionIndex}>
              {isExpanded && section.title && (
                <button
                  onClick={() => toggleSection(sectionIndex)}
                  className="w-full flex items-center justify-between px-2 py-1 mb-1 hover:bg-hover rounded transition-colors group"
                >
                  <div className="text-xs font-medium text-tertiary group-hover:text-primary">
                    {section.title}
                  </div>
                  {isSectionExpanded ? (
                    <ChevronDown size={14} className="text-tertiary group-hover:text-primary" />
                  ) : (
                    <ChevronRight size={14} className="text-tertiary group-hover:text-primary" />
                  )}
                </button>
              )}

              {isSectionExpanded && (
                <div className="space-y-0.5 mb-6">
                  {section.items.map((item, filteredItemIndex) => {
                    const ExternalIcon = item.external
                    const hasSubsections = item.items && item.items.length > 0
                    // Find original item index in the original section
                    const originalSection = navItems[sectionIndex]
                    const originalItemIndex = originalSection?.items.findIndex(
                      origItem => origItem.endpointKey === item.endpointKey && origItem.label === item.label
                    ) ?? filteredItemIndex
                    const itemIndex = originalItemIndex >= 0 ? originalItemIndex : filteredItemIndex
                    const subsectionKey = `${sectionIndex}-${itemIndex}`
                    const isSubsectionExpanded = expandedSubsections.has(subsectionKey)
                    const itemMatches = itemMatchesSearch(item.endpointKey)
                    const isHighlighted = debouncedSearchQuery.trim() && itemMatches

                    return (
                      <div key={itemIndex}>
                        <div className="flex items-center">
                          {hasSubsections ? (
                            <button
                              onClick={() => toggleSubsection(sectionIndex, itemIndex)}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hover transition-colors flex-1 min-w-0 group"
                            >
                              {isExpanded && (
                                <>
                                  <span className={`text-sm whitespace-nowrap flex items-center gap-2 min-w-0 ${isHighlighted ? 'text-primary font-medium' : 'text-secondary group-hover:text-primary'}`}>
                                    {item.label}
                                    {item.badge && (
                                      <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                                        {item.badge}
                                      </span>
                                    )}
                                  </span>
                                  {isSubsectionExpanded ? (
                                    <ChevronDown size={14} className="text-tertiary group-hover:text-primary ml-auto flex-shrink-0" />
                                  ) : (
                                    <ChevronRight size={14} className="text-tertiary group-hover:text-primary ml-auto flex-shrink-0" />
                                  )}
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={item.onClick}
                              className={`flex items-center gap-3 w-full px-2 py-2 rounded ${item.active ? 'text-primary bg-hover' : isHighlighted ? 'text-primary' : 'text-secondary'} ${isExpanded ? '' : 'justify-center'} ${item.onClick ? 'hover:bg-hover hover:text-primary cursor-pointer' : ''}`}
                            >
                              {isExpanded && (
                                <span className={`text-sm whitespace-nowrap flex items-center gap-2 ${isHighlighted ? 'font-medium' : ''}`}>
                                  {item.label}
                                  {item.badge && (
                                    <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                                      {item.badge}
                                    </span>
                                  )}
                                  {ExternalIcon && <ExternalIcon size={12} className="flex-shrink-0" />}
                                </span>
                              )}
                            </button>
                          )}
                        </div>
                        {hasSubsections && isSubsectionExpanded && isExpanded && (
                          <div className="ml-6 mt-0.5 space-y-0.5 mb-2">
                            {item.items!.map((subItem, subItemIndex) => {
                              const SubExternalIcon = subItem.external
                              const subItemMatches = itemMatchesSearch(subItem.endpointKey)
                              const isSubHighlighted = debouncedSearchQuery.trim() && subItemMatches

                              return (
                                <button
                                  key={subItemIndex}
                                  onClick={subItem.onClick}
                                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm ${subItem.active ? 'text-primary bg-hover' : isSubHighlighted ? 'text-primary' : 'text-secondary'} ${subItem.onClick ? 'hover:bg-hover hover:text-primary cursor-pointer' : ''}`}
                                >
                                  <span className={`whitespace-nowrap flex items-center gap-2 ${isSubHighlighted ? 'font-medium' : ''}`}>
                                    {subItem.label}
                                    {subItem.badge && (
                                      <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                                        {subItem.badge}
                                      </span>
                                    )}
                                    {SubExternalIcon && <SubExternalIcon size={12} className="flex-shrink-0" />}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {isExpanded && debouncedSearchQuery.trim() && filteredNavItems.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-tertiary">
            No endpoints found matching &quot;{debouncedSearchQuery}&quot;
          </div>
        )}
      </nav>

      {isExpanded && (
        <div className="border-t border-border px-3 py-3 flex-shrink-0 space-y-1" style={{ backgroundColor: 'var(--sidebar)' }}>
          <ThemeSwitcher />
          {!debouncedSearchQuery.trim() && (
            <a
              href="https://docs.google.com/forms/d/e/1FAIpQLScVYNtp3-uOQ-WQNGZ905bIxIfOjW29GyZtTnx2t9yUV_xuIQ/viewform?usp=dialog"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full px-2 py-2 text-secondary rounded text-sm hover:bg-hover hover:text-primary transition-colors"
            >
              Give us feedback
            </a>
          )}
        </div>
      )}
    </div>
  )
}

