import { useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PersonaFlow from "./PersonaFlow";
import "./Portal.css";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;

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
    const [alreadyVotedInfo, setAlreadyVotedInfo] = useState(null);
    const [votedReceipt, setVotedReceipt] = useState(null);

    const syncStatus = useCallback(async (sessionId) => {
        if (!sessionId) return;
        try {
            const { data } = await api.post(`/voting-verification/${sessionId}/persona/sync`);
            setSession((current) => current ? {
                ...current,
                status: data.data.status,
                personaStatus: data.data.personaStatus
            } : current);
            setNotice(`Verification status: ${data.data.personaStatus.toUpperCase()}`);
            if (data.data.status === "fingerprint_pending" || data.data.status === "review_required") {
                setConfig(null);
            }
        } catch (err) {
            console.error("Sync error:", err);
        }
    }, []);

    const openSession = async (event) => {
        event.preventDefault();
        setError("");
        setNotice("");
        setAlreadyVotedInfo(null);
        setVotedReceipt(null);

        const value = epic.trim().toUpperCase();
        if (!EPIC_PATTERN.test(value)) {
            return setError(t("login.invalidEpic") || "Enter a valid 10-character EPIC number.");
        }

        setBusy(true);
        try {
            const { data: started } = await api.post("/voting-verification/start", { epic: value });
            const activeSession = started.data;
            setSession(activeSession);
            setScanToken(`FP-${activeSession.voter.epic}`);

            // Start Persona verification step for voting day
            const { data: persona } = await api.post(`/voting-verification/${activeSession.sessionId}/persona/start`);
            if (["verified", "pending_review", "review_required", "approved"].includes(persona.data.status)) {
                await syncStatus(activeSession.sessionId);
            } else {
                setConfig(persona.data);
            }
        } catch (err) {
            console.error("Open session failed:", err);
            if (err.response?.status === 409) {
                setAlreadyVotedInfo(err.response?.data?.message || "Duplicate vote prevented: Voter has already voted.");
            } else {
                setError(err.response?.data?.message || t("eci.openSessionFailed") || "Could not open voter check.");
            }
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
            setVotedReceipt({
                epic: session.voter.epic,
                name: session.voter.name,
                pollingStation: session.voter.pollingStation,
                votedAt: new Date().toISOString()
            });
            setNotice("✓ Voter identity authenticated! Ballot recorded in official electoral roll.");
        } catch (err) {
            setError(err.response?.data?.message || t("eci.fingerprintFailed") || "Biometric verification failed.");
        } finally {
            setBusy(false);
        }
    };

    const resetCheck = () => {
        setSession(null);
        setConfig(null);
        setEpic("");
        setError("");
        setNotice("");
        setAlreadyVotedInfo(null);
        setVotedReceipt(null);
    };

    if (!logged) return <Navigate to="/eci/login" replace />;
    if (userData?.role !== "eci") return <Navigate to={userData?.role === "voter" ? "/dashboard" : "/admin"} replace />;

    return (
        <main className="portal-page">
            <section className="portal-card voting-verification-card">
                <header className="voting-verification-header">
                    <div>
                        <p className="eyebrow">Election Commission of India · Polling Station Verification</p>
                        <h1>On-Day Voter Authentication</h1>
                        <p className="portal-muted">Conduct live identity verification, biometric fingerprint check, and record ballot casting.</p>
                    </div>
                    <div className="portal-actions">
                        <Link to="/eci/dashboard" className="secondary-btn">{t("common.dashboard") || "ECI Dashboard"}</Link>
                        <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>{t("common.signOut") || "Sign Out"}</button>
                    </div>
                </header>

                {error && <div className="portal-error" role="alert">{error}</div>}
                {notice && <div className="portal-notice" role="status">{notice}</div>}

                {/* Duplicate Voting Warning */}
                {alreadyVotedInfo && (
                    <div className="portal-error" style={{ borderLeft: "5px solid #c62828", background: "#ffebee", padding: "16px", borderRadius: "12px", margin: "16px 0" }}>
                        <h3 style={{ margin: "0 0 6px", color: "#c62828" }}>🚫 Duplicate Voting Prohibited</h3>
                        <p style={{ margin: 0, fontWeight: "600" }}>{alreadyVotedInfo}</p>
                    </div>
                )}

                {!session && (
                    <form onSubmit={openSession} className="portal-form" style={{ marginTop: "20px" }}>
                        <label>
                            {t("eci.voterEpicLabel") || "Voter EPIC Number"}
                            <input
                                value={epic}
                                onChange={(event) => setEpic(event.target.value.toUpperCase())}
                                maxLength={10}
                                placeholder="Enter voter EPIC (e.g. ABC1234567, DEF7654321)"
                                autoComplete="off"
                                autoFocus
                            />
                        </label>
                        <button disabled={busy} className="primary-btn">
                            {busy ? "Looking up Voter…" : "Open Voter Check"}
                        </button>
                    </form>
                )}

                {session && (
                    <section className="verification-stage" style={{ marginTop: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                            <div>
                                <p className="eyebrow">Electoral Record</p>
                                <h2 style={{ margin: "0 0 4px" }}>{session.voter?.name}</h2>
                                <p className="portal-muted" style={{ margin: "2px 0" }}><strong>EPIC:</strong> <code>{session.voter?.epic}</code></p>
                                <p className="portal-muted" style={{ margin: "2px 0" }}><strong>DOB & Gender:</strong> {session.voter?.dateOfBirth?.slice(0, 10)} · {session.voter?.gender}</p>
                                <p className="portal-muted" style={{ margin: "2px 0" }}><strong>Constituency:</strong> {session.voter?.assemblyConstituency}, {session.voter?.district}</p>
                                <p className="portal-muted" style={{ margin: "2px 0" }}><strong>Polling Station:</strong> {session.voter?.pollingStation} (Part {session.voter?.partNumber})</p>
                            </div>

                            <div>
                                <span className={`badge ${session.status === "verified" ? "badge-verified" : "badge-progress"}`}>
                                    {session.status.toUpperCase()}
                                </span>
                            </div>
                        </div>

                        {/* Step 1: Persona Flow if applicable */}
                        {config && <PersonaFlow config={config} onComplete={handlePersonaComplete} />}

                        {/* Step 2: Fingerprint Scan */}
                        {session.status === "fingerprint_pending" && (
                            <form className="portal-form fingerprint-demo-form" onSubmit={submitFingerprint} style={{ marginTop: "24px", padding: "20px", borderRadius: "14px", background: "rgba(0,0,0,0.03)" }}>
                                <h3>{t("eci.demoScannerTitle") || "Biometric Scanner Verification"}</h3>
                                <p className="portal-muted">
                                    Simulating certified ECI polling station fingerprint scanner. Token generated: <code>{scanToken}</code>.
                                </p>
                                <label>
                                    {t("eci.scannerToken") || "Scanner Token"}
                                    <input
                                        value={scanToken}
                                        onChange={(event) => setScanToken(event.target.value)}
                                        autoComplete="off"
                                    />
                                </label>
                                <button disabled={busy} className="primary-btn">
                                    {busy ? (t("common.checking") || "Authenticating…") : "Authenticate Fingerprint & Cast Vote"}
                                </button>
                            </form>
                        )}

                        {/* Certified Voting Receipt */}
                        {votedReceipt && (
                            <div className="admin-notice" style={{ background: "#e8f5e9", borderLeft: "5px solid #56a581", marginTop: "24px" }}>
                                <h3 style={{ color: "#2e7d32", margin: "0 0 6px" }}>✓ Voting Completed & Certified</h3>
                                <p style={{ margin: "4px 0" }}>Voter <strong>{votedReceipt.name}</strong> ({votedReceipt.epic}) has successfully cast their vote.</p>
                                <p style={{ margin: "4px 0" }}><strong>Polling Booth:</strong> {votedReceipt.pollingStation}</p>
                                <p style={{ margin: "4px 0" }}><strong>Timestamp:</strong> {new Date(votedReceipt.votedAt).toLocaleString()}</p>
                                <small style={{ color: "var(--text-secondary)" }}>
                                    Electoral roll record updated with <code>hasVoted: true</code> to prevent duplicate ballots.
                                </small>
                            </div>
                        )}

                        <div style={{ marginTop: "24px" }}>
                            <button className="primary-btn" onClick={resetCheck}>
                                {session.status === "verified" ? "✓ Proceed to Next Voter" : "Start Another Check"}
                            </button>
                        </div>
                    </section>
                )}

                <p className="portal-footer" style={{ marginTop: "30px" }}>
                    <Link to="/">{t("eci.publicPortal") || "Return to Portal Selection"}</Link>
                </p>
            </section>
        </main>
    );
}

export default VotingVerification;
