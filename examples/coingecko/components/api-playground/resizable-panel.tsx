'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Code, FileText } from 'lucide-react'

interface ResizablePanelProps {
  left: React.ReactNode | ((props: { onRunClick: () => void }) => React.ReactNode)
  right: React.ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  onRunClick?: () => void  // Callback when run button triggers code view
}

export function ResizablePanel({ left, right, defaultWidth = 700, minWidth = 400, maxWidth = 1200, onRunClick }: ResizablePanelProps) {
  // Calculate responsive initial width based on screen size
  const getResponsiveWidth = () => {
    if (typeof window === 'undefined') return defaultWidth
    const screenWidth = window.innerWidth

    // At 1920px: use default (700px)
    // At 1100px: use smaller width (400px)
    // Linear interpolation between these points
    if (screenWidth >= 1920) return 700
    if (screenWidth <= 1100) return 400

    // Linear interpolation: width = 400 + (screenWidth - 1100) * (300 / 820)
    const ratio = (screenWidth - 1100) / (1920 - 1100)
    return Math.round(400 + ratio * 300)
  }

  const [rightPanelWidth, setRightPanelWidth] = useState(getResponsiveWidth())
  const [isDragging, setIsDragging] = useState(false)
  const [showCode, setShowCode] = useState(false) // false = form, true = code
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return

      const deltaX = e.clientX - dragStartX.current
      const newWidth = Math.max(minWidth, Math.min(maxWidth, dragStartWidth.current - deltaX))
      setRightPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, minWidth, maxWidth])

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true)
    dragStartX.current = e.clientX
    dragStartWidth.current = rightPanelWidth
  }

  // Function to switch to code view (called when Run is clicked)
  const handleSwitchToCode = () => {
    setShowCode(true)
    onRunClick?.() // Call parent callback if provided
  }

  return (
    <div className="flex flex-col md:flex-row flex-1 min-w-0 md:h-full">
      {/* Mobile toggle button - fixed at bottom */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <button
          onClick={() => setShowCode(!showCode)}
          className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full shadow-2xl hover:bg-primary/90 transition-all font-semibold text-base border-2 border-primary-foreground/20"
        >
          {showCode ? (
            <>
              <FileText size={22} />
              <span>Form</span>
            </>
          ) : (
            <>
              <Code size={22} />
              <span>Code</span>
            </>
          )}
        </button>
      </div>

      {/* Left Panel (Form) */}
      <div className={`${showCode ? 'hidden' : 'block'} md:block bg-background overflow-auto min-w-0 flex-shrink order-1 md:order-none min-h-0 flex-1 md:flex-1 pb-24 md:pb-0`}>
        {typeof left === 'function' ? left({ onRunClick: handleSwitchToCode }) : left}
      </div>

      {/* Desktop drag handle */}
      <div
        className="hidden md:block w-1 bg-default hover:bg-primary cursor-col-resize transition-colors relative group flex-shrink-0"
        onMouseDown={handleDragStart}
      >
        <div className="absolute inset-0 w-3 -left-1 cursor-col-resize" />
      </div>

      {/* Right Panel (Code) */}
      <div
        className={`${showCode ? 'block' : 'hidden'} md:block bg-code-editor text-white relative flex flex-col order-2 md:order-none flex-shrink-0 w-full md:w-auto h-full md:h-auto pb-24 md:pb-0`}
        style={{ width: typeof window !== 'undefined' && window.innerWidth >= 768 ? `${rightPanelWidth}px` : '100%' }}
      >
        {right}
      </div>
    </div>
  )
}
