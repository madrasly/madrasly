import type { Metadata } from 'next'
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
          defaultTheme="light"
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
