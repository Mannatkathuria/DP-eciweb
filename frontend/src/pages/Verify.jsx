import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PersonaFlow from "./PersonaFlow";
import "./PersonaVerification.css";

const statusText = {
    unverified: "Not verified",
    pending: "Verification in progress",
    pending_review: "Submitted to Persona; awaiting a decision",
    review_required: "Needs review",
    verified: "Verified",
    declined: "Not approved",
    failed: "Verification failed",
    expired: "Verification expired"
};

function Verify() {
    const { logged, userData, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [status, setStatus] = useState("unverified");
    const [inquiryId, setInquiryId] = useState(null);
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const loadStatus = useCallback(async () => {
        const { data } = await api.get("/persona/status");
        setStatus(data.data.status);
        setInquiryId(data.data.inquiryId);
        return data.data;
    }, []);

    useEffect(() => {
        if (!logged || userData?.role !== "voter") return;
        loadStatus().catch((err) => setError(err.response?.data?.message || "Could not load verification status."));
    }, [logged, userData?.role, loadStatus]);

    const startVerification = async () => {
        setError("");
        setNotice("");
        setLoading(true);
        try {
            const { data } = await api.post("/persona/start");
            const inquiry = data.data;
            setInquiryId(inquiry.inquiryId);
            setStatus(inquiry.status);
            if (["verified", "pending_review", "review_required"].includes(inquiry.status)) {
                setNotice(`Current Persona status: ${statusText[inquiry.status] || inquiry.status}.`);
                return;
            }
            setConfig(inquiry);
        } catch (err) {
            setError(err.response?.data?.message || "Could not start Persona verification.");
        } finally {
            setLoading(false);
        }
    };

    const refreshStatus = useCallback(async (completedInquiryId = inquiryId) => {
        setError("");
        try {
            if (completedInquiryId) {
                const { data } = await api.post("/persona/sync", { inquiryId: completedInquiryId });
                setStatus(data.data.status);
                setInquiryId(data.data.inquiryId);
                setNotice(`Persona status: ${statusText[data.data.status] || data.data.status}.`);
            } else {
                const record = await loadStatus();
                setNotice(`Persona status: ${statusText[record.status] || record.status}.`);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Could not refresh Persona status.");
        }
    }, [inquiryId, loadStatus]);

    const handleComplete = useCallback(async (result) => {
        await refreshStatus(result?.inquiryId || inquiryId);
        setConfig(null);
    }, [inquiryId, refreshStatus]);

    if (!logged) return <Navigate to="/login?role=voter" replace />;
    if (userData?.role !== "voter") {
        return <Navigate to={userData?.role === "eci" ? "/eci/dashboard" : "/admin"} replace />;
    }

    return (
        <main className="persona-page">
            <header className="persona-header">
                <div><p className="eyebrow">VOTER SERVICES</p><h1>Identity verification</h1><p>Signed in as {userData?.name || userData?.epic}</p></div>
                <div className="persona-header-actions">
                    <Link className="secondary-btn" to="/dashboard">Dashboard</Link>
                    <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>Sign out</button>
                </div>
            </header>

            <section className={`persona-status-card persona-status-${status}`}>
                <div>
                    <p className="eyebrow">CURRENT STATUS</p>
                    <h2>{statusText[status] || status.replaceAll("_", " ")}</h2>
                    <p>{status === "verified"
                        ? "Persona approved your identity inquiry."
                        : status === "pending_review"
                            ? "Your document and face checks were submitted. Your verification will update when Persona returns a decision."
                            : "Complete the Persona flow to submit your document and face checks."}</p>
                </div>
                {status !== "verified" && <button className="primary-btn" onClick={startVerification} disabled={loading}>
                    {loading ? "Preparing…" : status === "pending" ? "Resume Persona verification" : "Start Persona verification"}
                </button>}
                <button type="button" className="secondary-btn" onClick={() => refreshStatus()} disabled={loading}>Refresh status</button>
            </section>

            {error && <p className="persona-flow-error" role="alert">{error}</p>}
            {notice && <p className="persona-flow-notice" role="status">{notice}</p>}
            {config && <PersonaFlow config={config} onComplete={handleComplete} />}
            <p className="persona-footnote">This sandbox prototype uses Persona for document and face verification. Verification decisions follow the status returned by Persona.</p>
        </main>
    );
}

export default Verify;
