/**
 * Regression test for `check-route-mount.mjs`.
 *
 * Spawns the checker against a synthetic temp directory whose
 * filenames recreate the parent-as-component bug pattern, and
 * asserts the checker exits with code 1 and names the offending
 * parent. Run via `node --test`:
 *
 *   node --test apps/frontend/scripts/check-route-mount.test.mjs
 *
 * The script's positive path (current tree → exit 0) is verified
 * by running `pnpm --filter frontend arch` in CI; this test
 * covers the failure path so a future tweak to the regex / file
 * walk can't silently let the bug pattern back in.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const HERE = resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'), '..');
const CHECKER = resolve(HERE, 'check-route-mount.mjs');

function makeFixture(files) {
  // The checker resolves `../../src/app/router/routes` from its
  // own location. We recreate the relative layout the script
  // expects:
  //   <root>/apps/frontend/scripts/check-route-mount.mjs
  //   <root>/apps/frontend/src/app/router/routes/<files>
  const root = mkdtempSync(join(tmpdir(), 'route-mount-test-'));
  const scriptsDir = join(root, 'apps', 'frontend', 'scripts');
  const routesDir = join(root, 'apps', 'frontend', 'src', 'app', 'router', 'routes');
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(routesDir, { recursive: true });
  const placed = join(scriptsDir, 'check-route-mount.mjs');
  copyFileSync(CHECKER, placed);
  for (const [name, src] of Object.entries(files)) {
    writeFileSync(join(routesDir, name), src, 'utf8');
  }
  return { root, scriptPath: placed };
}

test('exits 0 when no parent has nested children', () => {
  const { root, scriptPath } = makeFixture({
    '_public.index.tsx': `import { createRoute } from '@tanstack/react-router';
export const Route = createRoute({ component: () => <div /> });`,
  });
  const result = spawnSync('node', [scriptPath], { encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
});

test('exits 0 when the parent renders <Outlet />', () => {
  const { root, scriptPath } = makeFixture({
    '_app.foo.tsx': `import { Outlet } from '@tanstack/react-router';
export const Route = { component: () => <Outlet /> };`,
    '_app.foo.bar.tsx': `export const Route = { component: () => <div /> };`,
  });
  const result = spawnSync('node', [scriptPath], { encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
});

test('exits 1 + names the violation when a parent has children but no Outlet', () => {
  const { root, scriptPath } = makeFixture({
    '_app.foo.tsx': `import { FooPage } from '@/pages/foo';
export const Route = { component: FooPage };`,
    '_app.foo.bar.tsx': `export const Route = { component: () => <div /> };`,
  });
  const result = spawnSync('node', [scriptPath], { encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /_app\.foo\.tsx/);
  assert.match(result.stderr, /_app\.foo\.bar\.tsx/);
});

test('does not flag a commented-out Outlet as a real one', () => {
  const { root, scriptPath } = makeFixture({
    '_app.foo.tsx': `// <Outlet />  this used to render but doesn't anymore
import { FooPage } from '@/pages/foo';
export const Route = { component: FooPage };`,
    '_app.foo.bar.tsx': `export const Route = { component: () => <div /> };`,
  });
  const result = spawnSync('node', [scriptPath], { encoding: 'utf8' });
  rmSync(root, { recursive: true, force: true });
  assert.equal(result.status, 1, 'commented-out Outlet should not satisfy the check');
});
