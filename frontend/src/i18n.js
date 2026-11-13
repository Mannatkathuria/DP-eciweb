// The site's one language system.
//
// i18next holds the chosen language (saved in localStorage as "i18nextLng", so it survives
// navigation and refresh). Each language has two files under src/locales/<code>/:
//
//   ui.json           the phrase catalogue: interface text keyed by its English wording, the way
//                     gettext does it. This is the single place a translation is written.
//   translation.json  optional hand-keyed entries for screens that call t("some.key"). Any key a
//                     language does not define is filled from the catalogue, by looking up the
//                     English value of that key, so nothing has to be translated twice.
//
// Text can reach the screen three ways, all fed from the same catalogue:
//   t("login.title")                      keyed text (react-i18next)
//   tr("Sign in") / useTr()                text written in English in the code, including
//                                          sentences with {{placeholders}}
//   domTranslate.js                        English text already in the page markup is swapped
//                                          for its catalogue entry (exact whole-text matches only)
//
// A language's files are loaded before it becomes active, so switching never shows a half
// translated page, and the first render already has the right language.

import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { useCallback } from "react";
import { LANGUAGE_CODES } from "./languages";
import { applyLanguage } from "./domTranslate";
import en from "./locales/en/translation.json";

const catalogueLoaders = import.meta.glob("./locales/*/ui.json", { import: "default" });
const keyedLoaders = import.meta.glob(["./locales/*/translation.json", "!./locales/en/translation.json"], { import: "default" });

/** Loaded catalogues: { hi: { "Sign in": "साइन इन", ... }, ... }. English has none. */
const catalogues = {};

/** Normalise a phrase the way catalogue keys are written: single spaces, no outer spaces. */
export const phraseKey = (s) => String(s).replace(/\s+/g, " ").trim();

/** Fill every key of the English tree from the language's own keyed file, else its catalogue. */
function fillFrom(enNode, own, catalogue) {
  const out = {};
  for (const [k, v] of Object.entries(enNode)) {
    const mine = own?.[k];
    if (v && typeof v === "object") out[k] = fillFrom(v, mine && typeof mine === "object" ? mine : {}, catalogue);
    else if (typeof mine === "string" && mine) out[k] = mine;
    else if (typeof v === "string" && catalogue[phraseKey(v)]) out[k] = catalogue[phraseKey(v)];
  }
  return out;
}

async function loadLanguage(lng) {
  const code = lng.split("-")[0];
  if (code === "en") return en;
  const [catalogue, keyed] = await Promise.all([
    catalogueLoaders[`./locales/${code}/ui.json`]?.() ?? {},
    keyedLoaders[`./locales/${code}/translation.json`]?.() ?? {},
  ]);
  catalogues[code] = catalogue;
  return fillFrom(en, keyed, catalogue);
}

// i18next waits for a backend before it switches language, so the whole page changes at once.
const LocaleBackend = {
  type: "backend",
  init() {},
  read(lng, _ns, done) {
    loadLanguage(lng).then((data) => done(null, data), (err) => done(err, null));
  },
};

export const i18nReady = i18n
  .use(LocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: LANGUAGE_CODES,
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage"],
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

const current = () => (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];

const fill = (s, vars) => (vars ? s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] ?? vars[k] === 0 ? String(vars[k]) : m)) : s);

/**
 * Translate interface text written in English, for the current language. `vars` fills
 * {{placeholders}} after translation, so names, numbers and references are inserted unchanged.
 * Returns the English text when the catalogue has no entry.
 */
export function tr(english, vars, lng = current()) {
  const catalogue = catalogues[lng];
  const found = catalogue && catalogue[phraseKey(english)];
  return fill(found || english, vars);
}

/** `tr` for components: re-renders when the language changes. */
export function useTr() {
  const { i18n: inst } = useTranslation();
  const lng = (inst.resolvedLanguage || "en").split("-")[0];
  return useCallback((english, vars) => tr(english, vars, lng), [lng]);
}

/** Change the site language (all selectors use this). */
export const setLanguage = (code) => i18n.changeLanguage(code);

// Text written in English in the page markup follows the chosen language too (domTranslate.js).
i18n.on("languageChanged", (lng) => applyLanguage(lng.split("-")[0], catalogues[lng.split("-")[0]]));
i18nReady.then(() => applyLanguage(current(), catalogues[current()]));

export default i18n;
