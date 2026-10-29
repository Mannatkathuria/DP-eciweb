import { useTranslation } from "react-i18next";

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();

  return (
    <label className="language-selector">
      <span>{t("language")}</span>
      <select
        value={i18n.resolvedLanguage || "en"}
        onChange={(event) => i18n.changeLanguage(event.target.value)}
      >
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
        <option value="pa">ਪੰਜਾਬੀ</option>
        <option value="te">తెలుగు</option>
        <option value="ta">தமிழ்</option>
        <option value="kn">ಕನ್ನಡ</option>
      </select>
    </label>
  );
}
