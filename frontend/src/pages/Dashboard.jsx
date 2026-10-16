import { useContext, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import "./Dashboard.css";

function Dashboard() {
    const { logged, userData, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    const [verification, setVerification] = useState(null);
    const [verificationError, setVerificationError] = useState("");

    useEffect(() => {
        if (!logged || userData?.role !== "voter") return;
        api.get("/persona/status")
            .then(({ data }) => setVerification(data.data))
            .catch((error) => setVerificationError(error.response?.data?.message || "Verification status is unavailable."));
    }, [logged, userData?.role]);

    if (!logged) return <Navigate to="/login?role=voter" replace />;
    if (userData?.role === "eci") return <Navigate to="/eci/dashboard" replace />;
    if (userData?.role === "blo" || userData?.role === "admin") return <Navigate to="/admin" replace />;

    const verified = verification?.status === "verified";
    return (
        <main className="dashboard">
            <header className="voter-dashboard-header">
                <div><p className="eyebrow">VOTER DASHBOARD</p><p>Signed in as <strong>{userData?.name || userData?.epic}</strong></p></div>
                <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>Sign out</button>
            </header>
            <section className="hero">
                <p className="eyebrow">ELECTOR SERVICES</p>
                <h1>Welcome{userData?.name ? `, ${userData.name}` : ""}</h1>
                <p className="hero-description">Manage your voter record and identity verification from your dashboard.</p>
                {!verified && (
                    <div className="voter-verification-warning" role="status">
                        <strong>You are not verified yet.</strong>
                        <p>{verification?.status === "pending_review"
                            ? "Your Persona check is submitted and awaiting a decision."
                            : verification?.status === "pending"
                                ? "Your Persona verification is in progress. Resume it to finish."
                                : "Complete Persona document and face verification to update your status."}</p>
                        {verificationError && <p>{verificationError}</p>}
                        <Link to="/verify" className="primary-btn">{verification?.status === "pending" ? "Resume verification" : "Verify with Persona"}</Link>
                    </div>
                )}
                {verified && <div className="voter-verification-success"><strong>Your identity verification is approved.</strong></div>}
                <div className="hero-actions">
                    <Link to="/verify" className="secondary-btn">{verified ? "View verification" : "Open Persona verification"}</Link>
                    <Link to="/electoral-roll" className="secondary-btn">Check electoral roll</Link>
                </div>
            </section>
            <section className="info-section voter-dashboard-info">
                <div className="info-card"><span className="step-number">01</span><h3>Persona document check</h3><p>Submit an identity document through the embedded Persona flow.</p></div>
                <div className="info-card"><span className="step-number">02</span><h3>Face verification</h3><p>Persona runs the face checks configured for this Sandbox inquiry template.</p></div>
                <div className="info-card"><span className="step-number">03</span><h3>Track your status</h3><p>Your status updates when Persona sends a decision or you refresh it from the verification page.</p></div>
            </section>
        </main>
    );
}

export default Dashboard;
