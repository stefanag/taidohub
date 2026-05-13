/**
 * Side-effecting module: installs OpenAPI metadata support on `z` so any Zod
 * schema in the package (or downstream consumers) can call `.openapi({...})`.
 *
 * Every resource file imports this module to guarantee the extension is loaded
 * before any `.openapi()` call evaluates. Splitting it out of `./openapi.ts`
 * avoids a circular dependency (`openapi.ts` itself imports the resource
 * registries to build a default `registerContractSchemas`).
 */
import { extendZodWithOpenApi } from '@anatine/zod-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export { extendZodWithOpenApi, z };
