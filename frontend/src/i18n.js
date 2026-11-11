import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { LANGUAGE_CODES } from "./languages";
import { applyLanguage } from "./domTranslate";

import en from "./locales/en/translation.json";
import hi from "./locales/hi/translation.json";
import pa from "./locales/pa/translation.json";
import te from "./locales/te/translation.json";
import ta from "./locales/ta/translation.json";
import kn from "./locales/kn/translation.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      pa: { translation: pa },
      te: { translation: te },
      ta: { translation: ta },
      kn: { translation: kn },
      // Languages without screen keys yet: keys fall back to English, and the interface text is
      // translated from src/locales/ui/<code>.json (see domTranslate.js).
      bn: { translation: { language: "ভাষা" } },
      mr: { translation: { language: "भाषा" } },
      gu: { translation: { language: "ભાષા" } },
      ml: { translation: { language: "ഭാഷ" } },
      or: { translation: { language: "ଭାଷା" } }
    },
    fallbackLng: "en",
    supportedLngs: LANGUAGE_CODES,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"]
    },
    interpolation: {
      escapeValue: false
    }
  });

// Text written in English in the pages follows the chosen language too (see domTranslate.js).
i18n.on("languageChanged", (lng) => applyLanguage(lng));
if (typeof document !== "undefined") {
  const run = () => applyLanguage(i18n.resolvedLanguage);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

export default i18n;
