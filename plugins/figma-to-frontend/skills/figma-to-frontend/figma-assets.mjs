#!/usr/bin/env node
// figma-assets.mjs — pull everything you need to build a frontend from a Figma link.
// Works with VIEW access only (no editor seat, no plugin, no Dev Mode).
//
// Usage:
//   FIGMA_TOKEN=figd_xxx node figma-assets.mjs "<figma link>" [--out ./figma-export] [--scale 2] [--icon-max 128]
//
// Output:
//   icons/*.svg        vector icons/logos (auto-detected + anything with export settings)
//   images/*           original raster images used as image fills (photos, illustrations)
//   components/*       every main component (SVG + PNG) — the file's component library
//   screens/*.png      screenshot of every top-level frame (reference for pixel matching)
//   tokens.json        colors, typography, shadows, radii, spacing (with usage counts + style names)
//   tokens.css         the same as CSS variables
//   design.json        the full raw node tree (layout, auto-layout, sizes) for code generation
//   manifest.json      what was exported, node ids, sizes

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readFileSync } from "node:fs";

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const link = argv.find((a) => a.includes("figma.com"));
const TOKEN_FILE = path.join(os.homedir(), ".config", "figma-assets", "token");
const readTokenFile = () => { try { return readFileSync(TOKEN_FILE, "utf8").trim(); } catch { return undefined; } };
const TOKEN = flag("token", process.env.FIGMA_TOKEN || readTokenFile());
const SCALE = Number(flag("scale", 2));
const ICON_MAX = Number(flag("icon-max", 128));

if (!link || !TOKEN) {
  console.error(`Usage: FIGMA_TOKEN=figd_xxx node figma-assets.mjs "<figma link>" [--out dir] [--scale 2] [--icon-max 128]
Get a token: Figma → Settings → Security → Personal access tokens (scope: File content → Read).
Then save it once in ${TOKEN_FILE} (or set FIGMA_TOKEN).`);
  process.exit(link ? 2 : 1); // 2 = link given but no token
}

// ---------- parse link ----------
function parseLink(u) {
  const url = new URL(u);
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => ["file", "design", "proto", "board"].includes(p));
  if (i < 0) throw new Error("Not a Figma file link");
  let key = parts[i + 1];
  const b = parts.indexOf("branch");
  if (b >= 0) key = parts[b + 1];
  const nodeParam = url.searchParams.get("node-id") || url.searchParams.get("starting-point-node-id");
  const nodeId = nodeParam ? decodeURIComponent(nodeParam).replace("-", ":") : null;
  return { key, nodeId };
}
const { key: FILE_KEY, nodeId: NODE_ID } = parseLink(link);

// ---------- http ----------
const API = "https://api.figma.com/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(p, tries = 5) {
  const res = await fetch(API + p, { headers: { "X-Figma-Token": TOKEN } });
  if (res.status === 429 && tries > 0) {
    const wait = Number(res.headers.get("retry-after") || 30) * 1000;
    console.log(`  rate limited, waiting ${wait / 1000}s…`);
    await sleep(wait);
    return api(p, tries - 1);
  }
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403) throw new Error(`403 Forbidden — the token's account can't view this file (or the token is wrong).\n${body}`);
    if (res.status === 404) throw new Error(`404 — file not found. Check the link.\n${body}`);
    throw new Error(`${res.status} ${p}\n${body}`);
  }
  return res.json();
}

async function download(url, dest) {
  for (let t = 0; t < 3; t++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const buf = Buffer.from(await res.arrayBuffer());
      let file = dest;
      if (!path.extname(dest)) file = dest + sniffExt(buf, res.headers.get("content-type"));
      await fs.writeFile(file, buf);
      return path.basename(file);
    } catch (e) {
      if (t === 2) throw e;
      await sleep(1000 * (t + 1));
    }
  }
}

function sniffExt(buf, ct = "") {
  if (buf[0] === 0x89 && buf[1] === 0x50) return ".png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (buf.slice(0, 4).toString() === "GIF8") return ".gif";
  if (buf.slice(8, 12).toString() === "WEBP") return ".webp";
  if (ct.includes("svg") || buf.slice(0, 200).toString().includes("<svg")) return ".svg";
  return ".bin";
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ---------- helpers ----------
const slug = (s) =>
  (s || "node")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "node";

const hex2 = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
function colorToCss(c, opacity = 1) {
  const a = (c.a ?? 1) * opacity;
  const hex = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return a >= 0.999 ? hex : `${hex}${hex2(a)}`;
}

function gradientToCss(p) {
  const stops = (p.gradientStops || [])
    .map((s) => `${colorToCss(s.color, p.opacity ?? 1)} ${Math.round(s.position * 100)}%`)
    .join(", ");
  if (p.type === "GRADIENT_LINEAR" && p.gradientHandlePositions?.length >= 2) {
    const [a, b] = p.gradientHandlePositions;
    const deg = Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90);
    return `linear-gradient(${deg}deg, ${stops})`;
  }
  if (p.type === "GRADIENT_RADIAL") return `radial-gradient(${stops})`;
  return `conic-gradient(${stops})`;
}

const VECTORISH = new Set(["VECTOR", "BOOLEAN_OPERATION", "ELLIPSE", "RECTANGLE", "LINE", "STAR", "POLYGON", "REGULAR_POLYGON", "GROUP"]);
const CONTAINERS = new Set(["COMPONENT", "INSTANCE", "FRAME", "GROUP", "VECTOR", "BOOLEAN_OPERATION", "COMPONENT_SET"]);

function allVectorish(node) {
  if (node.visible === false) return true;
  if (node.type === "TEXT") return false;
  if ((node.fills || []).some((f) => f.type === "IMAGE")) return false;
  if (node.children) {
    return node.children.every((c) => VECTORISH.has(c.type) || c.type === "FRAME" || c.type === "INSTANCE" || c.type === "COMPONENT" ? allVectorish(c) : false);
  }
  return VECTORISH.has(node.type);
}

function looksLikeIcon(node) {
  if (!CONTAINERS.has(node.type)) return false;
  const bb = node.absoluteBoundingBox;
  const named = /icon|ic[_-]|logo|svg|arrow|chevron/i.test(node.name);
  const small = bb && bb.width <= ICON_MAX && bb.height <= ICON_MAX;
  if (!(small || named)) return false;
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") return true;
  return !!node.children?.length && allVectorish(node);
}

// ---------- main ----------
async function main() {
  console.log(`File ${FILE_KEY}${NODE_ID ? `  node ${NODE_ID}` : ""}`);

  // 1. fetch tree
  let fileName, roots, styles, components;
  if (NODE_ID) {
    const r = await api(`/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(NODE_ID)}`);
    fileName = r.name;
    const n = r.nodes[NODE_ID];
    if (!n) throw new Error(`Node ${NODE_ID} not found`);
    roots = [n.document];
    styles = n.styles || {};
    components = n.components || {};
  } else {
    const r = await api(`/files/${FILE_KEY}`);
    fileName = r.name;
    roots = r.document.children; // pages
    styles = r.styles || {};
    components = r.components || {};
  }

  const OUT = path.resolve(flag("out", path.join("figma-export", slug(fileName) + (NODE_ID ? "-" + NODE_ID.replace(":", "-") : ""))));
  for (const d of ["icons", "images", "screens", "components"]) await fs.mkdir(path.join(OUT, d), { recursive: true });
  await fs.writeFile(path.join(OUT, "design.json"), JSON.stringify({ fileName, fileKey: FILE_KEY, nodeId: NODE_ID, styles, components, roots }, null, 1));
  console.log(`✓ design tree → design.json`);

  // 2. walk
  const icons = new Map(); // dedupe key → {id, name}
  const exportNodes = []; // nodes with designer-defined export settings
  const imageRefs = new Map(); // imageRef → node name
  const screens = [];
  const colors = new Map();
  const gradients = new Map();
  const typography = new Map();
  const shadows = new Map();
  const radii = new Map();
  const spacing = new Map();
  const fonts = new Set();
  const bump = (m, k, extra) => {
    const v = m.get(k) || { count: 0, ...extra };
    v.count++;
    if (extra?.style && !v.style) v.style = extra.style;
    m.set(k, v);
  };
  const styleName = (node, kind) => styles[node.styles?.[kind]]?.name;

  // top-level frames = screens
  for (const r of roots) {
    const kids = r.type === "CANVAS" ? r.children : r.type === "SECTION" ? r.children : [r];
    for (const k of kids || []) if (k.visible !== false && ["FRAME", "COMPONENT", "COMPONENT_SET", "SECTION", "INSTANCE"].includes(k.type)) screens.push({ id: k.id, name: k.name });
  }

  function walk(node, insideIcon = false) {
    if (node.visible === false) return;

    if (node.exportSettings?.length) exportNodes.push(node);

    if (!insideIcon && looksLikeIcon(node)) {
      const compName = node.componentId && components[node.componentId]?.name;
      const k = node.componentId || node.id;
      if (!icons.has(k)) icons.set(k, { id: node.id, name: compName || node.name, w: node.absoluteBoundingBox?.width, h: node.absoluteBoundingBox?.height });
      insideIcon = true;
    }

    for (const f of node.fills || []) {
      if (f.visible === false) continue;
      if (f.type === "SOLID" && node.type !== "TEXT") bump(colors, colorToCss(f.color, f.opacity ?? 1), { style: styleName(node, "fill") || styleName(node, "fills") });
      if (f.type === "SOLID" && node.type === "TEXT") bump(colors, colorToCss(f.color, f.opacity ?? 1), { style: styleName(node, "fill") || styleName(node, "fills"), text: true });
      if (f.type?.startsWith("GRADIENT")) bump(gradients, gradientToCss(f), { style: styleName(node, "fill") });
      if (f.type === "IMAGE" && f.imageRef) imageRefs.set(f.imageRef, imageRefs.get(f.imageRef) || node.name);
    }
    for (const s of node.strokes || []) if (s.type === "SOLID" && s.visible !== false) bump(colors, colorToCss(s.color, s.opacity ?? 1), { style: styleName(node, "stroke") });

    if (node.type === "TEXT" && node.style) {
      const s = node.style;
      fonts.add(`${s.fontFamily} ${s.fontWeight}`);
      const lh = s.lineHeightUnit === "INTRINSIC_%" ? "normal" : s.lineHeightPx ? `${+s.lineHeightPx.toFixed(2)}px` : "normal";
      const k = `${s.fontFamily}|${s.fontWeight}|${s.fontSize}|${lh}|${+(s.letterSpacing || 0).toFixed(2)}`;
      bump(typography, k, {
        fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontSize: s.fontSize, lineHeight: lh,
        letterSpacing: +(s.letterSpacing || 0).toFixed(2), textCase: s.textCase, style: styleName(node, "text"),
        sample: (node.characters || "").slice(0, 40),
      });
    }

    for (const e of node.effects || []) {
      if (e.visible === false) continue;
      if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
        const css = `${e.type === "INNER_SHADOW" ? "inset " : ""}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread || 0}px ${colorToCss(e.color)}`;
        bump(shadows, css, { style: styleName(node, "effect") });
      }
      if (e.type === "BACKGROUND_BLUR" || e.type === "LAYER_BLUR") bump(shadows, `${e.type.toLowerCase()}(${e.radius}px)`, {});
    }

    if (node.cornerRadius) bump(radii, node.cornerRadius);
    if (node.rectangleCornerRadii && new Set(node.rectangleCornerRadii).size > 1) bump(radii, node.rectangleCornerRadii.join(" "));
    if (node.layoutMode && node.layoutMode !== "NONE") {
      if (node.itemSpacing) bump(spacing, node.itemSpacing);
      for (const p of ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"]) if (node[p]) bump(spacing, node[p]);
    }

    for (const c of node.children || []) walk(c, insideIcon);
  }
  roots.forEach((r) => walk(r));

  console.log(`  found ${icons.size} icons, ${exportNodes.length} nodes with export settings, ${imageRefs.size} images, ${screens.length} screens`);

  // 3. render nodes via images API
  let exportBlocked = false;
  async function render(nodes, format, scale, dir) {
    const results = [];
    const used = new Set();
    for (const batch of chunk(nodes, format === "svg" ? 40 : 10)) {
      const ids = batch.map((n) => n.id).join(",");
      let r;
      try {
        r = await api(`/images/${FILE_KEY}?ids=${encodeURIComponent(ids)}&format=${format}${format === "svg" ? "&svg_outline_text=true&svg_include_id=false&svg_simplify_stroke=true" : `&scale=${scale}`}`);
      } catch (e) {
        console.warn(`  ! render batch failed: ${e.message.split("\n")[0]}`);
        continue;
      }
      if (r.err) {
        console.warn(`  ! ${r.err}`);
        if (/export|permission|forbidden/i.test(r.err)) exportBlocked = true;
      }
      await pool(batch, 6, async (n) => {
        const url = r.images?.[n.id];
        if (!url) return;
        let base = slug(n.name);
        let name = base, i = 2;
        while (used.has(name)) name = `${base}-${i++}`;
        used.add(name);
        const suffix = n.suffix || "";
        const file = await download(url, path.join(OUT, dir, `${name}${suffix}.${format}`)).catch(() => null);
        if (file) results.push({ ...n, file: `${dir}/${file}` });
      });
    }
    return results;
  }

  console.log("→ exporting icons as SVG…");
  const iconFiles = await render([...icons.values()], "svg", 1, "icons");

  console.log("→ exporting designer export settings…");
  const exportFiles = [];
  for (const n of exportNodes) {
    for (const s of n.exportSettings) {
      const fmt = s.format.toLowerCase();
      const scale = s.constraint?.type === "SCALE" ? s.constraint.value : 1;
      const out = await render([{ id: n.id, name: n.name, suffix: s.suffix || (fmt !== "svg" && scale !== 1 ? `@${scale}x` : "") }], fmt === "jpg" ? "jpg" : fmt, scale, "icons");
      exportFiles.push(...out);
    }
  }

  console.log("→ downloading original images…");
  const imageFiles = [];
  if (imageRefs.size) {
    const r = await api(`/files/${FILE_KEY}/images`);
    const map = r.meta?.images || {};
    const used = new Set();
    await pool([...imageRefs], 6, async ([ref, nodeName]) => {
      if (!map[ref]) return;
      let name = slug(nodeName), i = 2;
      while (used.has(name)) name = `${slug(nodeName)}-${i++}`;
      used.add(name);
      const file = await download(map[ref], path.join(OUT, "images", name)).catch(() => null);
      if (file) imageFiles.push({ imageRef: ref, file: `images/${file}`, usedBy: nodeName });
    });
  }

  // main components defined in the scope (not instances), as SVG + PNG — the component library
  const mainComponents = [];
  (function findComponents(n) {
    if (n.visible === false) return;
    if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") {
      mainComponents.push({ id: n.id, name: n.name });
      return;
    }
    (n.children || []).forEach(findComponents);
  })({ children: roots });
  console.log(`→ exporting ${mainComponents.length} main components…`);
  const componentFiles = [
    ...(await render(mainComponents, "svg", 1, "components")),
    ...(await render(mainComponents, "png", SCALE, "components")),
  ];

  console.log(`→ rendering screens @${SCALE}x…`);
  const screenFiles = await render(screens, "png", SCALE, "screens");

  // 4. tokens
  const sortByCount = (m) => [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  const tokens = {
    colors: sortByCount(colors).map(([value, v]) => ({ value, count: v.count, style: v.style, usedOnText: !!v.text })),
    gradients: sortByCount(gradients).map(([value, v]) => ({ value, count: v.count, style: v.style })),
    typography: sortByCount(typography).map(([, v]) => v),
    shadows: sortByCount(shadows).map(([value, v]) => ({ value, count: v.count, style: v.style })),
    radii: sortByCount(radii).map(([value, v]) => ({ value: isNaN(value) ? value : `${value}px`, count: v.count })),
    spacing: sortByCount(spacing).map(([value, v]) => ({ value: `${value}px`, count: v.count })).sort((a, b) => parseFloat(a.value) - parseFloat(b.value)),
    fonts: [...fonts].sort(),
  };
  await fs.writeFile(path.join(OUT, "tokens.json"), JSON.stringify(tokens, null, 2));

  const v = (prefix, list, val, nameOf) => list.map((t, i) => `  --${prefix}-${nameOf?.(t) ? slug(nameOf(t)) : i + 1}: ${val(t)};`).join("\n");
  const css = `/* generated from Figma: ${fileName} */
:root {
  /* colors (most used first) */
${v("color", tokens.colors, (t) => t.value, (t) => t.style)}
${tokens.gradients.length ? "\n  /* gradients */\n" + v("gradient", tokens.gradients, (t) => t.value, (t) => t.style) : ""}

  /* shadows */
${v("shadow", tokens.shadows.filter((t) => !t.value.includes("blur(")), (t) => t.value, (t) => t.style)}

  /* radii */
${v("radius", tokens.radii, (t) => t.value.split(" ").length > 1 ? t.value.split(" ").map((x) => x + "px").join(" ") : t.value)}

  /* spacing */
${v("space", tokens.spacing, (t) => t.value)}
}

/* typography */
${tokens.typography.map((t, i) => `.text-${t.style ? slug(t.style) : i + 1} { font-family: "${t.fontFamily}"; font-weight: ${t.fontWeight}; font-size: ${t.fontSize}px; line-height: ${t.lineHeight}; letter-spacing: ${t.letterSpacing}px;${t.textCase === "UPPER" ? " text-transform: uppercase;" : ""} } /* ×${t.count} "${(t.sample || "").replace(/\*\//g, "").replace(/\n/g, " ")}" */`).join("\n")}
`;
  await fs.writeFile(path.join(OUT, "tokens.css"), css);

  await fs.writeFile(
    path.join(OUT, "manifest.json"),
    JSON.stringify({ fileName, fileKey: FILE_KEY, nodeId: NODE_ID, link, exportedAt: new Date().toISOString(), icons: iconFiles, designerExports: exportFiles, components: componentFiles, exportBlocked, images: imageFiles, screens: screenFiles, fonts: tokens.fonts }, null, 2)
  );

  console.log(`
✓ Done → ${OUT}
  icons:   ${iconFiles.length} SVG  (+${exportFiles.length} from export settings)
  images:  ${imageFiles.length}
  components: ${componentFiles.length} files (${mainComponents.length} components)
  screens: ${screenFiles.length}
  tokens:  ${tokens.colors.length} colors, ${tokens.typography.length} text styles, ${tokens.shadows.length} shadows, ${tokens.radii.length} radii
  fonts:   ${tokens.fonts.join(", ") || "-"}`);
  if (exportBlocked) console.log("\n⚠ EXPORT_BLOCKED: the file owner disabled export for viewers. Tree + tokens + original images are still available; rendered SVG/PNG may be missing.");
}

main().catch((e) => {
  console.error("✗ " + e.message);
  process.exit(1);
});
