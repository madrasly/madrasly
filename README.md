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

## Usage

**Create a playground:**
```bash
python generate.py <spec-path> <output-path>
```

**Run it:**
```bash
cd <output-path> && pnpm install && pnpm dev
```

## Options

- `--force` or `-f`: Force overwrite of existing output directory
- `--api-key KEY`: Pre-configure API key (stores in `.env`, hides auth field from users)
- `--theme THEME`: Set default theme (`light`, `dark`, or `coffee`)
- `--workspace-image URL|FILE`: Workspace logo/image

## Development

Auto-regenerate on changes:
```bash
node watch.js <spec-path> <output-path>
```

## License

MIT
