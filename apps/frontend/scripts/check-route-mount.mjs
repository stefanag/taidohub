#!/usr/bin/env node
/**
 * Detects the "parent-as-component" routing bug pattern in TanStack
 * Router flat-routing files.
 *
 * # The bug
 *
 * TanStack flat-routing parses file names like dotted segments:
 *
 *   _app.tsx                  → /
 *   _app.students.tsx         → /students     ← parent for any /_app/students/...
 *   _app.students.index.tsx   → /students/    (the "index" child)
 *   _app.students.$userId.tsx → /students/<id> (another child)
 *
 * If `_app.students.tsx` exports a page component (instead of an
 * Outlet-only layout), the codegen makes the children render INSIDE
 * the parent's component tree. Because the parent's component doesn't
 * render `<Outlet />`, the children silently never mount. The URL
 * navigates, the address bar updates, but the page never changes.
 *
 * This bit us twice in dev (chunks /students/$userId and the admin
 * resource $id/edit splits). Both were hand-diagnosed and
 * hand-fixed. This script makes a CI gate impossible to skip.
 *
 * # Detection
 *
 * For every parent route file `routes/<prefix>.<name>.tsx` whose path
 * is a strict prefix of one or more sibling route files
 * `routes/<prefix>.<name>.<...>.tsx`, the parent MUST render
 * `<Outlet />` somewhere in its `component`. Text-based check: the
 * source must contain `<Outlet />` (with or without props) or `Outlet`
 * passed directly to `createRoute({ component: Outlet })`.
 *
 * If the parent file has children but doesn't include either form,
 * the script exits with code 1 and prints which files need a layout
 * fix.
 *
 * # Why a script, not a Steiger plugin
 *
 * Steiger's plugin contract is geared toward FSD layering rules
 * (slice/segment imports). The route-mount rule is structural and
 * file-shape-based — much simpler to express as a 100-line Node
 * script. Wired into the `arch` npm script so CI exercises it on
 * every PR.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROUTES_DIR = resolve(
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:'),
  '..',
  '..',
  'src',
  'app',
  'router',
  'routes',
);

/** Returns true if the file's source includes `<Outlet />`, `<Outlet/>`, or `component: Outlet`. */
function rendersOutlet(filePath) {
  const src = readFileSync(filePath, 'utf8');
  // Strip block + line comments cheaply so a commented-out `<Outlet />`
  // doesn't mask a real bug.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return (
    /<\s*Outlet\s*(\/>|>)/.test(stripped) ||
    /component\s*:\s*Outlet\b/.test(stripped) ||
    // Common pattern: `component: () => <Outlet />`. Captured by the
    // first regex; left here as a comment so a future reader doesn't
    // think it's missed.
    false
  );
}

/** Returns `route` files keyed by their dotted prefix. */
function collectRoutes() {
  const files = readdirSync(ROUTES_DIR)
    .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
    .sort();
  return files.map((name) => ({
    name,
    prefix: name.slice(0, -'.tsx'.length), // e.g. "_app.students"
    fullPath: join(ROUTES_DIR, name),
  }));
}

function main() {
  const routes = collectRoutes();
  const violations = [];

  for (const parent of routes) {
    // Find any route whose prefix starts with `parent.prefix + '.'` —
    // those are nested under the parent and need it to render
    // `<Outlet />`.
    const children = routes.filter(
      (other) =>
        other !== parent && other.prefix.startsWith(parent.prefix + '.'),
    );
    if (children.length === 0) continue; // leaf file, no constraint.

    if (!rendersOutlet(parent.fullPath)) {
      violations.push({ parent: parent.name, children: children.map((c) => c.name) });
    }
  }

  if (violations.length === 0) {
    console.log(
      `[check-route-mount] ${routes.length} route files scanned, no parent-as-component violations.`,
    );
    process.exit(0);
  }

  console.error(
    '[check-route-mount] Parent-as-component routes detected:\n',
  );
  for (const v of violations) {
    console.error(`  ${v.parent}`);
    console.error(`    has nested children:`);
    for (const c of v.children) console.error(`      - ${c}`);
    console.error(
      `    but its component does not render <Outlet />. Children will navigate URL-wise but never mount.`,
    );
    console.error(
      `    Fix: split ${v.parent} into an Outlet-only layout + ${v.parent.replace(/\.tsx$/, '.index.tsx')} carrying the page component.\n`,
    );
  }
  process.exit(1);
}

main();
