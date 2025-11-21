import { z } from 'zod';
import type { OpenAPIV3 } from 'openapi-types';

/**
 * Generator configuration schema with runtime validation
 */
export const GeneratorConfigSchema = z.object({
    specPath: z.string(),
    outputDir: z.string(),
    force: z.boolean().default(false),
    apiKey: z.string().optional(),
    workspaceImage: z.string().optional(),
    theme: z.enum(['light', 'dark', 'coffee']).default('light'),
    interactive: z.boolean().default(true),
    popularEndpoints: z.array(z.string()).optional(),
});

export type GeneratorConfig = z.infer<typeof GeneratorConfigSchema>;

/**
 * UI configuration types (x-ui-config extension)
 */
export interface UIConfig {
    sidebar: SidebarConfig;
    endpoints: Record<string, EndpointConfig>;
    auth: AuthConfig;
    /** Array of endpoint keys to display as popular endpoints on the landing page */
    popularEndpoints?: string[];
}

export interface SidebarConfig {
    workspace: WorkspaceConfig;
    navItems?: NavItem[];
    user?: UserConfig;
}

export interface WorkspaceConfig {
    name: string;
    icon: string;
    image?: string;
}

export interface NavItem {
    title: string;
    icon?: string;
    items?: NavSubItem[];
}

export interface NavSubItem {
    title: string;
    endpoint: string;
}

export interface UserConfig {
    name: string;
    initials: string;
    avatar?: string;
}

export interface EndpointConfig {
    title: string;
    description: string;
    method: string;
    path: string;
    urlField?: UrlFieldConfig;
}

export interface UrlFieldConfig {
    name: string;
    placeholder?: string;
    defaultValue?: string;
}

export interface AuthConfig {
    mode: 'manual' | 'automatic';
    schemeName?: string;
}

/**
 * Extended OpenAPI spec with x-ui-config
 */
export interface ExtendedOpenAPISpec extends OpenAPIV3.Document {
    'x-ui-config'?: UIConfig;
}

/**
 * Generator result
 */
export interface GenerationResult {
    success: boolean;
    outputDir: string;
    duration: number;
    errors?: Error[];
}

/**
 * Copy options for template files
 */
export interface CopyOptions {
    skipLayout?: boolean;
    skipDirs?: Set<string>;
    skipFiles?: Set<string>;
}

/**
 * Workspace setup result from interactive prompts
 */
export interface WorkspaceSetupResult {
    workspaceImage?: string;
}
