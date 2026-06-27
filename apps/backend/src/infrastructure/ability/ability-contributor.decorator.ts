import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key written by {@link AbilityContributor} and read by
 * `AbilityFactory.onModuleInit` via `Reflector`.
 */
export const ABILITY_CONTRIBUTOR_METADATA = 'taidohub:ability-contributor';

/**
 * Marks a class as a CASL rule contributor that should be picked up
 * by `AbilityFactory` automatically on application bootstrap.
 *
 * Before this decorator, the factory's constructor listed all 14
 * contributors explicitly AND the AbilityModule's providers list
 * repeated the same 14 — adding a new module's rules required edits
 * in two places. With the decorator, the contract is:
 *
 *   1. Implement `AbilityRuleContributor` on a `@Injectable()` class.
 *   2. Decorate the class with `@AbilityContributor()`.
 *   3. Provide the class in the owning module (so Nest's container
 *      instantiates it).
 *
 * `AbilityFactory` discovers the instance, calls `contributeTo` on
 * it, and the rules merge into the ability. No edit to the factory
 * needed.
 *
 * A class providing the interface but missing this decorator is NOT
 * picked up — the discovery rule is opt-in by design so test
 * doubles (or fake implementations introduced for one-off
 * scenarios) don't get silently included.
 */
export const AbilityContributor = (): ClassDecorator =>
  SetMetadata(ABILITY_CONTRIBUTOR_METADATA, true);
