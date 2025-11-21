/**
 * Utility functions to parse example code and extract form field values
 */

export interface ParsedExampleValues {
  [fieldName: string]: any
}

/**
 * Parse curl example to extract JSON body and query parameters
 */
function parseCurlExample(curlCode: string): ParsedExampleValues {
  const values: ParsedExampleValues = {}
  
  // Extract JSON body from -d flag (handle multi-line JSON)
  // First, try to find the -d flag and extract everything after it until the end or next flag
  const dFlagMatch = curlCode.match(/-d\s+([\s\S]+)/)
  if (dFlagMatch) {
    let jsonContent = dFlagMatch[1].trim()
    
    // Remove trailing backslashes and whitespace from each line
    jsonContent = jsonContent.replace(/\\\s*$/gm, '').trim()
    
    // Try to extract JSON from quoted string (single, double, or backtick)
    const quoteMatch = jsonContent.match(/^['"`]([\s\S]*?)['"`]\s*$/)
    if (quoteMatch) {
      jsonContent = quoteMatch[1]
    }
    
    // Clean up escaped characters
    jsonContent = jsonContent
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
    
    // Try to parse as JSON
    try {
      const jsonBody = JSON.parse(jsonContent)
      Object.assign(values, jsonBody)
    } catch (e) {
      // If parsing fails, try to extract JSON object manually
      // Look for JSON object pattern
      const jsonObjectMatch = jsonContent.match(/\{[\s\S]*\}/)
      if (jsonObjectMatch) {
        try {
          const jsonBody = JSON.parse(jsonObjectMatch[0])
          Object.assign(values, jsonBody)
        } catch (e2) {
          // If still fails, try to fix common issues
          let fixedJson = jsonObjectMatch[0]
            .replace(/,\s*}/g, '}') // Remove trailing commas
            .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
          try {
            const jsonBody = JSON.parse(fixedJson)
            Object.assign(values, jsonBody)
          } catch (e3) {
            // Give up on this approach
          }
        }
      }
    }
  }
  
  // Extract path parameters from URL (for DELETE/GET requests)
  const urlMatch = curlCode.match(/https?:\/\/[^\s'"]+(\/[^\s'"]+)/)
  if (urlMatch) {
    const path = urlMatch[1]
    // Extract the last path segment that's not a query parameter
    const segments = path.split('/').filter(Boolean)
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1].split('?')[0]
      // Don't extract URL path parameters here - handled in parseExampleCode with actual field name
    }
  }
  
  // Extract query parameters from URL
  const queryMatch = curlCode.match(/\?([^\s'"]+)/)
  if (queryMatch) {
    const queryString = queryMatch[1]
    const params = new URLSearchParams(queryString)
    for (const [key, value] of params.entries()) {
      values[key] = value
    }
  }
  
  return values
}

/**
 * Parse Python example to extract function parameters
 */
function parsePythonExample(pythonCode: string): ParsedExampleValues {
  const values: ParsedExampleValues = {}
  
  // Don't extract URL path parameters here - handled in parseExampleCode with actual field name
  
  // Try to extract JSON-like structures from function calls
  // Look for patterns like: client.method.create(param1="value", param2="value")
  const functionCallMatch = pythonCode.match(/\.(?:create|update|new)\(([\s\S]*?)\)/)
  if (functionCallMatch) {
    const args = functionCallMatch[1]
    
    // Extract keyword arguments
    const kwargPattern = /(\w+)\s*=\s*["']([^"']+)["']/g
    let match
    while ((match = kwargPattern.exec(args)) !== null) {
      const [, key, value] = match
      values[key] = value
    }
    
    // Extract dictionary arguments (handle nested structures)
    const dictPattern = /(\w+)\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g
    while ((match = dictPattern.exec(args)) !== null) {
      const [, key, dictContent] = match
      const innerKwargPattern = /["'](\w+)["']\s*:\s*["']([^"']+)["']/g
      let innerMatch
      const dictValues: Record<string, any> = {}
      while ((innerMatch = innerKwargPattern.exec(dictContent)) !== null) {
        const [, innerKey, innerValue] = innerMatch
        dictValues[innerKey] = innerValue
      }
      if (Object.keys(dictValues).length > 0) {
        values[key] = dictValues
      }
    }
    
    // Extract array arguments
    const arrayPattern = /(\w+)\s*=\s*\[([^\]]+)\]/g
    while ((match = arrayPattern.exec(args)) !== null) {
      const [, key, arrayContent] = match
      const items: string[] = []
      const itemPattern = /["']([^"']+)["']/g
      let itemMatch
      while ((itemMatch = itemPattern.exec(arrayContent)) !== null) {
        items.push(itemMatch[1])
      }
      if (items.length > 0) {
        values[key] = items
      }
    }
    
    // Extract dictionary literals passed directly (e.g., messages=[{...}])
    const dictLiteralPattern = /\[(\{[\s\S]*?\})\]/g
    while ((match = dictLiteralPattern.exec(args)) !== null) {
      const dictStr = match[1]
      try {
        // Try to parse as JSON-like structure
        const kvPattern = /["'](\w+)["']\s*:\s*["']([^"']+)["']/g
        const dictValues: Record<string, any> = {}
        let kvMatch
        while ((kvMatch = kvPattern.exec(dictStr)) !== null) {
          const [, k, v] = kvMatch
          dictValues[k] = v
        }
        if (Object.keys(dictValues).length > 0) {
          // Try to find which parameter this belongs to
          const beforeMatch = args.substring(0, match.index)
          const paramMatch = beforeMatch.match(/(\w+)\s*=\s*\[$/)
          if (paramMatch) {
            values[paramMatch[1]] = [dictValues]
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  }
  
  return values
}

/**
 * Parse Node.js example to extract function parameters
 */
function parseNodeJsExample(nodeJsCode: string): ParsedExampleValues {
  const values: ParsedExampleValues = {}
  
  // First, try to extract path parameter from simple function calls like delete('id')
  const simpleCallMatch = nodeJsCode.match(/\.(?:delete|get|retrieve)\(["']([^"']+)["']\)/)
  if (simpleCallMatch) {
    // Don't extract URL path parameters here - handled in parseExampleCode with actual field name
  }
  
  // Try to extract object arguments from function calls
  // Look for patterns like: client.method.create({ param1: "value", param2: "value" })
  const functionCallMatch = nodeJsCode.match(/\.(?:create|update|new)\(([\s\S]*?)\)/)
  if (functionCallMatch) {
    const args = functionCallMatch[1]
    
    // Extract object properties (handle nested objects)
    const objectPattern = /\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g
    const objectMatch = objectPattern.exec(args)
    if (objectMatch) {
      const objectContent = objectMatch[1]
      
      // Extract key-value pairs
      const kvPattern = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g
      let match
      while ((match = kvPattern.exec(objectContent)) !== null) {
        const [, key, value] = match
        values[key] = value
      }
      
      // Extract array values
      const arrayPattern = /["']?(\w+)["']?\s*:\s*\[([^\]]+)\]/g
      while ((match = arrayPattern.exec(objectContent)) !== null) {
        const [, key, arrayContent] = match
        const items: string[] = []
        const itemPattern = /["']([^"']+)["']/g
        let itemMatch
        while ((itemMatch = itemPattern.exec(arrayContent)) !== null) {
          items.push(itemMatch[1])
        }
        if (items.length > 0) {
          values[key] = items
        }
      }
      
      // Extract nested object arrays (e.g., messages: [{ role: "...", content: "..." }])
      const nestedArrayPattern = /["']?(\w+)["']?\s*:\s*\[(\{[\s\S]*?\})\]/g
      while ((match = nestedArrayPattern.exec(objectContent)) !== null) {
        const [, key, nestedObj] = match
        const nestedKvPattern = /["']?(\w+)["']?\s*:\s*["']([^"']+)["']/g
        const nestedValues: Record<string, any> = {}
        let nestedMatch
        while ((nestedMatch = nestedKvPattern.exec(nestedObj)) !== null) {
          const [, k, v] = nestedMatch
          nestedValues[k] = v
        }
        if (Object.keys(nestedValues).length > 0) {
          values[key] = [nestedValues]
        }
      }
    }
  }
  
  return values
}

/**
 * Parse Go example to extract function parameters
 */
function parseGoExample(goCode: string): ParsedExampleValues {
  const values: ParsedExampleValues = {}
  
  // Try to extract struct initialization
  // Look for patterns like: StructName{ Field: "value", Field2: "value" }
  const structPattern = /\w+\{([^}]+)\}/g
  const structMatch = structPattern.exec(goCode)
  if (structMatch) {
    const structContent = structMatch[1]
    
    // Extract field-value pairs
    const fieldPattern = /(\w+)\s*:\s*["']([^"']+)["']/g
    let match
    while ((match = fieldPattern.exec(structContent)) !== null) {
      const [, key, value] = match
      values[key] = value
    }
  }
  
  return values
}

/**
 * Main function to parse example code based on language
 */
export function parseExampleCode(
  language: string,
  code: string,
  formFields: Array<{ name: string; type: string }>,
  urlFieldName?: string
): ParsedExampleValues {
  const lang = language.toLowerCase()
  let parsed: ParsedExampleValues = {}
  
  switch (lang) {
    case 'curl':
      parsed = parseCurlExample(code)
      break
    case 'python':
      parsed = parsePythonExample(code)
      break
    case 'node.js':
    case 'node':
    case 'javascript':
    case 'js':
      parsed = parseNodeJsExample(code)
      break
    case 'go':
      parsed = parseGoExample(code)
      break
    default:
      // For other languages, try to extract JSON if present
      const jsonMatch = code.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0])
        } catch (e) {
          // Ignore parsing errors
        }
      }
  }
  
  // Extract URL path parameter value if urlFieldName is provided
  // Use the actual field name from the spec, not a hardcoded key
  if (urlFieldName) {
    // Try to extract from path parameters in curl
    if (lang === 'curl') {
      const pathMatch = code.match(/https?:\/\/[^\s]+(\/[^\s'"]+)/)
      if (pathMatch) {
        const path = pathMatch[1]
        // Extract the last path segment that's not a query parameter
        const segments = path.split('/').filter(Boolean)
        if (segments.length > 0) {
          const lastSegment = segments[segments.length - 1].split('?')[0]
          // Check if it looks like a parameter value (not a route name)
          if (lastSegment && !lastSegment.includes('{') && !lastSegment.includes('}')) {
            parsed[urlFieldName] = lastSegment
          }
        }
      }
    }
    
    // Try to extract from function arguments
    if (lang === 'python' || lang === 'node.js' || lang === 'node') {
      const argMatch = code.match(new RegExp(`\\.(?:delete|get|retrieve)\\(["']([^"']+)["']\\)`))
      if (argMatch) {
        parsed[urlFieldName] = argMatch[1]
      }
    }
  }
  
  // Filter parsed values to include fields that exist in formFields
  // But also include top-level keys that might match form field base names
  const filtered: ParsedExampleValues = {}
  const topLevelFieldNames = new Set(
    formFields
      .filter(field => !field.name.includes('.'))
      .map(field => field.name)
  )
  
  // Include all parsed values that match top-level form fields
  for (const [key, value] of Object.entries(parsed)) {
    if (topLevelFieldNames.has(key)) {
      // Direct match with a top-level form field
      filtered[key] = value
    } else {
      // Check if this key matches any nested field's base name
      const matchingField = formFields.find(field => {
        const baseName = field.name.split('.')[0]
        return baseName === key
      })
      if (matchingField) {
        // Include it - it will be handled by the form
        filtered[key] = value
      }
    }
  }
  
  // Also include any nested fields that match exactly
  for (const field of formFields) {
    if (parsed[field.name] !== undefined && !filtered[field.name]) {
      filtered[field.name] = parsed[field.name]
    }
  }
  
  return filtered
}

