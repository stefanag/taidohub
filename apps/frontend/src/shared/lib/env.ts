import { z } from 'zod';

/**
 * Parses and validates `import.meta.env` at module load time. Throws a
 * descriptive error if any required `VITE_*` variable is missing or
 * malformed — fail loud at boot rather than at first network request.
 */
const EnvSchema = z.object({
  VITE_API_URL: z.string().url(),
});

const parsed = EnvSchema.safeParse({
  VITE_API_URL: import.meta.env.VITE_API_URL,
});

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid frontend environment. See console for details.');
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
