# TaidoHub — Design Specification

> Reference document for reviewing and maintaining the visual design of the Taidohub webapp.

> **Status: target spec — not yet implemented.** Most components, routes, and page inventories below describe the visual *destination*. The shipping app today renders a small surface area (admin/organisations, admin/audit-log, login, dashboard scaffold) on top of the FSD scaffolding under [`apps/frontend/src`](apps/frontend/src/). Token values in [`apps/frontend/src/app/styles/globals.css`](apps/frontend/src/app/styles/globals.css) also still diverge from the values quoted in §2 (e.g. `--color-primary` currently `#2D5FA2`, doc target `#051125`). Treat any mismatch as "implementation lagging the spec," not "spec is wrong."

---

## 1. Brand & Creative Principles

Taidohub is a digital training companion for a Japanese martial-art federation. The visual language is built on two ideas in tension:

- **Stillness** — disciplined grid, minimal ornament, generous whitespace (the *Maai* of intentional space).
- **Motion** — bold typography, deliberate asymmetry on hero rows, intentional sizing that drives focus.

Concrete principles flowing from this:

1. **Minimalist & disciplined.** No decorative clutter. No effects for their own sake.
2. **Japanese aesthetic.** Kanji displayed prominently. Serif italic for quote passages. Generous line-height on Japanese passages.
3. **Readable hierarchy.** Large headlines, muted secondary text, clear section numbering, weight-driven separation rather than dividers.
4. **Monochromatic primary.** Deep navy-tinted near-black palette with a single warm secondary accent.
5. **Sharp by default, restrained roundedness when softening.** 2 px base radius; 4 px for buttons and standard cards. Never large rounded corners.
6. **Tonal layering over outlines.** Section boundaries come from background-color shifts and whitespace first; borders are reserved for accent and accessibility fallback (see §4 and §5).
7. **Asymmetric where it matters.** Hero rows and feature blocks use intentional column ratios (3+2, 8+4) over uniform grids. Repeating content cards may use uniform grids (3+3+3) — the rule is *intentional sizing*, not "no grids".

---

## 2. Color Tokens

All colors come from [`apps/frontend/src/app/styles/globals.css`](apps/frontend/src/app/styles/globals.css) via the Tailwind `@theme` directive. Hex values below are the design target; the file currently ships slightly different values (see the banner at the top).

### Surface scale (light → dark)
| Token | Hex | Usage |
|---|---|---|
| `surface-container-lowest` | `#ffffff` | Innermost card backgrounds (sensei note) |
| `surface-container-low` | `#f3f4f5` | Section card backgrounds (Requirements, Admin) |
| `surface-container` | `#edeeef` | Mid-level containers |
| `surface-container-high` | `#e7e8e9` | Elevated surfaces |
| `surface` / `background` | `#f8f9fa` | Page background |
| `surface-dim` | `#d9dadb` | Dividers, disabled |
| `surface-variant` | `#e1e3e4` | Input backgrounds, chips |

### Primary scale
| Token | Hex | Usage |
|---|---|---|
| `primary` | `#051125` | Brand color — nav, headings, CTA buttons, accents |
| `primary-container` | `#1b263b` | Dark card backgrounds (GradeCard) |
| `on-primary` | `#ffffff` | Text/icons on primary bg |
| `on-primary-container` | `#828da7` | Muted text on dark card |
| `inverse-primary` | `#bbc6e2` | Light text on very dark bg |

### Secondary / warm accent
| Token | Hex | Usage |
|---|---|---|
| `secondary` | `#77574d` | Warm brown accents |
| `secondary-container` | `#fed3c7` | Warm pastel chip bg |
| `on-secondary-container` | `#795950` | Text in warm chips |

### Tertiary / near-black
| Token | Hex | Usage |
|---|---|---|
| `tertiary` | `#0f1112` | Darkest surfaces (JissenCard bg) |
| `tertiary-container` | `#242626` | Dark secondary card bg |

### Text
| Token | Hex | Usage |
|---|---|---|
| `on-surface` | `#191c1d` | Body text — navy-tinted near-black, never pure `#000` |
| `on-surface-variant` | `#45474d` | Secondary/muted text |
| `on-background` | `#191c1d` | Same as on-surface |

### Semantic
| Token | Hex | Usage |
|---|---|---|
| `error` | `#ba1a1a` | Error messages |
| `error-container` | `#ffdad6` | Error backgrounds |
| `outline` | `#75777d` | Borders |
| `outline-variant` | `#c5c6cd` | Subtle dividers / "ghost border" fallback |

### Rules

- **No pure black.** All "blacks" in the system are navy-tinted near-blacks (`#191c1d`, `#0f1112`). When picking a new dark token, tint it with the primary navy seed — never use `#000000`.
- **All grays are tinted.** Picking a generic Tailwind gray (`gray-500`) is a smell; prefer the surface/outline tokens above so the palette stays cohesive.

---

## 3. Typography

### Font families
| Variable | Stack | Usage |
|---|---|---|
| `font-headline` | Manrope + Noto Sans JP | Headings, card titles, nav branding |
| `font-body` | Inter + Noto Sans JP | Body text, descriptions, form labels |
| `font-label` | Inter | Compact labels, badges, stat tiles |

Japanese characters always render in **Noto Sans JP** (included as fallback in all stacks).

### Type scale (Tailwind classes in use)
| Class | Usage |
|---|---|
| `text-5xl` / `text-6xl` + `font-extrabold tracking-tighter` | Requirements page h1 (初段) |
| `text-2xl` / `text-3xl` + `font-light opacity-60` | Rank subtitle on Requirements |
| `text-lg` + `font-bold tracking-tight` | Section headings (dashboard) |
| `text-sm` + `font-bold` | Card titles, table headers |
| `text-[10px]` + `font-bold tracking-[0.2em] uppercase` | Eyebrow labels, metadata chips |
| `text-[9px]` + `font-bold uppercase tracking-widest` | "See all" type links |
| `text-xs` | Small muted descriptions |
| `italic font-serif` | Japanese quote blocks |

### Japanese text utility
```css
.japanese-text {
  font-family: 'Noto Sans JP', sans-serif;
  line-height: 1.6;
}
```
Applied on large kanji headings and quote passages.

### Future direction (not yet implemented)

A typographic third voice — **Space Grotesk** — is on the roadmap as a "technical label" font for overlines, metadata strings, and stat tile units. It would pair against Manrope's humanist clarity for editorial contrast. Adding it requires a Tailwind theme + index.css change; until that lands, `font-label` (Inter) covers the same role.

---

## 4. Spacing, Radius, Layout

### Border radius (5-level scale)
| Level | Variable | Value | Usage |
|---|---|---|---|
| 0 | (no variable) | 0 px | Extra-crisp surfaces; rare |
| 1 | `--radius` | 2 px | Default (`rounded-sm`) — cards, chips, eyebrows |
| 2 | `--radius-lg` | 4 px | Buttons, slightly elevated elements |
| 3 | `--radius-xl` | 8 px | Modal-type containers |
| 4 | `--radius-full` | 12 px | Pills, avatars |

The design deliberately avoids large rounded corners. Default is Level 1; reach for higher only when softening matters.

### Spacing & layout

- **Page width.** Content pages wrapped in `max-w-4xl mx-auto` for a consistent column.
- **Vertical rhythm.** `space-y-5` for stacked sections; `gap-4` / `gap-8` for grid gaps.
- **Asymmetric hero rows.** When the page has a feature row, prefer ratios like `grid-cols-5` split as `col-span-3` + `col-span-2`, or 8+4 — not uniform 6+6. Repeating content cards (StatTile, HokeiCard) use uniform grids; that's fine.
- **Sidebar.** Fixed left, ~`w-60`. Content area offset with `ml-60`. Background is `bg-slate-300` (light neutral — sits visually behind content).
- **"Ma" rule.** When a section feels crowded, prioritise whitespace over dividers.

### Sidebar specifics

- Logo: `text-primary font-headline font-extrabold text-xl tracking-tight`
- Active nav item: `bg-primary text-white rounded-sm`
- Inactive nav item: `text-on-surface-variant hover:bg-surface-container`
- Bottom section: Settings + Support links, small `text-[10px]` labels

---

## 5. Surfaces & Elevation

Depth is achieved through **tonal layering** rather than drop shadows. Treat the UI as physical layers of fine paper — contrast in brightness creates "lift" without visual clutter.

### Layering principle

1. **Base layer:** `surface` / `background` for the page itself.
2. **Elevated content:** `surface-container-low` and friends — separation through tonal lift, not shadow.
3. **Sunken content:** Sidebar (`bg-slate-300`) and search-bar-style utilities use deeper neutral tints.
4. **Dark accent surfaces:** `primary-container` (GradeCard) and `tertiary-container` (JissenCard) for high-contrast moments.

### Borders & dividers — when, when not

The hard rule "no 1 px borders ever" was rejected during reconciliation because the codebase does use accent borders (`border-l-2 border-primary` on hover, `border-b` between list rows) and they read as ornament, not section division. Working rules:

- **For section boundaries:** prefer background-color shifts (tonal lift between containers) and whitespace. Don't reach for `border` first.
- **For accents and ornament:** thin borders are permitted — `border-l-2 border-primary/20` (SenseiNote), `border-l-2 border-primary` (HokeiCard hover), per-row `border-b` for list dividers.
- **Accessibility fallback:** if a real border is needed for clarity, use `outline-variant` at low opacity as a "ghost border".
- **Never:** an opaque 1 px outline drawn around a card to "hold it together". That kills the editorial feel.

### Shadows

Avoid dropshadows by default. When a floating element genuinely requires elevation:

- Use an extra-diffused shadow tinted with the primary neutral, never pure black.
- Reserve shadows for things actually floating over content — popovers, tooltips. Static cards don't need them.

---

## 6. Effects (opt-in)

Two effects are documented as available but not currently in production. They land when a specific use case justifies them — don't apply broadly.

### Taido Gradient

For primary CTAs or hero backgrounds: a subtle linear gradient transitioning from `primary` to `primary-container`. Treats the dark surface like a developed photo print rather than a flat solid. Currently unused in the live UI.

### Glassmorphism

Reserved for floating navigation, dropdowns, or full-screen overlays:

```css
background: color-mix(in srgb, var(--color-surface) 80%, transparent);
backdrop-filter: blur(24px);
```

Maintains the "Motion" feel without losing legibility. Currently unused; would be appropriate for a future floating quick-action menu or impersonation banner.

### Kinetic imagery

When using photographic imagery (athletic action, etc.), images don't have to be perfectly rectangular — image masks and subjects "breaking" the container can add depth. The current Requirements page uses a simple gradient overlay on a karate photo; this rule allows future hero treatments to be more sculpted. Don't retroactively force this on every existing image.

---

## 7. Icons

All icons use **Lucide** via `lucide-react`. Icons are React components, not glyph fonts — import per icon and size with the `size` prop (defaults to 24 px, matching Material Symbols' default optical size). Stroke width defaults to 2; nudge to 1.5 for small UI (badges, inline indicators) when it feels too heavy.

```tsx
import { LayoutDashboard } from 'lucide-react';
<LayoutDashboard className="size-4" aria-hidden />
```

Pair Lucide with the surrounding text colour (`text-on-surface`, `text-primary`, etc.) rather than fixed greys. For decorative icons set `aria-hidden`; for icon-only buttons provide an `aria-label`.

### Target icon set (component → Lucide name)

Where a martial-art-specific Material Symbol had no direct Lucide analogue, the table picks the closest neutral equivalent so the abstraction stays readable.

| Location | Lucide component |
|---|---|
| Sidebar nav — Dashboard | `LayoutDashboard` |
| Sidebar nav — Historik | `History` |
| Sidebar nav — Krav (Requirements) | `Award` |
| Sidebar nav — Profil | `User` |
| Sidebar nav — Behörigheter | `ShieldCheck` |
| Sidebar nav — Tekniker / Kihon section | `Dumbbell` |
| Hokei section + general session type | `Activity` |
| Jissen section + session type | `Swords` |
| Kobo section | `Swords` |
| Teknik section | `Accessibility` |
| Unsoku section | `Footprints` |
| Progress card | `TrendingUp` |
| GradeCard background decoration | `Trophy` |
| ExamCountdownCard — date | `CalendarDays` |
| ExamCountdownCard — dojo | `MapPin` |
| ExamCountdownCard — time | `Clock` |
| RecentWorkouts empty state | `Activity` |
| SleepCard | `Moon` (sleeping), `Bed` (logged session) |
| Sleep quality scale | `Frown` → `Meh` → `Smile` |
| HokeiCard | `PlayCircle` |
| TechniqueRow completion | `CheckSquare` (done) / `Square` (todo) |
| LoadingSpinner (animated) | `Loader2` with `animate-spin` |

---

## 8. Components

The frontend follows Feature-Sliced Design ([`apps/frontend/src/`](apps/frontend/src/) — `entities/`, `features/`, `widgets/`, `pages/`, `shared/`). Paths below are target slot locations; the existing `AppSidebar` widget at [`apps/frontend/src/widgets/appsidebar/`](apps/frontend/src/widgets/appsidebar/) is the closest implemented analogue of the `Sidebar` row.

### Layout
| Component | Target slot |
|---|---|
| `Sidebar` | `apps/frontend/src/widgets/sidebar/` |

### Shared
| Component | Target slot | Props | Description |
|---|---|---|---|
| `LoadingSpinner` | `apps/frontend/src/shared/ui/` | — | Centered animated `Loader2` (Lucide) with `animate-spin` |
| `ProtectedRoute` | `apps/frontend/src/shared/ui/` | `children`, `requiredPermission?` | Auth guard, redirects to `/login` or `/dashboard` |

### Dashboard (target slot: `apps/frontend/src/widgets/dashboard-*/`)
| Component | Key Props |
|---|---|
| `GreetingHeader` | `greeting`, `dateLabel`, `rank` |
| `GradeCard` | `rank`, `daysAtGrade`, `certifiedAt` |
| `ExamCountdownCard` | `examDate`, `countdown`, `dojo`, `timeStart`, `timeEnd` |
| `StatTile` | `label`, `value`, `sub?` |
| `ActivityChart` | `days` (ISO strings[]), `minutes` (number[]) |
| `SleepCard` | `sleep` (object or null) |
| `RecentWorkouts` | `sessions` (array) |
| `SessionRow` | `icon`, `title`, `instructor`, `duration`, `date`, `status`, `statusMuted` |
| `SenseiNote` | `note` (object or null) |

### Requirements cards (target slot: `apps/frontend/src/widgets/requirements-*/`)
| Component | Key Props |
|---|---|
| `ProgressCard` | `percent`, `mastered`, `total` |
| `RequirementSection` | `number`, `title`, `subtitle`, `icon`, `children` |
| `TechniqueRow` | `japanese`, `romaji`, `completed` |
| `HokeiCard` | `japanese`, `romaji`, `description`, `completed` |
| `JissenCard` | `japanese`, `romaji`, `description`, `tag`, `maxProficiency`, `proficiencyLevel` |

### Component patterns

**Buttons.**
- *Primary:* solid `bg-primary text-white rounded-sm` (Level 1, 2 px). Used for "Logga in", "Lägg till teknik", main CTAs.
- *Secondary:* warm chip on `secondary-container` for status-style chips, never primary actions.
- *Tertiary / ghost:* primary text with hover underline; no fill, no border. Used for "Se alla" links.

**Cards & containers.** Tonal surface variations with Level 1 (2 px) radius. Section separation via vertical gaps and weight-driven typographic hierarchy, not outlines.

**Input fields.** `bg-surface-variant rounded-sm` background, focus ring in primary color. Underline-only style is also acceptable for in-flow form fields — pick one shape per page.

---

## 9. Page Inventory

### 9.1 Login (`/login`)

**Layout:** Split two-column full-viewport.

- **Left panel (1/2 width):** Dark hero, `bg-primary`. Contains:
  - White logo text top-left
  - Centered Japanese quote in italic serif (`精神一到何事か成らざらん`) with English translation
  - Attribution text in small uppercase tracking — "Gichin Funakoshi"
  - Decorative horizontal rule above quote
- **Right panel (1/2 width):** White form area, vertically centered:
  - Heading "Välkommen tillbaka" + subtext
  - Email input + Password input — `bg-surface-variant rounded-sm`, focus ring in primary
  - "Logga in" primary button — full width, `bg-primary text-white`
  - Error text in `text-error`
  - Loading state disables button

### 9.2 Dashboard (`/dashboard`)

**Layout:** `max-w-4xl mx-auto space-y-5`.

1. **GreetingHeader.** Left: time-based greeting in large bold headline + Swedish date label. Right: belt color dot (per rank) + rank level text in `text-[10px] uppercase`.
2. **Grade + Exam row** — `grid grid-cols-1 sm:grid-cols-5 gap-4` (asymmetric 3 + 2):
   - **GradeCard** (`col-span-3`): Dark `bg-primary-container text-white`. Japanese rank name large, days at grade, certification date. Faint `award_star` icon as background decoration.
   - **ExamCountdownCard** (`col-span-2`): Lighter card. Countdown number + "dagar" label, exam date, dojo city, time range. Empty state if no exam booked.
3. **Stat tiles row** — `grid grid-cols-3 gap-3` (uniform). Three **StatTile** components: "Pass totalt", "Denna månad", "Denna vecka". Each: large `text-primary font-headline` number, small muted label below, optional `sub` line.
4. **Activity + Sleep row** — `grid grid-cols-1 sm:grid-cols-2 gap-4`:
   - **ActivityChart:** 7 vertical bars (last 7 days), today's bar in `bg-primary`, others in `bg-surface-container-high`. Day labels below in `text-[10px]`. Title "Aktivitet den senaste veckan".
   - **SleepCard:** hours (large number + "tim"), quality badge (icon + label), log date. Empty state with `bedtime` icon.
5. **RecentWorkouts.** Section heading + "Se alla" link. List of **SessionRow** (icon avatar, title, instructor, duration, date, status badge). Empty state with `sports_martial_arts` icon.
6. **SenseiNote.** Separator line above. Author avatar + name + date. Quote block in `bg-surface-container-lowest italic border-l-2 border-primary/20` with curly quote marks.

### 9.3 Requirements (`/requirements`)

**Layout:** `max-w-4xl mx-auto`.

**Hero section** (`mb-16`, flex row on `md+`):
- Left: Eyebrow chip ("Mastery Level SHODAN") in `bg-primary text-white text-[10px]`; large Japanese heading 初段 with smaller subtitle "Svart bälte"; descriptive paragraph in muted text.
- Right: **ProgressCard** — completion percentage, mastered/total count.

**Sections grid** (`grid grid-cols-1 md:grid-cols-12`):

| Section | Grid | Background | Content |
|---|---|---|---|
| 01 Kihon | col-span-8 | `bg-surface-container-low` | Two-column list of **TechniqueRow** |
| Quote image | col-span-4 | Background photo (karate) | Overlay gradient from primary; Japanese quote; attribution |
| 02 Hokei | col-span-12 | `bg-surface-container-low` | 3-col grid of **HokeiCard** |
| 03 Jissen | col-span-12 | `bg-surface-container-low` | 2-col grid of **JissenCard** |
| 04 Kobo | col-span-12 | `bg-surface-container-low` | 2-col grid of **JissenCard** |
| 05 Teknik | col-span-12 | `bg-surface-container-low` | Two-column **TechniqueRow** list |
| 06 Unsoku | col-span-12 | `bg-surface-container-low` | Two-column **TechniqueRow** list |

**`RequirementSection` header pattern.** Large decorative section number (`text-6xl font-extrabold opacity-5`); Japanese title + romaji subtitle side by side; Material icon on right.

**`TechniqueRow`.** Checkbox icon (filled if completed, outline if not); Japanese name (`font-medium`) + romaji below (`text-xs text-on-surface-variant`); bottom border divider.

**`HokeiCard`.** `play_circle` icon top-right; Japanese name bold; romaji in muted small text; description paragraph; left border accent on hover (`border-l-2 border-primary`); slightly different opacity treatment when completed.

**`JissenCard` (used for Jissen + Kobo).** Dark background (`bg-tertiary-container` or similar); white text; tag badge top-right (`text-[9px] uppercase tracking-widest border border-white/20 px-2 py-0.5`); Japanese name bold; description in smaller muted text; three-dot proficiency indicator at bottom (filled dots up to `proficiency_level`).

### 9.4 Admin — Permissions (`/admin/permissions`)

**Layout:** standard page width.

- Page heading + subtitle.
- **Stats grid** (4 tiles): counts per permission level.
- **User list** grouped by permission level:
  - Section heading with permission label + user count badge.
  - Each row: avatar circle (initials), name + email, permission select dropdown, save indicator.
  - Current user row has self-change protection.
- Permission dropdown options: Standard User → Administrator (5 levels).
- Save indicators: checkmark (saved), spinner (saving), nothing (unchanged).

### 9.5 Admin — Techniques (`/admin/techniques`)

**Layout:** standard page width.

- Page heading + "Lägg till teknik" button (primary).
- **Filter tabs** (horizontal scroll): All, Kihon, Hokei, Jissen, Kobo, Teknik, Unsoku — each with count badge.
- **Technique list:**
  - Each row: Name (Japanese + romaji + Swedish), Type badge, Rank level, Tai category, Attack type.
  - Type badge color-coded by type.
  - Edit link per row → `/admin/techniques/:id/edit`.

### 9.6 Admin — Technique Form (`/admin/techniques/new` and `/:id/edit`)

- Form fields: Type selector, Rank level, Japanese name, Romaji, Swedish name, English description, Swedish description.
- Conditional fields (only if type = kihon or technique):
  - **Tai (Sotai)** select: Sentai, Untai, Hentai, Nentai, Tentai.
  - **Attack type:** kick, punch, block, takedown.
- Save / Cancel buttons.

---

## 10. Belt Color Mapping

Used in `GreetingHeader` for the rank-dot indicator.

| Belt | CSS color |
|---|---|
| yellow | `#FFD700` |
| orange | `#FF8C00` |
| purple | `#800080` |
| green | `#228B22` |
| blue | `#1E3A8A` |
| brown | `#8B4513` |
| black | `#111827` |
| _(default)_ | `#9CA3AF` (gray) |

---

## 11. Navigation Structure

```
/login               — Public, redirects to /dashboard if authed
/dashboard           — All authenticated users
/history             — (stub)
/requirements        — All authenticated users
/profile             — (stub)
/admin/permissions   — All authenticated users (visible in sidebar)
/admin/techniques    — All authenticated users (visible in sidebar)
/admin/techniques/new
/admin/techniques/:id/edit
```

Sidebar nav order:

1. Dashboard (`LayoutDashboard`)
2. Historik (`History`)
3. Krav (`Award`)
4. Profil (`User`)
5. Behörigheter (`ShieldCheck`)
6. Tekniker (`Dumbbell`)

Bottom of sidebar: Settings, Support (smaller, muted).

---

## 12. Interaction Patterns

- **Hover states.** Most interactive elements use `hover:opacity-70` or `hover:bg-surface-container`. Cards with accent borders use `hover:border-l-2 border-primary` to add a kinetic edge cue.
- **Focus states.** Inputs show a primary-color ring on focus.
- **Image zoom.** The kanji quote image on Requirements uses `group-hover:scale-105 transition-transform duration-700` — slow, deliberate, not snappy.
- **Loading.** Full-page `LoadingSpinner` during data fetch; inline save indicators on Permissions rows.
- **Error state.** `<p className="text-error p-8">` message replaces page content on fetch failure.
- **Empty states.** Illustrated with a relevant Material icon + muted description (e.g., workouts, sleep). Match the icon to the entity, not a generic "no data".

---

## 13. Key Visual Patterns (snippets)

### Eyebrow chip
```
text-[10px] font-bold tracking-[0.2em] uppercase
bg-primary text-white
px-3 py-1 rounded-sm
```

### Section card
```
bg-surface-container-low p-6 lg:p-10 rounded-sm
```

### Dark primary card (GradeCard)
```
bg-primary-container text-white rounded-sm p-6
```

### Dark tertiary card (JissenCard)
```
bg-tertiary-container text-white rounded-sm p-5
```

### Decorative large number
```
text-6xl font-extrabold opacity-5 select-none
```

### Quote block (SenseiNote)
```
bg-surface-container-lowest p-5
italic text-sm text-on-surface leading-relaxed
border-l-2 border-primary/20
```

---

## 14. Do's and Don'ts (reconciled)

### Do
- **Embrace asymmetry on hero rows.** Align text left while letting decorative elements bleed off the edge. Use 3+2 / 8+4 over uniform halves.
- **Use "Ma" (intentional space).** If a section feels crowded, prioritise whitespace over dividers.
- **Tint your neutrals.** All grays and surfaces are tinted with the primary navy seed — never raw Tailwind grays.
- **Lead with tonal surface shifts.** When marking off a section, change the surface tone before reaching for a border.
- **Match icons to the domain.** Use the Lucide catalogue sparingly and consistently per the §7 table.

### Don't
- **No pure black.** Use the navy-tinted near-blacks (`#191c1d`, `#0f1112`) for text and dark surfaces.
- **No opaque outlines holding cards together.** A 1 px solid border around a content card is a smell — move to tonal lift instead. Accent borders (`border-l-2`) are fine.
- **No standard-grid laziness.** Generic 6+6 splits on hero rows feel templated. Use intentional sizing. (Repeating content cards may use uniform grids — this rule is about *hero* compositions.)
- **No drop shadows for stationary cards.** Static cards earn their depth through tone, not shadow. Reserve shadows for popovers / tooltips that genuinely float.
- **No large rounded corners.** The system caps at Level 4 (12 px) for pills and avatars; cards stay at Level 1–2.

---

## 15. Accessibility Notes

- The warm secondary palette has limited contrast against light backgrounds; use `secondary` for text only against `secondary-container`, not against `surface`.
- The error palette (`error` `#ba1a1a` on `error-container` `#ffdad6`) meets WCAG AA for body text.
- Focus rings use the primary color and must remain visible at all zoom levels.
- The "ghost border" `outline-variant` at low opacity is the accessibility fallback when a real border is needed (e.g., to disambiguate stacked cards on the same surface tone).
- Japanese passages set `lang="ja"` on the wrapping element so screen readers and font fallbacks behave correctly.

---

## 16. Glossary

- **Maai** (間合い) — *interval*, the intentional space between subject and ground; informs the "use whitespace before dividers" rule.
- **Stillness / Motion** — the two-pole framing for the brand voice: disciplined grid + bold typography.
- **Tonal layering** — depth through brightness contrast between surface containers, not drop shadows.
- **Ghost border** — a low-opacity `outline-variant` border used only as accessibility fallback; never the primary boundary cue.
- **Kinetic imagery** — photographic treatment where subjects are masked or break the container; opt-in for hero compositions.
