import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

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
      kn: { translation: kn }
    },
    fallbackLng: "en",
    supportedLngs: ["en", "hi", "pa", "te", "ta", "kn"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"]
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
