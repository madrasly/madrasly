import type { ExtendedOpenAPISpec } from '../types/index.js';

/**
 * Render layout.tsx with theme support
 */
export function renderLayout(theme: string, _spec: ExtendedOpenAPISpec): string {

  return `import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'
import { readFileSync } from 'fs'
import { join } from 'path'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

// Read OpenAPI spec to get title and workspace image
let openApiSpec: any = null
let apiTitle = 'API Playground'
let workspaceImage: string | undefined = undefined

try {
  const openApiPath = join(process.cwd(), 'openapi.json')
  const openApiContent = readFileSync(openApiPath, 'utf-8')
  openApiSpec = JSON.parse(openApiContent)
  apiTitle = openApiSpec?.info?.title || 'API Playground'
  workspaceImage = openApiSpec?.['x-ui-config']?.sidebar?.workspace?.image
} catch (error) {
  // If openapi.json doesn't exist, use defaults
}

// Build icons configuration
const iconsConfig: Metadata['icons'] = workspaceImage
  ? {
      icon: [
        {
          url: workspaceImage,
          ...(workspaceImage.endsWith('.svg') ? { type: 'image/svg+xml' } : {}),
        },
      ],
      apple: workspaceImage,
    }
  : {
      icon: [
        {
          url: '/icon-light-32x32.png',
          media: '(prefers-color-scheme: light)',
        },
        {
          url: '/icon-dark-32x32.png',
          media: '(prefers-color-scheme: dark)',
        },
        {
          url: '/icon.svg',
          type: 'image/svg+xml',
        },
      ],
      apple: '/apple-icon.png',
    }

export const metadata: Metadata = {
  title: apiTitle,
  description: openApiSpec?.info?.description || 'API Playground',
  generator: 'v0.app',
  icons: iconsConfig,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="${theme}"
          themes={['light', 'dark', 'coffee']}
          enableSystem={false}
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
`;
}

/**
 * Render API route for OpenAPI spec
 */
export function renderOpenAPISpecRoute(): string {
  return `import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const specPath = join(process.cwd(), 'openapi.json')
    const spec = JSON.parse(readFileSync(specPath, 'utf-8'))
    return NextResponse.json(spec)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load OpenAPI spec' },
      { status: 500 }
    )
  }
}
`;
}

/**
 * Render hook for loading OpenAPI spec
 */
export function renderUseOpenAPISpecHook(): string {
  return `'use client'
import { useState, useEffect } from 'react'

export function useOpenAPISpec() {
  const [spec, setSpec] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/openapi-spec')
      .then(r => r.json())
      .then(setSpec)
      .catch(err => {
        console.error('Failed to load OpenAPI spec:', err)
        setSpec(null)
      })
      .finally(() => setLoading(false))
  }, [])

  return { spec, loading }
}
`;
}

/**
 * Render page.tsx with endpoint configuration
 */
export function renderPage(_endpoints: string[], _firstEndpoint: string): string {
  return `'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/api-playground/sidebar'
import { parseSidebarConfig } from '@/lib/openapi-sidebar-parser'
import { generateSlugFromEndpoint } from '@/lib/slug-utils'
import { useOpenAPISpec } from '@/lib/use-openapi-spec'
import LandingPage from './landing-page'

export default function ApiPlaygroundPage() {
  const router = useRouter()
  const { spec: openApiSpec, loading } = useOpenAPISpec()
  const [sidebarConfig, setSidebarConfig] = useState<any>(null)
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null)

  useEffect(() => {
    if (!openApiSpec || loading) return

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
          router.push(\`/\${key}\`)
        }
      },
      openApiSpec as any
    )
    setSidebarConfig(sidebar)
  }, [router, openApiSpec, loading])

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  // Show landing page if no active endpoint
  if (!activeEndpoint && sidebarConfig) {
    return <LandingPage />
  }

  // This should not be reached, but kept for compatibility
  return <LandingPage />
}
`;
}

/**
 * Generate package.json
 */
export function renderPackageJson(): object {
  return {
    name: 'api-playground',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
    },
    dependencies: {
      'fuse.js': '7.1.0',
      '@hookform/resolvers': '^3.10.0',
      '@radix-ui/react-accordion': '1.2.2',
      '@radix-ui/react-alert-dialog': '1.1.4',
      '@radix-ui/react-aspect-ratio': '1.1.1',
      '@radix-ui/react-avatar': '1.1.2',
      '@radix-ui/react-checkbox': '1.1.3',
      '@radix-ui/react-collapsible': '1.1.2',
      '@radix-ui/react-context-menu': '2.2.4',
      '@radix-ui/react-dialog': '1.1.4',
      '@radix-ui/react-dropdown-menu': '2.1.4',
      '@radix-ui/react-hover-card': '1.1.4',
      '@radix-ui/react-label': '2.1.1',
      '@radix-ui/react-menubar': '1.1.4',
      '@radix-ui/react-navigation-menu': '1.2.3',
      '@radix-ui/react-popover': '1.1.4',
      '@radix-ui/react-progress': '1.1.1',
      '@radix-ui/react-radio-group': '1.2.2',
      '@radix-ui/react-scroll-area': '1.2.2',
      '@radix-ui/react-select': '2.1.4',
      '@radix-ui/react-separator': '1.1.1',
      '@radix-ui/react-slider': '1.2.2',
      '@radix-ui/react-slot': '1.1.1',
      '@radix-ui/react-switch': '1.1.1',
      '@radix-ui/react-tabs': '1.1.2',
      '@radix-ui/react-toast': '1.2.4',
      '@radix-ui/react-toggle': '1.1.1',
      '@radix-ui/react-toggle-group': '1.1.1',
      '@radix-ui/react-tooltip': '1.1.6',
      '@vercel/analytics': '1.3.1',
      autoprefixer: '^10.4.20',
      'class-variance-authority': '^0.7.1',
      clsx: '^2.1.1',
      cmdk: '1.0.4',
      'date-fns': '4.1.0',
      'embla-carousel-react': '8.5.1',
      'input-otp': '1.4.1',
      'lucide-react': '^0.454.0',
      '@monaco-editor/react': '^4.6.0',
      next: '16.0.3',
      'next-themes': '^0.4.6',
      react: '19.2.0',
      'react-day-picker': '9.8.0',
      'react-dom': '19.2.0',
      'react-hook-form': '^7.60.0',
      'react-markdown': '^10.1.0',
      'react-resizable-panels': '^2.1.7',
      recharts: '2.15.4',
      'remark-gfm': '^4.0.1',
      sonner: '^1.7.4',
      'tailwind-merge': '^2.5.5',
      'tailwindcss-animate': '^1.0.7',
      vaul: '^0.9.9',
      zod: '3.25.76',
      '@apidevtools/swagger-parser': '^10.1.0',
    },
    devDependencies: {
      '@tailwindcss/postcss': '^4.1.9',
      '@types/node': '^22',
      '@types/react': '^19',
      '@types/react-dom': '^19',
      postcss: '^8.5',
      tailwindcss: '^4.1.9',
      'tw-animate-css': '1.3.3',
      typescript: '^5',
    },
  };
}

/**
 * Generate tsconfig.json
 */
export function renderTsConfig(): object {
  return {
    compilerOptions: {
      target: 'ES2017',
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      paths: { '@/*': ['./*'] },
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  };
}

/**
 * Generate next.config.mjs
 */
export function renderNextConfig(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
`;
}

/**
 * Generate postcss.config.mjs
 */
export function renderPostcssConfig(): string {
  return `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
`;
}

/**
 * Generate tailwind.config.ts
 */
export function renderTailwindConfig(): string {
  return `import type { Config } from "tailwindcss";

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
`;
}

/**
 * Generate README.md
 */
export function renderReadme(): string {
  return `# API Playground

A Next.js application generated from an OpenAPI specification.

## Getting Started

1. Install dependencies:
\`\`\`bash
pnpm install
# or
npm install
\`\`\`

2. Run the development server:
\`\`\`bash
pnpm dev
# or
npm run dev
\`\`\`

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Customization

Edit \`openapi.json\` to customize:
- API endpoints and parameters
- Sidebar navigation
- Code samples
- UI configuration

The playground automatically updates based on the OpenAPI spec.
`;
}

/**
 * Generate .gitignore
 */
export function renderGitignore(): string {
  return `# Dependencies
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
`;
}

/**
 * Generate .env file
 */
export function renderEnvFile(apiKey?: string): string {
  if (apiKey) {
    return `API_KEY=${apiKey}\n`;
  }

  return `# API Key for automatic authentication mode
# API_KEY=your_api_key_here
`;
}
