'use client'

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface SelfDestructBannerProps {
  /** Time in minutes until self-destruct (default: 15) */
  destructTime?: number
  /** Optional callback when user clicks the banner */
  onSignUpClick?: () => void
}

export function SelfDestructBanner({ destructTime = 15, onSignUpClick }: SelfDestructBannerProps) {
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [showSignUpModal, setShowSignUpModal] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    let destructDate: Date | null = null
    
    const loadAndStartTimer = async () => {
      try {
        const response = await fetch('/destruct-config.json')
        if (response.ok) {
          const config = await response.json()
          if (config.destructDate) {
            destructDate = new Date(config.destructDate)
          }
        }
      } catch (error) {
        console.warn('Failed to load destruct config:', error)
      }

      // Fallback to 15 minutes if no date is set
      if (!destructDate) {
        destructDate = new Date(Date.now() + destructTime * 60 * 1000)
      }

      const updateTimeRemaining = () => {
        if (!destructDate) return
        const now = new Date()
        const diff = Math.max(0, Math.floor((destructDate.getTime() - now.getTime()) / 1000))
        setTimeRemaining(diff)
      }

      // Update immediately
      updateTimeRemaining()

      // Update every second
      interval = setInterval(updateTimeRemaining, 1000)
    }

    loadAndStartTimer()

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [destructTime])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleBannerClick = () => {
    setShowSignUpModal(true)
    onSignUpClick?.()
  }

  // Calculate percentage - always use 15 minutes (900 seconds) as total
  const totalSeconds = 15 * 60 // 15 minutes in seconds
  const percentage = totalSeconds > 0 ? (timeRemaining / totalSeconds) * 100 : 0

  return (
    <TooltipProvider>
      <>
        {/* Compact Top Right Banner */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={handleBannerClick}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="fixed top-4 right-4 z-50 cursor-pointer group"
            >
              <div 
                className="relative overflow-hidden rounded-lg shadow-lg hover:shadow-xl transition-shadow border border-destructive/50"
                style={{
                  background: 'var(--color-error-bg)',
                  color: 'var(--color-error-text)',
                  borderColor: 'var(--color-error-border)'
                }}
              >
                {/* Progress bar */}
                <div
                  className="absolute bottom-0 left-0 h-1 transition-all duration-1000 ease-linear"
                  style={{ 
                    width: `${percentage}%`,
                    backgroundColor: 'var(--color-error)'
                  }}
                />

                <div className="px-4 py-2.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock size={16} className={`${isHovered ? 'animate-pulse' : ''}`} />
                    <span className="font-semibold tabular-nums">
                      Self-destructing in {formatTime(timeRemaining)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <p className="text-sm">
              Register on madrasly to host your playground permanently for free
            </p>
          </TooltipContent>
        </Tooltip>

      {/* Sign Up Modal */}
      <Dialog open={showSignUpModal} onOpenChange={setShowSignUpModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-foreground text-center">
              Host Your API Playground Forever
            </DialogTitle>
            <DialogDescription className="text-base pt-2 text-center">
              This is a temporary demo that will self-destruct in {formatTime(timeRemaining)}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <p className="text-sm text-secondary text-center">
              It's free to host your API playground forever if you sign up.
            </p>

            {/* CTA Buttons */}
            <div className="space-y-3 pt-2">
              <a
                href="https://madrasly.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-6 py-3 font-semibold rounded-lg hover:shadow-lg hover:scale-105 transition-all text-center hover:opacity-90 text-white"
                style={{
                  backgroundColor: 'var(--color-error)'
                }}
              >
                Sign Up - It's Free Forever
              </a>
              <button
                onClick={() => setShowSignUpModal(false)}
                className="block w-full px-6 py-3 bg-hover text-secondary font-medium rounded-lg hover:bg-active transition-colors text-center"
              >
                Continue with Demo
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
    </TooltipProvider>
  )
}
