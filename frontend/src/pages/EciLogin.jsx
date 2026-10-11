import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import "./Portal.css";

function EciLogin() {
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();
    const [username, setUsername] = useState("eci");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async e => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const { data } = await api.post("/auth/login", { username, password });
            if (data.user?.role !== "eci") throw new Error("This account is not authorised for the ECI portal.");
            login(data.user.username, data.token, data.user);
            navigate("/eci/voting-verification");
        } catch (err) {
            setError(err.response?.data?.message || err.message || "Unable to sign in.");
        } finally { setLoading(false); }
    };

    return (
        <main className="portal-page">
            <section className="portal-card">
                <p className="eyebrow">ECI OFFICIAL PORTAL</p>
                <h1>Polling-station verification</h1>
                <p className="portal-muted">Restricted to authorised election officials.</p>
                {error && <div className="portal-error">{error}</div>}
                <form onSubmit={submit} className="portal-form">
                    <label>Official username<input value={username} onChange={e => setUsername(e.target.value)} /></label>
                    <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
                    <button disabled={loading}>{loading ? "Signing in…" : "Enter ECI portal"}</button>
                </form>
                <p className="portal-footer"><Link to="/">Back to public portal</Link></p>
            </section>
        </main>
    );
}
export default EciLogin;
