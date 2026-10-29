import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Login.css";

const BLO_ID_PATTERN = /^BLO-[A-Z]{2}-\d{6}$/;
const meetsRule = (value) => value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// Forgot password: BLO ID -> OTP to the registered mobile (valid 2 minutes) -> new password twice.
function BloForgotPassword() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [bloId, setBloId] = useState("");
    const [reset, setReset] = useState(null); // { challenge, bloId, maskedMobile, expiresAt, resendAt }
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [now, setNow] = useState(() => Date.now());
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!reset) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [reset]);

    const startReset = (id, data) => {
        setReset({
            challenge: data.challenge, bloId: id, maskedMobile: data.maskedMobile,
            expiresAt: Date.now() + data.expiresInSeconds * 1000,
            resendAt: Date.now() + data.resendAfterSeconds * 1000
        });
        setNow(Date.now());
        setOtp("");
    };

    const otpError = (status) => (status === 401 ? t("blo.resetExpired") : status === 429 ? t("blo.tooMany") : t("blo.resetFailed"));

    const requestOtp = async (event) => {
        event.preventDefault();
        setError(""); setNotice("");
        const id = bloId.trim().toUpperCase();
        if (!BLO_ID_PATTERN.test(id)) { setError(t("blo.unknownId")); return; }
        try {
            setBusy(true);
            const { data } = await api.post("/auth/blo/forgot", { bloId: id });
            startReset(id, data.data);
        } catch (err) {
            const status = err.response?.status;
            setError(status === 404 ? t("blo.unknownId") : otpError(status));
        } finally { setBusy(false); }
    };

    const resend = async () => {
        setError(""); setNotice("");
        try {
            setBusy(true);
            const { data } = await api.post("/auth/blo/forgot/resend", { challenge: reset.challenge });
            startReset(reset.bloId, data.data);
            setNotice(t("blo.resent", { mobile: data.data.maskedMobile }));
        } catch (err) {
            const status = err.response?.status;
            if (status === 401) setReset(null);
            setError(otpError(status));
        } finally { setBusy(false); }
    };

    const submitReset = async (event) => {
        event.preventDefault();
        setError(""); setNotice("");
        if (!meetsRule(newPassword)) { setError(t("blo.ruleFailed")); return; }
        if (newPassword !== confirmPassword) { setError(t("blo.mismatch")); return; }
        try {
            setBusy(true);
            await api.post("/auth/blo/reset", { challenge: reset.challenge, otp, newPassword });
            navigate("/blo/login", { replace: true, state: { notice: t("blo.resetDone") } });
        } catch (err) {
            const status = err.response?.status;
            if (status === 401) { setReset(null); setError(t("blo.resetExpired")); return; }
            setError(status === 429 ? t("blo.otpTooMany") : t("blo.otpIncorrect"));
            setOtp("");
        } finally { setBusy(false); }
    };

    const secondsLeft = reset ? Math.max(0, Math.ceil((reset.expiresAt - now) / 1000)) : 0;
    const resendIn = reset ? Math.max(0, Math.ceil((reset.resendAt - now) / 1000)) : 0;

    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-header">
                    <p className="eyebrow">{t("portal.bloPortal")}</p>
                    <h1>{t("blo.forgotTitle")}</h1>
                    <p>{reset ? t("blo.resetSent", { mobile: reset.maskedMobile, bloId: reset.bloId }) : t("blo.forgotIntro")}</p>
                </div>
                {error && <div className="login-error" role="alert">{error}</div>}
                {notice && <div className="otp-notice" role="status">{notice}</div>}

                {!reset && (
                    <form onSubmit={requestOtp}>
                        <div className="form-group">
                            <label htmlFor="reset-blo-id">{t("blo.idLabel")}</label>
                            <input id="reset-blo-id" value={bloId} onChange={(e) => setBloId(e.target.value.toUpperCase())}
                                autoComplete="username" maxLength={13} placeholder={t("blo.idPlaceholder")} disabled={busy} autoFocus required />
                        </div>
                        <button type="submit" className="login-button" disabled={busy}>{busy ? t("blo.checking") : t("blo.sendOtp")}</button>
                    </form>
                )}

                {reset && (
                    <>
                        <form onSubmit={submitReset}>
                            <div className="form-group">
                                <label htmlFor="reset-otp">{t("otp.label")}</label>
                                <input id="reset-otp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t("otp.placeholder")}
                                    disabled={busy || secondsLeft === 0} autoFocus required />
                            </div>
                            <p className="login-demo" role="timer">
                                {secondsLeft > 0 ? t("blo.expiresIn", { time: formatTime(secondsLeft) }) : t("blo.expired")}
                            </p>
                            <div className="form-group">
                                <label htmlFor="reset-new-password">{t("blo.newPassword")}</label>
                                <input id="reset-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                                    autoComplete="new-password" minLength={8} maxLength={128} disabled={busy} required />
                            </div>
                            <div className="form-group">
                                <label htmlFor="reset-confirm-password">{t("blo.confirmPassword")}</label>
                                <input id="reset-confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                    autoComplete="new-password" minLength={8} maxLength={128} disabled={busy} required />
                            </div>
                            <p className="login-demo">{t("blo.passwordRule")}</p>
                            <button className="login-button" disabled={busy || otp.length !== 6 || secondsLeft === 0}>
                                {busy ? t("common.submitting") : t("blo.resetSave")}
                            </button>
                        </form>
                        <p className="login-demo">{t("blo.otpDemo")}</p>
                        <div className="otp-actions">
                            <button type="button" className="secondary-btn" onClick={resend} disabled={busy || resendIn > 0}>
                                {resendIn > 0 ? t("blo.resendIn", { seconds: resendIn }) : t("blo.resend")}
                            </button>
                        </div>
                    </>
                )}

                <div className="login-footer"><Link to="/blo/login">{t("blo.backToSignIn")}</Link></div>
            </section>
        </main>
    );
}

export default BloForgotPassword;
