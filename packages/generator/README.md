# @playground-y/generator

TypeScript-based generator for creating API playgrounds from OpenAPI specifications.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode (for development)
npm run dev

# Run tests
npm test
```

## Usage

```bash
# After building
node dist/cli.js <openapi-spec.json> [output-dir] [options]

# Options:
#   --force                  Overwrite existing directory
#   --api-key <key>         API key for automatic authentication
#   --workspace-image <url> Workspace image URL or file path
#   --theme <theme>         Default theme: light, dark, or coffee
#   --no-interactive        Skip interactive prompts
```

## Architecture

The generator is built with a modular architecture:

- **spec-loader**: Load and dereference OpenAPI specs
- **config-generator**: Generate x-ui-config defaults
- **file-system**: Atomic file operations and directory management
- **template-renderer**: Generate TypeScript/React code
- **asset-handler**: Handle workspace images and static assets
- **interactive-prompts**: CLI prompts for configuration

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```
