import { LucideIcon } from 'lucide-react'

export interface SidebarNavItem {
  title?: string
  items: {
    label: string
    icon?: LucideIcon
    active?: boolean
    badge?: string
    external?: LucideIcon
    endpointKey?: string
    onClick?: () => void
    items?: SidebarNavItem['items'] // Support for nested subsections
  }[]
}

export interface FormFieldConfig {
  name: string
  label: string
  description?: string
  type: 'text' | 'switch' | 'select' | 'number' | 'array' | 'object' | 'array-object' | 'date' | 'datetime' | 'multi-select'
  placeholder?: string
  defaultValue?: string | boolean | number | string[] | Record<string, any> | Array<Record<string, any>>
  options?: { value: string; label: string }[]
  required?: boolean
  nullable?: boolean // True if field can be null (has anyOf with type: 'null')
  infoIcon?: boolean
  format?: string // OpenAPI format (e.g., 'date', 'date-time')
  minimum?: number // For number/slider fields
  maximum?: number // For number/slider fields
  // For object type: nested fields within this object
  nestedFields?: FormFieldConfig[]
  // For array-object type: schema for items in the array
  itemSchema?: any
  // For discriminated unions: which fields belong to which variant
  discriminator?: {
    propertyName: string
    variants: Record<string, FormFieldConfig[]> // Map of discriminator value -> fields for that variant
  }
}

export interface CodeSample {
  language: string
  code: string
  icon?: React.ReactNode
}

export interface ExampleOption {
  label: string
  value: string
  language: string
  code: string
}

export interface AuthConfig {
  mode?: 'automatic' | 'manual'
  schemeName?: string
}

export interface ApiEndpointConfig {
  title: string
  description: string
  method: string
  path: string
  codeSamples: CodeSample[]
  formFields: FormFieldConfig[]
  examples?: ExampleOption[]
  authConfig?: AuthConfig
}

