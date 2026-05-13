/**
 * Re-export of `z` from Zod 4.
 *
 * Historically this module installed `@anatine/zod-openapi`'s prototype patch
 * so every Zod schema gained a `.openapi({...})` method. That library is not
 * compatible with Zod 4 (it patches `ZodSchema.prototype`, which no longer
 * exists). Zod 4 provides `.meta({...})` natively, so no extension step is
 * required.
 *
 * The file is kept as a thin re-export so existing
 * `import { z } from './zod-openapi.js'` imports across the package continue
 * to work without rippling through every file.
 */
export { z } from 'zod';
