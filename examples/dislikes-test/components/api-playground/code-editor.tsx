'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { FileCode, Play, Check } from 'lucide-react'
import { CodeSample } from './types'
import { generateCodeSamples } from '@/lib/code-generator'
import Editor from '@monaco-editor/react'
import { toast } from '@/hooks/use-toast'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface CodeEditorProps {
  codeSamples: CodeSample[]
  defaultLanguage?: string
  formValues?: Record<string, any>
  operation?: {
    method: string
    path: string
    parameters?: any[]
    requestBody?: any
    security?: any[]
  }
  spec?: {
    servers?: Array<{ url: string }>
    components?: {
      securitySchemes?: Record<string, any>
    }
  }
  onCodeSamplesChange?: (samples: CodeSample[]) => void
  apiResponse?: any
  isLoading?: boolean
  error?: string | null
  endpointKey?: string // Add endpointKey to force remount
}

export function CodeEditor({
  codeSamples: initialCodeSamples,
  defaultLanguage,
  formValues,
  operation,
  spec,
  apiResponse,
  isLoading,
  error,
  endpointKey
}: CodeEditorProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'output'>('code')
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage || initialCodeSamples[0]?.language || 'python')
  const [isCopied, setIsCopied] = useState(false)

  // Clear response when it becomes null/undefined (endpoint changed)
  useEffect(() => {
    console.log('[DEBUG] CodeEditor apiResponse changed:', apiResponse ? 'has response' : 'null', 'isLoading:', isLoading, 'error:', error)
    if (!apiResponse && !isLoading && !error) {
      // Reset to code tab when response is cleared
      console.log('[DEBUG] CodeEditor: Clearing response, resetting to code tab')
      setActiveTab('code')
    }
  }, [apiResponse, isLoading, error])

  // Switch to output tab when Run is pressed (loading starts) or when response is received
  useEffect(() => {
    if (isLoading || apiResponse || error) {
      setActiveTab('output')
    }
  }, [isLoading, apiResponse, error])

  // Track current editor value per language (for controlled component)
  const [editorValues, setEditorValues] = useState<Record<string, string>>({})
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const isUserTypingRef = useRef(false)
  const lastGeneratedCodeRef = useRef<Record<string, string>>({})
  const onChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasUserEditsRef = useRef<Record<string, boolean>>({})

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (onChangeTimeoutRef.current) {
        clearTimeout(onChangeTimeoutRef.current)
      }
      editorRef.current = null
    }
  }, [])

  // Regenerate code samples when form values change
  const codeSamples = useMemo(() => {
    if (operation && spec) {
      // Always regenerate with current form values (even if empty, to use defaults)
      return generateCodeSamples(operation, spec, undefined, formValues || {})
    }
    // Use initial samples if operation/spec not provided
    return initialCodeSamples
  }, [initialCodeSamples, formValues, operation, spec])

  const activeSample = codeSamples.find(s => s.language === activeLanguage) || codeSamples[0]

  // Initialize editor value on mount or language change
  useEffect(() => {
    if (activeSample) {
      const lang = activeSample.language
      if (!editorValues[lang]) {
        setEditorValues(prev => ({
          ...prev,
          [lang]: activeSample.code
        }))
        lastGeneratedCodeRef.current[lang] = activeSample.code
      }
    }
  }, [activeSample?.language])

  // Update editor when form values change (but not when user is typing)
  useEffect(() => {
    if (activeSample && editorRef.current && !isUserTypingRef.current) {
      const lang = activeSample.language
      const generatedCode = activeSample.code
      const lastGenerated = lastGeneratedCodeRef.current[lang]

      // Only update if user hasn't manually edited AND code actually changed
      if (!hasUserEditsRef.current[lang] && generatedCode !== lastGenerated) {
        const editor = editorRef.current
        const model = editor.getModel()
        const language = getMonacoLanguage(lang)

        // Ensure language is set before updating content
        if (model && monacoRef.current) {
          monacoRef.current.editor.setModelLanguage(model, language)
        }

        // Type out content to trigger language service initialization
        // This ensures IntelliSense works immediately when params change
        if (language !== 'plaintext' && language !== 'shell') {
          typeContent(editor, generatedCode).catch(() => {
            // Fallback: just set value if typing fails
            editor.setValue(generatedCode)
            editor.updateOptions({ readOnly: true, domReadOnly: true })
          })
        } else {
          // For plaintext/shell, just set value normally
          editor.setValue(generatedCode)
          editor.updateOptions({ readOnly: true, domReadOnly: true })
        }

        // Update state to match
        setEditorValues(prev => ({
          ...prev,
          [lang]: generatedCode
        }))

        lastGeneratedCodeRef.current[lang] = generatedCode
      }
    } else if (activeSample && !hasUserEditsRef.current[activeSample.language]) {
      // Initialize lastGeneratedCodeRef
      lastGeneratedCodeRef.current[activeSample.language] = activeSample.code
    }
  }, [activeSample?.code, activeSample?.language])

  // Get the value to display
  const displayValue = activeSample
    ? (editorValues[activeSample.language] ?? activeSample.code)
    : ''

  // Map language names to Monaco Editor language IDs
  function getMonacoLanguage(lang: string): string {
    const langMap: Record<string, string> = {
      'python': 'python',
      'javascript': 'javascript',
      'curl': 'shell',
      'bash': 'shell',
      'sh': 'shell',
      'typescript': 'typescript',
      'json': 'json',
    }
    return langMap[lang.toLowerCase()] || 'plaintext'
  }

  // Type out content programmatically to trigger language service initialization
  // This simulates user typing, which naturally wakes up Monaco's language workers
  function typeContent(editor: any, content: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        // Temporarily make editor editable
        editor.updateOptions({ readOnly: false })

        // Clear existing content
        editor.setValue('')

        // Type out content incrementally using setValue
        // This is simpler and more reliable than executeEdits
        const chunkSize = 50 // Characters per chunk
        let index = 0

        const typeChunk = () => {
          try {
            if (index < content.length) {
              // Set value incrementally - each setValue triggers a change event
              const partialContent = content.slice(0, index + chunkSize)
              editor.setValue(partialContent)

              index += chunkSize
              // Very fast typing - 1ms per chunk
              setTimeout(typeChunk, 1)
            } else {
              // Ensure full content is set (handle any rounding issues)
              const currentValue = editor.getValue()
              if (currentValue !== content) {
                editor.setValue(content)
              }

              // Restore read-only mode
              editor.updateOptions({ readOnly: true, domReadOnly: true })
              resolve()
            }
          } catch (error) {
            // On any error, just set the full content and resolve
            console.debug('Typing error, falling back to setValue:', error)
            editor.setValue(content)
            editor.updateOptions({ readOnly: true, domReadOnly: true })
            resolve()
          }
        }

        // Start typing after a tiny delay to ensure editor is ready
        setTimeout(typeChunk, 0)
      } catch (error) {
        // If initial setup fails, just set value directly
        console.debug('TypeContent setup error:', error)
        editor.setValue(content)
        editor.updateOptions({ readOnly: true, domReadOnly: true })
        resolve()
      }
    })
  }

  return (
    <div className="bg-code-editor text-white relative flex flex-col h-full">
      {/* Hidden semantic HTML code blocks for scrapers - all languages visible */}
      {/* This ensures scrapers can see all code examples even before Monaco Editor loads */}
      <div className="sr-only">
        {codeSamples.length > 0 && codeSamples.map((sample) => (
          <div key={`scraper-${sample.language}`} data-language={sample.language} itemScope itemType="https://schema.org/Code">
            <h3>Code Example: {sample.language.charAt(0).toUpperCase() + sample.language.slice(1)}</h3>
            <pre><code className={`language-${sample.language}`} itemProp="code">{sample.code}</code></pre>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-code-editor flex items-center px-6 bg-code-editor-header">
        <button
          onClick={() => setActiveTab('code')}
          className={`
            px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2
            transition-all duration-200 ease-in-out
            ${activeTab === 'code'
              ? 'border-primary text-white'
              : 'text-muted hover:text-white hover:border-default active:scale-[0.98]'
            }
          `}
        >
          <FileCode size={14} />
          Code
        </button>
        <button
          onClick={() => setActiveTab('output')}
          className={`
            px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2
            transition-all duration-200 ease-in-out
            ${activeTab === 'output'
              ? 'border-primary text-white'
              : 'text-muted hover:text-white hover:border-default active:scale-[0.98]'
            }
          `}
        >
          <Play size={14} />
          Output
        </button>
      </div>

      {/* Language Tabs */}
      {activeTab === 'code' && (
        <>
          <div className="border-b border-code-editor flex items-center px-6 gap-0 bg-code-editor">
            {codeSamples.map((sample) => (
              <button
                key={sample.language}
                onClick={() => setActiveLanguage(sample.language)}
                className={`
                  px-3 py-2.5 text-sm font-medium flex items-center gap-2
                  transition-all duration-200 ease-in-out
                  ${activeLanguage === sample.language
                    ? 'bg-code-editor text-white border-b-2 border-default'
                    : 'text-muted hover:text-white hover:bg-code-editor-header active:scale-[0.98]'
                  }
                `}
              >
                {sample.icon}
                {sample.language.charAt(0).toUpperCase() + sample.language.slice(1)}
              </button>
            ))}
          </div>

          {/* Code Content */}
          <div className="flex-1 relative overflow-hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`
                    absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded z-10
                    transition-all duration-200 ease-in-out
                    ${isCopied
                      ? 'text-success bg-code-editor-success'
                      : 'text-muted hover:text-white bg-code-editor-hover active:bg-code-editor-active active:scale-95'
                    }
                  `}
                  onClick={() => {
                    if (activeSample?.code) {
                      navigator.clipboard.writeText(activeSample.code)
                      setIsCopied(true)
                      toast({
                        title: 'Copied!',
                        description: 'Code copied to clipboard',
                      })
                      setTimeout(() => setIsCopied(false), 2000)
                    }
                  }}
                >
                  {isCopied ? (
                    <Check size={16} />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M4 2H12V4H14V14H6V12H4V2Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      <path d="M2 4H10V12H2V4Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isCopied ? 'Copied!' : 'Copy code'}</p>
              </TooltipContent>
            </Tooltip>

            {activeSample && (
              <Editor
                key={`editor-${activeLanguage}`}
                height="100%"
                language={getMonacoLanguage(activeSample.language)}
                value={displayValue}
                theme="vs-dark"
                loading={<div className="text-muted p-6">Loading editor...</div>}
                options={{
                  readOnly: true,
                  domReadOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  selectOnLineNumbers: false,
                  glyphMargin: false,
                  hover: {
                    enabled: true,
                    delay: 300,
                  },
                  quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: false,
                  },
                  suggestOnTriggerCharacters: true,
                  codeLens: false,
                  folding: true,
                  foldingStrategy: 'auto',
                  showFoldingControls: 'always',
                  matchBrackets: 'always',
                  contextmenu: true,
                  // Disable all editing features
                  cursorBlinking: 'solid',
                  cursorStyle: 'line',
                  renderLineHighlight: 'none',
                  // Prevent focus
                  tabFocusMode: false,
                }}
                onMount={(editor, monaco) => {
                  editorRef.current = editor
                  monacoRef.current = monaco

                  // Set the correct language for IntelliSense
                  const model = editor.getModel()
                  if (model && monaco) {
                    const language = getMonacoLanguage(activeSample.language)
                    monaco.editor.setModelLanguage(model, language)
                  }

                  // Type out content programmatically after a short delay (0.1s as requested)
                  // This simulates user typing and naturally triggers language service initialization
                  setTimeout(() => {
                    const content = displayValue
                    if (content && activeSample) {
                      const language = getMonacoLanguage(activeSample.language)
                      // Only type out for languages that support IntelliSense
                      if (language !== 'plaintext' && language !== 'shell') {
                        typeContent(editor, content).catch(() => {
                          // Fallback: just set value if typing fails
                          editor.setValue(content)
                          editor.updateOptions({ readOnly: true, domReadOnly: true })
                        })
                      } else {
                        // For plaintext/shell, just set value normally
                        editor.setValue(content)
                        editor.updateOptions({ readOnly: true, domReadOnly: true })
                      }
                    }
                  }, 100)

                  // Get the editor DOM element and make it non-focusable
                  const editorDom = editor.getContainerDomNode()
                  editorDom.setAttribute('tabindex', '-1')

                  // Block keyboard events to prevent any editing
                  editorDom.addEventListener('keydown', (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }, true)

                  // Prevent focus but allow text selection
                  editor.onDidFocusEditorText(() => {
                    // Blur immediately to prevent cursor
                    setTimeout(() => {
                      editorDom.blur()
                    }, 0)
                  })
                }}
              />
            )}
          </div>
        </>
      )}

      {activeTab === 'output' && (
        <div className="flex-1 p-6 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                <div className="text-muted text-sm">Making API request...</div>
              </div>
            </div>
          )}
          {error && (
            <div className="bg-error border border-error rounded-lg p-4 mb-4">
              <div className="text-error font-semibold mb-2">Error</div>
              <div className="text-error text-sm">{error}</div>
            </div>
          )}
          {(() => {
            console.log('[DEBUG] CodeEditor render check - apiResponse:', apiResponse ? `has response (status: ${apiResponse.status})` : 'null', 'isLoading:', isLoading, 'activeTab:', activeTab)
            return null
          })()}
          {apiResponse && !isLoading && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`px-3 py-1 rounded text-sm font-medium ${apiResponse.status >= 200 && apiResponse.status < 300
                    ? 'bg-success text-success'
                    : 'bg-error text-error'
                    }`}>
                    {apiResponse.status} {apiResponse.statusText}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const responseText = apiResponse.raw || JSON.stringify(apiResponse.data, null, 2)
                    navigator.clipboard.writeText(responseText)
                    toast({
                      title: 'Copied!',
                      description: 'Response copied to clipboard',
                    })
                  }}
                  className="px-3 py-1.5 text-sm text-muted hover:text-white bg-code-editor-hover rounded transition-colors"
                >
                  Copy
                </button>
              </div>
              <Editor
                key={`response-editor-${endpointKey || 'default'}-${apiResponse.status}`} // Force remount when endpoint or status changes
                height="calc(100vh - 200px)"
                language={typeof apiResponse.data === 'string' ? 'plaintext' : 'json'}
                value={apiResponse.raw || (typeof apiResponse.data === 'string' ? apiResponse.data : JSON.stringify(apiResponse.data, null, 2))}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                }}
              />
            </div>
          )}
          {!apiResponse && !isLoading && !error && (
            <div className="flex items-center justify-center h-full">
              <div className="text-muted text-sm">Output will appear here after running the API...</div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Right Built With Button */}
      <div className="absolute bottom-8 right-8">
        <a
          href="https://github.com/madrasly/madrasly"
          target="_blank"
          rel="noopener noreferrer"
          className="
            px-4 py-2 bg-white text-black rounded-full font-medium text-sm 
            flex items-center gap-2 shadow-lg
            transition-all duration-200 ease-in-out
            hover:bg-gray-100 hover:shadow-xl active:bg-gray-200 active:scale-95
          "
        >
          Built with madrasly
        </a>
      </div>
    </div>
  )
}

