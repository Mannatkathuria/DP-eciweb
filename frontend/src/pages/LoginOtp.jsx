import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import { useContext } from "react";
import "./Login.css";

function LoginOtp() {
    const [params] = useSearchParams();
    const epic = String(params.get("epic") || "").trim().toUpperCase();
    const portal = params.get("portal") || "voter";
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { logged, userData, login } = useContext(AuthContext);
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");

    if (logged && userData?.role) {
        const destination = userData.role === "eci" ? "/eci/dashboard"
            : userData.role === "blo" || userData.role === "admin" ? "/admin" : "/dashboard";
        return <Navigate to={destination} replace />;
    }
    if (!/^[A-Z]{3}\d{7}$/.test(epic)) {
        return <Navigate to={portal === "eci" ? "/eci/login" : `/login?role=${portal === "blo" ? "blo" : "voter"}`} replace />;
    }

    const verify = async (event) => {
        event.preventDefault();
        setError("");
        setNotice("");
        if (!/^\d{6}$/.test(otp)) {
            setError(t("otp.invalid"));
            return;
        }
        try {
            setBusy(true);
            const { data } = await api.post("/verification/otp/verify", { electorId: epic, otp });
            login(data.user.epic, data.token, data.user);
            const destination = data.user.role === "eci" ? "/eci/dashboard"
                : data.user.role === "blo" || data.user.role === "admin" ? "/admin" : "/dashboard";
            navigate(destination, { replace: true });
        } catch (err) {
            setError(t("otp.verifyFailed"));
        } finally {
            setBusy(false);
        }
    };

    const resend = async () => {
        setError("");
        setNotice("");
        try {
            setBusy(true);
            await api.post("/verification/otp/send", { electorId: epic });
            setOtp("");
            setNotice(t("otp.newGenerated"));
        } catch (err) {
            setError(t("otp.newFailed"));
        } finally {
            setBusy(false);
        }
    };

    const signInPath = portal === "eci" ? "/eci/login" : `/login?role=${portal === "blo" ? "blo" : "voter"}`;
    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-header">
                    <p className="eyebrow">{t("otp.secureSignIn")}</p>
                    <h1>{t("otp.title")}</h1>
                    <p>{t("otp.confirmSignIn")} <strong>{epic}</strong>. {t("otp.dashboardNext")}</p>
                </div>
                {error && <div className="login-error" role="alert">{error}</div>}
                {notice && <div className="otp-notice" role="status">{notice}</div>}
                <form onSubmit={verify}>
                    <div className="form-group">
                        <label htmlFor="login-otp">{t("otp.label")}</label>
                        <input id="login-otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t("otp.placeholder")} autoFocus required />
                    </div>
                    <button className="login-button" disabled={busy || otp.length !== 6}>{busy ? t("common.checking") : t("otp.verify")}</button>
                </form>
                <p className="login-demo">{t("otp.demoHint")}</p>
                <div className="otp-actions">
                    <button type="button" className="back-button" onClick={resend} disabled={busy}>{t("otp.generateNew")}</button>
                    <Link to={signInPath}>{t("otp.backToSignIn")}</Link>
                </div>
            </section>
        </main>
    );
}

export default LoginOtp;
