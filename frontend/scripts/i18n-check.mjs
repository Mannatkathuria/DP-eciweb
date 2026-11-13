// Lists interface text that a language's phrase catalogue does not cover.
//
//   node scripts/i18n-check.mjs                 coverage for every language
//   node scripts/i18n-check.mjs hi              coverage for Hindi, with the missing phrases
//   node scripts/i18n-check.mjs --json out.json every English phrase found, with the files using it
//
// It reads every .js/.jsx file under src/ and collects text that reaches the screen: JSX text,
// user-facing attributes (placeholder, title, aria-label, label, hint, ...), string literals in
// data such as config/roles.js, the first argument of tr("..."), and the values of
// src/locales/en/translation.json. Identifiers, paths, class names and API addresses are skipped.
// The parser is the one Vite already ships (rolldown), so no extra dependency is needed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAst } from "rolldown/parseAst";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "src");
const locales = path.join(src, "locales");

const SKIP_ATTRS = new Set(["className", "to", "href", "id", "htmlFor", "key", "type", "name", "value", "role", "autoComplete",
  "inputMode", "pattern", "accept", "src", "target", "rel", "method", "lang", "style", "fill", "stroke", "d", "viewBox", "xmlns",
  "transform", "points", "width", "height", "data-testid", "capture", "step", "min", "max", "dir", "tabIndex", "encType", "path",
  "variant", "size", "tone", "kind", "field", "mode", "translate", "icon", "status", "form", "aria-controls", "aria-labelledby",
  "aria-describedby", "aria-current", "aria-live"]);
const SKIP_CALLS = /^(get|post|put|patch|delete|includes|startsWith|endsWith|getItem|setItem|removeItem|querySelector|querySelectorAll|getElementById|addEventListener|removeEventListener|t|split|replace|replaceAll|join|toggle|add|remove|has|on|off|emit|navigate|require|import|matchMedia|setProperty|getAttribute|setAttribute|hasAttribute|createElement|fetch|open|indexOf|padStart|padEnd|toLocaleString|toLocaleDateString|toLocaleTimeString|Error|TypeError|log|warn|error|info|debug|test|match|localeCompare|set|append|delete|useSearchParams|get|Intl|DateTimeFormat|NumberFormat|RegExp|encodeURIComponent|startTransaction|table|where|equals|anyOf|keys|toString|clearTimeout)$/;

export const looksLikeText = (raw) => {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 2 || !/[A-Za-z]{2}/.test(s)) return false;
  if (/^[a-z0-9_.\-/:#?=&@*]+$/.test(s)) return false;            // identifiers, keys, paths
  if (/^(\/|\.\/|https?:|mailto:|tel:|data:|blob:)/.test(s)) return false;
  if (/^[A-Z0-9_:\-]+$/.test(s)) return false;                     // CONSTANTS, codes
  if (/^[a-z][a-zA-Z0-9]*$/.test(s)) return false;                 // camelCase
  if (/^[a-z-]+( [a-z0-9-]+)+$/.test(s) && /\b(btn|chip|alert|panel|row|field|grid|muted|badge|section|container|stack|f6|is|desk|nav|menu)[-\w]*/.test(s)) return false; // class lists
  if (/^(image|application|text|video|audio)\/[\w.+-]+/.test(s)) return false; // MIME types
  return true;
};

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "locales" ? [] : files(p);
    return /\.(jsx?|mjs)$/.test(e.name) ? [p] : [];
  });
}

const callee = (c) => (c?.type === "MemberExpression" ? c.property?.name ?? "" : c?.name ?? "");

export function collect() {
  const found = new Map();
  const add = (text, file) => {
    if (typeof text !== "string" || !looksLikeText(text)) return;
    // A leading "#" marks a numeric table column (desk kit's Table strips it before render).
    const k = text.replace(/\s+/g, " ").trim().replace(/^#(?=\S)/, "");
    if (!found.has(k)) found.set(k, new Set());
    found.get(k).add(path.relative(src, file).replaceAll("\\", "/"));
  };

  for (const file of files(src)) {
    const code = fs.readFileSync(file, "utf8");
    let ast;
    try { ast = parseAst(code, { lang: file.endsWith(".jsx") ? "jsx" : "js" }); } catch (e) { console.error(`Could not parse ${file}: ${e.message}`); continue; }
    const visit = (node, parent, parentKey) => {
      if (!node || typeof node.type !== "string") return;
      switch (node.type) {
        case "ImportDeclaration": case "ExportAllDeclaration": return;
        case "JSXText": add(node.value, file); break;
        case "JSXAttribute": {
          if (SKIP_ATTRS.has(node.name?.name)) return;
          break;
        }
        case "Literal": {
          if (typeof node.value !== "string") break;
          if (parent?.type === "Property" && parentKey === "key") break;
          if (parent?.type === "BinaryExpression" && /[=!]==?/.test(parent.operator)) break;
          if ((parent?.type === "CallExpression" || parent?.type === "NewExpression") && parentKey === "arguments") {
            const name = callee(parent.callee);
            if (name === "tr") { add(node.value, file); break; }
            if (SKIP_CALLS.test(name)) break;
          }
          if (parent?.type === "SwitchCase" || parent?.type === "MemberExpression") break;
          add(node.value, file);
          break;
        }
        case "TemplateLiteral": for (const q of node.quasis) add(q.value.cooked ?? "", file); break;
      }
      for (const [k, v] of Object.entries(node)) {
        if (k === "type" || k === "start" || k === "end") continue;
        if (Array.isArray(v)) v.forEach((c) => visit(c, node, k));
        else if (v && typeof v === "object") visit(v, node, k);
      }
    };
    visit(ast, null, null);
  }

  const en = JSON.parse(fs.readFileSync(path.join(locales, "en", "translation.json"), "utf8"));
  const walk = (o) => Object.values(o).forEach((v) => (typeof v === "object" ? walk(v) : add(v, path.join(locales, "en", "translation.json"))));
  walk(en);
  return found;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const found = collect();
  if (args[0] === "--json") {
    const out = [...found].map(([s, f]) => ({ s, files: [...f] }));
    fs.writeFileSync(args[1], JSON.stringify(out, null, 1));
    console.log(`${out.length} phrases written to ${args[1]}`);
  } else {
    const langs = args.length ? args : fs.readdirSync(locales).filter((d) => fs.existsSync(path.join(locales, d, "ui.json")));
    for (const lang of langs) {
      const cat = JSON.parse(fs.readFileSync(path.join(locales, lang, "ui.json"), "utf8"));
      const missing = [...found.keys()].filter((k) => !cat[k]);
      console.log(`${lang}: ${found.size - missing.length}/${found.size} phrases translated, ${missing.length} missing`);
      if (args.length) missing.forEach((m) => console.log(`  - ${m}   [${[...found.get(m)].join(", ")}]`));
    }
  }
}
