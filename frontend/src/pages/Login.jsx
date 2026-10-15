import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import "./Login.css";

const EPIC_PATTERN = /^[A-Z]{3}\d{7}$/;

function Login() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    // "voter" or "blo" (set by the portal the user chose); the server checks the role.
    const portal = params.get("role") === "blo" ? "blo" : "voter";

    const [epic, setEpic] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const value = epic.trim().toUpperCase();

        if (!EPIC_PATTERN.test(value)) {
            setError("Enter a valid EPIC number (three letters followed by seven digits).");
            return;
        }

        try {
            setLoading(true);

            // The server only checks that this EPIC belongs to a registered account
            // and generates the OTP. It never creates an account.
            await api.post("/auth/login", { epic: value, portal });

            // console.log(value);

            // Go straight to the verification page, where the OTP is entered.
            navigate("/verify", { state: { loginEpic: value, portal } });
        } catch (err) {
            
            console.log("Status:", err.response?.status);
            console.log("Response:", err.response?.data);

            setError(
                err.response?.data?.message ||
                "Unable to sign in. Please check your EPIC number and try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-page">

            <section className="login-card">

                <div className="login-header">
                    <p className="eyebrow">
                        {portal === "blo" ? "BLO PORTAL" : "ELECTOR SERVICES"}
                    </p>

                    <h1>Sign in</h1>

                    <p>
                        Enter your EPIC number. We will send a one-time
                        code (OTP) to verify it is you.
                    </p>
                </div>

                {error && (
                    <div className="login-error" role="alert">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>

                    <div className="form-group">
                        <label htmlFor="epic">
                            EPIC number
                        </label>

                        <input
                            id="epic"
                            name="epic"
                            type="text"
                            value={epic}
                            onChange={(e) => setEpic(e.target.value.toUpperCase())}
                            autoComplete="off"
                            maxLength={10}
                            placeholder="e.g. ABC1234567"
                            disabled={loading}
                            autoFocus
                        />
                    </div>

                    <button
                        type="submit"
                        className="login-button"
                        disabled={loading}
                    >
                        {loading ? "Sending OTP..." : "Continue"}
                    </button>

                </form>

                <div className="login-footer">
                    <Link to="/">
                        Return to home
                    </Link>
                </div>

            </section>

        </main>
    );
}

export default Login;
