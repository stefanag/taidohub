/**
 * Central OpenAPI integration helper.
 *
 * The actual Zod ↔ OpenAPI extension lives in `./zod-openapi.ts` (a small side-
 * effecting module) so resource files can import `z` without depending on this
 * file — that breaks the circular dependency that would otherwise arise from
 * the default registry below.
 */
import { generateSchema } from '@anatine/zod-openapi';
import type { OpenAPIObject, SchemaObject, ReferenceObject } from 'openapi3-ts/oas31';
import { type ZodTypeAny } from 'zod';

import { AuthOpenApiRegistry } from './auth.js';
import { ErrorEnvelopeOpenApiRegistry } from './errors.js';
import { PostsOpenApiRegistry } from './posts.js';
import { UsersOpenApiRegistry } from './users.js';

// Pull in the side-effecting extension so callers that import `./openapi.js`
// directly (without going through the barrel) still get `.openapi()`.
import './zod-openapi.js';

/**
 * A registry maps OpenAPI component names to the Zod schemas that describe them.
 * Each resource module exports one of these and `registerContractSchemas` merges
 * them into the Swagger document.
 */
export type ZodSchemaRegistry = Record<string, ZodTypeAny>;

/**
 * Convert each schema in the supplied (or default) registries to an OpenAPI
 * schema object and merge them into `document.components.schemas` under their
 * registry keys.
 *
 * The backend calls this against the document produced by
 * `SwaggerModule.createDocument(...)` so every shared schema lands under a
 * stable `$ref`-able name.
 */
export function registerContractSchemas(
  document: OpenAPIObject,
  registries: ZodSchemaRegistry[] = [
    ErrorEnvelopeOpenApiRegistry,
    AuthOpenApiRegistry,
    UsersOpenApiRegistry,
    PostsOpenApiRegistry,
  ],
): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};

  const target = document.components.schemas as Record<string, SchemaObject | ReferenceObject>;

  for (const registry of registries) {
    for (const [name, schema] of Object.entries(registry)) {
      target[name] = generateSchema(schema) as SchemaObject;
    }
  }

  return document;
}

/**
 * The canonical map of every contract registry. Useful when callers want to
 * iterate registries themselves rather than relying on the default merge.
 */
export const ContractRegistries = {
  errors: ErrorEnvelopeOpenApiRegistry,
  auth: AuthOpenApiRegistry,
  users: UsersOpenApiRegistry,
  posts: PostsOpenApiRegistry,
} as const;
