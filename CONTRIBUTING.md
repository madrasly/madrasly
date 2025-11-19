# Contributing to OpenAPI Playground Generator

Thank you for your interest in contributing! This guide will help you set up the development environment and understand how to make changes.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** - Required for the TypeScript generator and generated Next.js apps
- **pnpm** - Package manager (install with `npm install -g pnpm`)

## Development Environment Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Playground-Y
```

### 2. Understanding the Project Structure

```
.
├── src/                 # TypeScript generator source code
│   ├── cli.ts          # CLI entry point
│   ├── generator.ts    # Main generator logic
│   ├── modules/        # Generator modules (file-system, templates, etc.)
│   └── types/          # TypeScript type definitions
├── templates/          # Next.js app template files
│   ├── components/     # React components
│   │   ├── api-playground/  # Core playground components
│   │   └── ui/         # UI component library
│   ├── lib/            # Utilities and parsers
│   └── app/            # Next.js app directory structure
├── examples/           # Example OpenAPI specifications
├── dist/               # Compiled TypeScript output (generated)
├── watch.js            # Development watcher script
├── package.json        # Package configuration
└── tsconfig.json       # TypeScript configuration
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Build the Generator

```bash
npm run build
```

This compiles TypeScript source from `src/` to `dist/`.

## Development Workflow

### Running the Development Environment

The easiest way to develop is using the `watch.js` script, which:
- Watches for changes to OpenAPI specs, generator source code, and template files
- Automatically regenerates the playground when changes are detected
- Starts and manages the Next.js dev server

**Start the development environment:**

```bash
# Using an example spec
node watch.js examples/coingecko-spec.json example

# Or with an API key (for automatic auth mode)
node watch.js examples/coingecko-spec.json example --api-key YOUR_API_KEY
```

This will:
1. Build the generator (if needed)
2. Generate the playground in `example/`
3. Install dependencies automatically
4. Start the Next.js dev server on `http://localhost:3000`
5. Watch for changes and auto-regenerate

**Stop the development environment:**
Press `Ctrl+C` to stop the watcher and dev server.

### Making Changes

#### 1. Changing Generator Code

To modify how playgrounds are generated:

1. Edit files in `src/` (e.g., `src/generator.ts`, `src/modules/template-renderer.ts`)
2. The TypeScript will be recompiled automatically if using `npm run dev`
3. Or run `npm run build` to rebuild manually
4. The `watch.js` script will detect changes and regenerate the playground

**Example:**
```bash
# Start dev build watcher in one terminal
npm run dev

# In another terminal, start the playground watcher
node watch.js examples/coingecko-spec.json example
```

#### 2. Changing Template Files

Template files in `templates/` are copied to generated playgrounds. To modify them:

1. Edit files in `templates/` (e.g., `templates/components/api-playground/sidebar.tsx`)
2. The `watch.js` script will detect the change
3. The playground will automatically regenerate
4. Next.js will hot-reload the changes in your browser

**Example:**
```bash
# Edit a component
vim templates/components/api-playground/sidebar.tsx

# watch.js detects the change and regenerates
# Browser automatically refreshes with your changes
```

#### 3. Changing the Watch Script

To modify the watch script itself:

1. Edit `watch.js`
2. Restart the watch script to apply changes

**Note:** Changes to `watch.js` require a manual restart.

### Testing Your Changes

1. **Start the dev environment:**
   ```bash
   node watch.js examples/coingecko-spec.json example
   ```

2. **Make your changes** to generator source or template files

3. **Verify the changes:**
   - Open `http://localhost:3000` in your browser
   - Check that your changes appear correctly
   - Test different OpenAPI specs if needed

4. **Test with different specs:**
   ```bash
   # Stop current watch (Ctrl+C)
   node watch.js examples/httpbin-spec.json httpbin-test
   ```

### Common Development Tasks

#### Adding a New Component

1. Create the component in `templates/components/`
2. The component will be automatically included in generated playgrounds
3. Import and use it in your template pages/components as needed

#### Modifying UI Components

1. Edit files in `templates/components/ui/` or `templates/components/api-playground/`
2. Changes will automatically propagate to generated playgrounds via hot-reload

#### Adding Generator Features

1. Modify files in `src/` to add new functionality
2. Rebuild with `npm run build` or use `npm run dev` for auto-rebuild
3. Test with `watch.js` to see changes immediately
4. Ensure backward compatibility with existing OpenAPI specs

#### Testing with Different OpenAPI Specs

The `examples/` directory contains various OpenAPI specs for testing:

```bash
# Test with different specs
node watch.js examples/httpbin-spec.json httpbin-test
node watch.js examples/coingecko-spec.json coingecko-test
node watch.js examples/anthropic.yaml anthropic-test
```

## Project Architecture

### How It Works

1. **Generator (`src/`):**
   - Written in TypeScript
   - Reads an OpenAPI specification (JSON or YAML)
   - Copies template files from `templates/` to the output directory
   - Generates configuration files (package.json, tsconfig.json, etc.)
   - Creates Next.js pages and components based on the spec

2. **Watch Script (`watch.js`):**
   - Monitors `src/`, `templates/`, and the OpenAPI spec file
   - Automatically runs the generator when changes are detected
   - Manages the Next.js dev server lifecycle

3. **Template Files (`templates/`):**
   - React components and Next.js app structure
   - These are copied to generated playgrounds
   - Changes here affect all future generated playgrounds

### Key Files

- **`src/cli.ts`**: CLI entry point, argument parsing
- **`src/generator.ts`**: Main generation logic orchestration
- **`src/modules/file-system.ts`**: File operations and template copying
- **`src/modules/template-renderer.ts`**: Generates config files and pages
- **`src/modules/spec-loader.ts`**: OpenAPI spec loading and validation
- **`watch.js`**: Development automation and file watching
- **`templates/components/api-playground/`**: Core playground components
  - `sidebar.tsx`: Navigation sidebar
  - `api-form.tsx`: API request form
  - `code-editor.tsx`: Code example viewer

## Code Style Guidelines

- **TypeScript**: Use TypeScript strict mode, modern ES2022+ features
- **React**: Use functional components with hooks
- **File naming**: Use kebab-case for files (e.g., `api-form.tsx`)
- **Component naming**: Use PascalCase for components
- **Function naming**: Use descriptive, intention-revealing names

## Building for Production

To build a production-ready version of the generator:

```bash
npm run build
```

To test the built generator locally:

```bash
# Link the package globally
npm link

# Use it anywhere
playground-y examples/coingecko-spec.json test-output
```

## Debugging

### Generator Issues

If the generator fails:

1. Check Node.js version: `node --version` (should be 18+)
2. Rebuild the generator: `npm run build`
3. Check the error output in the terminal
4. Verify your OpenAPI spec is valid

### Watch Script Issues

If `watch.js` isn't detecting changes:

1. Ensure you're using Node.js 18+
2. Check file permissions
3. Try restarting the watch script
4. Check that edited files are in watched directories (`src/`, `templates/`)

### Next.js Dev Server Issues

If the dev server fails to start:

1. Check that dependencies are installed: `cd example && pnpm install`
2. Check for port conflicts (default port is 3000)
3. Check the terminal output for specific errors
4. Try deleting `example/.next` and regenerating

## Submitting Changes

1. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the guidelines above

3. **Test thoroughly:**
   - Test with multiple OpenAPI specs
   - Verify generated playgrounds work correctly
   - Check that existing functionality still works

4. **Commit your changes:**
   ```bash
   git commit -m "Description of your changes"
   ```

5. **Push and create a pull request**

## Getting Help

- Check the [README.md](README.md) for usage examples
- Review existing issues and pull requests
- Ask questions in discussions or issues

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT).
