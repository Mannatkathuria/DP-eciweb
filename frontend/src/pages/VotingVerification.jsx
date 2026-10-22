import { useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PersonaFlow from "./PersonaFlow";
import "./Portal.css";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;
const personaLabel = (status, t) => {
    const keys = { unverified: "verification.notStarted", pending: "verification.inProgress", pending_review: "verification.awaitingDecision", review_required: "verification.needsReview", verified: "verification.approved", declined: "verification.declined", failed: "verification.failed", expired: "verification.expired" };
    return t(keys[status] || "verification.notStarted");
};

function VotingVerification() {
    const { logged, userData, logout } = useContext(AuthContext);
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [epic, setEpic] = useState("");
    const [session, setSession] = useState(null);
    const [config, setConfig] = useState(null);
    const [scanToken, setScanToken] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const syncStatus = useCallback(async (sessionId) => {
        if (!sessionId) return;
        const { data } = await api.post(`/voting-verification/${sessionId}/persona/sync`);
        setSession((current) => current ? { ...current, status: data.data.status, personaStatus: data.data.personaStatus } : current);
        setNotice(t("verification.currentStatus", { status: personaLabel(data.data.personaResult, t) }));
        if (data.data.status === "fingerprint_pending" || data.data.status === "review_required") setConfig(null);
    }, [t]);

    const openSession = async (event) => {
        event.preventDefault();
        setError("");
        setNotice("");
        const value = epic.trim().toUpperCase();
        if (!EPIC_PATTERN.test(value)) return setError(t("login.invalidEpic"));

        setBusy(true);
        try {
            const { data: started } = await api.post("/voting-verification/start", { epic: value });
            const activeSession = started.data;
            setSession(activeSession);
            setScanToken(`FP-${activeSession.voter.epic}`);

            const { data: persona } = await api.post(`/voting-verification/${activeSession.sessionId}/persona/start`);
            if (["verified", "pending_review", "review_required"].includes(persona.data.status)) {
                await syncStatus(activeSession.sessionId);
            } else {
                setConfig(persona.data);
            }
        } catch (err) {
            setError(t("eci.openSessionFailed"));
            setSession(null);
            setConfig(null);
        } finally {
            setBusy(false);
        }
    };

    const handlePersonaComplete = useCallback(async () => {
        await syncStatus(session?.sessionId);
    }, [session?.sessionId, syncStatus]);

    const submitFingerprint = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const { data } = await api.post(`/voting-verification/${session.sessionId}/fingerprint`, { scanToken });
            setSession((current) => ({ ...current, status: data.data.status }));
            setNotice(t("eci.fingerprintSuccess"));
        } catch (err) {
            setError(t("eci.fingerprintFailed"));
        } finally {
            setBusy(false);
        }
    };

    if (!logged) return <Navigate to="/eci/login" replace />;
    if (userData?.role !== "eci") return <Navigate to={userData?.role === "voter" ? "/dashboard" : "/admin"} replace />;

    return (
        <main className="portal-page">
            <section className="portal-card voting-verification-card">
                <header className="voting-verification-header">
                    <div><p className="eyebrow">{t("eci.portal")}</p><h1>{t("eci.voterVerification")}</h1><p className="portal-muted">{t("eci.personaDescription")}</p></div>
                    <div className="portal-actions"><Link to="/eci/dashboard" className="secondary-btn">{t("common.dashboard")}</Link><button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>{t("common.signOut")}</button></div>
                </header>

                {error && <div className="portal-error" role="alert">{error}</div>}
                {notice && <div className="portal-notice" role="status">{notice}</div>}

                {!session && <form onSubmit={openSession} className="portal-form">
                    <label>{t("eci.voterEpicLabel")}<input value={epic} onChange={(event) => setEpic(event.target.value.toUpperCase())} maxLength={10} placeholder={t("login.epicExample")} autoComplete="off" /></label>
                    <button disabled={busy}>{busy ? t("eci.opening") : t("eci.openVoterCheck")}</button>
                </form>}

                {session && <section className="verification-stage">
                    <p className="eyebrow">{t("eci.voterRecord")}</p>
                    <h2>{session.voter?.name || t("portal.roles.voter")}</h2>
                    <p className="portal-muted">{t("login.epicLabel")}: {session.voter?.epic || epic}</p>
                    <p className="portal-muted">{t("common.status")}: <strong>{personaLabel(session.personaStatus || session.status, t)}</strong></p>
                    {config && <PersonaFlow config={config} onComplete={handlePersonaComplete} />}
                    {session.status === "persona_pending" && !config && <button className="secondary-btn" onClick={() => syncStatus(session.sessionId)} disabled={busy}>{t("verification.refresh")}</button>}
                    {session.status === "fingerprint_pending" && <form className="portal-form fingerprint-demo-form" onSubmit={submitFingerprint}>
                        <h2>{t("eci.demoScannerTitle")}</h2>
                        <p className="portal-muted">{t("eci.demoScannerDescription")}</p>
                        <label>{t("eci.scannerToken")}<input value={scanToken} onChange={(event) => setScanToken(event.target.value)} autoComplete="off" /></label>
                        <button disabled={busy}>{busy ? t("common.checking") : t("eci.verifyFingerprint")}</button>
                    </form>}
                    {session.status === "verified" && <div className="portal-notice"><strong>{t("eci.checkComplete")}</strong> {t("eci.checkCompleteDescription")}</div>}
                    {session.status === "review_required" && <div className="portal-error">{t("eci.personaNotApproved")}</div>}
                    <button className="secondary-btn" onClick={() => { setSession(null); setConfig(null); setEpic(""); setError(""); setNotice(""); }}>{t("eci.startAnotherCheck")}</button>
                </section>}
                <p className="portal-footer"><Link to="/">{t("eci.publicPortal")}</Link></p>
            </section>
        </main>
    );
}

export default VotingVerification;
