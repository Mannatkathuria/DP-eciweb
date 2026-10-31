import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./GovHeader.css";

export default function GovAccessibilityBar() {
  const { i18n, t } = useTranslation();
  const [time, setTime] = useState("");
  const [fontScale, setFontScale] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }) + " IST"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const changeFontSize = (delta) => {
    let newScale = fontScale + delta;
    if (newScale < 0.85) newScale = 0.85;
    if (newScale > 1.25) newScale = 1.25;
    setFontScale(newScale);
    document.documentElement.style.setProperty("--gov-font-scale", newScale);
  };

  const resetFontSize = () => {
    setFontScale(1);
    document.documentElement.style.setProperty("--gov-font-scale", 1);
  };

  const toggleContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    if (next) {
      document.body.classList.add("gov-high-contrast");
    } else {
      document.body.classList.remove("gov-high-contrast");
    }
  };

  const toggleDyslexia = () => {
    const next = !dyslexiaFont;
    setDyslexiaFont(next);
    if (next) {
      document.body.classList.add("gov-dyslexia-font");
    } else {
      document.body.classList.remove("gov-dyslexia-font");
    }
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.body.classList.add("gov-dark-mode");
    } else {
      document.body.classList.remove("gov-dark-mode");
    }
  };

  return (
    <div className="gov-access-bar" role="region" aria-label="Accessibility and Quick Tools">
      <div className="gov-access-container">
        <div className="gov-access-left">
          <a href="#main-content" className="gov-skip-link">
            Skip to Main Content
          </a>
          <span className="gov-divider" aria-hidden="true">|</span>
          <span className="gov-ist-clock" title="Indian Standard Time">
            🕒 {time || "Live IST"}
          </span>
          <span className="gov-divider" aria-hidden="true">|</span>
          <a href="tel:1950" className="gov-helpline-badge" title="National Voter Toll-free Helpline">
            <span className="gov-helpline-icon">📞</span>
            <strong>1950</strong>
            <span className="gov-helpline-label">Toll-Free Helpline</span>
          </a>
        </div>

        <div className="gov-access-right">
          {/* Font resizing */}
          <div className="gov-font-controls" aria-label="Text Size Controls">
            <button
              type="button"
              onClick={() => changeFontSize(-0.08)}
              title="Decrease Font Size"
              aria-label="Decrease Font Size"
            >
              A-
            </button>
            <button
              type="button"
              onClick={resetFontSize}
              title="Reset Font Size"
              aria-label="Normal Font Size"
              className={fontScale === 1 ? "active" : ""}
            >
              A
            </button>
            <button
              type="button"
              onClick={() => changeFontSize(0.08)}
              title="Increase Font Size"
              aria-label="Increase Font Size"
            >
              A+
            </button>
          </div>

          <span className="gov-divider" aria-hidden="true">|</span>

          {/* Contrast & Theme */}
          <button
            type="button"
            className={`gov-tool-btn ${highContrast ? "active" : ""}`}
            onClick={toggleContrast}
            title="Toggle High Contrast Mode"
            aria-label="High Contrast Mode"
          >
            🌓 Contrast
          </button>

          <button
            type="button"
            className={`gov-tool-btn ${dyslexiaFont ? "active" : ""}`}
            onClick={toggleDyslexia}
            title="Toggle Dyslexia-Friendly Font"
            aria-label="Dyslexia Font"
          >
            📖 Font
          </button>

          <button
            type="button"
            className={`gov-tool-btn ${darkMode ? "active" : ""}`}
            onClick={toggleDarkMode}
            title="Toggle Dark Mode"
            aria-label="Dark Mode"
          >
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>

          <span className="gov-divider" aria-hidden="true">|</span>

          {/* Language Selector */}
          <label className="gov-lang-select-wrapper" htmlFor="gov-language-select">
            <span className="gov-lang-icon" aria-hidden="true">🌐</span>
            <select
              id="gov-language-select"
              value={i18n.resolvedLanguage || "en"}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              aria-label="Select Official Language"
            >
              <option value="en">English (India)</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="pa">ਪੰਜਾਬੀ (Punjabi)</option>
              <option value="te">తెలుగు (Telugu)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="kn">ಕನ್ನಡ (Kannada)</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
