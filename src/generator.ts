import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import type { GeneratorConfig, GenerationResult } from './types/index.js';
import { loadOpenAPISpec } from './modules/spec-loader.js';
import { ensureUIConfig } from './modules/config-generator.js';
import {
    createDirectoryStructure,
    copyTemplateFiles,
    atomicWrite,
} from './modules/file-system.js';
import {
    renderLayout,
    renderPage,
    renderOpenAPISpecRoute,
    renderUseOpenAPISpecHook,
    renderPackageJson,
    renderTsConfig,
    renderNextConfig,
    renderPostcssConfig,
    renderTailwindConfig,
    renderReadme,
    renderGitignore,
    renderEnvFile,
} from './modules/template-renderer.js';
import { handleWorkspaceImage } from './modules/asset-handler.js';
import { runInteractiveSetup, loadExistingConfig } from './modules/interactive-prompts.js';

/**
 * Main generator function - orchestrates all modules
 */
export async function generatePlayground(
    config: GeneratorConfig
): Promise<GenerationResult> {
    const startTime = Date.now();
    const errors: Error[] = [];

    try {
        console.log(`Loading OpenAPI spec from ${config.specPath}...`);

        // 1. Load and dereference OpenAPI spec
        let spec = await loadOpenAPISpec(config.specPath);

        // 2. Determine if this is first run or regeneration
        const isFirstRun = !existsSync(config.outputDir) || !existsSync(join(config.outputDir, 'openapi.json'));

        // 3. Handle workspace image
        let workspaceImageUrl: string | undefined;

        if (isFirstRun) {
            // First run: interactive setup or use flag
            if (config.workspaceImage) {
                workspaceImageUrl = await handleWorkspaceImage(config.workspaceImage, `${config.outputDir}.tmp`);
            } else {
                const setupResult = await runInteractiveSetup(spec, config);
                if (setupResult.workspaceImage) {
                    workspaceImageUrl = await handleWorkspaceImage(setupResult.workspaceImage, `${config.outputDir}.tmp`);
                }
            }
        } else {
            // Regeneration: use flag or load existing
            if (config.workspaceImage) {
                workspaceImageUrl = await handleWorkspaceImage(config.workspaceImage, `${config.outputDir}.tmp`);
            } else {
                const existingConfig = await loadExistingConfig(config.outputDir);
                if (existingConfig?.image) {
                    workspaceImageUrl = existingConfig.image;
                    console.log(`  ✓ Using existing workspace image: ${workspaceImageUrl}`);
                }
            }
        }

        // 4. Ensure UI config with defaults
        console.log('Ensuring x-ui-config exists...');
        spec = ensureUIConfig(spec, {
            workspaceName: undefined, // Will use API title from spec
            workspaceImage: workspaceImageUrl,
        });

        // 5. Handle auth configuration
        const authConfig = spec['x-ui-config']?.auth;
        if (authConfig) {
            if (config.apiKey) {
                authConfig.mode = 'automatic';
                console.log('  Auth mode set to: automatic');
            } else if (authConfig.mode === 'automatic' && !config.apiKey) {
                console.log('⚠ Warning: Auth mode is set to "automatic" but no API key provided.');
                console.log('  Continuing with manual mode...');
                authConfig.mode = 'manual';
            }
        }

        // 6. Create temp directory structure
        const tempOutputDir = `${config.outputDir}.tmp`;
        console.log(`Creating project structure in ${tempOutputDir}...`);
        await createDirectoryStructure(tempOutputDir);
        console.log('✓ Directory structure created');


        // 7. Copy template files from bundled templates directory
        console.log('Copying template files...');

        const __filename = fileURLToPath(import.meta.url);
        const distDir = dirname(__filename); // dist/
        const rootDir = dirname(distDir); // root directory
        const templateDir = join(rootDir, 'templates');

        await copyTemplateFiles(templateDir, tempOutputDir, { skipLayout: true });
        console.log('✓ Template files copied');



        // 8. Generate layout.tsx
        console.log('Generating layout.tsx with theme support...');
        const layoutContent = renderLayout(config.theme, spec);
        await writeFile(join(tempOutputDir, 'app', 'layout.tsx'), layoutContent);
        console.log(`✓ layout.tsx generated with default theme: ${config.theme}`);

        // 9. Generate configuration files
        console.log('Generating configuration files...');

        const packageJson = renderPackageJson();
        await writeFile(join(tempOutputDir, 'package.json'), JSON.stringify(packageJson, null, 2));
        console.log('  ✓ package.json');

        const tsConfig = renderTsConfig();
        await writeFile(join(tempOutputDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
        console.log('  ✓ tsconfig.json');

        await writeFile(join(tempOutputDir, 'next.config.mjs'), renderNextConfig());
        console.log('  ✓ next.config.mjs');

        await writeFile(join(tempOutputDir, 'postcss.config.mjs'), renderPostcssConfig());
        console.log('  ✓ postcss.config.mjs');

        await writeFile(join(tempOutputDir, 'tailwind.config.ts'), renderTailwindConfig());
        console.log('  ✓ tailwind.config.ts');

        await writeFile(join(tempOutputDir, '.gitignore'), renderGitignore());
        console.log('  ✓ .gitignore');

        await writeFile(join(tempOutputDir, '.env'), renderEnvFile(config.apiKey));
        console.log('  ✓ .env');

        await writeFile(join(tempOutputDir, '.nvmrc'), '20\n');
        console.log('  ✓ .nvmrc');

        // 9.5. Generate API route and hook for runtime spec loading
        console.log('Generating runtime spec loading files...');
        await mkdir(join(tempOutputDir, 'app', 'api', 'openapi-spec'), { recursive: true });
        await writeFile(join(tempOutputDir, 'app', 'api', 'openapi-spec', 'route.ts'), renderOpenAPISpecRoute());
        console.log('  ✓ app/api/openapi-spec/route.ts');
        
        await writeFile(join(tempOutputDir, 'lib', 'use-openapi-spec.ts'), renderUseOpenAPISpecHook());
        console.log('  ✓ lib/use-openapi-spec.ts');

        // 10. Generate page components
        console.log('Generating page components...');
        const endpoints = Object.keys(spec['x-ui-config']?.endpoints || {});
        const firstEndpoint = endpoints[0] || 'default';
        console.log(`  Found ${endpoints.length} endpoints, using '${firstEndpoint}' as default`);

        const pageContent = renderPage(endpoints, firstEndpoint);
        await writeFile(join(tempOutputDir, 'app', 'page.tsx'), pageContent);
        console.log('  ✓ page.tsx');

        // 11. Copy OpenAPI spec (already dereferenced)
        console.log('Copying OpenAPI spec...');
        await writeFile(
            join(tempOutputDir, 'openapi.json'),
            JSON.stringify(spec, null, 2)
        );
        console.log('  ✓ openapi.json');

        // 12. Generate README
        console.log('Generating README...');
        await writeFile(join(tempOutputDir, 'README.md'), renderReadme());
        console.log('  ✓ README.md');

        // 13. Atomic swap
        console.log('\n🔄 Performing atomic swap...');
        await atomicWrite(config.outputDir, tempOutputDir, !isFirstRun);
        console.log('  ✓ Atomic swap completed');

        const duration = (Date.now() - startTime) / 1000;

        return {
            success: true,
            outputDir: config.outputDir,
            duration,
            errors: errors.length > 0 ? errors : undefined,
        };
    } catch (error) {
        const duration = (Date.now() - startTime) / 1000;

        if (error instanceof Error) {
            errors.push(error);
        }

        return {
            success: false,
            outputDir: config.outputDir,
            duration,
            errors,
        };
    }
}
