---
name: figma-to-frontend
description: Turn a Figma link into working frontend code with every state, even with VIEW-only access and no Figma API limits. First walks the user through running the local Figma MCP Bridge plugin, then reads the design through it (structure, exact values, tokens, icons, images, every state), reuses components that already exist in the codebase instead of rebuilding them, builds the page, and compares the result against the design screen by screen until it matches. Use whenever the user shares a figma.com link and wants it built ("اعمل الفرونت", "ابني الصفحة دي", "اعمل الصفحة دي بحالاتها", "implement this Figma"), or wants its assets/icons/images/tokens pulled ("هات الأسيتس", "طلّع الأيقونات"), says they only have view access, or Figma is rate-limiting — in any language.
---

# Figma → frontend (bridge first, reuse first, verified against the design)

`<skill dir>` below = the base directory shown when this skill loads (it holds `tools/`, `save-assets.mjs`, `figma-assets.mjs`).

Talk to the user in their language (usually Egyptian Arabic), short and simple — no jargon dumps. Code, identifiers and commits stay English.

The flow is always: **1 connect the plugin → 2 read the design → 3 inventory existing code → 4 build → 5 compare with the design → 6 report.** Don't stop after step 2 unless the user asked for assets only.

---

## 1. Connect the plugin (Figma MCP Bridge)

The bridge is a Figma plugin + local MCP server (`figma-bridge` tools). It reads the file straight from the Figma desktop app, so **no API, no quota, works on any plan**.

### 1a. Check the connection first
Load the tools with ToolSearch (`select:mcp__figma-bridge__list_files,mcp__figma-bridge__get_metadata,mcp__figma-bridge__get_design_context,mcp__figma-bridge__get_node,mcp__figma-bridge__save_screenshots,mcp__figma-bridge__get_variable_defs,mcp__figma-bridge__get_styles`), then:
- `list_files` → is the file (or a copy of it, e.g. "X (Copy)") listed?
- **Always confirm it's live** with `get_metadata`. `list_files` can show a stale entry after the plugin was closed. If you get "Unable to establish connection" or "Connection closed", the plugin isn't running.

If connected → go to step 2. If not → give the user the steps below, then wait for "اشتغل"/"done" and check again.

### 1b. Steps to give the user (copy this, adapted to their language)
> 1. افتح **Figma Desktop** (البلجن مش بيشتغل على فيجما المتصفح).
> 2. افتح لينك الفايل.
> 3. لو الفايل معاك **View بس**: من القايمة اختار **Duplicate to your drafts** وافتح النسخة (البلجنز مش بتشتغل على View).
>    لو معاك Edit أو Dev Mode على الفايل: كمّل على الفايل نفسه.
> 4. **Plugins → Development → Figma MCP Bridge** (أو ⌘⌥P لو كان آخر بلجن اشتغل).
> 5. سيب نافذة البلجن مفتوحة طول الشغل، وقولّي "اشتغل".

You cannot run the plugin yourself: driving the Figma desktop app needs macOS Accessibility permission, and you never change security settings. Don't try `osascript`/UI scripting.

### 1c. If the `figma-bridge` tools don't exist at all (first-time setup)
Tell the user, once:
This plugin ships the MCP server config (`.mcp.json`, `@gethopp/figma-mcp-bridge@0.0.24`). If the tools are missing, Node/npx isn't available or the plugin isn't enabled — ask the user to check `/plugin` and that `npx` works, then restart Claude.
The Figma side is imported once: Figma Desktop → **Plugins → Development → Import plugin from manifest** → `figma-plugin/manifest.json` from the shared package (or the release at https://github.com/gethopp/figma-mcp-bridge/releases). Then do 1b.

### 1d. Node ids in a copy
A duplicated file keeps a **different key** (the copy's link) and may have **different node ids**. Prefer the link to the copy. If the user gives the original link, find the frame in the copy by page/section/frame **name** (`get_metadata` lists pages; `get_design_context(depth: 3)` on the current page lists sections and frames).

---

## 2. Read the design

1. `get_metadata` → pages + current page. A link's `node-id` may be a **page**, a **section** or a **frame**.
2. `get_design_context(depth: 3)` on the current page → sections and frames (save to a file if it's large; read with python, not Read).
3. **List the screens and work out the states.** Order frames by x position (RTL files flow right→left). Near-identical frames are **states of one page** (hover, focus, open dropdown, selected filter, collapsed menu, profile menu, empty, loading skeleton, error banners, permission variants). Separate sections like "Error screens" are their own pages. Build one page with all its states, not one page per frame.
4. **Screenshots of every frame** in one batch: `save_screenshots(items, scale: 1)` → `figma-export/<page>/screens/NN-name.png` (`outputPath` must be inside the working directory). Look at all of them (`sips -Z 900` thumbnails) before building.
5. **Exact values:** `get_node(<frame>)` returns ~900 KB JSON (saved to a tool-results file). Copy it out, then:
   - `python3 -I <skill dir>/tools/figma-tree.py <node.json> <depth>`: tree with size/position, fills, strokes, radius, auto-layout (direction/gap/align), padding, shadows, text styles.
   - `python3 -I <skill dir>/tools/figma-subtree.py <node.json> <nodeId> <depth>`: one subtree.
   - To find what a state adds (menus, dropdown panels, toasts), diff its node ids/names against the default frame's.
   - Shadow opacity isn't in the summary; read `styles.effects` for that node in python.
6. **Tokens:** `get_variable_defs` / `get_styles` → CSS variables.
7. **Assets** (one `save_screenshots` batch each):
   - Icons → `format: "SVG"` per icon instance (take one id per unique icon name). Then normalise `fill/stroke="#…"` → `currentColor` and drop width/height so hover/active colors work from CSS. Keep multicolor art (logos, checkbox) as-is.
   - Illustrations, background art, decorative glows → `format: "PNG", scale: 2`.
   - If `get_node` fails on a frame ("Unknown node type"), use `save_screenshots` / `get_design_context` on the same id.

---

## 3. Inventory existing code (reuse before building)

Never build something that already exists in the project. Do this **before** writing any component.

1. If it's an existing project, run the inventory when available: `bash ~/.claude/skills/ui-front-shared/inventory.sh "$PWD"`. Otherwise, list shared UI dirs (`src/shared/ui`, `src/components`, `components/ui`, `src/ui`) and their exports.
2. Read the project's conventions if present: `CLAUDE.md`, `docs/REFERENCE_PATTERNS.md`, `components.json`, the global CSS / theme tokens, and the icon/image barrels.
3. For **every part of the design**, search by **role**, not just by name: sidebar/nav, header, stat card, select/multi-select, search input, checkbox, dropdown menu, toast/alert, empty state, error page, skeleton, chart, modal, table. For example: `grep -rliE 'sidebar|nav-item' src --include='*.tsx'`. Also look for a **sibling screen** with the same layout. Copying its structure beats building from Figma.
4. Decide per part, internally:

| Design part | Decision |
|---|---|
| identical to an existing component | **reuse** (import it) |
| same thing, differs in a detail (padding, color, an extra icon) | **ask**: modify shared · add a backward-compatible prop/variant · `className` override at the usage site · new component (say how many places use it: `grep -rl Name src \| wc -l`) |
| a sibling screen has the same layout | **copy that file's pattern** |
| nothing similar exists | build new from the project's primitives, in its folder conventions |
| design token has no exact project token but is close (`#1F5FA0` vs `--primary #1E5E9F`) | **ask** whether it's the token or a new color |

Batch all questions in one `AskUserQuestion`. Don't ask what the design or the code already answers.

Also reuse within this run: e.g. if the login page already has a focus-underline input, the new dropdown uses the same pattern and tokens.

---

## 4. Build

- **Where:** inside the user's project when there is one (move the session there with `change_directory` first). A new standalone app → Vite + React + TypeScript, plain CSS with tokens as CSS variables, `dir="rtl"` for Arabic, fonts from Google Fonts. Ask once if it's unclear.
- **Values:** project token / CSS var first → framework scale only when the px matches exactly → arbitrary value. Never round a Figma value to fit a scale. Use logical properties for RTL (`inset-inline-*`, `padding-inline`, `ps-/pe-`, `text-start`).
- **Every state from step 2 must be reachable**, through real behavior wherever possible: hover/focus/open/selected are real UI states. Empty, loading, error, offline and permission variants are driven by data or props, with a **dev-only state switcher** (route params like `?state=empty`, `?actions=1`) so each one can be reviewed and screenshotted. Never ship the switcher in production builds (`import.meta.env.DEV`).
- Mock data must reproduce the numbers shown in the design (including filtered states) so the comparison is 1:1. If the design itself is inconsistent (e.g. a % that doesn't match its own numbers), compute it correctly and say so.
- Keep behavior sane: close menus on outside-click/Escape, keyboard focus styles, `aria-*` on menus/listboxes/alerts.

---

## 5. Compare with the design (don't skip this)

1. Render each state at the design's frame size with headless Chrome. If the app needs a login, add a **dev-only** bypass (e.g. `?user=admin`):
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,1024 --virtual-time-budget=5000 --screenshot=out.png "http://localhost:5173/?user=admin#/home?state=empty"
   ```
2. Compare against `screens/*.png` at the same scale (`sips -Z 900` on both). Then crop the same region from both (`sips -c H W --cropOffset Y X`) for details: chart angles and thickness, icon direction, spacing between rows, text wrapping.
3. Fix and repeat until positions, sizes, colors and text match. Typical misses:
   - element order flipped in RTL
   - a gap applied to the wrong level (e.g. 32 vs 20 between rows)
   - a frame height that's larger than its text (use the frame's size)
   - an icon that's already rotated in the export
4. Drive the interactions in the browser (`mcp__Claude_Browser__*` + `javascript_tool`) and assert results: dropdown select/search/clear changes the numbers, menus open and close, collapse persists, tooltips, validation messages.
5. Run the project's checks (`tsc`, `lint`, `build`).

---

## 6. Report (short)

- What was built and how to run it.
- Which states are covered and how to view each one (dev switcher / URLs).
- What was **reused** (paths), what's **new**, and anything **changed in shared code** (only if the user approved it).
- Anything approximated or not in the design, in one line each.
- Send a screenshot of the main screen with `SendUserFile`.

---

## Fallbacks (only when the bridge can't be used)

- **Figma MCP (connected account):** `get_metadata`, `get_screenshot`, `download_assets`, `get_variable_defs`. It's **quota-limited** by the seat on the file's plan: View/Collab/Starter ≈ 20 calls/month; Full/Dev on Pro ≈ 200/day. Plan calls. Download asset URLs immediately with `node <skill dir>/save-assets.mjs <outDir> <list.json>` (dedupes by hash). Its SVG exports include canvas junk (a `#242424` rect, huge ±10000 paths), so strip it.
- **REST token:** `node <skill dir>/figma-assets.mjs "<link>" --out <dir>` with a personal token in `~/.config/figma-assets/token`. The user saves the token themselves, never in chat. It's also seat-limited.
- **Owner blocked copy/export for viewers:** no route works by design. Ask the owner for access, and never try to bypass it.
