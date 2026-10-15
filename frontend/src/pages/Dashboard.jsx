import { Link } from "react-router-dom";
import "./Dashboard.css";

function Dashboard() {
    return (
        <main className="dashboard">
            <section className="hero">
                <p className="eyebrow">ELECTOR SERVICES</p>
                <h1>One voter record.<br />Three verification stages.</h1>
                <p className="hero-description">
                    Register before election day, verify your electoral record,
                    and use the authorised polling-station verification workflow on election day.
                </p>
                <div className="hero-actions">
                    <Link to="/register" className="primary-btn">Register as voter</Link>
                    <Link to="/verify" className="secondary-btn">Pre-election verification</Link>
                    <Link to="/electoral-roll" className="secondary-btn">Check Electoral Roll</Link>
                </div>
            </section>

            <section className="info-section">
                <div className="info-card">
                    <span className="step-number">01</span>
                    <h3>Register</h3>
                    <p>Submit a registration request. Once your Booth Level Officer approves it, you can sign in with your EPIC number.</p>
                </div>
                <div className="info-card">
                    <span className="step-number">02</span>
                    <h3>Verify before election day</h3>
                    <p>Match your electoral record with an authorised identity credential and complete liveness.</p>
                </div>
                <div className="info-card">
                    <span className="step-number">03</span>
                    <h3>Verify at the polling station</h3>
                    <p>Only an authenticated ECI operator can open the during-voting document + face + fingerprint workflow.</p>
                </div>
            </section>

            <section className="notice">
                <strong>Important:</strong>
                <p>
                    This is a prototype. Government identity APIs and certified fingerprint hardware are represented by sandbox/demo adapters.
                    The system does not itself establish legal eligibility to vote.
                </p>
            </section>

            <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
                <Link to="/login?role=voter">Voter sign in</Link>{" · "}
                <Link to="/login?role=blo">BLO sign in</Link>{" · "}
                <Link to="/eci/login">ECI official portal</Link>
            </p>
        </main>
    );
}

export default Dashboard;
