import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import "./Login.css";

const meetsRule = (value) => value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

// Required after a BLO's first sign-in with a temporary password; also usable later.
function BloChangePassword() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { logged, userData, setUserData, logout } = useContext(AuthContext);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    if (!logged || userData?.role !== "blo") return <Navigate to="/blo/login" replace />;

    const submit = async (event) => {
        event.preventDefault();
        setError("");
        if (!meetsRule(newPassword)) { setError(t("blo.ruleFailed")); return; }
        if (newPassword !== confirmPassword) { setError(t("blo.mismatch")); return; }
        try {
            setBusy(true);
            const { data } = await api.post("/auth/blo/password", { currentPassword, newPassword });
            setUserData(data.data);
            localStorage.setItem("userData", JSON.stringify(data.data));
            navigate("/admin", { replace: true });
        } catch {
            setError(t("blo.changeFailed"));
        } finally { setBusy(false); }
    };

    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-header">
                    <p className="eyebrow">{t("portal.bloPortal")}</p>
                    <h1>{t("blo.changeTitle")}</h1>
                    <p>{t("blo.changeIntro")}</p>
                </div>
                {error && <div className="login-error" role="alert">{error}</div>}
                <form onSubmit={submit}>
                    <div className="form-group">
                        <label htmlFor="current-password">{t("blo.currentPassword")}</label>
                        <input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                            autoComplete="current-password" maxLength={128} disabled={busy} autoFocus required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="new-password">{t("blo.newPassword")}</label>
                        <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                            autoComplete="new-password" minLength={8} maxLength={128} disabled={busy} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="confirm-password">{t("blo.confirmPassword")}</label>
                        <input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password" minLength={8} maxLength={128} disabled={busy} required />
                    </div>
                    <p className="login-demo">{t("blo.passwordRule")}</p>
                    <button className="login-button" disabled={busy}>{busy ? t("common.submitting") : t("blo.savePassword")}</button>
                </form>
                <div className="login-footer">
                    <button type="button" className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>{t("common.signOut")}</button>
                </div>
            </section>
        </main>
    );
}

export default BloChangePassword;
