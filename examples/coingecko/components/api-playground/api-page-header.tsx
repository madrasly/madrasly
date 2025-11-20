'use client'

import { FileText, Link2, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from '@/hooks/use-toast'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MarkdownRenderer } from './markdown-renderer'

interface ApiPageHeaderProps {
  title: string
  description: string
  actions?: {
    label: string
    icon?: React.ReactNode
    onClick?: () => void
  }[]
}

export function ApiPageHeader({ title, description, actions }: ApiPageHeaderProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const handleActionClick = (action: { label: string; onClick?: () => void }, index: number) => {
    if (action.onClick) {
      action.onClick()
    }

    // Show feedback for copy actions
    if (action.label.toLowerCase().includes('copy')) {
      setCopiedIndex(index)
      toast({
        title: 'Copied!',
        description: `${action.label} copied to clipboard`,
      })
      setTimeout(() => setCopiedIndex(null), 2000)
    } else if (action.onClick) {
      // Show feedback for other actions that have onClick
      toast({
        title: 'Action completed',
        description: `${action.label} action executed`,
      })
    }
  }

  return (
    <div className="mb-8 min-w-0">
      <div className="flex flex-wrap items-center justify-between mb-2 gap-3 sm:gap-4">
        <h1 className="text-[32px] font-semibold text-primary max-w-4xl min-w-0">{title}</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions?.map((action, index) => {
            const isCopied = copiedIndex === index
            const isCopyAction = action.label.toLowerCase().includes('copy')

            return (
              <Tooltip key={index}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleActionClick(action, index)}
                    className={`
                      h-8 px-3 text-sm flex items-center gap-2 border rounded-md bg-background whitespace-nowrap
                      transition-all duration-200 ease-in-out
                      text-secondary border-default hover:bg-hover hover:border-hover hover:text-primary active:bg-active active:scale-[0.98] cursor-pointer
                      ${isCopied ? 'bg-success border-success text-success' : ''}
                    `}
                  >
                    {isCopied && isCopyAction ? (
                      <Check size={16} className="text-success" />
                    ) : (
                      action.icon
                    )}
                    {action.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{action.label}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </div>
      <div className="text-secondary text-[15px] max-w-4xl text-wrap-normal">
        <MarkdownRenderer content={description} />
      </div>
    </div>
  )
}
