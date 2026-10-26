import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import "./Login.css";

const BLO_ID_PATTERN = /^BLO-[A-Z]{2}-\d{6}$/;
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

// BLO sign-in: step 1 BLO ID + password, step 2 the OTP sent to the BLO's mobile (valid 2 minutes).
function BloLogin() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { logged, userData, login } = useContext(AuthContext);

    const [bloId, setBloId] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [challenge, setChallenge] = useState(null); // { challenge, maskedMobile, expiresAt, resendAt }
    const [now, setNow] = useState(() => Date.now());
    const [error, setError] = useState("");
    // e.g. "Your password was changed" after a reset.
    const [notice, setNotice] = useState(location.state?.notice || "");
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!challenge) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [challenge]);

    if (logged && userData?.role === "blo") {
        return <Navigate to={userData.mustChangePassword ? "/blo/password" : "/admin"} replace />;
    }

    const startOtp = (data) => {
        setChallenge({
            challenge: data.challenge, maskedMobile: data.maskedMobile,
            expiresAt: Date.now() + data.expiresInSeconds * 1000,
            resendAt: Date.now() + data.resendAfterSeconds * 1000
        });
        setNow(Date.now());
        setOtp("");
    };

    const submitCredentials = async (event) => {
        event.preventDefault();
        setError(""); setNotice("");
        const id = bloId.trim().toUpperCase();
        if (!BLO_ID_PATTERN.test(id) || !password) { setError(t("blo.invalid")); return; }
        try {
            setBusy(true);
            const { data } = await api.post("/auth/blo/login", { bloId: id, password });
            setPassword("");
            startOtp(data.data);
        } catch (err) {
            const status = err.response?.status;
            setError(status === 401 ? t("blo.invalid") : status === 423 ? t("blo.locked")
                : status === 429 ? t("blo.tooMany") : t("blo.failed"));
        } finally { setBusy(false); }
    };

    const verify = async (event) => {
        event.preventDefault();
        setError(""); setNotice("");
        try {
            setBusy(true);
            const { data } = await api.post("/auth/blo/verify", { challenge: challenge.challenge, otp });
            login(data.user.epic, data.token, data.user);
            navigate(data.user.mustChangePassword ? "/blo/password" : "/admin", { replace: true });
        } catch (err) {
            const status = err.response?.status;
            if (status === 401) { setChallenge(null); setError(t("blo.sessionExpired")); return; }
            setError(status === 429 ? t("blo.otpTooMany") : t("blo.otpIncorrect"));
            setOtp("");
        } finally { setBusy(false); }
    };

    const resend = async () => {
        setError(""); setNotice("");
        try {
            setBusy(true);
            const { data } = await api.post("/auth/blo/resend", { challenge: challenge.challenge });
            startOtp(data.data);
            setNotice(t("blo.resent", { mobile: data.data.maskedMobile }));
        } catch (err) {
            const status = err.response?.status;
            if (status === 401) { setChallenge(null); setError(t("blo.sessionExpired")); return; }
            setError(status === 429 ? t("blo.tooMany") : t("blo.failed"));
        } finally { setBusy(false); }
    };

    const secondsLeft = challenge ? Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000)) : 0;
    const resendIn = challenge ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000)) : 0;

    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-header">
                    <p className="eyebrow">{t("portal.bloPortal")}</p>
                    <h1>{challenge ? t("blo.otpTitle") : t("login.title")}</h1>
                    <p>{challenge ? t("blo.otpSent", { mobile: challenge.maskedMobile }) : t("blo.instructions")}</p>
                </div>
                {error && <div className="login-error" role="alert">{error}</div>}
                {notice && <div className="otp-notice" role="status">{notice}</div>}

                {!challenge && (
                    <form onSubmit={submitCredentials}>
                        <div className="form-group">
                            <label htmlFor="blo-id">{t("blo.idLabel")}</label>
                            <input id="blo-id" value={bloId} onChange={(e) => setBloId(e.target.value.toUpperCase())}
                                autoComplete="username" maxLength={13} placeholder={t("blo.idPlaceholder")} disabled={busy} autoFocus required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="blo-password">{t("blo.passwordLabel")}</label>
                            <input id="blo-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password" maxLength={128} disabled={busy} required />
                        </div>
                        <button type="submit" className="login-button" disabled={busy}>
                            {busy ? t("blo.checking") : t("common.continue")}
                        </button>
                        <div className="login-footer"><Link to="/blo/forgot">{t("blo.forgotLink")}</Link></div>
                    </form>
                )}

                {challenge && (
                    <>
                        <form onSubmit={verify}>
                            <div className="form-group">
                                <label htmlFor="blo-otp">{t("otp.label")}</label>
                                <input id="blo-otp" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t("otp.placeholder")}
                                    disabled={busy || secondsLeft === 0} autoFocus required />
                            </div>
                            <p className="login-demo" role="timer">
                                {secondsLeft > 0 ? t("blo.expiresIn", { time: formatTime(secondsLeft) }) : t("blo.expired")}
                            </p>
                            <button className="login-button" disabled={busy || otp.length !== 6 || secondsLeft === 0}>
                                {busy ? t("common.checking") : t("otp.verify")}
                            </button>
                        </form>
                        <p className="login-demo">{t("blo.otpDemo")}</p>
                        <div className="otp-actions">
                            <button type="button" className="secondary-btn" onClick={resend} disabled={busy || resendIn > 0}>
                                {resendIn > 0 ? t("blo.resendIn", { seconds: resendIn }) : t("blo.resend")}
                            </button>
                            <button type="button" className="secondary-btn" onClick={() => { setChallenge(null); setError(""); setNotice(""); }} disabled={busy}>
                                {t("blo.useDifferent")}
                            </button>
                        </div>
                    </>
                )}

                <div className="login-footer"><Link to="/">{t("login.returnHome")}</Link></div>
            </section>
        </main>
    );
}

export default BloLogin;
