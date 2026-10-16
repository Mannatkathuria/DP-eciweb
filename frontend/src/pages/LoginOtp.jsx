import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios";
import { AuthContext } from "../context/AuthContext";
import { useContext } from "react";
import "./Login.css";

function LoginOtp() {
    const [params] = useSearchParams();
    const epic = String(params.get("epic") || "").trim().toUpperCase();
    const portal = params.get("portal") || "voter";
    const navigate = useNavigate();
    const { logged, userData, login } = useContext(AuthContext);
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");

    if (logged && userData?.role) {
        const destination = userData.role === "eci" ? "/eci/dashboard"
            : userData.role === "blo" || userData.role === "admin" ? "/admin" : "/dashboard";
        return <Navigate to={destination} replace />;
    }
    if (!/^[A-Z]{3}\d{7}$/.test(epic)) {
        return <Navigate to={portal === "eci" ? "/eci/login" : `/login?role=${portal === "blo" ? "blo" : "voter"}`} replace />;
    }

    const verify = async (event) => {
        event.preventDefault();
        setError("");
        setNotice("");
        if (!/^\d{6}$/.test(otp)) {
            setError("Enter the six-digit OTP.");
            return;
        }
        try {
            setBusy(true);
            const { data } = await api.post("/verification/otp/verify", { electorId: epic, otp });
            login(data.user.epic, data.token, data.user);
            const destination = data.user.role === "eci" ? "/eci/dashboard"
                : data.user.role === "blo" || data.user.role === "admin" ? "/admin" : "/dashboard";
            navigate(destination, { replace: true });
        } catch (err) {
            setError(err.response?.data?.message || "OTP verification failed.");
        } finally {
            setBusy(false);
        }
    };

    const resend = async () => {
        setError("");
        setNotice("");
        try {
            setBusy(true);
            await api.post("/verification/otp/send", { electorId: epic });
            setOtp("");
            setNotice("A new demo OTP was generated. Check the backend terminal.");
        } catch (err) {
            setError(err.response?.data?.message || "Could not generate a new OTP.");
        } finally {
            setBusy(false);
        }
    };

    const signInPath = portal === "eci" ? "/eci/login" : `/login?role=${portal === "blo" ? "blo" : "voter"}`;
    return (
        <main className="login-page">
            <section className="login-card">
                <div className="login-header">
                    <p className="eyebrow">SECURE SIGN IN</p>
                    <h1>Enter your OTP</h1>
                    <p>Confirm sign-in for EPIC <strong>{epic}</strong>. You will continue to your dashboard after this step.</p>
                </div>
                {error && <div className="login-error" role="alert">{error}</div>}
                {notice && <div className="otp-notice" role="status">{notice}</div>}
                <form onSubmit={verify}>
                    <div className="form-group">
                        <label htmlFor="login-otp">Six-digit OTP</label>
                        <input id="login-otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Enter OTP" autoFocus required />
                    </div>
                    <button className="login-button" disabled={busy || otp.length !== 6}>{busy ? "Checking…" : "Verify and continue"}</button>
                </form>
                <p className="login-demo">Demo OTPs are printed by the backend. No SMS is sent.</p>
                <div className="otp-actions">
                    <button type="button" className="back-button" onClick={resend} disabled={busy}>Generate a new OTP</button>
                    <Link to={signInPath}>Back to sign in</Link>
                </div>
            </section>
        </main>
    );
}

export default LoginOtp;
