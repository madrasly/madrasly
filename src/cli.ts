#!/usr/bin/env node

import { Command } from 'commander';
import { generatePlayground } from './generator.js';
import { GeneratorConfigSchema } from './types/index.js';

const program = new Command();

program
    .name('madrasly')
    .description('Generate API playground from OpenAPI spec')
    .version('1.0.0')
    .argument('<spec>', 'OpenAPI spec file (JSON or YAML)')
    .argument('[output]', 'Output directory', 'generated-playground')
    .option('--force', 'Overwrite existing directory', false)
    .option('--api-key <key>', 'API key for automatic authentication')
    .option('--workspace-image <url>', 'Workspace image URL or file path')
    .option('--theme <theme>', 'Default theme: light, dark, or coffee', 'light')
    .option('--popular-endpoints <endpoints>', 'Comma-separated list of endpoint keys to display on landing page')
    .option('--no-interactive', 'Skip interactive prompts')
    .action(async (spec: string, output: string, options: any) => {
        try {
            // Validate and parse configuration
            const config = GeneratorConfigSchema.parse({
                specPath: spec,
                outputDir: output,
                force: options.force || false,
                apiKey: options.apiKey,
                workspaceImage: options.workspaceImage,
                theme: options.theme || 'light',
                interactive: options.interactive !== false,
                popularEndpoints: options.popularEndpoints ? options.popularEndpoints.split(',').map((s: string) => s.trim()) : undefined,
            });

            // Generate playground
            const result = await generatePlayground(config);

            if (result.success) {
                console.log(`\n✅ Playground generated successfully in ${result.outputDir}`);
                console.log(`⏱  Generation completed in ${result.duration.toFixed(2)}s`);
                console.log('\nNext steps:');
                console.log(`  cd ${result.outputDir}`);
                console.log('  pnpm install');
                console.log('  pnpm dev');
                console.log('\n💡 Tip: Use watch.js for auto-regeneration on file changes');
            } else {
                console.error(`\n❌ Generation failed`);
                if (result.errors) {
                    for (const error of result.errors) {
                        console.error(`  ${error.message}`);
                    }
                }
                process.exit(1);
            }
        } catch (error) {
            if (error instanceof Error) {
                console.error(`\n❌ Error: ${error.message}`);
            } else {
                console.error(`\n❌ Unknown error occurred`);
            }
            process.exit(1);
        }
    });

program.parse();
