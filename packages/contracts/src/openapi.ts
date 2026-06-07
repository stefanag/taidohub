/**
 * Central OpenAPI integration helper.
 *
 * Zod 4 has `.meta({...})` built-in, so no prototype extension is required.
 * Schema → OpenAPI conversion is delegated to `zod-openapi`'s `createSchema`.
 */
import type { OpenAPIObject, SchemaObject, ReferenceObject } from 'openapi3-ts/oas31';
import { type ZodTypeAny } from 'zod';
import { createSchema } from 'zod-openapi';

import { AuditLogOpenApiRegistry } from './audit-log.js';
import { AuthOpenApiRegistry } from './auth.js';
import { BeltRanksOpenApiRegistry } from './ranks.js';
import { BeltSystemsOpenApiRegistry } from './belt-systems.js';
import { ErrorEnvelopeOpenApiRegistry } from './errors.js';
import { LabelsOpenApiRegistry } from './labels.js';
import { OrganisationsOpenApiRegistry } from './organisations.js';
import { ProfileOpenApiRegistry } from './profile.js';
import { RankHistoryOpenApiRegistry } from './rank-history.js';
import { ShogoTitlesOpenApiRegistry } from './shogo-titles.js';
import { UsersOpenApiRegistry } from './users.js';

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
    OrganisationsOpenApiRegistry,
    AuditLogOpenApiRegistry,
    ProfileOpenApiRegistry,
    BeltSystemsOpenApiRegistry,
    BeltRanksOpenApiRegistry,
    ShogoTitlesOpenApiRegistry,
    RankHistoryOpenApiRegistry,
    LabelsOpenApiRegistry,
  ],
): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};

  const target = document.components.schemas as Record<string, SchemaObject | ReferenceObject>;

  for (const registry of registries) {
    for (const [name, schema] of Object.entries(registry)) {
      // `io: 'input'` lets schemas with `.default()` / other transforms
      // render — they describe how request bodies *enter* the API. For
      // pure response shapes this is a no-op (input === output).
      const { schema: openApiSchema } = createSchema(schema, { io: 'input' });
      target[name] = openApiSchema as unknown as SchemaObject;
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
  organisations: OrganisationsOpenApiRegistry,
  auditLog: AuditLogOpenApiRegistry,
  profile: ProfileOpenApiRegistry,
  beltSystems: BeltSystemsOpenApiRegistry,
  beltRanks: BeltRanksOpenApiRegistry,
  shogoTitles: ShogoTitlesOpenApiRegistry,
  rankHistory: RankHistoryOpenApiRegistry,
  labels: LabelsOpenApiRegistry,
} as const;
