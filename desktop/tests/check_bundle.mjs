#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(desktop, "dist");
const html = readFileSync(resolve(dist, "index.html"), "utf8");
if (!html.includes("MyNotes Desktop") || /(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(html)) {
  throw new Error("Desktop entry must be the isolated MyNotes Desktop page with local assets only.");
}
const css = readdirSync(resolve(dist, "assets")).filter(name => name.endsWith(".css"))
  .map(name => readFileSync(resolve(dist, "assets", name), "utf8")).join("\n");
for (const required of [".inset-0{", "top:50%", "z-index:50", ".desktop-dashboard", ".type-choice"]) {
  if (!css.includes(required)) throw new Error(`Desktop bundle is missing required dialog/layout CSS: ${required}`);
}
if (/umami|manus-runtime|__MANUS__/i.test(html)) {
  throw new Error("Web analytics/debug injection must not enter the offline desktop HTML.");
}
console.log("Desktop bundle guard passed: isolated local entry and shared modal/layout styles.");
