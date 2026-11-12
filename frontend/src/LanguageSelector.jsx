import { useTranslation } from "react-i18next";
import { LANGUAGES } from "./languages";
import { setLanguage } from "./i18n";

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();

  return (
    <label className="language-selector">
      <span>{t("language")}</span>
      <select value={i18n.resolvedLanguage || "en"} onChange={(event) => setLanguage(event.target.value)}>
        {LANGUAGES.map(({ code, label }) => <option key={code} value={code} translate="no">{label}</option>)}
      </select>
    </label>
  );
}
