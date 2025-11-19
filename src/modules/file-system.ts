import { mkdir, copyFile, rm, readdir, stat } from 'fs/promises';
import { existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import type { CopyOptions } from '../types/index.js';

/**
 * Create directory structure for Next.js project
 */
export async function createDirectoryStructure(outputDir: string): Promise<void> {
    const dirs = [
        outputDir,
        join(outputDir, 'app'),
        join(outputDir, 'app', 'api'),
        join(outputDir, 'app', 'api', 'run'),
        join(outputDir, 'app', 'api', 'health'),
        join(outputDir, 'app', '[...slug]'),
        join(outputDir, 'components'),
        join(outputDir, 'components', 'api-playground'),
        join(outputDir, 'components', 'ui'),
        join(outputDir, 'lib'),
        join(outputDir, 'hooks'),
        join(outputDir, 'public'),
    ];

    for (const dir of dirs) {
        await mkdir(dir, { recursive: true });
    }
}

/**
 * Copy template files from source to destination
 */
export async function copyTemplateFiles(
    templateDir: string,
    outputDir: string,
    options: CopyOptions = {}
): Promise<void> {
    // Detect if we're using bundled templates (without src/ prefix) or monorepo (with src/ prefix)
    const isBundled = existsSync(join(templateDir, 'components'));
    const prefix = isBundled ? '' : 'src/';

    const filesToCopy = [
        [`${prefix}components/api-playground/sidebar.tsx`, 'components/api-playground/sidebar.tsx'],
        [`${prefix}components/api-playground/types.ts`, 'components/api-playground/types.ts'],
        [`${prefix}components/api-playground/form-field.tsx`, 'components/api-playground/form-field.tsx'],
        [`${prefix}components/api-playground/code-editor.tsx`, 'components/api-playground/code-editor.tsx'],
        [`${prefix}components/api-playground/api-page-header.tsx`, 'components/api-playground/api-page-header.tsx'],
        [`${prefix}components/api-playground/api-form.tsx`, 'components/api-playground/api-form.tsx'],
        [`${prefix}components/api-playground/resizable-panel.tsx`, 'components/api-playground/resizable-panel.tsx'],
        [`${prefix}components/api-playground/endpoint-selector.tsx`, 'components/api-playground/endpoint-selector.tsx'],
        [`${prefix}components/api-playground/markdown-renderer.tsx`, 'components/api-playground/markdown-renderer.tsx'],
        [`${prefix}lib/openapi-parser.tsx`, 'lib/openapi-parser.tsx'],
        [`${prefix}lib/openapi-sidebar-parser.ts`, 'lib/openapi-sidebar-parser.ts'],
        [`${prefix}lib/slug-utils.ts`, 'lib/slug-utils.ts'],
        [`${prefix}lib/icon-mapper.ts`, 'lib/icon-mapper.ts'],
        [`${prefix}lib/code-formatter.tsx`, 'lib/code-formatter.tsx'],
        [`${prefix}lib/code-generator.tsx`, 'lib/code-generator.tsx'],
        [`${prefix}lib/utils.ts`, 'lib/utils.ts'],
        [`${prefix}lib/endpoint-search.ts`, 'lib/endpoint-search.ts'],
        [`${prefix}lib/example-parser.ts`, 'lib/example-parser.ts'],
        [`${prefix}lib/logger.ts`, 'lib/logger.ts'],
        [`${prefix}lib/env-validation.ts`, 'lib/env-validation.ts'],
        [`${prefix}lib/rate-limiter.ts`, 'lib/rate-limiter.ts'],
        [`${prefix}lib/request-deduplication.ts`, 'lib/request-deduplication.ts'],
        [`${prefix}components/error-boundary.tsx`, 'components/error-boundary.tsx'],
        [`${prefix}components/ui/input.tsx`, 'components/ui/input.tsx'],
        [`${prefix}components/ui/button.tsx`, 'components/ui/button.tsx'],
        [`${prefix}components/ui/switch.tsx`, 'components/ui/switch.tsx'],
        [`${prefix}components/ui/select.tsx`, 'components/ui/select.tsx'],
        [`${prefix}components/ui/popover.tsx`, 'components/ui/popover.tsx'],
        [`${prefix}components/ui/calendar.tsx`, 'components/ui/calendar.tsx'],
        [`${prefix}components/ui/checkbox.tsx`, 'components/ui/checkbox.tsx'],
        [`${prefix}components/ui/slider.tsx`, 'components/ui/slider.tsx'],
        [`${prefix}components/ui/toast.tsx`, 'components/ui/toast.tsx'],
        [`${prefix}components/ui/toaster.tsx`, 'components/ui/toaster.tsx'],
        [`${prefix}components/ui/tooltip.tsx`, 'components/ui/tooltip.tsx'],
        [`${prefix}components/ui/sheet.tsx`, 'components/ui/sheet.tsx'],
        [`${prefix}components/theme-provider.tsx`, 'components/theme-provider.tsx'],
        [`${prefix}components/theme-switcher.tsx`, 'components/theme-switcher.tsx'],
        [`${prefix}hooks/use-toast.ts`, 'hooks/use-toast.ts'],
        [`${prefix}hooks/use-mobile.ts`, 'hooks/use-mobile.ts'],
        [`${prefix}app/globals.css`, 'app/globals.css'],
        [`${prefix}app/api/run/route.ts`, 'app/api/run/route.ts'],
        [`${prefix}app/api/health/route.ts`, 'app/api/health/route.ts'],
        [`${prefix}app/[...slug]/page.tsx`, 'app/[...slug]/page.tsx'],
        [`${prefix}app/landing-page.tsx`, 'app/landing-page.tsx'],
    ];

    for (const [src, dst] of filesToCopy) {
        // Skip layout.tsx if requested
        if (options.skipLayout && src.includes('layout.tsx')) {
            continue;
        }

        const srcPath = join(templateDir, src);
        const dstPath = join(outputDir, dst);

        if (existsSync(srcPath)) {
            await mkdir(dirname(dstPath), { recursive: true });
            await copyFile(srcPath, dstPath);
        } else {
            console.warn(`  ⚠ Warning: Template file ${src} not found, skipping...`);
        }
    }
}

/**
 * Perform atomic write operation (temp -> final directory swap)
 */
export async function atomicWrite(
    targetDir: string,
    sourceDir: string,
    incremental: boolean
): Promise<void> {
    if (!existsSync(targetDir)) {
        // First generation - simple rename
        await mkdir(dirname(targetDir), { recursive: true });
        await copyTree(sourceDir, targetDir);
        await rm(sourceDir, { recursive: true, force: true });
    } else if (incremental) {
        // Incremental update - preserve file watchers
        await copyTree(sourceDir, targetDir, {
            overwrite: true,
            removeExtra: true,
        });
        await rm(sourceDir, { recursive: true, force: true });
    } else {
        // Full replacement
        const backupDir = `${targetDir}.backup`;

        if (existsSync(backupDir)) {
            await rm(backupDir, { recursive: true, force: true });
        }

        await copyTree(targetDir, backupDir);
        await rm(targetDir, { recursive: true, force: true });
        await copyTree(sourceDir, targetDir);
        await rm(sourceDir, { recursive: true, force: true });
        await rm(backupDir, { recursive: true, force: true });
    }
}

/**
 * Copy directory tree recursively
 */
export async function copyTree(
    src: string,
    dst: string,
    options: {
        overwrite?: boolean;
        removeExtra?: boolean;
        skipDirs?: Set<string>;
        skipFiles?: Set<string>;
    } = {}
): Promise<void> {
    const {
        removeExtra = false,
        skipDirs = new Set(['node_modules', '.next', '.pnpm', '.turbo', 'dist', 'build', '.cache']),
        skipFiles = new Set(['.DS_Store', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']),
    } = options;

    // Create destination if it doesn't exist
    if (!existsSync(dst)) {
        await mkdir(dst, { recursive: true });
    }

    const srcEntries = await readdir(src);
    const dstEntries = existsSync(dst) ? await readdir(dst) : [];

    const srcSet = new Set(srcEntries.filter(name => !skipDirs.has(name) && !skipFiles.has(name)));
    const dstSet = new Set(dstEntries.filter(name => !skipDirs.has(name) && !skipFiles.has(name)));

    // Remove files/dirs in dst that aren't in src (if removeExtra is true)
    if (removeExtra) {
        for (const name of dstSet) {
            if (!srcSet.has(name)) {
                const path = join(dst, name);
                const stats = await stat(path);

                if (stats.isDirectory()) {
                    await rm(path, { recursive: true, force: true });
                } else {
                    await rm(path, { force: true });
                }
            }
        }
    }

    // Copy files/dirs from src to dst
    for (const name of srcSet) {
        if (skipDirs.has(name) || skipFiles.has(name)) {
            continue;
        }

        const srcPath = join(src, name);
        const dstPath = join(dst, name);
        const stats = await stat(srcPath);

        if (stats.isDirectory()) {
            await copyTree(srcPath, dstPath, options);
        } else {
            try {
                await copyFile(srcPath, dstPath);
            } catch (err: any) {
                // Handle permission errors
                if (err.code === 'EACCES' || err.code === 'EPERM') {
                    try {
                        chmodSync(dstPath, 0o666);
                        await copyFile(srcPath, dstPath);
                    } catch (retryErr) {
                        console.warn(`  ⚠ Failed to copy ${srcPath}: ${retryErr}`);
                    }
                } else {
                    throw err;
                }
            }
        }
    }
}
