#!/usr/bin/env node
// save-assets.mjs — download Figma MCP asset URLs into an export folder, deduped by content hash.
// Usage: node save-assets.mjs <outDir> <list.json>
// list.json: [{ "url": "...", "kind": "screens|images|icons", "name": "login-1" }, ...]
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const [outDir, listFile] = process.argv.slice(2);
const list = JSON.parse(await fs.readFile(listFile, "utf8"));
const indexFile = path.join(outDir, "manifest.json");
let manifest = { files: [] };
try { manifest = JSON.parse(await fs.readFile(indexFile, "utf8")); } catch {}
const hashes = new Map(manifest.files.map((f) => [f.hash, f]));

const sniff = (b) =>
  b[0] === 0x89 ? "png" : b[0] === 0xff ? "jpg" : b.slice(0, 4).toString() === "GIF8" ? "gif"
  : b.slice(8, 12).toString() === "WEBP" ? "webp" : b.slice(0, 300).toString().includes("<svg") ? "svg" : "bin";

let added = 0, dup = 0, failed = 0;
for (const item of list) {
  try {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
    if (hashes.has(hash)) { dup++; continue; }
    const ext = sniff(buf);
    const dir = path.join(outDir, item.kind);
    await fs.mkdir(dir, { recursive: true });
    let base = item.name || `${item.kind.replace(/s$/, "")}-${hash}`, name = `${base}.${ext}`, i = 2;
    while (manifest.files.some((f) => f.file === `${item.kind}/${name}`)) name = `${base}-${i++}.${ext}`;
    await fs.writeFile(path.join(dir, name), buf);
    const entry = { file: `${item.kind}/${name}`, hash, bytes: buf.length, ...(item.nodeId && { nodeId: item.nodeId }) };
    if (ext === "svg") {
      const m = buf.toString().match(/viewBox="[\d.\s-]+?\s([\d.]+)\s([\d.]+)"/);
      if (m) entry.size = `${Math.round(m[1])}x${Math.round(m[2])}`;
    }
    manifest.files.push(entry); hashes.set(hash, entry); added++;
  } catch (e) { failed++; console.warn(`! ${item.name || item.url}: ${e.message}`); }
}
await fs.writeFile(indexFile, JSON.stringify(manifest, null, 2));
console.log(`saved ${added} new, ${dup} duplicates skipped, ${failed} failed → ${outDir}`);
