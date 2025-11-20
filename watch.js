#!/usr/bin/env node

/**
 * Watch script that automatically regenerates the playground when files change
 * Uses the TypeScript generator by default (much faster than Python)
 * 
 * Usage: node watch.js <openapi-file> <output-dir> [OPTIONS]
 * 
 * Options:
 *   --api-key KEY              API key for automatic authentication
 *   --workspace-image URL|FILE Workspace image URL or file path
 *   --theme THEME              Default theme: light, dark, or coffee
 *   --no-interactive           Skip interactive prompts
 *   --use-python-generator     Use legacy Python generator instead of TypeScript
 */

import { spawn } from 'child_process';
import { watch } from 'fs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const openapiFile = process.argv[2] || 'example-spec.yaml';
const outputDir = process.argv[3] || 'example';


// Parse --api-key argument if provided
let apiKey = null;
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--api-key' && i + 1 < process.argv.length) {
    apiKey = process.argv[i + 1];
    break;
  }
}

// Parse --workspace-image argument if provided
let workspaceImage = null;
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--workspace-image' && i + 1 < process.argv.length) {
    workspaceImage = process.argv[i + 1];
    break;
  }
}

// Parse --theme argument if provided
let theme = null;
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--theme' && i + 1 < process.argv.length) {
    theme = process.argv[i + 1];
    break;
  }
}

// Parse --no-interactive argument
const noInteractive = process.argv.includes('--no-interactive');

// Parse --use-python-generator argument (fallback to legacy generator)
const usePythonGenerator = process.argv.includes('--use-python-generator');

let isGenerating = false;
let regenerateTimeout = null;
let nextDevProcess = null;
let devServerStarted = false;

function regenerate() {
  return new Promise((resolve, reject) => {
    if (isGenerating) {
      console.log('⏳ Generation already in progress, queuing...');
      // Wait for current generation to complete
      const checkInterval = setInterval(() => {
        if (!isGenerating) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      return;
    }

    isGenerating = true;
    console.log(`\n🔄 Regenerating playground from ${openapiFile}...`);

    const startTime = Date.now();
    let command, args;

    if (usePythonGenerator) {
      // Use legacy Python generator
      console.log('   Using Python generator (legacy)...');
      command = 'python3';
      args = [path.join(__dirname, 'generate.py'), openapiFile, outputDir, '--force'];
    } else {
      // Use TypeScript generator (default)
      console.log('   Using TypeScript generator...');
      command = 'node';
      args = [
        path.join(__dirname, 'dist/cli.js'),
        openapiFile,
        outputDir,
        '--force'
      ];
    }

    // Add common arguments
    if (apiKey) {
      args.push('--api-key', apiKey);
    }
    if (workspaceImage) {
      args.push('--workspace-image', workspaceImage);
    }
    if (theme) {
      args.push('--theme', theme);
    }
    if (noInteractive) {
      args.push('--no-interactive');
    }

    const generator = spawn(command, args, {
      stdio: 'inherit',
      cwd: __dirname
    });

    generator.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      isGenerating = false;
      if (code === 0) {
        console.log(`✅ Regeneration complete in ${duration}s\n`);
        resolve();
      } else {
        console.error(`❌ Regeneration failed with code ${code}\n`);
        reject(new Error(`Generation failed with code ${code}`));
      }
    });

    generator.on('error', (err) => {
      isGenerating = false;
      reject(err);
    });
  });
}

// Watch for changes to:
// 1. The OpenAPI spec file
// 2. The TypeScript generator package
// 3. Template files in src/ directory

const watchPaths = [
  openapiFile,
  path.join(__dirname, 'src'),
  path.join(__dirname, 'templates')
];

console.log('👀 Watching for changes...');
console.log(`   - OpenAPI spec: ${openapiFile}`);
console.log(`   - Generator source: ${path.join(__dirname, 'src')}`);
console.log(`   - Templates: ${path.join(__dirname, 'templates')}`);
console.log(`   - Output: ${outputDir}\n`);

// Watch for changes
watchPaths.forEach(watchPath => {
  try {
    watch(watchPath, { recursive: true }, (eventType, filename) => {
      if (filename && !filename.includes('node_modules') && !filename.includes('.next')) {
        // Debounce rapid changes
        if (regenerateTimeout) {
          clearTimeout(regenerateTimeout);
        }

        regenerateTimeout = setTimeout(async () => {
          console.log(`\n📝 Detected change: ${filename}`);
          try {
            await regenerate();
          } catch (err) {
            console.error(`Error during regeneration: ${err.message}`);
          }
        }, 500); // Wait 500ms for multiple rapid changes
      }
    });
  } catch (err) {
    console.warn(`⚠️  Could not watch ${watchPath}: ${err.message}`);
  }
});

// Start Next.js dev server after initial generation completes
async function startDevServerIfNeeded() {
  if (devServerStarted) {
    return; // Already started
  }

  const codeDir = path.join(__dirname, outputDir);
  const nodeModulesPath = path.join(codeDir, 'node_modules');

  // Wait a bit for file system to settle after regeneration
  await new Promise(resolve => setTimeout(resolve, 500));

  // Check if node_modules exists, if not, install dependencies first
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('📦 Installing dependencies...\n');
    const install = spawn('pnpm', ['install'], {
      stdio: 'inherit',
      cwd: codeDir
    });

    install.on('close', (code) => {
      if (code === 0) {
        console.log('\n🚀 Starting Next.js dev server...\n');
        startDevServer();
      } else {
        console.error(`\n❌ Failed to install dependencies (code ${code})`);
        process.exit(1);
      }
    });
  } else {
    startDevServer();
  }

  function startDevServer() {
    devServerStarted = true;
    nextDevProcess = spawn('pnpm', ['dev'], {
      stdio: 'inherit',
      cwd: codeDir
    });

    nextDevProcess.on('error', (err) => {
      console.error(`\n❌ Failed to start dev server: ${err.message}`);
      process.exit(1);
    });

    nextDevProcess.on('close', (code) => {
      process.exit(code);
    });
  }
}

// Wait for initial generation to complete, then start dev server
(async () => {
  try {
    await regenerate();
    await startDevServerIfNeeded();
  } catch (err) {
    console.error(`Error during initial setup: ${err.message}`);
    process.exit(1);
  }
})();

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  if (nextDevProcess) {
    nextDevProcess.kill();
  }
  process.exit(0);
});
