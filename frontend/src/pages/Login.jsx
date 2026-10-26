import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import "./Login.css";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;
const DEMO_EPIC = { voter: "ABC1234567", blo: "BLO1234567" };

function Login() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [params] = useSearchParams();
    const portal = params.get("role") === "blo" ? "blo" : "voter";
    const [epic, setEpic] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // BLOs sign in with a BLO ID, password and mobile OTP on their own page.
    if (params.get("role") === "blo") return <Navigate to="/blo/login" replace />;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        const value = epic.trim().toUpperCase();
        if (!EPIC_PATTERN.test(value)) {
            setError(t("login.invalidEpic"));
            return;
        }

        
        try {
            setLoading(true);

            localStorage.setItem("epic", value); // Save before request

            await api.post("/auth/login", { epic: value, portal });

            navigate(`/login/otp?epic=${encodeURIComponent(value)}&portal=${portal}`);
        } catch (err) {
            setError(t("login.loginFailed"));
        } finally {
            setLoading(false);
        }

    };

    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-header">
                    <p className="eyebrow">{portal === "blo" ? t("portal.bloPortal") : t("portal.voterServices")}</p>
                    <h1>{t("login.title")}</h1>
                    <p>{t("login.instructions")}</p>
                </div>
                {error && <div className="login-error" role="alert">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="epic">{t("login.epicLabel")}</label>
                        <input id="epic" name="epic" type="text" value={epic}
                            onChange={(event) => setEpic(event.target.value.toUpperCase())}
                            autoComplete="off" maxLength={10} placeholder={t("login.epicExample")} disabled={loading} autoFocus />
                    </div>
                    <button type="submit" className="login-button" disabled={loading}>
                        {loading ? t("login.sendingOtp") : t("common.continue")}
                    </button>
                </form>
                <p className="login-demo">{t("login.demoEpic")}: <strong>{DEMO_EPIC[portal]}</strong><br />{t("login.otpTerminalHint")}</p>
                <div className="login-footer"><Link to="/">{t("login.returnHome")}</Link></div>
            </section>
        </main>
    );
}

export default Login;
