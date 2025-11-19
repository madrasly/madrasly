import SwaggerParser from '@apidevtools/swagger-parser';
import { readFileSync } from 'fs';
import { load as loadYaml } from 'js-yaml';
import { extname } from 'path';
import type { ExtendedOpenAPISpec } from '../types/index.js';
import type { OpenAPIV3 } from 'openapi-types';

/**
 * Load and parse OpenAPI spec from file (supports JSON and YAML)
 */
export async function loadOpenAPISpec(filePath: string): Promise<ExtendedOpenAPISpec> {
    try {
        const format = detectSpecFormat(filePath);
        const content = readFileSync(filePath, 'utf-8');

        let spec: any;
        if (format === 'yaml') {
            spec = loadYaml(content);
        } else {
            spec = JSON.parse(content);
        }

        // Dereference $ref pointers
        const dereferenced = await dereferenceSpec(spec);

        return dereferenced as ExtendedOpenAPISpec;
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to load OpenAPI spec from ${filePath}: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Detect if file is JSON or YAML based on extension
 */
export function detectSpecFormat(filePath: string): 'json' | 'yaml' {
    const ext = extname(filePath).toLowerCase();

    if (ext === '.yaml' || ext === '.yml') {
        return 'yaml';
    }

    return 'json';
}

/**
 * Dereference $ref pointers in OpenAPI spec
 */
export async function dereferenceSpec(spec: OpenAPIV3.Document): Promise<OpenAPIV3.Document> {
    try {
        // SwaggerParser.dereference resolves all $ref pointers
        const dereferenced = await SwaggerParser.dereference(spec as any);
        return dereferenced as OpenAPIV3.Document;
    } catch (error) {
        // If dereferencing fails, log warning and return original spec
        console.warn('Warning: Failed to dereference spec, continuing with original');
        if (error instanceof Error) {
            console.warn(`  ${error.message}`);
        }
        return spec;
    }
}

/**
 * Validate that spec is a valid OpenAPI 3.x spec
 */
export async function validateSpec(spec: any): Promise<boolean> {
    try {
        await SwaggerParser.validate(spec);
        return true;
    } catch (error) {
        return false;
    }
}
