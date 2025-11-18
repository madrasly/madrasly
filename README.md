# OpenAPI Playground Generator

Generate beautiful, interactive API playgrounds from OpenAPI specifications.

<table>
<tr>
<td width="50%">
<img width="100%" alt="Screenshot 2025-11-18 at 3 26 08 PM" src="https://github.com/user-attachments/assets/89cb9792-0000-4463-8f24-ef5c9dfef529" />
</td>
<td width="50%">
<img width="100%" alt="Screenshot 2025-11-18 at 3 26 27 PM" src="https://github.com/user-attachments/assets/285c9350-451f-4cfd-98cc-f70a005196cd" />
</td>
</tr>
</table>

## DEMO
https://coingecko-y.vercel.app/

## Quick Start

**Prerequisites:**
- Node.js 18+ (for both the generator and generated playgrounds)
- pnpm (install with `npm install -g pnpm`)

**Generate a playground:**
```bash
# Clone the repository
git clone <repository-url>
cd Playground-Y

# Install generator dependencies  
cd packages/generator
npm install
npm run build
cd ../..

# Generate your playground
node packages/generator/dist/cli.js examples/coingecko-spec.json my-playground

# Run the generated playground
cd my-playground
pnpm install
pnpm dev
```

## Usage

### Direct Generation

```bash
node packages/generator/dist/cli.js <spec-path> <output-path> [options]
```

**Options:**
- `--force`: Force overwrite of existing output directory
- `--api-key KEY`: Pre-configure API key (stores in `.env`, hides auth field from users)
- `--theme THEME`: Set default theme (`light`, `dark`, or `coffee`)
- `--workspace-image URL|FILE`: Workspace logo/image
- `--no-interactive`: Skip interactive prompts

### Development Mode with Auto-Reload

Auto-regenerate on OpenAPI spec changes:
```bash
node watch.js <spec-path> <output-path>
```

The watch script:
- Monitors your OpenAPI spec file for changes
- Automatically regenerates the playground
- Runs a Next.js dev server with hot reload
- Preserves file watchers for seamless development

**Example:**
```bash
node watch.js examples/coingecko-spec.json examples/coingecko
```

## Features

✨ **Beautiful UI** - Modern, responsive design with light/dark/coffee themes  
⚡ **Fast** - TypeScript generator is ~10x faster than alternatives  
🎯 **Type-safe** - Full TypeScript support throughout  
🔄 **Hot reload** - Auto-regeneration with file watcher preservation  
🎨 **Customizable** - Themes, branding, and configuration via `x-ui-config`  
📝 **OpenAPI 3.x** - Full support with intelligent defaults  
🚀 **Production ready** - Generates Next.js 16 apps  

## Project Structure

```
Playground-Y/
├── packages/generator/     # TypeScript generator (NEW!)
│   ├── src/
│   │   ├── modules/       # Modular components
│   │   ├── generator.ts   # Main orchestrator
│   │   └── cli.ts         # CLI interface
│   └── dist/              # Compiled output
├── src/                   # Template files for generated apps
├── examples/              # Example OpenAPI specs
└── watch.js               # Development watcher script
```

## Migration from Python

**The generator is now TypeScript-based!** The Python generator has been retired in favor of a faster, more maintainable TypeScript implementation.

If you have existing workflows, simply replace:
```bash
# Old (Python)
python generate.py spec.json output

# New (TypeScript) 
node packages/generator/dist/cli.js spec.json output
```

All features are maintained with improved performance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
