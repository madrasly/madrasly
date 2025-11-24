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
[DEMO](https://madrasly-hero-demo.vercel.app/)

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
