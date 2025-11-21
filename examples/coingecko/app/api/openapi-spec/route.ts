import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

export async function GET() {
  const openApiSpecUrl = process.env.OPENAPI_SPEC_URL;

  if (openApiSpecUrl) {
    try {
      const response = await fetch(openApiSpecUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch OpenAPI spec from ${openApiSpecUrl}: ${response.statusText}`);
      }
      const spec = await response.json();
      return NextResponse.json(spec);
    } catch (error) {
      console.error('Error fetching OpenAPI spec from URL:', error);
      return NextResponse.json(
        { error: 'Failed to load OpenAPI spec from URL' },
        { status: 500 }
      );
    }
  } else {
    try {
      const specPath = join(process.cwd(), 'openapi.json');
      const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
      return NextResponse.json(spec);
    } catch (error) {
      console.error('Error reading OpenAPI spec from file:', error);
      return NextResponse.json(
        { error: 'Failed to load OpenAPI spec from file' },
        { status: 500 }
      );
    }
  }
}
