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
npx playground-y <spec-file> <output-directory>
```

**Example:**
```bash
npx playground-y examples/coingecko-spec.json my-playground
cd my-playground
pnpm install
pnpm dev
```

## Usage

### Installation (Optional)

You can install the CLI globally for repeated use:

```bash
npm install -g playground-y
```

### Generate Playground

```bash
playground-y <spec-path> <output-path> [options]
```

**Available Aliases:**
- `playground-y`
- `playgroundy`
- `pgy`
- `openapi-playground`

**Options:**
- `--force`: Force overwrite of existing output directory
- `--api-key KEY`: Pre-configure API key (stores in `.env`, hides auth field from users)
- `--theme THEME`: Set default theme (`light`, `dark`, or `coffee`)
- `--workspace-image URL|FILE`: Workspace logo/image
- `--no-interactive`: Skip interactive prompts


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
