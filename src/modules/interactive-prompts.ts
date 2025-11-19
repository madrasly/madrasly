import prompts from 'prompts';
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ExtendedOpenAPISpec, WorkspaceSetupResult, GeneratorConfig } from '../types/index.js';

/**
 * Run interactive setup for workspace configuration
 */
export async function runInteractiveSetup(
    _spec: ExtendedOpenAPISpec,
    config: GeneratorConfig
): Promise<WorkspaceSetupResult> {
    // Skip if interactive mode is disabled
    if (!config.interactive) {
        return {};
    }

    // Skip if workspace image is provided via CLI
    if (config.workspaceImage) {
        return {};
    }

    // Skip if API key is provided (assume non-interactive)
    if (config.apiKey) {
        return {};
    }

    console.log('\n' + '='.repeat(60));
    console.log('Workspace Setup');
    console.log('='.repeat(60));
    console.log('Configure your API playground workspace\n');

    const response = await prompts({
        type: 'text',
        name: 'workspaceImage',
        message: 'Workspace logo/image (optional):',
        initial: '',
        format: (val) => val.trim(),
        hint: 'Enter a URL or file path, or press Enter to skip',
    });

    console.log('\n' + '='.repeat(60) + '\n');

    return {
        workspaceImage: response.workspaceImage || undefined,
    };
}

/**
 * Load existing workspace configuration from previously generated openapi.json
 */
export async function loadExistingConfig(
    outputDir: string
): Promise<{ image?: string } | null> {
    const openApiPath = join(outputDir, 'openapi.json');

    if (!existsSync(openApiPath)) {
        return null;
    }

    try {
        const content = readFileSync(openApiPath, 'utf-8');
        const spec = JSON.parse(content) as ExtendedOpenAPISpec;

        const workspaceConfig = spec['x-ui-config']?.sidebar?.workspace;
        if (workspaceConfig?.image) {
            return { image: workspaceConfig.image };
        }
    } catch (error) {
        // Ignore errors and return null
    }

    return null;
}
