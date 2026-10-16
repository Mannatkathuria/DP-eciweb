import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Portal.css";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;

function EciLogin() {
    const navigate = useNavigate();
    const [epic, setEpic] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async e => {
        e.preventDefault();
        setError("");

        const value = epic.trim().toUpperCase();
        if (!EPIC_PATTERN.test(value)) {
            setError("Enter a valid EPIC number (three letters followed by seven digits).");
            return;
        }

        setLoading(true);
        try {
            await api.post("/auth/login", { epic: value, portal: "eci" });
            navigate(`/login/otp?epic=${encodeURIComponent(value)}&portal=eci`);
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Unable to sign in.");
        } finally { setLoading(false); }
    };

    return (
        <main className="portal-page">
            <section className="portal-card">
                <p className="eyebrow">ECI OFFICIAL PORTAL</p>
                <h1>Polling-station verification</h1>
                <p className="portal-muted">Restricted to authorised election officials. Sign in with your EPIC number; a one-time code (OTP) will be sent for verification.</p>
                {error && <div className="portal-error">{error}</div>}
                <form onSubmit={submit} className="portal-form">
                    <label>Official EPIC number<input value={epic} onChange={e => setEpic(e.target.value.toUpperCase())} maxLength={10} placeholder="e.g. ECI0000001" autoComplete="off" /></label>
                    <button disabled={loading}>{loading ? "Sending OTP…" : "Continue"}</button>
                </form>
                <p className="portal-muted">Sandbox demo EPIC: <strong>ECI1234567</strong>. The generated OTP appears in the backend terminal.</p>
                <p className="portal-footer"><Link to="/">Back to public portal</Link></p>
            </section>
        </main>
    );
}
export default EciLogin;
