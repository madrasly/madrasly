'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Play, ChevronDown } from 'lucide-react'
import { FormField } from './form-field'
import { FormFieldConfig, ExampleOption, AuthConfig } from './types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseExampleCode } from '@/lib/example-parser'

interface ApiFormProps {
  urlField?: {
    label: string
    placeholder: string
    defaultValue?: string
    name?: string
  }
  formFields: FormFieldConfig[]
  onSubmit?: (data: Record<string, any>, apiKey?: string) => void
  onFormChange?: (data: Record<string, any>, apiKey?: string) => void
  isLoading?: boolean
  examples?: ExampleOption[]
  authConfig?: AuthConfig
  securityScheme?: {
    type: string
    scheme?: string
    name?: string
    in?: string
  }
  onRunClick?: () => void  // Callback when Run button is clicked
}

// Helper function to set nested value using dot notation
function setNestedValue(obj: Record<string, any>, path: string, value: any): Record<string, any> {
  const keys = path.split('.')
  const result = { ...obj }
  let current: any = result

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current) || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {}
    } else {
      current[key] = { ...current[key] }
    }
    current = current[key]
  }

  const lastKey = keys[keys.length - 1]
  current[lastKey] = value

  return result
}

// Helper function to delete nested value using dot notation
function deleteNestedValue(obj: Record<string, any>, path: string): Record<string, any> {
  const keys = path.split('.')
  const result = { ...obj }

  if (keys.length === 1) {
    // Top-level property
    const newResult = { ...result }
    delete newResult[keys[0]]
    return newResult
  }

  // Nested property - need to rebuild the nested structure
  let current: any = result
  const pathExists = keys.every((key, index) => {
    if (index === keys.length - 1) return true
    return key in current && typeof current[key] === 'object' && current[key] !== null && !Array.isArray(current[key])
  })

  if (!pathExists) return result

  // Rebuild the nested structure, omitting the target key
  const newResult = { ...result }
  let target: any = newResult

  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in target) || typeof target[keys[i]] !== 'object' || target[keys[i]] === null || Array.isArray(target[keys[i]])) {
      return result // Path doesn't exist
    }
    target[keys[i]] = { ...target[keys[i]] }
    target = target[keys[i]]
  }

  const lastKey = keys[keys.length - 1]
  if (lastKey in target) {
    delete target[lastKey]
  }

  return newResult
}

// Helper function to get nested value using dot notation
function getNestedValue(obj: Record<string, any>, path: string): any {
  const keys = path.split('.')
  let current: any = obj

  for (const key of keys) {
    if (current === undefined || current === null) return undefined
    current = current[key]
  }

  return current
}

export function ApiForm({ urlField, formFields, onSubmit, onFormChange, isLoading, examples, authConfig, securityScheme, onRunClick }: ApiFormProps) {
  // Initialize form data with default values - recalculate when formFields change
  // Handle nested structures properly
  const initialFormData = useMemo(() => {
    const data: Record<string, any> = {}
    formFields.forEach(field => {
      if (field.defaultValue !== undefined) {
        if (field.name.includes('.')) {
          // Handle nested paths
          setNestedValue(data, field.name, field.defaultValue)
        } else {
          data[field.name] = field.defaultValue
        }
      }
    })
    return data
  }, [formFields])

  const [urlValue, setUrlValue] = useState(urlField?.defaultValue || '')
  const [formData, setFormData] = useState<Record<string, any>>(initialFormData)
  const [selectedExample, setSelectedExample] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>('')

  // Show auth field only in manual mode
  const showAuthField = authConfig?.mode === 'manual' && securityScheme

  // Helper to find a field config by name (supports nested paths with dot notation)
  // Defined as regular function to support recursion
  function findFieldConfig(fieldPath: string, fields: FormFieldConfig[]): FormFieldConfig | undefined {
    // First try exact match
    for (const field of fields) {
      if (field.name === fieldPath) {
        return field
      }
    }

    // If no exact match and path contains dots, try to find parent object and search nested
    if (fieldPath.includes('.')) {
      const parts = fieldPath.split('.')
      const parentName = parts[0]
      const childPath = parts.slice(1).join('.')

      // Find parent field
      for (const field of fields) {
        if (field.name === parentName && field.nestedFields) {
          // Search in nested fields
          const nested = findFieldConfig(childPath, field.nestedFields)
          if (nested) return nested
        }
      }
    }

    return undefined
  }

  // Track which fields have been explicitly set by the user (not just defaults)
  const userModifiedFields = useRef<Set<string>>(new Set())
  // Track if we've auto-prefilled for the current endpoint
  const hasAutoPrefilled = useRef<boolean>(false)

  // Mark a field as user-modified when it changes
  useEffect(() => {
    // When formData changes, check which fields differ from initial defaults
    Object.keys(formData).forEach(key => {
      const field = findFieldConfig(key, formFields)
      if (field) {
        const currentValue = formData[key]
        const defaultValue = field.defaultValue
        // If value exists and differs from default, or if it's required, mark as modified
        if (currentValue !== undefined && currentValue !== null && currentValue !== '') {
          if (field.required || JSON.stringify(currentValue) !== JSON.stringify(defaultValue)) {
            userModifiedFields.current.add(key)
          }
        }
      }
    })
  }, [formData, formFields])

  // Helper to check if a value matches the schema default
  const valueMatchesDefault = useCallback((fieldPath: string, value: any): boolean => {
    const field = findFieldConfig(fieldPath, formFields)
    // Always include required fields, even if they match defaults
    if (!field || field.required) return false

    // Always include fields that the user has explicitly modified
    const fieldName = fieldPath.split('.')[0] // Get top-level field name
    if (userModifiedFields.current.has(fieldName)) {
      return false
    }

    const defaultValue = field.defaultValue
    if (defaultValue === undefined) return false // No default to match

    // Deep equality check
    if (JSON.stringify(value) === JSON.stringify(defaultValue)) {
      return true
    }

    return false
  }, [formFields])

  // Recursively clean up empty arrays, empty objects, null/undefined values, and default values
  const cleanData = useCallback((obj: any, parentPath: string = ''): any => {
    if (Array.isArray(obj)) {
      // Remove empty arrays - API expects either non-empty array or field omitted
      if (obj.length === 0) {
        return undefined
      }
      return obj.map((item, index) => cleanData(item, `${parentPath}[${index}]`))
    }
    if (obj && typeof obj === 'object') {
      const cleaned: Record<string, any> = {}
      for (const [key, value] of Object.entries(obj)) {
        // Skip internal keys
        if (key.startsWith('__')) continue

        const fieldPath = parentPath ? `${parentPath}.${key}` : key
        const cleanedValue = cleanData(value, fieldPath)

        // Only include non-undefined values
        if (cleanedValue !== undefined) {
          // Check if this value matches the schema default (only for top-level fields)
          // For nested fields, we check the full path
          const checkPath = parentPath ? fieldPath : key
          if (!valueMatchesDefault(checkPath, cleanedValue)) {
            cleaned[key] = cleanedValue
          }
          // If it matches default and is not required, exclude it (don't add to cleaned)
        }
      }
      // Remove empty objects - if object has no keys after cleaning, omit it
      if (Object.keys(cleaned).length === 0) {
        return undefined
      }
      return cleaned
    }
    // For primitive values, check if they match default (only for top-level)
    if (parentPath === '') {
      // This shouldn't happen for top-level primitives, but handle it
      return obj
    }
    return obj
  }, [valueMatchesDefault])

  // Track last cleaned data to prevent infinite loops
  const lastCleanedDataRef = useRef<string>('')

  // Reset form data when formFields change (e.g., when switching endpoints)
  useEffect(() => {
    setFormData(initialFormData)
    setUrlValue(urlField?.defaultValue || '')
    // Reset the cleaned data ref when formFields change
    lastCleanedDataRef.current = ''
    // Reset user modified fields tracking
    userModifiedFields.current.clear()
    // Reset selected example when endpoint changes
    setSelectedExample('')
    // Reset auto-prefill flag when endpoint changes
    hasAutoPrefilled.current = false
  }, [initialFormData, urlField?.defaultValue])

  // Auto-prefill with first example when component mounts or endpoint changes
  useEffect(() => {
    // Only auto-prefill if:
    // 1. Examples are available
    // 2. We haven't already auto-prefilled for this endpoint
    if (examples && examples.length > 0 && !hasAutoPrefilled.current) {
      const firstExample = examples[0]
      handleExampleSelect(firstExample.value)
      hasAutoPrefilled.current = true
    }
    // Only run when formFields change (new endpoint) or examples change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examples, formFields])

  // Use ref to store the latest onFormChange callback to avoid dependency issues
  const onFormChangeRef = useRef(onFormChange)
  useEffect(() => {
    onFormChangeRef.current = onFormChange
  }, [onFormChange])

  // Notify parent of form changes (excluding default values to match API behavior)
  useEffect(() => {
    const data: Record<string, any> = { ...formData }
    if (urlField) {
      data[urlField.name || 'url'] = urlValue
    }
    // Clean data to exclude defaults (so code editor matches what will be sent)
    const cleanedData = cleanData(data)

    // Only call onFormChange if the cleaned data actually changed
    const cleanedDataString = JSON.stringify(cleanedData)
    if (cleanedDataString !== lastCleanedDataRef.current) {
      lastCleanedDataRef.current = cleanedDataString
      // Pass API key separately, not in form data
      onFormChangeRef.current?.(cleanedData, showAuthField ? apiKey : undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlValue, formData, urlField, apiKey, showAuthField])

  const handleSubmit = () => {
    // Trigger onRunClick callback (to switch to code view on mobile)
    onRunClick?.()

    const data: Record<string, any> = { ...formData }
    if (urlField) {
      data[urlField.name || 'url'] = urlValue
    }
    // For GET requests (query parameters), include all non-empty values regardless of defaults
    // For POST/PUT/PATCH (request body), clean data normally
    // We'll determine this in the parent component, but for now, be more permissive
    // Include all values that exist in formData, even if they match defaults
    const cleanedData = cleanData(data)

    // If cleanedData is missing fields that were in formData, add them back
    // This ensures user-entered values (even if matching defaults) are included
    const finalData: Record<string, any> = { ...cleanedData }
    Object.keys(data).forEach(key => {
      const value = data[key]
      // If value exists and is not empty, include it even if it was filtered out
      if (value !== undefined && value !== null && value !== '' && !(key in finalData)) {
        // Only add back if it's a primitive or non-empty array/object
        if (typeof value !== 'object' || (Array.isArray(value) && value.length > 0) || (!Array.isArray(value) && Object.keys(value).length > 0)) {
          finalData[key] = value
        }
      }
    })

    // Pass API key separately, not in form data
    onSubmit?.(finalData, showAuthField ? apiKey : undefined)
  }

  const handleClear = () => {
    // Reset URL field to default or empty
    setUrlValue(urlField?.defaultValue || '')
    // Reset form fields to their default values
    setFormData(initialFormData)
    // Reset API key
    setApiKey('')
  }

  const handleExampleSelect = (exampleValue: string) => {
    const example = examples?.find(ex => ex.value === exampleValue)
    if (!example) return

    // Parse the example code to extract form values
    const parsedValues = parseExampleCode(
      example.language,
      example.code,
      formFields,
      urlField?.name
    )

    // Update form data with parsed values
    // Start with a fresh form data object - only include values from the example
    // Don't initialize with defaults - if a field isn't in the example, leave it empty
    const newFormData: Record<string, any> = {}

    // Apply parsed values from example
    // Create maps for quick lookup
    const topLevelFieldNames = new Set(
      formFields
        .filter(field => !field.name.includes('.'))
        .map(field => field.name)
    )
    const allFieldNames = new Set(formFields.map(field => field.name))
    const fieldBaseNames = new Map<string, string>() // baseName -> fullFieldName
    formFields.forEach(field => {
      const baseName = field.name.split('.')[0]
      if (!fieldBaseNames.has(baseName) || !field.name.includes('.')) {
        fieldBaseNames.set(baseName, field.name)
      }
    })

    for (const [key, value] of Object.entries(parsedValues)) {
      // Check if this is the URL field (path parameter)
      if (urlField && key === urlField.name) {
        setUrlValue(value)
      } else if (topLevelFieldNames.has(key)) {
        // Direct match with a top-level form field - set it directly
        // This handles nested structures like arrays/objects correctly
        newFormData[key] = value
      } else if (allFieldNames.has(key)) {
        // Exact match with any field (including nested)
        if (key.includes('.')) {
          setNestedValue(newFormData, key, value)
        } else {
          newFormData[key] = value
        }
      } else if (fieldBaseNames.has(key)) {
        // Matches a field's base name - set it using the full field name
        const fullFieldName = fieldBaseNames.get(key)!
        if (fullFieldName.includes('.')) {
          setNestedValue(newFormData, fullFieldName, value)
        } else {
          newFormData[key] = value
        }
      } else {
        // Last resort: if it's a top-level key that looks like it should be a form field, include it
        // This catches cases where the parser extracts fields that should exist
        const looksLikeFormField = /^[a-z_][a-z0-9_]*$/i.test(key)
        if (looksLikeFormField && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value) || (typeof value === 'object' && value !== null))) {
          newFormData[key] = value
        }
      }
    }

    setFormData(newFormData)

    // Keep the selected example value so it displays in the dropdown
    setSelectedExample(exampleValue)
  }

  return (
    <div className="min-w-0">
      {/* Top row: Try an example on left, Run/Clear buttons on right */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Try an example - show if examples exist */}
        {examples && examples.length > 0 && (
          <div className="flex items-center min-w-0 max-w-full">
            <Select value={selectedExample} onValueChange={handleExampleSelect}>
              <SelectTrigger className="w-auto h-auto px-0 py-0 border-0 bg-transparent text-sm text-link shadow-none">
                <SelectValue placeholder="Try an example" />
              </SelectTrigger>
              <SelectContent>
                {examples.map((example) => (
                  <SelectItem key={example.value} value={example.value}>
                    {example.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Run/Clear Buttons - wraps to new line when needed */}
        <div className="flex items-center gap-2 flex-shrink-0 basis-full sm:basis-auto sm:ml-auto">
          <button
            onClick={handleClear}
            className="btn-secondary"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            Clear
          </button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 h-auto rounded-md flex items-center gap-2 cursor-pointer transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                Running...
              </>
            ) : (
              <>
                <Play size={14} fill="white" />
                Run
              </>
            )}
          </Button>
        </div>
      </div>

      {/* URL Input - only show if defined in spec */}
      {urlField && (
        <div className="mb-6">
          <label className="block label-default mb-2 max-w-4xl">
            {urlField.label}
          </label>
          <Input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            className="w-full h-12 px-4 text-[15px] border-2 border-primary rounded-lg focus:outline-none focus:border-primary/80"
            placeholder={urlField.placeholder}
          />
        </div>
      )}

      {/* Auth Field - only show in manual mode */}
      {showAuthField && (
        <div className="mb-6">
          <label className="block label-default mb-2">
            {securityScheme?.type === 'http' && securityScheme?.scheme === 'bearer'
              ? 'API Key (Bearer Token)'
              : securityScheme?.type === 'apiKey' && securityScheme?.in === 'header'
                ? `API Key (${securityScheme.name || 'Header'})`
                : securityScheme?.type === 'apiKey' && securityScheme?.in === 'query'
                  ? `API Key (${securityScheme.name || 'Query Parameter'})`
                  : 'API Key'}
          </label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full h-12 px-4 text-[15px] border-2 border-primary rounded-lg focus:outline-none focus:border-primary/80"
            placeholder={
              securityScheme?.type === 'http' && securityScheme?.scheme === 'bearer'
                ? 'Enter your Bearer token'
                : securityScheme?.type === 'apiKey'
                  ? `Enter your ${securityScheme.name || 'API key'}`
                  : 'Enter your API key'
            }
          />
        </div>
      )}

      <div className="space-y-0 min-w-0">
        {formFields.map((field, index) => {
          // Get value - handle nested paths
          const fieldValue = field.name.includes('.')
            ? getNestedValue(formData, field.name)
            : formData[field.name]

          // Handle onChange - update nested or flat value
          // If value is undefined, delete the property instead of setting it to undefined
          const handleFieldChange = (value: any) => {
            // Mark this field as user-modified when user changes it
            const fieldName = field.name.split('.')[0] // Get top-level field name
            if (value !== undefined && value !== null && value !== '') {
              userModifiedFields.current.add(fieldName)
            }

            if (field.name.includes('.')) {
              if (value === undefined) {
                // Delete nested property - this forces a complete reset
                setFormData(prev => deleteNestedValue(prev, field.name))
              } else {
                setFormData(prev => setNestedValue(prev, field.name, value))
              }
            } else {
              if (value === undefined) {
                // Delete the property entirely - this forces a complete reset
                setFormData(prev => {
                  const newData = { ...prev }
                  delete newData[field.name]
                  return newData
                })
              } else {
                setFormData(prev => ({ ...prev, [field.name]: value }))
              }
            }
          }

          return (
            <FormField
              key={index}
              config={field}
              value={fieldValue}
              onChange={handleFieldChange}
            />
          )
        })}
      </div>
    </div>
  )
}

