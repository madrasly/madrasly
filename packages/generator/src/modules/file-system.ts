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
    const filesToCopy = [
        ['src/components/api-playground/sidebar.tsx', 'components/api-playground/sidebar.tsx'],
        ['src/components/api-playground/types.ts', 'components/api-playground/types.ts'],
        ['src/components/api-playground/form-field.tsx', 'components/api-playground/form-field.tsx'],
        ['src/components/api-playground/code-editor.tsx', 'components/api-playground/code-editor.tsx'],
        ['src/components/api-playground/api-page-header.tsx', 'components/api-playground/api-page-header.tsx'],
        ['src/components/api-playground/api-form.tsx', 'components/api-playground/api-form.tsx'],
        ['src/components/api-playground/resizable-panel.tsx', 'components/api-playground/resizable-panel.tsx'],
        ['src/components/api-playground/endpoint-selector.tsx', 'components/api-playground/endpoint-selector.tsx'],
        ['src/components/api-playground/markdown-renderer.tsx', 'components/api-playground/markdown-renderer.tsx'],
        ['src/lib/openapi-parser.tsx', 'lib/openapi-parser.tsx'],
        ['src/lib/openapi-sidebar-parser.ts', 'lib/openapi-sidebar-parser.ts'],
        ['src/lib/slug-utils.ts', 'lib/slug-utils.ts'],
        ['src/lib/icon-mapper.ts', 'lib/icon-mapper.ts'],
        ['src/lib/code-formatter.tsx', 'lib/code-formatter.tsx'],
        ['src/lib/code-generator.tsx', 'lib/code-generator.tsx'],
        ['src/lib/utils.ts', 'lib/utils.ts'],
        ['src/lib/endpoint-search.ts', 'lib/endpoint-search.ts'],
        ['src/lib/example-parser.ts', 'lib/example-parser.ts'],
        ['src/lib/logger.ts', 'lib/logger.ts'],
        ['src/lib/env-validation.ts', 'lib/env-validation.ts'],
        ['src/lib/rate-limiter.ts', 'lib/rate-limiter.ts'],
        ['src/lib/request-deduplication.ts', 'lib/request-deduplication.ts'],
        ['src/components/error-boundary.tsx', 'components/error-boundary.tsx'],
        ['src/components/ui/input.tsx', 'components/ui/input.tsx'],
        ['src/components/ui/button.tsx', 'components/ui/button.tsx'],
        ['src/components/ui/switch.tsx', 'components/ui/switch.tsx'],
        ['src/components/ui/select.tsx', 'components/ui/select.tsx'],
        ['src/components/ui/popover.tsx', 'components/ui/popover.tsx'],
        ['src/components/ui/calendar.tsx', 'components/ui/calendar.tsx'],
        ['src/components/ui/checkbox.tsx', 'components/ui/checkbox.tsx'],
        ['src/components/ui/slider.tsx', 'components/ui/slider.tsx'],
        ['src/components/ui/toast.tsx', 'components/ui/toast.tsx'],
        ['src/components/ui/toaster.tsx', 'components/ui/toaster.tsx'],
        ['src/components/ui/tooltip.tsx', 'components/ui/tooltip.tsx'],
        ['src/components/ui/sheet.tsx', 'components/ui/sheet.tsx'],
        ['src/components/theme-provider.tsx', 'components/theme-provider.tsx'],
        ['src/components/theme-switcher.tsx', 'components/theme-switcher.tsx'],
        ['src/hooks/use-toast.ts', 'hooks/use-toast.ts'],
        ['src/hooks/use-mobile.ts', 'hooks/use-mobile.ts'],
        ['src/app/globals.css', 'app/globals.css'],
        ['src/app/api/run/route.ts', 'app/api/run/route.ts'],
        ['src/app/api/health/route.ts', 'app/api/health/route.ts'],
        ['src/app/[...slug]/page.tsx', 'app/[...slug]/page.tsx'],
        ['src/app/landing-page.tsx', 'app/landing-page.tsx'],
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
