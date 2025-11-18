import { copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';

/**
 * Handle workspace image - copy file to public directory or return URL
 */
export async function handleWorkspaceImage(
    input: string | undefined,
    outputDir: string
): Promise<string | undefined> {
    if (!input) {
        return undefined;
    }

    // Check if it's a URL
    if (isUrl(input)) {
        console.log(`  ✓ Using workspace image URL: ${input}`);
        return input;
    }

    // It's a file path - copy to public directory
    return await copyImageToPublic(input, outputDir);
}

/**
 * Check if input is a URL
 */
export function isUrl(input: string): boolean {
    return input.startsWith('http://') || input.startsWith('https://');
}

/**
 * Copy image file to public directory
 */
export async function copyImageToPublic(
    imagePath: string,
    outputDir: string
): Promise<string | undefined> {
    if (!existsSync(imagePath)) {
        console.warn(`  ⚠ Warning: Workspace image file not found: ${imagePath}`);
        return undefined;
    }

    const publicDir = join(outputDir, 'public');
    await mkdir(publicDir, { recursive: true });

    // Get file extension or default to .png
    const ext = extname(imagePath) || '.png';
    const destFilename = `workspace-logo${ext}`;
    const destPath = join(publicDir, destFilename);

    // Copy the file
    await copyFile(imagePath, destPath);
    console.log(`  ✓ Copied workspace image to ${destFilename}`);

    // Return the public URL path
    return `/${destFilename}`;
}
