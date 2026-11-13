// Interface text written in English in the page markup, shown in the chosen language.
//
// When a language other than English is active, every visible text node and the placeholder,
// aria-label, title and alt attributes are looked up, whole, in that language's phrase catalogue
// (src/locales/<code>/ui.json, loaded by i18n.js) and replaced when found. Only exact matches of
// known interface text are replaced, so names, addresses, EPIC numbers, references and anything a
// person typed are never touched. Switching back to English restores the original text.
//
// Screens that call t("key") or tr("English") are already translated when React renders them;
// this covers the rest. Mark an element with translate="no" or data-no-translate to leave its
// contents alone (do this around user data such as names and addresses).
//
// The observer callback runs before the browser paints, so new content never flashes in English.

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT"]);

let dict = null;              // { english: translation } for the current language, or null for English
const touched = new Map();    // text node -> { src, out }
const touchedAttrs = new Map(); // element -> { attr: { src, out } }
let observer = null;

const key = (s) => s.replace(/\s+/g, " ").trim();

// Dates written in English in the markup ("31 Oct 2026", "October 2026") are shown with the month
// in the chosen language; the day and year stay as they are.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE = /^(\d{1,2} )?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)([a-z]*) (\d{4})$/;
let dateLang = null;
function localDate(k) {
  const m = DATE.exec(k);
  if (!m || !dateLang) return null;
  try {
    const month = new Intl.DateTimeFormat(dateLang, { month: m[3] ? "long" : "short" }).format(new Date(2000, MONTHS.indexOf(m[2]), 15));
    return `${m[1] ?? ""}${month} ${m[4]}`;
  } catch { return null; }
}

function lookup(text) {
  const k = key(text);
  if (!k || !dict) return null;
  const v = dict[k] || localDate(k);
  if (!v) return null;
  return text.match(/^\s*/)[0] + v + text.match(/\s*$/)[0];
}

function skipped(el, forAttrs = false) {
  // An input's placeholder or label attributes are interface text even though its value is not.
  for (let e = el; e; e = e.parentElement) {
    if (forAttrs && e === el && (e.tagName === "INPUT" || e.tagName === "TEXTAREA")) continue;
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
  if (skipped(el, true)) return;
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
    if (!dict) return;
    for (const r of records) {
      if (r.type === "characterData") doText(r.target);
      else if (r.type === "attributes") doAttrs(r.target);
      else r.addedNodes.forEach(walk);
    }
    if (touched.size > 5000) prune();
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

let titleSrc = null;

/** Switch the page's interface text to `code`, using that language's loaded catalogue. */
export function applyLanguage(code, catalogue) {
  if (typeof document === "undefined" || !document.body) return;
  document.documentElement.lang = code || "en";
  if (titleSrc === null) titleSrc = document.title;
  restore();
  if (!code || code === "en" || !catalogue) { dict = null; document.title = titleSrc; return; }
  dict = catalogue;
  dateLang = code + "-IN";
  start();
  walk(document.body);
  document.title = lookup(titleSrc) ?? titleSrc;
}

// Development aid: in the browser console, __untranslated() lists English-looking text on the
// current page that the active catalogue does not cover. scripts/i18n-check.mjs does the same
// for the whole source tree.
if (import.meta.env?.DEV && typeof window !== "undefined") {
  window.__untranslated = () => {
    if (!dict) return [];
    const ours = new Set([...touched.values()].map((v) => v.out));
    const out = new Set();
    const INDIC = /[ऀ-෿]/; // already in an Indian script (may still contain "EPIC", "BLO" ...)
    const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      const k = key(n.nodeValue);
      if (!/[A-Za-z]{3}/.test(k) || INDIC.test(k) || !n.parentElement || skipped(n.parentElement) || ours.has(n.nodeValue)) continue;
      if (!dict[k]) out.add(k);
    }
    for (const el of document.body.querySelectorAll("[placeholder],[aria-label],[title],[alt]")) {
      if (skipped(el, true)) continue;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && /[A-Za-z]{3}/.test(v) && !INDIC.test(v) && touchedAttrs.get(el)?.[a]?.out !== v) out.add(`@${a}: ${key(v)}`);
      }
    }
    return [...out];
  };
}
