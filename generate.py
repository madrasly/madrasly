#!/usr/bin/env python3
"""
OpenAPI Playground Generator

Generates a Next.js React app with an API playground from an OpenAPI specification.
Supports both JSON and YAML OpenAPI specs.
Usage: python generate.py <openapi.json|yaml> [output_dir] [--force]
"""

import json
import os
import sys
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, List

def load_openapi_spec(file_path: str) -> Dict[str, Any]:
    """Load and validate OpenAPI spec (supports both JSON and YAML)."""
    file_path_obj = Path(file_path)
    
    # Try to detect format by extension
    if file_path_obj.suffix.lower() in ['.yaml', '.yml']:
        try:
            import yaml
            with open(file_path, 'r') as f:
                return yaml.safe_load(f)
        except ImportError:
            print("Error: YAML file detected but PyYAML is not installed.")
            print("Install it with: pip install pyyaml")
            sys.exit(1)
        except Exception as e:
            print(f"Error loading YAML file: {e}")
            sys.exit(1)
    else:
        # Assume JSON
        try:
            with open(file_path, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            # Maybe it's YAML even though extension doesn't say so
            print(f"Warning: Failed to parse as JSON: {e}")
            print("Attempting to parse as YAML...")
            try:
                import yaml
                with open(file_path, 'r') as f:
                    return yaml.safe_load(f)
            except ImportError:
                print("Error: File appears to be YAML but PyYAML is not installed.")
                print("Install it with: pip install pyyaml")
                sys.exit(1)
            except Exception as e2:
                print(f"Error: Failed to parse as YAML: {e2}")
                sys.exit(1)

def ensure_x_ui_config(spec: Dict[str, Any], workspace_name: str = None, workspace_image: str = None) -> Dict[str, Any]:
    """Ensure x-ui-config exists in the spec, creating defaults if needed."""
    if 'x-ui-config' not in spec:
        spec['x-ui-config'] = {
            'sidebar': {
                'workspace': {
                    'name': spec.get('info', {}).get('title', 'API Playground'),
                    'icon': 'API'
                },
                'navItems': [],
                'user': {
                    'name': 'User',
                    'initials': 'U'
                }
            },
            'endpoints': {},
            'auth': {
                'mode': 'manual'
            }
        }
    
    # Ensure sidebar exists
    if 'sidebar' not in spec['x-ui-config']:
        spec['x-ui-config']['sidebar'] = {}
    
    # Ensure workspace exists - use provided name or fall back to info.title
    api_title = spec.get('info', {}).get('title', 'API Playground')
    workspace_name_to_use = workspace_name if workspace_name else api_title
    
    if 'workspace' not in spec['x-ui-config']['sidebar']:
        spec['x-ui-config']['sidebar']['workspace'] = {
            'name': workspace_name_to_use,
            'icon': 'API'
        }
    else:
        # Use provided name or API title (override any existing value)
        spec['x-ui-config']['sidebar']['workspace']['name'] = workspace_name_to_use
        # Ensure icon exists if not set
        if 'icon' not in spec['x-ui-config']['sidebar']['workspace']:
            spec['x-ui-config']['sidebar']['workspace']['icon'] = 'API'
    
    # Set workspace image if provided
    if workspace_image:
        spec['x-ui-config']['sidebar']['workspace']['image'] = workspace_image
    
    # Ensure auth config exists with defaults
    if 'auth' not in spec['x-ui-config']:
        spec['x-ui-config']['auth'] = {
            'mode': 'manual'
        }
    
    # Auto-detect security scheme if not specified
    if 'schemeName' not in spec['x-ui-config']['auth']:
        security_schemes = spec.get('components', {}).get('securitySchemes', {})
        if security_schemes:
            # Use the first security scheme found
            scheme_name = list(security_schemes.keys())[0]
            spec['x-ui-config']['auth']['schemeName'] = scheme_name
    
    # Auto-generate endpoints from paths if not specified
    if 'endpoints' not in spec['x-ui-config'] or not spec['x-ui-config']['endpoints']:
        spec['x-ui-config']['endpoints'] = {}
        
        for path, methods in spec.get('paths', {}).items():
            for method, operation in methods.items():
                if method.lower() in ['get', 'post', 'put', 'patch', 'delete']:
                    operation_id = operation.get('operationId', '')
                    # If operationId is empty or missing, generate one from method and path
                    if not operation_id or operation_id.strip() == '':
                        operation_id = f"{method}_{path.replace('/', '_').replace('{', '').replace('}', '')}"
                    endpoint_key = operation_id.lower().replace('_', '-')
                    
                    if endpoint_key not in spec['x-ui-config']['endpoints']:
                        endpoint_config = {
                            'title': operation.get('summary', operation_id),
                            'description': operation.get('description', ''),
                            'method': method.upper(),
                            'path': path
                        }
                        
                        # Only add urlField if explicitly defined in x-ui-config or if there's a path parameter
                        # Path parameters are typically shown as URL fields
                        if operation.get('parameters'):
                            for param in operation['parameters']:
                                # Path parameters are good candidates for URL fields
                                if param.get('in') == 'path':
                                    endpoint_config['urlField'] = {
                                        'name': param.get('name'),
                                    }
                                    # Use description/example from the spec if available
                                    if param.get('description'):
                                        endpoint_config['urlField']['placeholder'] = param.get('description')
                                    if param.get('schema', {}).get('example'):
                                        endpoint_config['urlField']['defaultValue'] = str(param.get('schema', {}).get('example'))
                                    break
                        
                        spec['x-ui-config']['endpoints'][endpoint_key] = endpoint_config
    
    return spec

def get_output_dir(output_dir: Path, use_temp: bool = True) -> Path:
    """Get the output directory path. Uses temp directory during generation for atomic writes."""
    if use_temp:
        return Path(str(output_dir) + '.tmp')
    return output_dir

def create_directory_structure(output_dir: Path):
    """Create the Next.js project directory structure."""
    out_dir = get_output_dir(output_dir, use_temp=True)
    dirs = [
        out_dir,
        out_dir / 'app',
        out_dir / 'app' / 'api',
        out_dir / 'app' / 'api' / 'run',
        out_dir / 'app' / 'api' / 'health',
        out_dir / 'app' / '[...slug]',
        out_dir / 'components',
        out_dir / 'components' / 'api-playground',
        out_dir / 'components' / 'ui',
        out_dir / 'lib',
        out_dir / 'hooks',
        out_dir / 'public',
    ]
    
    for dir_path in dirs:
        dir_path.mkdir(parents=True, exist_ok=True)

def copy_template_files(output_dir: Path, template_dir: Path = None, skip_layout: bool = False):
    """Copy template files from the current project if available."""
    current_dir = Path(__file__).parent
    print(f"  DEBUG: Current directory: {current_dir}")
    print(f"  DEBUG: Output directory: {output_dir}")
    
    # Files to copy from current project
    files_to_copy = [
        ('src/components/api-playground/sidebar.tsx', 'components/api-playground/sidebar.tsx'),
        ('src/components/api-playground/types.ts', 'components/api-playground/types.ts'),
        ('src/components/api-playground/form-field.tsx', 'components/api-playground/form-field.tsx'),
        ('src/components/api-playground/code-editor.tsx', 'components/api-playground/code-editor.tsx'),
        ('src/components/api-playground/api-page-header.tsx', 'components/api-playground/api-page-header.tsx'),
        ('src/components/api-playground/api-form.tsx', 'components/api-playground/api-form.tsx'),
        ('src/components/api-playground/resizable-panel.tsx', 'components/api-playground/resizable-panel.tsx'),
        ('src/components/api-playground/endpoint-selector.tsx', 'components/api-playground/endpoint-selector.tsx'),
        ('src/components/api-playground/markdown-renderer.tsx', 'components/api-playground/markdown-renderer.tsx'),
        ('src/lib/openapi-parser.tsx', 'lib/openapi-parser.tsx'),
        ('src/lib/openapi-sidebar-parser.ts', 'lib/openapi-sidebar-parser.ts'),
        ('src/lib/slug-utils.ts', 'lib/slug-utils.ts'),
        ('src/lib/icon-mapper.ts', 'lib/icon-mapper.ts'),
        ('src/lib/code-formatter.tsx', 'lib/code-formatter.tsx'),
        ('src/lib/code-generator.tsx', 'lib/code-generator.tsx'),
        ('src/lib/utils.ts', 'lib/utils.ts'),
        ('src/lib/endpoint-search.ts', 'lib/endpoint-search.ts'),
        ('src/lib/example-parser.ts', 'lib/example-parser.ts'),
        ('src/lib/logger.ts', 'lib/logger.ts'),
        ('src/lib/env-validation.ts', 'lib/env-validation.ts'),
        ('src/lib/rate-limiter.ts', 'lib/rate-limiter.ts'),
        ('src/lib/request-deduplication.ts', 'lib/request-deduplication.ts'),
        ('src/components/error-boundary.tsx', 'components/error-boundary.tsx'),
        ('src/components/ui/input.tsx', 'components/ui/input.tsx'),
        ('src/components/ui/button.tsx', 'components/ui/button.tsx'),
        ('src/components/ui/switch.tsx', 'components/ui/switch.tsx'),
        ('src/components/ui/select.tsx', 'components/ui/select.tsx'),
        ('src/components/ui/popover.tsx', 'components/ui/popover.tsx'),
        ('src/components/ui/calendar.tsx', 'components/ui/calendar.tsx'),
        ('src/components/ui/checkbox.tsx', 'components/ui/checkbox.tsx'),
        ('src/components/ui/slider.tsx', 'components/ui/slider.tsx'),
        ('src/components/ui/toast.tsx', 'components/ui/toast.tsx'),
        ('src/components/ui/toaster.tsx', 'components/ui/toaster.tsx'),
        ('src/components/ui/tooltip.tsx', 'components/ui/tooltip.tsx'),
        ('src/components/ui/sheet.tsx', 'components/ui/sheet.tsx'),
        ('src/components/theme-provider.tsx', 'components/theme-provider.tsx'),
        ('src/components/theme-switcher.tsx', 'components/theme-switcher.tsx'),
        ('src/hooks/use-toast.ts', 'hooks/use-toast.ts'),
        ('src/hooks/use-mobile.ts', 'hooks/use-mobile.ts'),
        # Note: layout.tsx is generated separately with theme support
        ('src/app/globals.css', 'app/globals.css'),
        ('src/app/api/run/route.ts', 'app/api/run/route.ts'),
        ('src/app/api/health/route.ts', 'app/api/health/route.ts'),
        ('src/app/[...slug]/page.tsx', 'app/[...slug]/page.tsx'),
        ('src/app/landing-page.tsx', 'app/landing-page.tsx'),
    ]
    
    for src, dst in files_to_copy:
        # Skip layout.tsx if it should be generated separately
        if skip_layout and 'layout.tsx' in src:
            continue
            
        src_path = current_dir / src
        out_dir = get_output_dir(output_dir, use_temp=True)
        dst_path = out_dir / dst
        
        print(f"  DEBUG: Checking {src_path} -> {dst_path}")
        if src_path.exists():
            print(f"  DEBUG: Source exists, creating parent dirs for {dst_path.parent}")
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            print(f"  DEBUG: Copying {src_path} to {dst_path}")
            shutil.copy2(src_path, dst_path)
            print(f"  ✓ Copied {src} -> {dst}")
        else:
            print(f"  ⚠ Warning: Template file {src} not found, skipping...")

def generate_package_json(output_dir: Path):
    """Generate package.json for Next.js project."""
    package_json = {
        "name": "api-playground",
        "version": "0.1.0",
        "private": True,
        "scripts": {
            "dev": "next dev",
            "build": "next build",
            "start": "next start",
            "lint": "next lint"
        },
        "dependencies": {
            "fuse.js": "7.1.0",
            "@hookform/resolvers": "^3.10.0",
            "@radix-ui/react-accordion": "1.2.2",
            "@radix-ui/react-alert-dialog": "1.1.4",
            "@radix-ui/react-aspect-ratio": "1.1.1",
            "@radix-ui/react-avatar": "1.1.2",
            "@radix-ui/react-checkbox": "1.1.3",
            "@radix-ui/react-collapsible": "1.1.2",
            "@radix-ui/react-context-menu": "2.2.4",
            "@radix-ui/react-dialog": "1.1.4",
            "@radix-ui/react-dropdown-menu": "2.1.4",
            "@radix-ui/react-hover-card": "1.1.4",
            "@radix-ui/react-label": "2.1.1",
            "@radix-ui/react-menubar": "1.1.4",
            "@radix-ui/react-navigation-menu": "1.2.3",
            "@radix-ui/react-popover": "1.1.4",
            "@radix-ui/react-progress": "1.1.1",
            "@radix-ui/react-radio-group": "1.2.2",
            "@radix-ui/react-scroll-area": "1.2.2",
            "@radix-ui/react-select": "2.1.4",
            "@radix-ui/react-separator": "1.1.1",
            "@radix-ui/react-slider": "1.2.2",
            "@radix-ui/react-slot": "1.1.1",
            "@radix-ui/react-switch": "latest",
            "@radix-ui/react-tabs": "1.1.2",
            "@radix-ui/react-toast": "1.2.4",
            "@radix-ui/react-toggle": "1.1.1",
            "@radix-ui/react-toggle-group": "1.1.1",
            "@radix-ui/react-tooltip": "1.1.6",
            "@vercel/analytics": "1.3.1",
            "autoprefixer": "^10.4.20",
            "class-variance-authority": "^0.7.1",
            "clsx": "^2.1.1",
            "cmdk": "1.0.4",
            "date-fns": "4.1.0",
            "embla-carousel-react": "8.5.1",
            "input-otp": "1.4.1",
            "lucide-react": "^0.454.0",
            "@monaco-editor/react": "^4.6.0",
            "next": "16.0.3",
            "next-themes": "^0.4.6",
            "react": "19.2.0",
            "react-day-picker": "9.8.0",
            "react-dom": "19.2.0",
            "react-hook-form": "^7.60.0",
            "react-markdown": "^10.1.0",
            "react-resizable-panels": "^2.1.7",
            "recharts": "2.15.4",
            "remark-gfm": "^4.0.1",
            "sonner": "^1.7.4",
            "tailwind-merge": "^2.5.5",
            "tailwindcss-animate": "^1.0.7",
            "vaul": "^0.9.9",
            "zod": "3.25.76",
            "@apidevtools/swagger-parser": "^10.1.0"
        },
        "devDependencies": {
            "@tailwindcss/postcss": "^4.1.9",
            "@types/node": "^22",
            "@types/react": "^19",
            "@types/react-dom": "^19",
            "postcss": "^8.5",
            "tailwindcss": "^4.1.9",
            "tw-animate-css": "1.3.3",
            "typescript": "^5"
        }
    }
    
    out_dir = get_output_dir(output_dir, use_temp=True)
    with open(out_dir / 'package.json', 'w') as f:
        json.dump(package_json, f, indent=2)

def generate_tsconfig(output_dir: Path):
    """Generate tsconfig.json."""
    tsconfig = {
        "compilerOptions": {
            "target": "ES2017",
            "lib": ["dom", "dom.iterable", "esnext"],
            "allowJs": True,
            "skipLibCheck": True,
            "strict": True,
            "noEmit": True,
            "esModuleInterop": True,
            "module": "esnext",
            "moduleResolution": "bundler",
            "resolveJsonModule": True,
            "isolatedModules": True,
            "jsx": "preserve",
            "incremental": True,
            "plugins": [
                {
                    "name": "next"
                }
            ],
            "paths": {
                "@/*": ["./*"]
            }
        },
        "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        "exclude": ["node_modules"]
    }
    
    out_dir = get_output_dir(output_dir, use_temp=True)
    with open(out_dir / 'tsconfig.json', 'w') as f:
        json.dump(tsconfig, f, indent=2)

def generate_next_config(output_dir: Path):
    """Generate next.config.mjs."""
    config = """/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
"""
    out_dir = get_output_dir(output_dir, use_temp=True)
    with open(out_dir / 'next.config.mjs', 'w') as f:
        f.write(config)

def generate_postcss_config(output_dir: Path):
    """Generate postcss.config.mjs."""
    config = """export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
"""
    out_dir = get_output_dir(output_dir, use_temp=True)
    with open(out_dir / 'postcss.config.mjs', 'w') as f:
        f.write(config)

def generate_tailwind_config(output_dir: Path):
    """Generate tailwind.config.ts."""
    config = """import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
"""
    out_dir = get_output_dir(output_dir, use_temp=True)
    with open(out_dir / 'tailwind.config.ts', 'w') as f:
        f.write(config)

def generate_layout_tsx(output_dir: Path, default_theme: str = 'light'):
    """Generate layout.tsx with theme support."""
    valid_themes = ['light', 'dark', 'coffee']
    if default_theme not in valid_themes:
        print(f"  ⚠ Warning: Invalid theme '{default_theme}', using 'light'")
        default_theme = 'light'
    
    layout_content = f"""import type {{ Metadata }} from 'next'
import {{ Geist, Geist_Mono }} from 'next/font/google'
import {{ Analytics }} from '@vercel/analytics/next'
import {{ Toaster }} from '@/components/ui/toaster'
import {{ ThemeProvider }} from '@/components/theme-provider'
import './globals.css'
import {{ readFileSync }} from 'fs'
import {{ join }} from 'path'

const _geist = Geist({{ subsets: ["latin"] }});
const _geistMono = Geist_Mono({{ subsets: ["latin"] }});

// Read OpenAPI spec to get title and workspace image
let openApiSpec: any = null
let apiTitle = 'API Playground'
let workspaceImage: string | undefined = undefined

try {{
  const openApiPath = join(process.cwd(), 'openapi.json')
  const openApiContent = readFileSync(openApiPath, 'utf-8')
  openApiSpec = JSON.parse(openApiContent)
  apiTitle = openApiSpec?.info?.title || 'API Playground'
  workspaceImage = openApiSpec?.['x-ui-config']?.sidebar?.workspace?.image
}} catch (error) {{
  // If openapi.json doesn't exist, use defaults
}}

// Build icons configuration
const iconsConfig: Metadata['icons'] = workspaceImage
  ? {{
      icon: [
        {{
          url: workspaceImage,
          ...(workspaceImage.endsWith('.svg') ? {{ type: 'image/svg+xml' }} : {{}}),
        }},
      ],
      apple: workspaceImage,
    }}
  : {{
      icon: [
        {{
          url: '/icon-light-32x32.png',
          media: '(prefers-color-scheme: light)',
        }},
        {{
          url: '/icon-dark-32x32.png',
          media: '(prefers-color-scheme: dark)',
        }},
        {{
          url: '/icon.svg',
          type: 'image/svg+xml',
        }},
      ],
      apple: '/apple-icon.png',
    }}

export const metadata: Metadata = {{
  title: apiTitle,
  description: openApiSpec?.info?.description || 'API Playground',
  generator: 'v0.app',
  icons: iconsConfig,
}}

export default function RootLayout({{
  children,
}}: Readonly<{{
  children: React.ReactNode
}}>) {{
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="{default_theme}"
          themes={{['light', 'dark', 'coffee']}}
          enableSystem={{false}}
        >
          {{children}}
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}}
"""
    
    out_dir = get_output_dir(output_dir, use_temp=True)
    layout_path = out_dir / 'app' / 'layout.tsx'
    layout_path.parent.mkdir(parents=True, exist_ok=True)
    with open(layout_path, 'w') as f:
        f.write(layout_content)
    print(f"  ✓ Generated layout.tsx with default theme: {default_theme}")

def generate_page_tsx(output_dir: Path, spec: Dict[str, Any], first_endpoint_key: str):
    """Generate the main page.tsx that loads from OpenAPI spec."""
    print(f"    DEBUG: generate_page_tsx called with endpoint_key={first_endpoint_key}")
    current_dir = Path(__file__).parent
    openapi_filename = 'openapi.json'
    
    # Get all endpoint keys
    print(f"    DEBUG: Extracting endpoints from spec...")
    endpoints = spec.get('x-ui-config', {}).get('endpoints', {})
    print(f"    DEBUG: Found {len(endpoints)} endpoints in config")
    endpoint_keys = list(endpoints.keys())
    endpoint_list = []
    for key, config in endpoints.items():
        endpoint_list.append({
            'key': key,
            'title': config.get('title', key),
            'method': config.get('method', 'GET'),
            'path': config.get('path', '/')
        })
    
    print(f"    DEBUG: Serializing endpoints to JSON...")
    endpoints_json = json.dumps(endpoint_list, indent=2)
    print(f"    DEBUG: Endpoints JSON length: {len(endpoints_json)} chars")
    
    # Read the template from src/app/page.tsx and adapt it for multi-endpoint support
    template_path = current_dir / 'src' / 'app' / 'page.tsx'
    if template_path.exists():
        with open(template_path, 'r') as f:
            template_content = f.read()
        
        # Replace hardcoded 'crawling' with activeEndpoint pattern
        # Replace single endpoint useEffect with multi-endpoint version
        # This is a complex replacement, so we'll build it carefully
        
        # Extract the handleCopyForAI function and other handlers from template
        # For now, we'll use a hybrid approach: use the template but adapt it
        
        # Build the page content with multi-endpoint support but full Copy for AI
        page_content = """'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/api-playground/sidebar'
import { parseSidebarConfig } from '@/lib/openapi-sidebar-parser'
import { generateSlugFromEndpoint } from '@/lib/slug-utils'
import openApiSpec from '../""" + openapi_filename + """'
import LandingPage from './landing-page'

export default function ApiPlaygroundPage() {
  const router = useRouter()
  const [sidebarConfig, setSidebarConfig] = useState<any>(null)
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null)

  useEffect(() => {
    const sidebar = parseSidebarConfig(
      { 
        ...openApiSpec['x-ui-config']?.sidebar, 
        endpoints: openApiSpec['x-ui-config']?.endpoints 
      },
      (key: string) => {
        const slug = generateSlugFromEndpoint(openApiSpec as any, key)
        if (slug) {
          router.push(slug)
        } else {
          router.push(`/${key}`)
        }
      },
      openApiSpec as any
    )
    setSidebarConfig(sidebar)
  }, [router])

  // Show landing page if no active endpoint
  if (!activeEndpoint && sidebarConfig) {
    return <LandingPage />
  }

  // This should not be reached, but kept for compatibility
  return <LandingPage />
}
"""
    
    out_dir = get_output_dir(output_dir, use_temp=True)
    page_path = out_dir / 'app' / 'page.tsx'
    print(f"    DEBUG: Writing page.tsx to {page_path}")
    print(f"    DEBUG: Page content length: {len(page_content)} chars")
    with open(page_path, 'w') as f:
        f.write(page_content)
    print(f"    DEBUG: page.tsx written successfully")

def dereference_openapi_spec(spec: Dict[str, Any], temp_spec_path: Path) -> Dict[str, Any]:
    """Dereference OpenAPI spec using @apidevtools/swagger-parser via Node.js script."""
    import tempfile
    
    # Write spec to temp file
    with open(temp_spec_path, 'w') as f:
        json.dump(spec, f, indent=2)
    
    # Create temp output file
    temp_output = temp_spec_path.parent / f"{temp_spec_path.stem}_dereferenced.json"
    
    # Call Node.js script to dereference using npx (installs package if needed)
    script_path = Path(__file__).parent / 'scripts' / 'dereference-spec.js'
    try:
        # Use npx to run the script, which will install @apidevtools/swagger-parser if needed
        result = subprocess.run(
            ['npx', '--yes', '--package=@apidevtools/swagger-parser', 'node', str(script_path), str(temp_spec_path), str(temp_output)],
            capture_output=True,
            text=True,
            check=True
        )
        print(f"  ✓ Spec dereferenced using @apidevtools/swagger-parser")
        
        # Read dereferenced spec
        with open(temp_output, 'r') as f:
            dereferenced = json.load(f)
        
        # Clean up temp files
        temp_output.unlink()
        return dereferenced
    except subprocess.CalledProcessError as e:
        print(f"  ⚠ Warning: Failed to dereference spec: {e.stderr}")
        print(f"  Continuing with original spec (may have unresolved $refs)")
        return spec
    except FileNotFoundError:
        print(f"  ⚠ Warning: Node.js not found. Cannot dereference spec.")
        print(f"  Continuing with original spec (may have unresolved $refs)")
        return spec

def copy_openapi_spec(output_dir: Path, spec: Dict[str, Any]):
    """Copy the OpenAPI spec to the output directory (dereferenced)."""
    out_dir = get_output_dir(output_dir, use_temp=True)
    spec_path = out_dir / 'openapi.json'
    
    # Create temp file for dereferencing
    import tempfile
    temp_dir = Path(tempfile.gettempdir())
    temp_spec_path = temp_dir / f"openapi_temp_{os.getpid()}.json"
    
    try:
        # Dereference the spec
        dereferenced_spec = dereference_openapi_spec(spec, temp_spec_path)
        
        # Write dereferenced spec to output
        print(f"    DEBUG: Writing dereferenced openapi.json to {spec_path}")
        with open(spec_path, 'w') as f:
            json.dump(dereferenced_spec, f, indent=2)
        print(f"    DEBUG: openapi.json written successfully")
    finally:
        # Clean up temp file
        if temp_spec_path.exists():
            try:
                temp_spec_path.unlink()
            except Exception:
                pass

def generate_readme(output_dir: Path):
    """Generate README.md."""
    readme = """# API Playground

A Next.js application generated from an OpenAPI specification.

## Getting Started

1. Install dependencies:
```bash
pnpm install
# or
npm install
```

2. Run the development server:
```bash
pnpm dev
# or
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Customization

Edit `openapi.json` to customize:
- API endpoints and parameters
- Sidebar navigation
- Code samples
- UI configuration

The playground automatically updates based on the OpenAPI spec.
"""
    
    out_dir = get_output_dir(output_dir, use_temp=True)
    with open(out_dir / 'README.md', 'w') as f:
        f.write(readme)

def generate_gitignore(output_dir: Path):
    """Generate .gitignore."""
    gitignore = """# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/

# Next.js
.next/
out/
build/
dist/

# Production
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Local env files
.env*.local
.env

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
"""
    
    out_dir = get_output_dir(output_dir, use_temp=True)
    with open(out_dir / '.gitignore', 'w') as f:
        f.write(gitignore)

def generate_env_file(output_dir: Path, api_key: str = None):
    """Generate .env file with API key if provided."""
    out_dir = get_output_dir(output_dir, use_temp=True)
    env_path = out_dir / '.env'
    
    if api_key:
        with open(env_path, 'w') as f:
            f.write(f"API_KEY={api_key}\n")
        print(f"  ✓ .env file created with API key")
    else:
        # Create empty .env file as template
        with open(env_path, 'w') as f:
            f.write("# API Key for automatic authentication mode\n")
            f.write("# API_KEY=your_api_key_here\n")
        print(f"  ✓ .env file created (template)")

def interactive_setup(spec: Dict[str, Any], api_key: str = None) -> str:
    """Interactive setup for workspace logo on first run.
    Returns workspace_image_url or None if skipped/not provided
    """
    # Check if we should skip interactive mode
    skip_interactive = '--no-interactive' in sys.argv
    
    # If flags are provided or --no-interactive, skip prompts
    if api_key or skip_interactive:
        return None
    
    # Interactive prompt for logo only
    print("\n" + "="*60)
    print("Workspace Setup")
    print("="*60)
    print("Configure your API playground workspace\n")
    
    # Prompt for logo/image
    print("Workspace logo/image (optional):")
    print("  Enter a URL (e.g., https://example.com/logo.png)")
    print("  Or a file path (e.g., ./logo.png)")
    print("  Or press Enter to skip")
    workspace_image_input = input("  [skip]: ").strip()
    
    workspace_image_url = workspace_image_input if workspace_image_input else None
    
    print("\n" + "="*60 + "\n")
    
    return workspace_image_url

def load_existing_config(output_dir: Path) -> Dict[str, Any]:
    """Load existing workspace image from previously generated openapi.json."""
    out_dir = get_output_dir(output_dir, use_temp=False)
    openapi_json_path = out_dir / 'openapi.json'
    
    if not openapi_json_path.exists():
        return None
    
    try:
        with open(openapi_json_path, 'r') as f:
            existing_spec = json.load(f)
        
        # Extract workspace config
        workspace_config = existing_spec.get('x-ui-config', {}).get('sidebar', {}).get('workspace', {})
        if workspace_config and workspace_config.get('image'):
            return {
                'image': workspace_config.get('image')
            }
    except Exception:
        pass
    
    return None

def handle_workspace_image(workspace_image: str, output_dir: Path) -> str:
    """Handle workspace image - copy file to public directory or return URL."""
    if not workspace_image:
        return None
    
    # Check if it's a URL (starts with http:// or https://)
    if workspace_image.startswith('http://') or workspace_image.startswith('https://'):
        print(f"  ✓ Using workspace image URL: {workspace_image}")
        return workspace_image
    
    # It's a file path - copy it to public directory
    image_path = Path(workspace_image)
    if not image_path.exists():
        print(f"  ⚠ Warning: Workspace image file not found: {workspace_image}")
        return None
    
    out_dir = get_output_dir(output_dir, use_temp=True)
    public_dir = out_dir / 'public'
    public_dir.mkdir(parents=True, exist_ok=True)
    
    # Get file extension
    ext = image_path.suffix or '.png'
    # Use a standard filename
    dest_filename = f'workspace-logo{ext}'
    dest_path = public_dir / dest_filename
    
    # Copy the file
    shutil.copy2(image_path, dest_path)
    print(f"  ✓ Copied workspace image to {dest_filename}")
    
    # Return the public URL path
    return f'/{dest_filename}'

def main():
    if len(sys.argv) < 2:
        print("Usage: python generate.py <openapi.json|yaml> [output_dir] [--force] [--api-key KEY] [--workspace-image URL|FILE] [--theme THEME] [--no-interactive]")
        print("\nNote: For YAML files, PyYAML must be installed: pip install pyyaml")
        print("\nOptions:")
        print("  --api-key KEY           API key for automatic authentication mode")
        print("  --workspace-image URL   Workspace image URL or file path")
        print("  --theme THEME           Default theme: light, dark, or coffee (default: light)")
        print("  --no-interactive         Skip interactive setup prompts (useful for automation)")
        sys.exit(1)
    
    openapi_file = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else Path('generated-playground')
    force_overwrite = '--force' in sys.argv or '-f' in sys.argv
    
    # Parse --api-key argument
    api_key = None
    for i, arg in enumerate(sys.argv):
        if arg == '--api-key' and i + 1 < len(sys.argv):
            api_key = sys.argv[i + 1]
            break
    
    # Parse --workspace-image argument
    workspace_image_input = None
    for i, arg in enumerate(sys.argv):
        if arg == '--workspace-image' and i + 1 < len(sys.argv):
            workspace_image_input = sys.argv[i + 1]
            break
    
    # Parse --theme argument
    default_theme = 'light'
    for i, arg in enumerate(sys.argv):
        if arg == '--theme' and i + 1 < len(sys.argv):
            theme_input = sys.argv[i + 1].lower()
            valid_themes = ['light', 'dark', 'coffee']
            if theme_input in valid_themes:
                default_theme = theme_input
            else:
                print(f"  ⚠ Warning: Invalid theme '{theme_input}', using 'light'. Valid themes: {', '.join(valid_themes)}")
            break
    
    if not openapi_file.exists():
        print(f"Error: OpenAPI file not found: {openapi_file}")
        sys.exit(1)
    
    print(f"Loading OpenAPI spec from {openapi_file}...")
    spec = load_openapi_spec(str(openapi_file))
    
    # Detect if this is first run or regeneration
    out_dir = get_output_dir(output_dir, use_temp=False)
    is_first_run = not out_dir.exists() or not (out_dir / 'openapi.json').exists()
    
    # Handle workspace image (name always comes from OpenAPI title)
    workspace_image_url = None
    
    if is_first_run:
        # First run: show interactive setup (unless flags provided or --no-interactive)
        if workspace_image_input:
            # Flag provided, use it directly (skip interactive)
            workspace_image_url = handle_workspace_image(workspace_image_input, output_dir)
        else:
            # No flag, try interactive setup
            interactive_image = interactive_setup(spec, api_key)
            if interactive_image:
                workspace_image_url = handle_workspace_image(interactive_image, output_dir)
    else:
        # Regeneration: load existing config or use flag if provided
        if workspace_image_input:
            # Flag provided, use it (overrides existing)
            workspace_image_url = handle_workspace_image(workspace_image_input, output_dir)
        else:
            # No flag, try to load from existing config
            existing_config = load_existing_config(output_dir)
            if existing_config and existing_config.get('image'):
                workspace_image_url = existing_config['image']
                print(f"  ✓ Using existing workspace image: {workspace_image_url}")
    
    print("Ensuring x-ui-config exists...")
    # Always use None for workspace_name - it will use the API title from spec
    spec = ensure_x_ui_config(spec, None, workspace_image_url)
    
    # Handle auth configuration
    auth_config = spec.get('x-ui-config', {}).get('auth', {})
    auth_mode = auth_config.get('mode', 'manual')
    
    # If API key provided, set mode to automatic
    if api_key:
        auth_config['mode'] = 'automatic'
        spec['x-ui-config']['auth'] = auth_config
        print(f"  Auth mode set to: automatic")
    elif auth_mode == 'automatic' and not api_key:
        # Prompt for API key if mode is automatic but no key provided
        print("\n⚠ Warning: Auth mode is set to 'automatic' but no API key provided.")
        print("  Use --api-key KEY to provide the API key, or set mode to 'manual' in x-ui-config")
        print("  Continuing with manual mode...")
        auth_config['mode'] = 'manual'
        spec['x-ui-config']['auth'] = auth_config
    
    # Get paths for atomic write pattern
    out_dir = get_output_dir(output_dir, use_temp=False)
    temp_out_dir = get_output_dir(output_dir, use_temp=True)
    
    # Clean up any existing temp directory from previous failed runs
    if temp_out_dir.exists():
        print(f"Cleaning up previous temp directory {temp_out_dir}...")
        try:
            import stat
            def handle_remove_readonly(func, path, exc):
                os.chmod(path, stat.S_IWRITE)
                func(path)
            shutil.rmtree(temp_code_dir, onerror=handle_remove_readonly)
        except Exception as e:
            print(f"⚠ Warning: Could not remove temp directory: {e}")
    
    try:
        print(f"DEBUG: Starting generation process...")
        print(f"Creating project structure in {output_dir}...")
        create_directory_structure(output_dir)
        print("✓ Directory structure created")
        
        print("DEBUG: About to copy template files...")
        print("Copying template files...")
        copy_template_files(output_dir, skip_layout=True)
        print("✓ Template files copied")
        
        print("DEBUG: Generating layout.tsx with theme support...")
        generate_layout_tsx(output_dir, default_theme)
        print("✓ layout.tsx generated")
        
        print("DEBUG: About to generate config files...")
        print("Generating configuration files...")
        print("  DEBUG: Generating package.json...")
        generate_package_json(output_dir)
        print("  ✓ package.json")
        print("  DEBUG: Generating tsconfig.json...")
        generate_tsconfig(output_dir)
        print("  ✓ tsconfig.json")
        print("  DEBUG: Generating next.config.mjs...")
        generate_next_config(output_dir)
        print("  ✓ next.config.mjs")
        print("  DEBUG: Generating postcss.config.mjs...")
        generate_postcss_config(output_dir)
        print("  ✓ postcss.config.mjs")
        print("  DEBUG: Generating tailwind.config.ts...")
        generate_tailwind_config(output_dir)
        print("  ✓ tailwind.config.ts")
        print("  DEBUG: Generating .gitignore...")
        generate_gitignore(output_dir)
        print("  ✓ .gitignore")
        print("  DEBUG: Generating .env file...")
        generate_env_file(output_dir, api_key)
        print("  ✓ .env")
        
        print("DEBUG: About to generate page components...")
        print("Generating page components...")
        endpoints = list(spec.get('x-ui-config', {}).get('endpoints', {}).keys())
        first_endpoint = endpoints[0] if endpoints else 'default'
        print(f"  DEBUG: Found {len(endpoints)} endpoints: {endpoints}")
        print(f"  Found {len(endpoints)} endpoints, using '{first_endpoint}' as default")
        print(f"  DEBUG: Calling generate_page_tsx...")
        generate_page_tsx(output_dir, spec, first_endpoint)
        print("  ✓ page.tsx")
        
        print("DEBUG: About to copy OpenAPI spec...")
        print("Copying OpenAPI spec...")
        copy_openapi_spec(output_dir, spec)
        print("  ✓ openapi.json")
        
        print("DEBUG: About to generate README...")
        print("Generating README...")
        generate_readme(output_dir)
        print("  ✓ README.md")
        print("DEBUG: All generation steps completed!")
        
        # Atomic swap: Use incremental updates to preserve Next.js file watcher
        print("\n🔄 Performing atomic swap...")
        
        if not out_dir.exists():
            # First time generation - just rename
            print(f"  First generation: Renaming {temp_out_dir} -> {out_dir}...")
            try:
                import stat
                def handle_remove_readonly(func, path, exc):
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                temp_out_dir.rename(out_dir)
                print("  ✓ Atomic swap completed")
            except Exception as e:
                print(f"  ❌ Error during atomic swap: {e}")
                raise
        else:
            # Incremental update: Copy files from temp to real directory
            # This preserves Next.js file watcher and allows hot-reload
            print(f"  Updating existing directory (preserving file watchers)...")
            
            def copy_tree(src, dst):
                """Copy directory tree, overwriting existing files and removing deleted ones."""
                # Directories to skip (managed by package manager or build tools)
                skip_dirs = {'node_modules', '.next', '.pnpm', '.turbo', 'dist', 'build', '.cache'}
                skip_files = {'.DS_Store', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'}
                
                if not dst.exists():
                    dst.mkdir(parents=True, exist_ok=True)
                
                # Track what exists in source (excluding skip items)
                src_items = {item.name for item in src.iterdir() 
                            if item.name not in skip_dirs and item.name not in skip_files}
                dst_items = {item.name for item in dst.iterdir() 
                            if item.name not in skip_dirs and item.name not in skip_files} if dst.exists() else set()
                
                # Remove files/dirs that no longer exist in source (but not skip items)
                for deleted_item in dst_items - src_items:
                    deleted_path = dst / deleted_item
                    try:
                        if deleted_path.is_dir():
                            shutil.rmtree(deleted_path)
                        else:
                            deleted_path.unlink()
                    except Exception:
                        pass  # Ignore errors removing old files
                
                # Copy/update files from source (excluding skip items)
                for item in src.iterdir():
                    # Skip node_modules and other build artifacts
                    if item.name in skip_dirs or item.name in skip_files:
                        continue
                    
                    src_path = src / item.name
                    dst_path = dst / item.name
                    
                    if src_path.is_dir():
                        copy_tree(src_path, dst_path)
                    else:
                        # Copy file, preserving permissions
                        import stat
                        try:
                            shutil.copy2(src_path, dst_path)
                        except PermissionError:
                            # Try to make writable and retry
                            os.chmod(dst_path, stat.S_IWRITE | stat.S_IREAD)
                            shutil.copy2(src_path, dst_path)
            
            try:
                # Copy all files from temp to real directory
                copy_tree(temp_out_dir, out_dir)
                
                # Remove temp directory
                import stat
                def handle_remove_readonly(func, path, exc):
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                shutil.rmtree(temp_out_dir, onerror=handle_remove_readonly)
                print("  ✓ Incremental update completed")
            except Exception as e:
                print(f"  ⚠ Warning: Error during incremental update: {e}")
                # Fallback: try full directory replacement
                print("  Attempting fallback: full directory replacement...")
                try:
                    # Remove old directory
                    import stat
                    def handle_remove_readonly(func, path, exc):
                        os.chmod(path, stat.S_IWRITE)
                        func(path)
                    shutil.rmtree(out_dir, onerror=handle_remove_readonly)
                    # Rename temp to final
                    temp_out_dir.rename(out_dir)
                    print("  ✓ Fallback completed (dev server may need restart)")
                except Exception as e2:
                    print(f"  ❌ Fallback also failed: {e2}")
                    raise
        
    except Exception as e:
        print(f"\n❌ Error during generation: {e}")
        import traceback
        traceback.print_exc()
        # Clean up temp directory on error
        if temp_out_dir.exists():
            print(f"\n🧹 Cleaning up temp directory {temp_out_dir}...")
            try:
                import stat
                def handle_remove_readonly(func, path, exc):
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                shutil.rmtree(temp_out_dir, onerror=handle_remove_readonly)
                print("✓ Temp directory cleaned up")
            except Exception as cleanup_error:
                print(f"⚠ Warning: Could not clean up temp directory: {cleanup_error}")
        sys.exit(1)
    
    print(f"\n✅ Playground generated successfully in {out_dir}")
    print("\nNext steps:")
    print(f"  cd {out_dir}")
    print("  pnpm install")
    print("  pnpm dev")
    print("\n💡 Tip: Use 'node watch.js <openapi-file> <output-dir>' for auto-regeneration on file changes")

if __name__ == '__main__':
    main()

