import { afterEach, describe, expect, it } from 'vitest';

import {
  createDrizzleClient,
  disposeDrizzleClient,
  type DrizzleDb,
} from './client.js';

/**
 * postgres-js lazy-connects on first query — constructing a client
 * against an unreachable URL does NOT open a socket. Tests below
 * exploit that to exercise the singleton check without a live
 * database. Each test uses a unique URL so the per-URL counter
 * stays isolated across cases.
 *
 * Every client created in a test is added to `created` and disposed
 * in `afterEach` — important because `disposeDrizzleClient` is what
 * decrements the active-count map; a leaked client would dirty the
 * shared module-level state for any later test that uses the same
 * URL.
 */
describe('createDrizzleClient — singleton guard', () => {
  const created: DrizzleDb[] = [];

  afterEach(async () => {
    while (created.length > 0) {
      const db = created.pop()!;
      try {
        await disposeDrizzleClient(db);
      } catch {
        // postgres-js end() may reject if the socket never came up —
        // acceptable here; the singleton-counter decrement is what
        // we actually need cleaned up.
      }
    }
  });

  it('allows a single client per DATABASE_URL', () => {
    const url = 'postgresql://localhost:65432/p1-3-test-a';
    const db = createDrizzleClient(url);
    created.push(db);
    expect(db).toBeDefined();
  });

  it('throws on a second concurrent client for the same URL', () => {
    const url = 'postgresql://localhost:65432/p1-3-test-b';
    const db1 = createDrizzleClient(url);
    created.push(db1);

    expect(() => {
      const db2 = createDrizzleClient(url);
      created.push(db2);
    }).toThrowError(/already active in this process/);
  });

  it('the error message mentions the singleton + opt-out path', () => {
    const url = 'postgresql://localhost:65432/p1-3-test-c';
    const db1 = createDrizzleClient(url);
    created.push(db1);

    try {
      const db2 = createDrizzleClient(url);
      created.push(db2);
      expect.fail('expected second createDrizzleClient call to throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('postgres-js pool');
      expect(msg).toContain('allowMultiple: true');
    }
  });

  it('permits a second client when allowMultiple: true is passed', () => {
    const url = 'postgresql://localhost:65432/p1-3-test-d';
    const db1 = createDrizzleClient(url);
    created.push(db1);

    const db2 = createDrizzleClient(url, { allowMultiple: true });
    created.push(db2);

    expect(db2).toBeDefined();
    expect(db1).not.toBe(db2);
  });

  it('disposing a client frees the slot so the URL can be reopened', async () => {
    const url = 'postgresql://localhost:65432/p1-3-test-e';
    const db1 = createDrizzleClient(url);
    await disposeDrizzleClient(db1);

    // Re-creating against the same URL after dispose should not throw.
    const db2 = createDrizzleClient(url);
    created.push(db2);

    expect(db2).toBeDefined();
  });

  it('isolates the counter per URL', () => {
    const urlA = 'postgresql://localhost:65432/p1-3-test-f-A';
    const urlB = 'postgresql://localhost:65432/p1-3-test-f-B';

    const dbA = createDrizzleClient(urlA);
    const dbB = createDrizzleClient(urlB);
    created.push(dbA, dbB);

    expect(dbA).toBeDefined();
    expect(dbB).toBeDefined();
  });

  it('disposeDrizzleClient is idempotent', async () => {
    const url = 'postgresql://localhost:65432/p1-3-test-g';
    const db = createDrizzleClient(url);

    await disposeDrizzleClient(db);
    // Second dispose: should not throw on the counter side (postgres-js's
    // own end() is a no-op the second time too).
    await disposeDrizzleClient(db);

    // And the slot is still free.
    const db2 = createDrizzleClient(url);
    created.push(db2);
    expect(db2).toBeDefined();
  });
});
