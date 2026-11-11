// Interface translation for pages whose text is written in English in the code.
//
// When a language other than English is chosen, every visible text node and the placeholder,
// aria-label, title and alt attributes are looked up, whole, in that language's dictionary
// (src/locales/ui/<code>.json) and replaced when found. Only exact matches of known interface
// text are replaced, so names, addresses, references and anything a person typed are never
// touched. Switching back to English restores the original text.
//
// Pages that already use i18n keys (t("...")) keep using them; this covers everything else.
// Mark an element with translate="no" or data-no-translate to leave it alone.

const loaders = import.meta.glob("./locales/ui/*.json", { import: "default" });
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT"]);

let dict = null;              // { english: translation } for the current language, or null for English
const touched = new Map();    // text node -> { src, out }
const touchedAttrs = new Map(); // element -> { attr: { src, out } }
let observer = null;

const key = (s) => s.replace(/\s+/g, " ").trim();

function lookup(text) {
  const k = key(text);
  if (!k || !dict) return null;
  const v = dict[k];
  if (!v) return null;
  return text.match(/^\s*/)[0] + v + text.match(/\s*$/)[0];
}

function skipped(el) {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP.has(e.tagName) || e.isContentEditable || e.getAttribute?.("translate") === "no" || e.hasAttribute?.("data-no-translate")) return true;
  }
  return false;
}

function doText(node) {
  const seen = touched.get(node);
  const current = node.nodeValue;
  if (seen && current === seen.out) return;            // already ours
  if (seen && current !== seen.out) touched.delete(node); // the app changed it; start over
  if (!node.parentElement || skipped(node.parentElement)) return;
  const out = lookup(current);
  if (out && out !== current) { touched.set(node, { src: current, out }); node.nodeValue = out; }
}

function doAttrs(el) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const mine = touchedAttrs.get(el)?.[a];
    const current = el.getAttribute(a);
    if (mine && current === mine.out) continue;
    const out = lookup(current);
    if (out && out !== current) {
      touchedAttrs.set(el, { ...(touchedAttrs.get(el) ?? {}), [a]: { src: current, out } });
      el.setAttribute(a, out);
    }
  }
}

function walk(root) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  doAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === Node.TEXT_NODE ? doText(n) : doAttrs(n);
}

function restore() {
  for (const [node, { src, out }] of touched) if (node.nodeValue === out) node.nodeValue = src;
  for (const [el, attrs] of touchedAttrs) for (const [a, { src, out }] of Object.entries(attrs)) if (el.getAttribute(a) === out) el.setAttribute(a, src);
  touched.clear();
  touchedAttrs.clear();
}

function prune() {
  for (const node of touched.keys()) if (!node.isConnected) touched.delete(node);
  for (const el of touchedAttrs.keys()) if (!el.isConnected) touchedAttrs.delete(el);
}

function start() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") doText(r.target);
      else if (r.type === "attributes") doAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
    if (touched.size > 5000) prune();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Switch the page's interface text to `code` (an i18next language code). */
export async function applyLanguage(code) {
  const lang = (code || "en").split("-")[0];
  document.documentElement.lang = lang;
  const load = loaders[`./locales/ui/${lang}.json`];
  if (!load) { dict = null; restore(); return; }
  try { dict = await load(); } catch { dict = null; return; }
  restore();
  start();
  walk(document.body);
  const t = lookup(document.title);
  if (t) document.title = t;
}
