import type { OpenAPIV3 } from 'openapi-types';
import type {
    ExtendedOpenAPISpec,
    EndpointConfig,
} from '../types/index.js';

interface EnsureUIConfigOptions {
    workspaceName?: string;
    workspaceImage?: string;
}

/**
 * Ensure x-ui-config exists in spec with defaults
 */
export function ensureUIConfig(
    spec: ExtendedOpenAPISpec,
    options: EnsureUIConfigOptions = {}
): ExtendedOpenAPISpec {
    // Initialize x-ui-config if missing
    if (!spec['x-ui-config']) {
        spec['x-ui-config'] = {
            sidebar: {
                workspace: {
                    name: spec.info?.title || 'API Playground',
                    icon: 'API',
                },
                user: {
                    name: 'User',
                    initials: 'U',
                },
            },
            endpoints: {},
            auth: {
                mode: 'manual',
            },
        };
    }

    const uiConfig = spec['x-ui-config'];

    // Ensure sidebar exists
    if (!uiConfig.sidebar) {
        uiConfig.sidebar = {
            workspace: {
                name: spec.info?.title || 'API Playground',
                icon: 'API',
            },
        };
    }

    // Set workspace name (use provided name or API title)
    const workspaceName = options.workspaceName || spec.info?.title || 'API Playground';
    if (!uiConfig.sidebar.workspace) {
        uiConfig.sidebar.workspace = {
            name: workspaceName,
            icon: 'API',
        };
    } else {
        uiConfig.sidebar.workspace.name = workspaceName;
        if (!uiConfig.sidebar.workspace.icon) {
            uiConfig.sidebar.workspace.icon = 'API';
        }
    }

    // Set workspace image if provided
    if (options.workspaceImage) {
        uiConfig.sidebar.workspace.image = options.workspaceImage;
    }

    // Ensure auth config exists
    if (!uiConfig.auth) {
        uiConfig.auth = { mode: 'manual' };
    }

    // Auto-detect security scheme if not specified
    if (!uiConfig.auth.schemeName) {
        const detectedScheme = detectSecurityScheme(spec);
        if (detectedScheme) {
            uiConfig.auth.schemeName = detectedScheme;
        }
    }

    // Auto-generate endpoints if not specified
    if (!uiConfig.endpoints || Object.keys(uiConfig.endpoints).length === 0) {
        uiConfig.endpoints = generateEndpointConfigs(spec.paths || {});
    }

    // Note: popularEndpoints can be optionally defined to control which endpoints
    // are displayed on the landing page. If not specified, the first 4 endpoints will be shown.
    // Example: popularEndpoints: ['get-votes', 'post-vote', 'get-registration']

    return spec;
}

/**
 * Generate endpoint configurations from OpenAPI paths
 */
export function generateEndpointConfigs(
    paths: OpenAPIV3.PathsObject
): Record<string, EndpointConfig> {
    const endpoints: Record<string, EndpointConfig> = {};
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;

    for (const [path, pathItem] of Object.entries(paths)) {
        if (!pathItem) continue;

        for (const method of httpMethods) {
            const operation = pathItem[method] as OpenAPIV3.OperationObject | undefined;
            if (!operation) continue;

            // Generate operation ID if missing
            let operationId = operation.operationId;
            if (!operationId || operationId.trim() === '') {
                operationId = `${method}_${path.replace(/\//g, '_').replace(/[{}]/g, '')}`;
            }

            const endpointKey = operationId.toLowerCase().replace(/_/g, '-');

            const endpointConfig: EndpointConfig = {
                title: operation.summary || operationId,
                description: operation.description || '',
                method: method.toUpperCase(),
                path: path,
            };

            // Check for path parameters to create urlField
            if (operation.parameters) {
                for (const param of operation.parameters) {
                    const parameter = param as OpenAPIV3.ParameterObject;

                    if (parameter.in === 'path') {
                        endpointConfig.urlField = {
                            name: parameter.name,
                        };

                        if (parameter.description) {
                            endpointConfig.urlField.placeholder = parameter.description;
                        }

                        if (parameter.schema && 'example' in parameter.schema) {
                            endpointConfig.urlField.defaultValue = String(parameter.schema.example);
                        }

                        break; // Use first path parameter
                    }
                }
            }

            endpoints[endpointKey] = endpointConfig;
        }
    }

    return endpoints;
}

/**
 * Auto-detect security scheme from OpenAPI spec
 */
export function detectSecurityScheme(spec: OpenAPIV3.Document): string | undefined {
    const securitySchemes = spec.components?.securitySchemes;

    if (!securitySchemes || Object.keys(securitySchemes).length === 0) {
        return undefined;
    }

    // Return the first security scheme
    return Object.keys(securitySchemes)[0];
}
