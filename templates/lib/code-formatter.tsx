'use client'

import React from 'react'

export function formatCodeForDisplay(code: string, language: string): React.ReactNode {
  const lines = code.split('\n')
  
  return (
    <>
      {lines.map((line, index) => {
        const lineNumber = index + 1
        return (
          <div key={index} className="flex">
            <span className="text-secondary select-none w-8 text-right mr-4">{lineNumber}</span>
            <span className="text-muted whitespace-pre">{line || ' '}</span>
          </div>
        )
      })}
    </>
  )
}

