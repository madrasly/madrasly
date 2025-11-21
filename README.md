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
- Node.js 18+

**Generate a playground instantly:**
```bash
npx madrasly <spec-file> <output-directory>
```

**Example:**
```bash
npx madrasly examples/coingecko-spec.json my-playground
cd my-playground
pnpm install
pnpm dev
```

## Usage

### Installation (Optional)

You can install the CLI globally for repeated use:

```bash
npm install -g madrasly
```

### Generate Playground

```bash
madrasly <spec-path> <output-path> [options]
```

**Available Aliases:**
- `madrasly`
- `madras`

**Options:**
- `--force`: Force overwrite of existing output directory
- `--api-key KEY`: Pre-configure API key (stores in `.env`, hides auth field from users)
- `--theme THEME`: Set default theme (`light`, `dark`, or `coffee`)
- `--workspace-image URL|FILE`: Workspace logo/image
- `--no-interactive`: Skip interactive prompts
- `--popular-endpoints ENDPOINTS`: Comma-separated list of endpoints to display prominently


## Features

✨ **Beautiful UI** - Modern, responsive design with light/dark/coffee themes  
⚡ **Fast** - TypeScript generator is ~10x faster than alternatives  
🎯 **Type-safe** - Full TypeScript support throughout  
🎨 **Customizable** - Themes, branding, and configuration via `x-ui-config`  
📝 **OpenAPI 3.x** - Full support with intelligent defaults  
🚀 **Production ready** - Generates Next.js 16 apps

## Migration from Python

**The generator is now TypeScript-based!** The Python generator has been retired in favor of a faster, more maintainable TypeScript implementation.

If you have existing workflows, simply replace:
```bash
# Old (Python)
python generate.py spec.json output

# New (TypeScript) 
npx madrasly spec.json output --popular-endpoints "get-votes,post-votes,post-interact-vote,get-puzzle-registration"
```

All features are maintained with improved performance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
