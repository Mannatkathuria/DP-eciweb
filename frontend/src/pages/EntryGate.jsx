import { useContext } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../context/AuthContext";
import { hasSeenEntry, markEntrySeen } from "../config/entry";
import { homeFor } from "../config/roles";
import EciEmblem from "../components/EciEmblem";
import { LANGUAGES } from "../languages";


/**
 * The site's front door. A first-time visitor chooses how to continue; after that, "/" skips
 * straight to the home page (or to the signed-in person's own section).
 */
export default function EntryGate() {
  const { logged, userData } = useContext(AuthContext);
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  if (logged && userData?.role) return <Navigate to={homeFor(userData.role)} replace />;
  if (hasSeenEntry()) return <Navigate to="/home" replace />;

  const go = (path) => { markEntrySeen(); navigate(path); };

  return (
    <main className="gate">
      <section className="gate-card" aria-labelledby="gate-title">
        <div className="gate-brand">
          <EciEmblem size={56} />
          <div>
            <strong>Election Commission of India</strong>
            <div className="muted">भारत निर्वाचन आयोग</div>
          </div>
        </div>
        <h1 id="gate-title">How would you like to continue?</h1>
        <p className="lede" style={{ marginBottom: 24 }}>You can look around without an account. Sign in when you need the work that belongs to your role.</p>

        <div className="picks">
          <button type="button" className="pick" onClick={() => go("/signin")}>
            <span className="mark" aria-hidden="true" />
            <span>
              <strong>Sign in</strong>
              <span className="desc">Voters, booth level officers, returning officers, candidates, agents, observers and other officials.</span>
            </span>
          </button>
          <button type="button" className="pick" onClick={() => go("/home")}>
            <span className="mark" aria-hidden="true" />
            <span>
              <strong>Browse without signing in</strong>
              <span className="desc">Search the electoral roll, read notices, see results and find your state election office.</span>
            </span>
          </button>
        </div>

        <div className="gate-foot">
          <label>
            <span className="sr-only">Language</span>
            <select value={i18n.resolvedLanguage || "en"} onChange={(e) => i18n.changeLanguage(e.target.value)}>
              {LANGUAGES.map(({ code, label }) => <option key={code} value={code} translate="no">{label}</option>)}
            </select>
          </label>
          <span>Need help? Call <a href="tel:1950">1950</a>, the voter helpline.</span>
        </div>
      </section>
    </main>
  );
}
