'use client'

import React from 'react'
import { FormFieldConfig, CodeSample, ApiEndpointConfig } from '@/components/api-playground/types'
import { generateCodeSamples } from './code-generator'

interface OpenAPISpec {
  servers?: Array<{ url: string }>
  components?: {
    securitySchemes?: Record<string, any>
    schemas?: Record<string, any>
  }
  paths: {
    [path: string]: {
      [method: string]: {
        summary?: string
        description?: string
        'x-codeSamples'?: Array<{ lang: string; source: string }>
        requestBody?: {
          content?: {
            'application/json'?: {
              schema?: { properties?: Record<string, any>; required?: string[] }
            }
          }
        }
        parameters?: Array<{
          name: string
          in: string
          description?: string
          schema?: {
            type: string
            enum?: string[]
            default?: any
            example?: any
            minimum?: number
            maximum?: number
          }
          required?: boolean
        }>
        'x-oaiMeta'?: {
          examples?: Array<{ title?: string; request?: Record<string, string> }>
        }
        security?: Array<Record<string, string[]>>
      }
    }
  }
  'x-ui-config'?: {
    sidebar?: {
      workspace?: { name: string; icon: string }
      navItems?: Array<{
        title?: string
        items: Array<{ label: string; icon?: string; active?: boolean; badge?: string; external?: boolean }>
      }>
      user?: { name: string; initials: string }
    }
    endpoints?: {
      [endpointKey: string]: {
        title: string
        description: string
        method: string
        path: string
        urlField?: { label?: string; placeholder?: string; defaultValue?: string; name?: string }
      }
    }
    auth?: { mode?: 'automatic' | 'manual'; schemeName?: string }
  }
}

// Schema resolution functions removed - spec is already dereferenced by @apidevtools/swagger-parser
// All $refs and allOf merging are handled by the library

function pickVariant(variants: any[]): any {
  if (!variants?.length) return null
  // Spec is already dereferenced, so variants are already resolved objects
  const checks = [
    (r: any) => r.type === 'array' && r.items && (r.items?.type === 'object' || r.items?.properties),
    (r: any) => r.type === 'object' || r.properties,
    (r: any) => r.type === 'array',
    (r: any) => r.type !== 'null'
  ]
  for (const check of checks) {
    for (const variant of variants) {
      // Variant is already resolved (no $ref), just check it directly
      if (variant && check(variant)) return variant
    }
  }
  return null
}

function mergeContentPartTypes(parentSchema: any): any {
  // Check if parent schema has discriminator-based anyOf
  if (!parentSchema?.anyOf || !parentSchema?.discriminator) return null

  // After dereferencing, variants are already resolved objects (no $ref strings)
  // Collect all content part schemas from all variants
  const allContentPartSchemas: any[] = []

  for (const variant of parentSchema.anyOf) {
    // Variant is already resolved (no $ref), just check it directly
    if (!variant || variant.type !== 'object') continue

    const contentProp = variant.properties?.content
    if (!contentProp) continue

    // Check if content has anyOf with array variant
    if (contentProp.anyOf) {
      for (const contentVariant of contentProp.anyOf) {
        if (contentVariant.type === 'array' && contentVariant.items) {
          // items is already resolved (no $ref), just collect the schema
          const itemsSchema = contentVariant.items
          // If items schema has anyOf, collect all variants
          if (itemsSchema?.anyOf) {
            for (const itemVariant of itemsSchema.anyOf) {
              // itemVariant is already resolved
              allContentPartSchemas.push(itemVariant)
            }
          } else {
            // Single content part type
            allContentPartSchemas.push(itemsSchema)
          }
        }
      }
    }
  }

  // If we found multiple content part types, preserve the anyOf structure
  // This is a discriminated union - each type has different properties
  if (allContentPartSchemas.length > 1) {
    return {
      anyOf: allContentPartSchemas,
      discriminator: {
        propertyName: 'type'
      }
    }
  } else if (allContentPartSchemas.length === 1) {
    return allContentPartSchemas[0]
  }

  return null
}

function normalizeSchema(schema: any): any {
  // Spec is already dereferenced, so schema has no $refs and allOf is already merged
  if (!schema) return null

  // Handle discriminator-based anyOf specially
  if (schema.anyOf && schema.discriminator) {
    // For discriminator-based unions, pick a representative variant but preserve discriminator info
    const picked = pickVariant(schema.anyOf)
    if (picked) {
      return { ...picked, _discriminator: schema.discriminator, _allVariants: schema.anyOf }
    }
  } else if (schema.anyOf) {
    return pickVariant(schema.anyOf) || schema
  }

  if (schema.oneOf) return pickVariant(schema.oneOf) || schema
  return schema
}

function formatLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ')
}

function getFieldType(schema: any): FormFieldConfig['type'] {
  if (schema.type === 'boolean') return 'switch'
  if (schema.enum) return 'select'
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.format === 'date-time' || schema.format === 'datetime') return 'datetime'
  if (schema.format === 'date') return 'date'
  return 'text'
}

function processSchemaProperties(schema: any, required: string[] = [], parentName: string = '', parentSchema?: any): FormFieldConfig[] {
  const resolved = normalizeSchema(schema)
  if (!resolved?.properties) return []

  const fields: FormFieldConfig[] = []
  const schemaRequired = resolved.required || required

  for (const [name, prop] of Object.entries(resolved.properties)) {
    // Check if field is nullable (anyOf with type: 'null')
    // Prop is already resolved (no $ref), just check it directly
    const propSchemaObj = prop as any
    const isNullable = propSchemaObj?.anyOf?.some((variant: any) => {
      // Variant is already resolved
      return variant?.type === 'null'
    }) || false

    let propSchema = normalizeSchema(prop as any)
    if (!propSchema) continue

    const fieldName = parentName ? `${parentName}.${name}` : name
    const isRequired = schemaRequired.includes(name)
    const label = formatLabel(name)

    // Special handling for content field in discriminator-based unions
    if (name === 'content' && resolved._discriminator && resolved._allVariants) {
      // Check if content is an array with items that have anyOf
      if (propSchema.type === 'array' && propSchema.items) {
        const mergedContentParts = mergeContentPartTypes({ anyOf: resolved._allVariants, discriminator: resolved._discriminator })
        if (mergedContentParts) {
          // If mergedContentParts has anyOf, it's a discriminated union
          // Preserve the discriminated union structure - don't merge properties
          if (mergedContentParts.anyOf) {
            // Process each variant separately to get its fields
            const variantFields: Record<string, FormFieldConfig[]> = {}
            const allTypeEnums: string[] = []

            for (const variant of mergedContentParts.anyOf) {
              // Variant is already resolved (no $ref)
              if (variant?.properties) {
                // Get the type enum value for this variant
                const typeEnum = variant.properties.type?.enum?.[0]
                if (typeEnum) {
                  allTypeEnums.push(typeEnum)
                  // Process fields for this variant only, excluding the 'type' field
                  // (we'll create it manually to avoid duplicates)
                  const variantNested = processSchemaProperties(variant, variant.required || [], '')
                  // Filter out the 'type' field since we're creating it manually
                  variantFields[typeEnum] = variantNested.filter(f => {
                    const fieldName = f.name.split('.').pop() || f.name
                    return fieldName !== 'type'
                  })
                }
              }
            }

            // Create a base field config with discriminator info
            // The type field will be shown, and fields will be conditionally shown based on selected type
            const typeField: FormFieldConfig = {
              name: 'type',
              label: 'Type',
              description: 'The type of the content part.',
              type: 'select',
              required: true,
              options: allTypeEnums.map(val => ({ value: val, label: val })),
            }

            // Combine type field with all variant-specific fields
            // UI will show/hide fields based on selected type
            const allFields = [typeField]
            for (const fields of Object.values(variantFields)) {
              allFields.push(...fields)
            }

            if (allFields.length > 0) {
              fields.push({
                name: fieldName,
                label,
                description: propSchema.description,
                type: 'array-object',
                required: isRequired,
                defaultValue: Array.isArray(propSchema.default) ? propSchema.default : [],
                nestedFields: allFields,
                discriminator: {
                  propertyName: 'type',
                  variants: variantFields
                }
              })
              continue
            }
          } else {
            // Single content part type, process normally
            const itemsSchema = normalizeSchema(mergedContentParts)
            if (itemsSchema && (itemsSchema.type === 'object' || itemsSchema.properties)) {
              const nested = processSchemaProperties(itemsSchema, itemsSchema.required || [], '')
              if (nested.length > 0) {
                fields.push({
                  name: fieldName,
                  label,
                  description: propSchema.description,
                  type: 'array-object',
                  required: isRequired,
                  defaultValue: Array.isArray(propSchema.default) ? propSchema.default : [],
                  itemSchema: itemsSchema,
                  nestedFields: nested,
                })
                continue
              }
            }
          }
        }
      }
    }

    // Array
    if (propSchema.type === 'array' && propSchema.items) {
      const itemsSchema = normalizeSchema(propSchema.items)
      if (itemsSchema && (itemsSchema.type === 'object' || itemsSchema.properties)) {
        const nested = processSchemaProperties(itemsSchema, itemsSchema.required || [], '', propSchema)
        if (nested.length > 0) {
          fields.push({
            name: fieldName,
            label,
            description: propSchema.description,
            type: 'array-object',
            required: isRequired,
            defaultValue: Array.isArray(propSchema.default) ? propSchema.default : [],
            itemSchema: itemsSchema,
            nestedFields: nested,
          })
          continue
        }
      }
      // Check if array items are enums - use multi-select
      if (itemsSchema && itemsSchema.enum) {
        fields.push({
          name: fieldName,
          label,
          description: propSchema.description,
          type: 'multi-select',
          required: isRequired,
          defaultValue: Array.isArray(propSchema.default) ? propSchema.default : [],
          options: itemsSchema.enum.map((val: string) => ({ value: val, label: val })),
        })
        continue
      }
      fields.push({
        name: fieldName,
        label,
        description: propSchema.description,
        type: 'array',
        required: isRequired,
        defaultValue: Array.isArray(propSchema.default) ? propSchema.default : [],
        placeholder: propSchema.description || 'Enter comma-separated values',
      })
      continue
    }

    // Object
    if (propSchema.type === 'object' || propSchema.properties) {
      const objectSchema = propSchema.type === 'object' ? propSchema : normalizeSchema(propSchema)
      const nested = objectSchema?.properties
        ? processSchemaProperties(objectSchema, objectSchema.required || [], fieldName, resolved)
        : []
      if (nested.length > 0) {
        fields.push({
          name: fieldName,
          label,
          description: propSchema.description,
          type: 'object',
          required: isRequired,
          defaultValue: propSchema.default || {},
          nestedFields: nested,
        })
        continue
      }
    }

    // Primitive
    fields.push({
      name: fieldName,
      label,
      description: propSchema.description,
      type: getFieldType(propSchema),
      required: isRequired,
      nullable: isNullable,
      format: propSchema.format,
      minimum: propSchema.minimum,
      maximum: propSchema.maximum,
      defaultValue: propSchema.type === 'array' ? (Array.isArray(propSchema.default) ? propSchema.default : []) : propSchema.default,
      options: propSchema.enum?.map((val: string) => ({ value: val, label: val })),
      placeholder: propSchema.type === 'array'
        ? (propSchema.description || 'Enter comma-separated values')
        : (propSchema.description || propSchema.example?.toString()),
    })
  }

  return fields
}

export function parseOpenAPIToConfig(spec: OpenAPISpec, endpointKey: string): ApiEndpointConfig & { urlField?: { label: string; placeholder: string; defaultValue?: string } } | null {
  const uiConfig = spec['x-ui-config']?.endpoints?.[endpointKey]
  if (!uiConfig) return null

  const operation = spec.paths[uiConfig.path]?.[uiConfig.method.toLowerCase()]
  if (!operation) return null

  const formFields: FormFieldConfig[] = []
  const urlFieldParamName = uiConfig.urlField?.name || 'url'

  // Parameters
  for (const param of operation.parameters || []) {
    if (param.in === 'path' || (param.name === urlFieldParamName && uiConfig.urlField)) continue

    const paramSchema: any = param.schema || {}

    // Check if array of enums - use multi-select
    let fieldType = getFieldType(paramSchema)
    if (paramSchema.type === 'array' && paramSchema.items) {
      const itemsSchema = normalizeSchema(paramSchema.items)
      if (itemsSchema && itemsSchema.enum) {
        fieldType = 'multi-select'
      }
    }

    formFields.push({
      name: param.name,
      label: formatLabel(param.name),
      description: param.description,
      type: fieldType,
      required: param.required,
      format: paramSchema.format,
      minimum: paramSchema.minimum,
      maximum: paramSchema.maximum,
      defaultValue: paramSchema.type === 'array'
        ? (Array.isArray(paramSchema.default) ? paramSchema.default : [])
        : paramSchema.default,
      options: fieldType === 'multi-select' && paramSchema.items
        ? normalizeSchema(paramSchema.items)?.enum?.map((val: string) => ({ value: val, label: val }))
        : paramSchema.enum?.map((val: string) => ({ value: val, label: val })),
      placeholder: paramSchema.type === 'array'
        ? (param.description || 'Enter comma-separated values')
        : (param.description || paramSchema.example?.toString()),
      infoIcon: param.name === 'timeout',
    })
  }

  // Request body - get first content type (prefer application/json, but fall back to any)
  const requestBodyContent = operation.requestBody?.content
  const contentType = requestBodyContent
    ? (requestBodyContent['application/json'] ? 'application/json' : Object.keys(requestBodyContent)[0])
    : null
  const requestBodySchema = contentType && requestBodyContent ? (requestBodyContent as Record<string, any>)[contentType]?.schema : undefined
  if (requestBodySchema) {
    const normalized = normalizeSchema(requestBodySchema)

    // Handle top-level array schema (e.g., { type: "array", items: { type: "string" } })
    if (normalized?.type === 'array') {
      const itemsSchema = normalizeSchema(normalized.items)

      // If items are objects with properties, create an array-object field
      if (itemsSchema && (itemsSchema.type === 'object' || itemsSchema.properties)) {
        const nested = processSchemaProperties(itemsSchema, itemsSchema.required || [], '')
        if (nested.length > 0) {
          formFields.push({
            name: 'body',
            label: 'Request Body',
            description: normalized.description || 'Array of items',
            type: 'array-object',
            required: true,
            defaultValue: [],
            itemSchema: itemsSchema,
            nestedFields: nested,
          })
        }
      } else if (itemsSchema?.enum) {
        // Array of enums - use multi-select
        formFields.push({
          name: 'body',
          label: 'Request Body',
          description: normalized.description || 'Select multiple values',
          type: 'multi-select',
          required: true,
          defaultValue: [],
          options: itemsSchema.enum.map((val: string) => ({ value: val, label: val })),
        })
      } else {
        // Array of primitives (strings, numbers, etc.)
        formFields.push({
          name: 'body',
          label: 'Request Body',
          description: normalized.description || 'Enter comma-separated values',
          type: 'array',
          required: true,
          defaultValue: [],
          placeholder: normalized.description || `Enter ${itemsSchema?.type || 'values'} (comma-separated)`,
        })
      }
    }
    // Handle top-level primitive schema (e.g., { type: "string" })
    else if (normalized?.type && normalized.type !== 'object' && !normalized.properties) {
      formFields.push({
        name: 'body',
        label: 'Request Body',
        description: normalized.description,
        type: getFieldType(normalized),
        required: true,
        format: normalized.format,
        minimum: normalized.minimum,
        maximum: normalized.maximum,
        defaultValue: normalized.default,
        options: normalized.enum?.map((val: string) => ({ value: val, label: val })),
        placeholder: normalized.description || normalized.example?.toString(),
      })
    }
    // Handle object schema with properties
    else {
      formFields.push(...processSchemaProperties(normalized, [], ''))
    }
  }

  // Code samples
  const codeSamples: CodeSample[] = operation['x-codeSamples']?.length
    ? operation['x-codeSamples'].map((s: any) => ({
      language: s.lang.toLowerCase(),
      code: s.source,
      icon: getLanguageIcon(s.lang),
    }))
    : generateCodeSamples({
      method: uiConfig.method.toLowerCase(),
      path: uiConfig.path,
      parameters: operation.parameters,
      requestBody: operation.requestBody,
      security: operation.security,
    }, spec, uiConfig.title)

  // URL field
  let urlField = uiConfig.urlField
  if (urlField && operation.parameters) {
    const urlParam = urlField.name
      ? operation.parameters.find(p => p.name === urlField!.name)
      : operation.parameters.find(p => p.in === 'path')

    if (urlParam) {
      urlField = {
        ...urlField,
        name: urlParam.name,
        label: urlField.label || formatLabel(urlParam.name),
        placeholder: urlField.placeholder || urlParam.description || urlParam.schema?.example?.toString() || '',
        defaultValue: urlField.defaultValue !== undefined ? urlField.defaultValue : (urlParam.schema?.default || urlParam.schema?.example),
      }
    } else if (urlField.name) {
      urlField = { ...urlField, label: urlField.label || formatLabel(urlField.name) }
    } else {
      urlField = undefined
    }
  }

  // Examples - check both x-oaiMeta and standard OpenAPI requestBody examples
  const examples: Array<{ label: string; value: string; language: string; code: string }> = []

  // First, try x-oaiMeta examples (custom extension)
  const examplesData = operation['x-oaiMeta']?.examples
  if (Array.isArray(examplesData)) {
    for (const example of examplesData) {
      if (!example.title || !example.request) continue
      const preferred = ['curl', 'python', 'node.js', 'node', 'go', 'java', 'ruby']
      const lang = preferred.find(l => example.request?.[l]?.trim()) || Object.keys(example.request || {})[0]
      const code = example.request?.[lang]?.trim()
      if (lang && code) {
        examples.push({ label: example.title, value: `${example.title}|${lang}`, language: lang, code })
      }
    }
  }

  // Then, try standard OpenAPI examples from requestBody
  if (examples.length === 0 && requestBodyContent) {
    const jsonContent = (requestBodyContent as Record<string, any>)['application/json']
    const contentExamples = jsonContent?.examples

    if (contentExamples && typeof contentExamples === 'object') {
      for (const [exampleKey, exampleObj] of Object.entries(contentExamples)) {
        const example = exampleObj as any
        const label = example.summary || exampleKey
        const value = example.value

        if (value && typeof value === 'object') {
          // Convert the example value to a JSON code sample
          const code = JSON.stringify(value, null, 2)
          examples.push({
            label,
            value: `${label}|json`,
            language: 'json',
            code
          })
        }
      }
    }
  }

  // Finally, try extracting examples from parameters
  if (examples.length === 0 && operation.parameters) {
    // Collect all parameter examples
    const parameterExamples: Record<string, Array<{ name: string; value: any }>> = {}

    for (const param of operation.parameters) {
      if (param.in === 'path') continue // Skip path parameters for examples

      // Check for OpenAPI 3.0 examples object
      const paramExamples = (param as any).examples
      if (paramExamples && typeof paramExamples === 'object') {
        for (const [exampleKey, exampleObj] of Object.entries(paramExamples)) {
          const example = exampleObj as any
          const exampleValue = example.value

          if (exampleValue !== undefined) {
            if (!parameterExamples[exampleKey]) {
              parameterExamples[exampleKey] = []
            }
            parameterExamples[exampleKey].push({
              name: param.name,
              value: exampleValue
            })
          }
        }
      }
    }

    // Generate one example per parameter example set (using curl as the default)
    for (const [exampleKey, paramValues] of Object.entries(parameterExamples)) {
      // Build form data from parameter values
      const exampleFormData: Record<string, any> = {}
      for (const { name, value } of paramValues) {
        exampleFormData[name] = value
      }

      // Generate code samples using the code generator
      const exampleCodeSamples = generateCodeSamples(
        {
          method: uiConfig.method.toLowerCase(),
          path: uiConfig.path,
          parameters: operation.parameters,
          requestBody: operation.requestBody,
          security: operation.security,
        },
        spec,
        uiConfig.title,
        exampleFormData // Pass the example data
      )

      // Use the first code sample (curl) for the example
      if (exampleCodeSamples.length > 0) {
        const curlSample = exampleCodeSamples.find(s => s.language === 'curl') || exampleCodeSamples[0]
        examples.push({
          label: exampleKey,
          value: exampleKey,
          language: curlSample.language,
          code: curlSample.code
        })
      }
    }
  }


  return {
    title: uiConfig.title,
    description: uiConfig.description,
    method: uiConfig.method,
    path: uiConfig.path,
    codeSamples,
    formFields,
    urlField: urlField && urlField.label && urlField.placeholder ? {
      label: urlField.label,
      placeholder: urlField.placeholder,
      defaultValue: urlField.defaultValue,
    } : undefined,
    examples: examples.length > 0 ? examples : undefined,
    authConfig: spec['x-ui-config']?.auth || { mode: 'manual' },
  }
}

function getLanguageIcon(language: string): React.ReactNode {
  const lang = language.toLowerCase()
  if (lang === 'python') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.09-.32.05-.24.02-.16-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.24.38-.2.44-.18.51-.15.58-.13-.64-.09-.71-.07-.77-.04-.84-.01-1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01.21.03zm-6.47 14.25l-.23.33-.08.41.08.41.23.33.33.23.41.08.41-.08.33-.23.23-.33.08-.41-.08-.41-.23-.33-.33-.23-.41-.08-.41.08z" />
      </svg>
    )
  } else if (lang === 'javascript' || lang === 'js') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <text x="12" y="15" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="bold" fill="currentColor" textAnchor="middle">JS</text>
      </svg>
    )
  } else if (lang === 'curl') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2H12V4H14V14H6V12H4V2Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M2 4H10V12H2V4Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
    )
  }
  return null
}
