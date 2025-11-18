'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Info, ChevronDown, ChevronRight, CalendarIcon } from 'lucide-react'
import { format, parseISO, isValid, parse } from 'date-fns'
import { FormFieldConfig } from './types'
import { MarkdownRenderer } from './markdown-renderer'

interface FormFieldProps {
  config: FormFieldConfig
  value?: string | boolean | number | string[] | Record<string, any> | Array<Record<string, any>>
  onChange?: (value: string | boolean | number | string[] | Record<string, any> | Array<Record<string, any>> | undefined) => void
}

function ObjectField({
  config,
  value,
  onChange
}: {
  config: FormFieldConfig
  value?: Record<string, any>
  onChange?: (value: Record<string, any>) => void
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const nestedFields = config.nestedFields || []
  
  // Initialize object value
  const objectValue = useMemo(() => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, any>
    }
    if (config.defaultValue && typeof config.defaultValue === 'object' && !Array.isArray(config.defaultValue)) {
      return config.defaultValue as Record<string, any>
    }
    return {}
  }, [value, config.defaultValue])
  
  const handleNestedChange = (fieldName: string, fieldValue: any) => {
    const newValue = { ...objectValue, [fieldName]: fieldValue }
    onChange?.(newValue)
  }
  
  // Extract field name from nested field (handle dot notation like "parent.child")
  const getFieldName = (field: FormFieldConfig) => {
    const parts = field.name.split('.')
    return parts[parts.length - 1]
  }
  
  return (
        <div className="py-4 min-w-0 border-l-2 border-default pl-4">
      {/* Hidden expanded content for scrapers - always show all nested fields */}
      <div className="sr-only">
        <h4>{config.label} - Nested Fields</h4>
        {config.description && (
          <div className="description-default mb-3">
            <MarkdownRenderer content={config.description} />
          </div>
        )}
        <div className="space-y-0">
          {nestedFields.map((field, index) => (
            <div key={`scraper-${index}`}>
              <strong>{field.label}</strong>
              {field.required && <span> (required)</span>}
              {field.description && (
                <div className="description-default">
                  <MarkdownRenderer content={field.description} />
                </div>
              )}
              {field.type === 'select' && field.options && (
                <div>
                  <span>Available options: </span>
                  {field.options.map((opt, optIdx) => (
                    <span key={optIdx}>
                      {opt.label} ({opt.value}){optIdx < field.options!.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full text-left mb-2 hover:opacity-70 transition-opacity"
      >
        {isExpanded ? (
          <ChevronDown size={16} className="text-tertiary flex-shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-tertiary flex-shrink-0" />
        )}
        <label className="label-default">{config.label}</label>
        {config.required && <span className="text-error">*</span>}
        {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
      </button>
      {config.description && (
        <div className="description-default mb-3 ml-6">
          <MarkdownRenderer content={config.description} />
        </div>
      )}
      {isExpanded && (
        <div className="ml-6 space-y-0">
          {nestedFields.map((field, index) => {
            const fieldName = getFieldName(field)
            const fieldValue = objectValue[fieldName]
            return (
              <FormField
                key={index}
                config={field}
                value={fieldValue}
                onChange={(val) => handleNestedChange(fieldName, val)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function ArrayObjectField({
  config,
  value,
  onChange
}: {
  config: FormFieldConfig
  value?: Array<Record<string, any>>
  onChange?: (value: Array<Record<string, any>>) => void
}) {
  const nestedFields = config.nestedFields || []
  const discriminator = config.discriminator
  
  // Initialize array value
  const arrayValue = useMemo(() => {
    if (Array.isArray(value)) {
      return value as Array<Record<string, any>>
    }
    if (Array.isArray(config.defaultValue)) {
      return config.defaultValue as Array<Record<string, any>>
    }
    return []
  }, [value, config.defaultValue])
  
  const handleItemChange = (index: number, itemValue: Record<string, any>) => {
    const newArray = [...arrayValue]
    newArray[index] = itemValue
    onChange?.(newArray)
  }
  
  const handleAddItem = () => {
    const newItem: Record<string, any> = {}
    // Initialize with default values from nested fields
    nestedFields.forEach(field => {
      const fieldName = field.name.split('.').pop() || field.name
      if (field.defaultValue !== undefined) {
        newItem[fieldName] = field.defaultValue
      }
    })
    onChange?.([...arrayValue, newItem])
  }
  
  const handleRemoveItem = (index: number) => {
    const newArray = arrayValue.filter((_, i) => i !== index)
    onChange?.(newArray)
  }
  
  // Extract field name from nested field (handle dot notation)
  const getFieldName = (field: FormFieldConfig) => {
    const parts = field.name.split('.')
    return parts[parts.length - 1]
  }
  
  // Get fields to show for an item based on discriminator value
  const getFieldsForItem = (item: Record<string, any>): FormFieldConfig[] => {
    if (!discriminator) {
      return nestedFields
    }
    
    const discriminatorValue = item[discriminator.propertyName]
    if (discriminatorValue && discriminator.variants[discriminatorValue]) {
      // Show type field + fields for selected variant
      const typeField = nestedFields.find(f => getFieldName(f) === discriminator.propertyName)
      const variantFields = discriminator.variants[discriminatorValue] || []
      return typeField ? [typeField, ...variantFields] : variantFields
    }
    
    // No type selected yet, show only type field
    const typeField = nestedFields.find(f => getFieldName(f) === discriminator.propertyName)
    return typeField ? [typeField] : []
  }
  
  return (
    <div className="py-4 min-w-0">
      {/* Hidden expanded content for scrapers - always show all nested fields */}
      <div className="sr-only">
        <h4>{config.label} - Array of Objects</h4>
        {config.description && (
          <div className="description-default mb-3">
            <MarkdownRenderer content={config.description} />
          </div>
        )}
        <div>Nested fields for each item:</div>
        <div className="space-y-0">
          {nestedFields.map((field, index) => {
            const fieldName = getFieldName(field)
            return (
              <div key={`scraper-${index}`}>
                <strong>{field.label}</strong> ({fieldName})
                {field.required && <span> (required)</span>}
                {field.description && (
                  <div className="description-default">
                    <MarkdownRenderer content={field.description} />
                  </div>
                )}
                {field.type === 'select' && field.options && (
                  <div>
                    <span>Available options: </span>
                    {field.options.map((opt, optIdx) => (
                      <span key={optIdx}>
                        {opt.label} ({opt.value}){optIdx < field.options!.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 min-w-0">
          <label className="label-default">{config.label}</label>
          {config.required && <span className="text-error">*</span>}
          {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
        </div>
        <button
          type="button"
          onClick={handleAddItem}
          className="px-3 py-1 text-xs text-link border border-link/30 rounded hover:bg-link/10 transition-colors cursor-pointer"
        >
          + Add
        </button>
      </div>
      {config.description && (
        <div className="description-default mb-3">
          <MarkdownRenderer content={config.description} />
        </div>
      )}
      <div className="space-y-4">
        {arrayValue.map((item, index) => {
          const fieldsToShow = getFieldsForItem(item)
          return (
            <div key={index} className="border border-default rounded-lg p-4 bg-hover">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-secondary">Item {index + 1}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="px-2 py-1 text-xs text-error hover:text-error/80 border border-error rounded hover:bg-error/10 transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>
              <div className="space-y-0">
                {fieldsToShow.map((field, fieldIndex) => {
                  const fieldName = getFieldName(field)
                  const fieldValue = item[fieldName]
                  return (
                    <FormField
                      key={fieldIndex}
                      config={field}
                      value={fieldValue}
                      onChange={(val) => {
                        const updatedItem = { ...item, [fieldName]: val }
                        // When type changes, clear fields from other variants
                        if (discriminator && fieldName === discriminator.propertyName && val !== fieldValue) {
                          const newType = val as string
                          const variantFields = discriminator.variants[newType] || []
                          const variantFieldNames = new Set(variantFields.map(f => getFieldName(f)))
                          // Remove fields that don't belong to the new variant
                          Object.keys(updatedItem).forEach(key => {
                            if (key !== discriminator.propertyName && !variantFieldNames.has(key)) {
                              delete updatedItem[key]
                            }
                          })
                        }
                        handleItemChange(index, updatedItem)
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
        {arrayValue.length === 0 && (
          <div className="text-sm text-tertiary italic py-2">
            No items. Click "Add" to create one.
          </div>
        )}
      </div>
    </div>
  )
}

function ArrayFieldInput({ 
  config, 
  value, 
  onChange 
}: { 
  config: FormFieldConfig
  value?: string | boolean | number | string[]
  onChange?: (value: string | boolean | number | string[] | Record<string, any> | Array<Record<string, any>> | undefined) => void
}) {
  // Convert initial value to string for display
  const getInitialString = () => {
    if (value !== undefined) {
      if (Array.isArray(value)) return value.join(', ')
      if (typeof value === 'string') return value
    }
    if (config.defaultValue !== undefined) {
      if (Array.isArray(config.defaultValue)) return config.defaultValue.join(', ')
      if (typeof config.defaultValue === 'string') return config.defaultValue
    }
    return ''
  }
  
  const [localValue, setLocalValue] = useState(getInitialString())
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    setLocalValue(inputValue)
    // Parse to array and notify parent
    const arrayValues = inputValue
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0)
    onChange?.(arrayValues.length > 0 ? arrayValues : [])
  }
  
  return (
    <div className="py-4 min-w-0">
      <div className="flex items-center gap-1 mb-1 min-w-0">
        <label className="label-default">
          {config.label}
          {config.required && <span className="text-error">*</span>}
        </label>
        {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
      </div>
      {config.description && (
        <div className="description-default mb-3">
          <MarkdownRenderer content={config.description} />
        </div>
      )}
      <Input
        type="text"
        placeholder={config.placeholder || 'Enter comma-separated values'}
        value={localValue}
        onChange={handleChange}
            className="input-default"
        readOnly={false}
        disabled={false}
      />
    </div>
  )
}

function MultiSelectField({
  config,
  value,
  onChange
}: {
  config: FormFieldConfig
  value?: string[]
  onChange?: (value: string[] | undefined) => void
}) {
  const selectedValues = useMemo(() => {
    if (Array.isArray(value)) {
      return new Set(value)
    }
    if (Array.isArray(config.defaultValue)) {
      return new Set(config.defaultValue)
    }
    return new Set<string>()
  }, [value, config.defaultValue])

  const handleToggle = (optionValue: string) => {
    const newSet = new Set(selectedValues)
    if (newSet.has(optionValue)) {
      newSet.delete(optionValue)
    } else {
      newSet.add(optionValue)
    }
    onChange?.(Array.from(newSet))
  }

  return (
    <div className="py-4 min-w-0">
      <div className="flex items-center gap-1 mb-1 min-w-0">
        <label className="label-default">
          {config.label}
          {config.required && <span className="text-error">*</span>}
        </label>
        {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
      </div>
      {config.description && (
        <div className="description-default mb-3">
          <MarkdownRenderer content={config.description} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {config.options?.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              checked={selectedValues.has(option.value)}
              onCheckedChange={() => handleToggle(option.value)}
            />
            <label
              className="text-sm text-primary cursor-pointer flex-1"
              onClick={() => handleToggle(option.value)}
            >
              {option.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FormField({ config, value, onChange }: FormFieldProps) {
  // Add hidden structured data for all fields (for scrapers)
  const fieldMetadata = (
    <div className="sr-only" itemScope itemType="https://schema.org/Property">
      <meta itemProp="name" content={config.label} />
      {config.description && <meta itemProp="description" content={config.description.replace(/<[^>]*>/g, '')} />}
      {config.required && <meta itemProp="required" content="true" />}
      {config.type && <meta itemProp="fieldType" content={config.type} />}
      {config.defaultValue !== undefined && <meta itemProp="defaultValue" content={String(config.defaultValue)} />}
      {config.placeholder && <meta itemProp="placeholder" content={config.placeholder} />}
      {config.options && config.options.length > 0 && (
        <meta itemProp="options" content={config.options.map(opt => `${opt.label}(${opt.value})`).join(', ')} />
      )}
    </div>
  )

  const renderField = () => {
    switch (config.type) {
      case 'switch':
        return (
          <div className="flex items-start justify-between py-4 min-w-0">
            <div className="flex-1 min-w-0">
              <h3 className="label-default">
                {config.label}
                {config.required && <span className="text-error">*</span>}
              </h3>
              {config.description && (
                <div className="description-default mt-1">
                  <MarkdownRenderer content={config.description} />
                </div>
              )}
            </div>
            <Switch 
              className="mt-0.5 flex-shrink-0" 
              checked={value as boolean ?? (config.defaultValue as boolean ?? false)}
              onCheckedChange={(checked) => onChange?.(checked)}
            />
          </div>
        )

      case 'select':
        return (
          <div className="py-4 min-w-0">
            {/* Hidden list of options for scrapers */}
            {config.options && config.options.length > 0 && (
              <div className="sr-only">
                <div>
                  <strong>{config.label}</strong>
                  {config.required && <span> (required)</span>}
                  {config.description && (
                    <div className="description-default">
                      <MarkdownRenderer content={config.description} />
                    </div>
                  )}
                  <div>Available options: {config.options.map((opt, idx) => (
                    <span key={idx}>
                      {opt.label} ({opt.value}){idx < config.options!.length - 1 ? ', ' : ''}
                    </span>
                  ))}</div>
                  {config.defaultValue !== undefined && (
                    <div>Default value: {Array.isArray(config.defaultValue) ? config.defaultValue.join(', ') : String(config.defaultValue)}</div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-1 mb-1 min-w-0">
              <label className="label-default">
                {config.label}
                {config.required && <span className="text-error">*</span>}
              </label>
              {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
            </div>
            {config.description && (
              <div className="description-default mb-3">
                <MarkdownRenderer content={config.description} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Select 
                key={value !== undefined ? `select-${config.name}-${value}` : `select-${config.name}-empty`}
                value={value !== undefined ? String(value) : undefined}
                onValueChange={(val) => onChange?.(val)}
              >
                <SelectTrigger className="w-full h-11 border-default min-w-0">
                  <SelectValue placeholder={config.placeholder || (config.defaultValue !== undefined ? `Default: ${config.defaultValue}` : 'Select...')} />
                </SelectTrigger>
                <SelectContent>
                  {config.options?.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {config.nullable && value !== undefined && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    // Clear the value - this will delete the property and force Select to remount
                    onChange?.(undefined)
                  }}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-tertiary hover:text-secondary hover:bg-hover rounded transition-colors"
                  title="Clear value"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>
        )

      case 'array':
        return <ArrayFieldInput config={config} value={value as string[] | undefined} onChange={onChange} />
      
      case 'multi-select':
        // Add hidden options list for scrapers
        const multiSelectContent = (
          <div className="py-4 min-w-0">
            {config.options && config.options.length > 0 && (
              <div className="sr-only">
                <div>
                  <strong>{config.label}</strong>
                  {config.required && <span> (required)</span>}
                  {config.description && (
                    <div className="description-default">
                      <MarkdownRenderer content={config.description} />
                    </div>
                  )}
                  <div>Available options: {config.options.map((opt, idx) => (
                    <span key={idx}>
                      {opt.label} ({opt.value}){idx < config.options!.length - 1 ? ', ' : ''}
                    </span>
                  ))}</div>
                  {config.defaultValue !== undefined && (
                    <div>Default value: {Array.isArray(config.defaultValue) ? config.defaultValue.join(', ') : String(config.defaultValue)}</div>
                  )}
                </div>
              </div>
            )}
            <MultiSelectField config={config} value={value as string[] | undefined} onChange={onChange ? (val: string[] | undefined) => onChange(val as any) : undefined} />
          </div>
        )
        return multiSelectContent
      
      case 'object':
        return <ObjectField config={config} value={value as Record<string, any>} onChange={onChange as (value: Record<string, any>) => void} />
      
      case 'array-object':
        return <ArrayObjectField config={config} value={value as Array<Record<string, any>>} onChange={onChange as (value: Array<Record<string, any>>) => void} />

      case 'number': {
        // Use slider if min/max are defined
        if (config.minimum !== undefined && config.maximum !== undefined) {
          const numValue = typeof value === 'number' ? value : (config.defaultValue as number ?? config.minimum ?? 0)
          const min = config.minimum
          const max = config.maximum
          
          return (
            <div className="py-4 min-w-0">
              <div className="flex items-center gap-1 mb-1 min-w-0">
                <label className="label-default">
                  {config.label}
                  {config.required && <span className="text-error">*</span>}
                </label>
                {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
              </div>
              {config.description && (
                <div className="description-default mb-3">
                  <MarkdownRenderer content={config.description} />
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Slider
                    value={[numValue]}
                    min={min}
                    max={max}
                    onValueChange={(vals) => {
                      const newValue = vals[0]
                      onChange?.(newValue)
                    }}
                  />
                </div>
                <Input
                  type="number"
                  min={min}
                  max={max}
                  value={numValue}
                  onChange={(e) => {
                    const inputValue = e.target.value
                    if (inputValue === '') {
                      onChange?.(undefined)
                    } else {
                      const numValue = Number(inputValue)
                      if (!isNaN(numValue) && isFinite(numValue)) {
                        // Clamp to min/max
                        const clamped = Math.max(min, Math.min(max, numValue))
                        onChange?.(clamped)
                      }
                    }
                  }}
                  className="w-20 h-11 px-3 text-sm border border-default rounded-lg focus:outline-none focus:border-hover"
                />
              </div>
            </div>
          )
        }
        
        // Regular number input (no min/max)
        // Calculate initial display value - only show actual value, not default
        const displayValue = value !== undefined && value !== null
          ? String(value)
          : ''
        
        const [localValue, setLocalValue] = useState(displayValue)
        
        // Update local value when prop value changes (e.g., from clear button)
        // Only sync when value prop changes from external source (like clear button)
        useEffect(() => {
          if (value !== undefined && value !== null) {
            const newDisplayValue = String(value)
            setLocalValue(prev => {
              if (prev !== newDisplayValue) {
                return newDisplayValue
              }
              return prev
            })
          } else if (value === undefined) {
            // Value was cleared - reset to empty (don't show default)
            setLocalValue('')
          }
        }, [value])
        
        return (
          <div className="py-4 min-w-0">
            <div className="flex items-center gap-1 mb-1 min-w-0">
              <label className="label-default">
                {config.label}
                {config.required && <span className="text-error">*</span>}
              </label>
              {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
            </div>
            {config.description && (
              <div className="description-default mb-3">
                <MarkdownRenderer content={config.description} />
              </div>
            )}
            <Input
              type="number"
              placeholder={config.placeholder || (config.defaultValue !== undefined ? `Default: ${config.defaultValue}` : '')}
              value={localValue}
              className="input-default"
              onChange={(e) => {
                const inputValue = e.target.value
                setLocalValue(inputValue)
                // Parse to number if not empty
                if (inputValue === '') {
                  // Empty value - pass undefined so code generator uses default
                  onChange?.(undefined)
                } else {
                  const numValue = Number(inputValue)
                  // Only pass number if it's a valid number
                  if (!isNaN(numValue) && isFinite(numValue)) {
                    onChange?.(numValue)
                  }
                  // If invalid, don't update parent (user might be typing, e.g., just "-")
                }
              }}
            />
          </div>
        )
      }

      case 'date':
      case 'datetime': {
        const isDateTime = config.type === 'datetime'
        const displayFormat = isDateTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd'
        const outputFormat = isDateTime ? "yyyy-MM-dd'T'HH:mm:ss'Z'" : 'yyyy-MM-dd'
        
        // Parse the value string to a Date object
        const parseValue = (val: string | undefined): Date | undefined => {
          if (!val) return undefined
          try {
            // Try ISO format first
            const isoDate = parseISO(val)
            if (isValid(isoDate)) return isoDate
            // Try date format
            const dateOnly = parse(val, 'yyyy-MM-dd', new Date())
            if (isValid(dateOnly)) return dateOnly
            return undefined
          } catch {
            return undefined
          }
        }
        
        // Format date for display
        const formatDate = (date: Date | undefined): string => {
          if (!date || !isValid(date)) return ''
          return format(date, displayFormat)
        }
        
        // Format date for output (API format)
        const formatDateForOutput = (date: Date | undefined): string => {
          if (!date || !isValid(date)) return ''
          if (isDateTime) {
            // For datetime, output ISO 8601 format
            return date.toISOString()
          } else {
            // For date, output YYYY-MM-DD
            return format(date, 'yyyy-MM-dd')
          }
        }
        
        const dateValue = parseValue(value as string | undefined)
        const [open, setOpen] = useState(false)
        const [displayValue, setDisplayValue] = useState(() => formatDate(dateValue))
        
        // Update display value when prop value changes
        useEffect(() => {
          const newDate = parseValue(value as string | undefined)
          setDisplayValue(formatDate(newDate))
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [value])
        
        return (
          <div className="py-4 min-w-0">
            <div className="flex items-center gap-1 mb-1 min-w-0">
              <label className="label-default">
                {config.label}
                {config.required && <span className="text-error">*</span>}
              </label>
              {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
            </div>
            {config.description && (
              <div className="description-default mb-3">
                <MarkdownRenderer content={config.description} />
              </div>
            )}
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-11 px-4 text-sm border border-default rounded-lg justify-start text-left font-normal min-w-0"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                  {displayValue || (
                    <span className="text-tertiary">
                      {config.placeholder || (config.defaultValue !== undefined ? `Default: ${config.defaultValue}` : `Pick a ${isDateTime ? 'date and time' : 'date'}`)}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateValue}
                  captionLayout="dropdown"
                  fromYear={1900}
                  toYear={new Date().getFullYear() + 10}
                  onSelect={(date) => {
                    if (date) {
                      const outputValue = formatDateForOutput(date)
                      onChange?.(outputValue)
                      setDisplayValue(formatDate(date))
                      if (!isDateTime) {
                        // For date-only, close immediately after selection
                        setOpen(false)
                      }
                    } else {
                      onChange?.(undefined)
                      setDisplayValue('')
                    }
                  }}
                  initialFocus
                />
                {isDateTime && dateValue && (
                  <div className="p-3 border-t">
                    <Input
                      type="time"
                      value={format(dateValue, 'HH:mm')}
                      onChange={(e) => {
                        const timeValue = e.target.value
                        if (timeValue && dateValue) {
                          const [hours, minutes] = timeValue.split(':')
                          const newDate = new Date(dateValue)
                          newDate.setHours(parseInt(hours, 10))
                          newDate.setMinutes(parseInt(minutes, 10))
                          const outputValue = formatDateForOutput(newDate)
                          onChange?.(outputValue)
                          setDisplayValue(formatDate(newDate))
                        }
                      }}
                      className="w-full"
                    />
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )
      }

      case 'text':
      default:
        return (
          <div className="py-4 min-w-0">
            <div className="flex items-center gap-1 mb-1 min-w-0">
              <label className="label-default">
                {config.label}
                {config.required && <span className="text-error">*</span>}
              </label>
              {config.infoIcon && <Info size={14} className="text-tertiary flex-shrink-0" />}
            </div>
            {config.description && (
              <div className="description-default mb-3">
                <MarkdownRenderer content={config.description} />
              </div>
            )}
            <Input
              type="text"
              placeholder={config.placeholder || (config.defaultValue !== undefined ? `Default: ${config.defaultValue}` : '')}
              value={value !== undefined ? String(value) : ''}
              className="input-default"
              onChange={(e) => onChange?.(e.target.value)}
            />
          </div>
        )
    }
  }

  return (
    <>
      {fieldMetadata}
      {renderField()}
    </>
  )
}

