import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import "./Login.css";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;
const DEMO_EPIC = { voter: "ABC1234567", blo: "BLO1234567" };

function Login() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const portal = params.get("role") === "blo" ? "blo" : "voter";
    const [epic, setEpic] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        const value = epic.trim().toUpperCase();
        if (!EPIC_PATTERN.test(value)) {
            setError("Enter a valid EPIC number (three letters followed by seven digits).");
            return;
        }

        try {
            setLoading(true);
            await api.post("/auth/login", { epic: value, portal });
            navigate(`/login/otp?epic=${encodeURIComponent(value)}&portal=${portal}`);
        } catch (err) {
            setError(err.response?.data?.message || "Unable to sign in. Please check your EPIC number and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-header">
                    <p className="eyebrow">{portal === "blo" ? "BLO PORTAL" : "ELECTOR SERVICES"}</p>
                    <h1>Sign in</h1>
                    <p>Enter your EPIC number. We will generate a one-time code (OTP) for this sign-in.</p>
                </div>
                {error && <div className="login-error" role="alert">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="epic">EPIC number</label>
                        <input id="epic" name="epic" type="text" value={epic}
                            onChange={(event) => setEpic(event.target.value.toUpperCase())}
                            autoComplete="off" maxLength={10} placeholder="e.g. ABC1234567" disabled={loading} autoFocus />
                    </div>
                    <button type="submit" className="login-button" disabled={loading}>
                        {loading ? "Sending OTP..." : "Continue"}
                    </button>
                </form>
                <p className="login-demo">Sandbox demo EPIC: <strong>{DEMO_EPIC[portal]}</strong><br />The generated OTP appears in the backend terminal.</p>
                <div className="login-footer"><Link to="/">Return to home</Link></div>
            </section>
        </main>
    );
}

export default Login;
