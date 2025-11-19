'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Normalizes markdown content to handle YAML literal block line breaks.
 * Converts single line breaks to spaces (per CommonMark spec) while preserving
 * intentional line breaks (double newlines, list items, code blocks, etc.)
 */
function normalizeMarkdownContent(content: string): string {
  // Split by double newlines (paragraph breaks) first
  const paragraphs = content.split(/\n\n+/)
  
  const normalized = paragraphs.map((paragraph) => {
    // Skip if it's a code block (starts with ```)
    if (paragraph.trim().startsWith('```')) {
      return paragraph
    }
    
    // Skip if it's a list item (starts with -, *, +, or numbered)
    if (/^[\s]*[-*+]\s/.test(paragraph) || /^[\s]*\d+\.\s/.test(paragraph)) {
      return paragraph
    }
    
    // Skip if it's a heading (starts with #)
    if (/^[\s]*#+\s/.test(paragraph)) {
      return paragraph
    }
    
    // For regular paragraphs, normalize single line breaks to spaces
    const lines = paragraph.split('\n')
    
    // Remove common leading indentation (YAML literal blocks often have indentation)
    const nonEmptyLines = lines.filter(line => line.trim().length > 0)
    if (nonEmptyLines.length > 0) {
      // Find minimum leading whitespace
      const minIndent = Math.min(...nonEmptyLines.map(line => {
        const match = line.match(/^(\s*)/)
        return match ? match[1].length : 0
      }))
      
      // Remove common indentation from all lines
      if (minIndent > 0) {
        lines.forEach((line, i) => {
          if (line.length >= minIndent) {
            lines[i] = line.substring(minIndent)
          }
        })
      }
    }
    
    const normalizedParagraph = lines
      .map((line, index, array) => {
        // Skip empty lines
        if (line.trim().length === 0) {
          return index < array.length - 1 ? ' ' : ''
        }
        
        const trimmed = line.trimEnd()
        // If line ends with two spaces, it's a hard break - preserve it
        if (line.endsWith('  ') && index < array.length - 1) {
          return trimmed + '  \n'
        }
        // Otherwise, replace single newline with space (unless it's the last line)
        return index < array.length - 1 ? trimmed + ' ' : trimmed
      })
      .join('')
      .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs into one space
      .trim()
    
    return normalizedParagraph
  }).join('\n\n')
  
  return normalized
}


export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  // Normalize the content to handle YAML literal block line breaks
  let normalizedContent = normalizeMarkdownContent(content)
  
  // Final pass: ensure absolutely no single newlines remain (only paragraph breaks)
  // Replace any remaining single newlines (not part of double newlines) with spaces
  normalizedContent = normalizedContent.replace(/([^\n])\n([^\n])/g, '$1 $2')
  
  // CRITICAL: react-markdown might be creating separate text nodes that wrap
  // We need to ensure the entire paragraph is treated as inline flow
  return (
    <div className={`${className} text-wrap-normal`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Customize link rendering
          a: ({ node, ...props }) => (
            <a
              {...props}
              className="text-link underline"
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
          // Customize bold rendering
          strong: ({ node, ...props }) => (
            <strong {...props} className="font-semibold text-primary" />
          ),
          // Customize code rendering - ensure inline code stays inline
          // CRITICAL FIX: In react-markdown v9+, inline prop is deprecated
          // We detect inline code by checking if there's a language class (block code) or if parent is paragraph
          code: ({ node, className, children, ...props }: any) => {
            // Check if it's a code block (has language class like "language-js")
            const isCodeBlock = className && /language-/.test(className)
            // If no language class and it's inside a paragraph, it's inline code
            const isInline = !isCodeBlock
            
            if (isInline) {
              // Remove any "block" classes that might be in the className
              const baseClasses = 'px-1.5 py-0.5 bg-hover text-primary rounded text-xs font-mono'
              const extraClasses = className ? className.replace(/\bblock\b/g, '').trim() : ''
              const finalClassName = `${baseClasses} ${extraClasses}`.trim()
              
              return (
                <code
                  {...props}
                  className={`${finalClassName} text-wrap-nowrap inline`}
                >
                  {children}
                </code>
              )
            }
            // Block code
            return (
              <code
                {...props}
                className="block p-2 bg-hover text-primary rounded text-xs font-mono overflow-x-auto"
              >
                {children}
              </code>
            )
          },
          // Customize paragraph rendering - ensure text flows inline
          p: ({ node, children, ...props }: any) => {
            return (
              <p 
                {...props} 
                className="mb-2 last:mb-0 text-wrap-normal block leading-normal" 
              >
                {children}
              </p>
            )
          },
          // Customize list rendering
          ul: ({ node, ...props }) => (
            <ul {...props} className="list-disc list-inside mb-2 space-y-1" />
          ),
          ol: ({ node, ...props }) => (
            <ol {...props} className="list-decimal list-inside mb-2 space-y-1" />
          ),
          li: ({ node, ...props }) => (
            <li {...props} className="ml-2" />
          ),
          // Customize heading rendering
          h1: ({ node, ...props }) => (
            <h1 {...props} className="text-lg font-semibold mb-2 mt-3 first:mt-0" />
          ),
          h2: ({ node, ...props }) => (
            <h2 {...props} className="text-base font-semibold mb-2 mt-3 first:mt-0" />
          ),
          h3: ({ node, ...props }) => (
            <h3 {...props} className="text-sm font-semibold mb-1 mt-2 first:mt-0" />
          ),
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}

