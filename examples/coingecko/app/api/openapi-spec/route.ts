import { readFileSync } from 'fs'
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
