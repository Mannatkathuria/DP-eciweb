import { useContext } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import "./Dashboard.css";

function EciDashboard() {
    const { logged, userData, logout } = useContext(AuthContext);
    const navigate = useNavigate();
    if (!logged) return <Navigate to="/eci/login" replace />;
    if (userData?.role !== "eci") return <Navigate to={userData?.role === "voter" ? "/dashboard" : "/admin"} replace />;

    return (
        <main className="dashboard">
            <header className="voter-dashboard-header">
                <div><p className="eyebrow">ECI OFFICIAL DASHBOARD</p><p>Signed in as <strong>{userData?.name || userData?.epic}</strong></p></div>
                <button className="secondary-btn" onClick={async () => { await logout(); navigate("/"); }}>Sign out</button>
            </header>
            <section className="hero">
                <p className="eyebrow">ELECTION OFFICIAL</p>
                <h1>Polling station dashboard</h1>
                <p className="hero-description">Start a voter check using Persona's embedded document and face verification flow, then complete the demonstration fingerprint step.</p>
                <div className="hero-actions">
                    <Link to="/eci/voting-verification" className="primary-btn">Start voter verification</Link>
                    <Link to="/" className="secondary-btn">Public portal</Link>
                </div>
            </section>
            <section className="info-section voter-dashboard-info">
                <div className="info-card"><span className="step-number">01</span><h3>Open voter record</h3><p>Enter the voter EPIC and open a time-limited verification session.</p></div>
                <div className="info-card"><span className="step-number">02</span><h3>Verify with Persona</h3><p>Run the document and configured face checks inside the app.</p></div>
                <div className="info-card"><span className="step-number">03</span><h3>Record the result</h3><p>Continue only after Persona approves the inquiry. The fingerprint stage is a demo scanner adapter.</p></div>
            </section>
        </main>
    );
}

export default EciDashboard;
