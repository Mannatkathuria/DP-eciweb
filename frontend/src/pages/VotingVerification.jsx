import { useCallback, useContext, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PersonaFlow from "./PersonaFlow";
import "./Portal.css";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;
const personaLabel = (status) => ({
    unverified: "Not started",
    pending: "In progress",
    pending_review: "Completed by voter; awaiting a Persona decision",
    review_required: "Needs review",
    verified: "Approved",
    declined: "Declined",
    failed: "Failed",
    expired: "Expired"
}[status] || status || "Not started");

function VotingVerification() {
    const { logged, userData, logout } = useContext(AuthContext);
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
        setNotice(data.data.message || `Persona status: ${personaLabel(data.data.personaResult)}.`);
        if (data.data.status === "fingerprint_pending" || data.data.status === "review_required") setConfig(null);
    }, []);

    const openSession = async (event) => {
        event.preventDefault();
        setError("");
        setNotice("");
        const value = epic.trim().toUpperCase();
        if (!EPIC_PATTERN.test(value)) return setError("Enter a valid EPIC number.");

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
            setError(err.response?.data?.message || "Could not open the voter verification session.");
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
            setNotice(data.data.message);
        } catch (err) {
            setError(err.response?.data?.message || "Fingerprint verification failed.");
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
                    <div><p className="eyebrow">ECI OFFICIAL PORTAL</p><h1>Voter verification</h1><p className="portal-muted">Persona handles the document and face checks in the embedded flow.</p></div>
                    <div className="portal-actions"><Link to="/eci/dashboard" className="secondary-btn">Dashboard</Link><button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>Sign out</button></div>
                </header>

                {error && <div className="portal-error" role="alert">{error}</div>}
                {notice && <div className="portal-notice" role="status">{notice}</div>}

                {!session && <form onSubmit={openSession} className="portal-form">
                    <label>Voter EPIC number<input value={epic} onChange={(event) => setEpic(event.target.value.toUpperCase())} maxLength={10} placeholder="e.g. ABC1234567" autoComplete="off" /></label>
                    <button disabled={busy}>{busy ? "Opening…" : "Open voter check"}</button>
                </form>}

                {session && <section className="verification-stage">
                    <p className="eyebrow">VOTER RECORD</p>
                    <h2>{session.voter?.name || "Voter"}</h2>
                    <p className="portal-muted">EPIC: {session.voter?.epic || epic}</p>
                    <p className="portal-muted">Status: <strong>{personaLabel(session.personaStatus || session.status)}</strong></p>
                    {config && <PersonaFlow config={config} onComplete={handlePersonaComplete} />}
                    {session.status === "persona_pending" && !config && <button className="secondary-btn" onClick={() => syncStatus(session.sessionId)} disabled={busy}>Refresh Persona status</button>}
                    {session.status === "fingerprint_pending" && <form className="portal-form fingerprint-demo-form" onSubmit={submitFingerprint}>
                        <h2>Demonstration fingerprint scanner</h2>
                        <p className="portal-muted">Persona approved the document and face checks. Enter the demo scan token shown for this voter.</p>
                        <label>Scanner token<input value={scanToken} onChange={(event) => setScanToken(event.target.value)} autoComplete="off" /></label>
                        <button disabled={busy}>{busy ? "Checking…" : "Verify fingerprint"}</button>
                    </form>}
                    {session.status === "verified" && <div className="portal-notice"><strong>Voter check complete.</strong> Persona approved the identity and the demo scanner stage passed.</div>}
                    {session.status === "review_required" && <div className="portal-error">Persona did not approve this inquiry. Follow the review outcome in Persona before continuing.</div>}
                    <button className="secondary-btn" onClick={() => { setSession(null); setConfig(null); setEpic(""); setError(""); setNotice(""); }}>Start another voter check</button>
                </section>}
                <p className="portal-footer"><Link to="/">Public portal</Link></p>
            </section>
        </main>
    );
}

export default VotingVerification;
