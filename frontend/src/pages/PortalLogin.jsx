import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { DEMO_IDS, GROUPS, roleById } from "../config/roles";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;

/**
 * Sign-in for every role that signs in with an identifier and a one-time code. Booth level officers
 * have their own page (BLO ID, password and mobile OTP), so they are sent there.
 */
export default function PortalLogin() {
  const { roleId } = useParams();
  const role = roleById(roleId);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [epic, setEpic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!role) return <Navigate to="/signin" replace />;
  if (role.mode === "blo") return <Navigate to="/blo/login" replace />;

  const group = GROUPS.find((g) => g.id === role.group);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const value = epic.trim().toUpperCase();
    if (!EPIC_PATTERN.test(value)) { setError(t("login.invalidEpic")); return; }
    try {
      setLoading(true);
      localStorage.setItem("epic", value);
      await api.post("/auth/login", { epic: value, portal: role.id });
      navigate(`/login/otp?epic=${encodeURIComponent(value)}&portal=${role.id}`);
    } catch (err) {
      setError(err.response?.data?.message || t("login.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <section className="auth-card" aria-labelledby="signin-title">
        <p className="muted" style={{ marginBottom: 6 }}>{group?.label}</p>
        <h1 id="signin-title">{role.label}</h1>
        <p className="muted">{role.blurb}</p>

        {error && <div className="login-error" role="alert">{error}</div>}
        <form onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="epic">{t("login.epicLabel")}</label>
            <input id="epic" name="epic" value={epic} onChange={(e) => setEpic(e.target.value.toUpperCase())}
              maxLength={10} autoComplete="off" placeholder={t("login.epicExample")} disabled={loading} autoFocus />
            <span className="hint">{t("login.instructions")}</span>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? t("login.sendingOtp") : t("common.continue")}
          </button>
        </form>

        <p className="auth-aside">
          {t("login.demoEpic")}: <strong>{DEMO_IDS[role.id]}</strong>. {t("login.otpTerminalHint")}
          <br /><Link to={`/signin?group=${role.group}`}>Choose a different role</Link>
        </p>
      </section>
    </div>
  );
}
