import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Portal.css";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;

function EciLogin() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [epic, setEpic] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async e => {
        e.preventDefault();
        setError("");

        const value = epic.trim().toUpperCase();
        if (!EPIC_PATTERN.test(value)) {
            setError(t("login.invalidEpic"));
            return;
        }

        setLoading(true);

        try {
            setLoading(true);

            localStorage.setItem("epic", value); // Save before request

            await api.post("/auth/login", { epic: value, portal: "eci" });

            navigate(`/login/otp?epic=${encodeURIComponent(value)}&portal=eci`);
        } catch (err) {
            setError(t("login.loginFailed"));
        } finally {
            setLoading(false);
        }{ setLoading(false); }
    };

    return (
        <main className="portal-page">
            <section className="portal-card">
                <p className="eyebrow">{t("eci.portal")}</p>
                <h1>{t("eci.loginTitle")}</h1>
                <p className="portal-muted">{t("eci.loginInstructions")}</p>
                {error && <div className="portal-error">{error}</div>}
                <form onSubmit={submit} className="portal-form">
                    <label>{t("eci.epicLabel")}<input value={epic} onChange={e => setEpic(e.target.value.toUpperCase())} maxLength={10} placeholder={t("eci.epicExample")} autoComplete="off" /></label>
                    <button disabled={loading}>{loading ? t("login.sendingOtp") : t("common.continue")}</button>
                </form>
                <p className="portal-muted">{t("login.demoEpic")}: <strong>ECI1234567</strong>. {t("login.otpTerminalHint")}</p>
                <p className="portal-footer"><Link to="/">{t("eci.backToPortal")}</Link></p>
            </section>
        </main>
    );
}
export default EciLogin;
