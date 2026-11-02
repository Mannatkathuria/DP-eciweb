import { useCallback, useEffect, useRef, useState } from "react";
import api, { rememberStepUp, setStepUpPrompt } from "../api/axios";

// Asks a signed-in official to confirm it's them with a fresh one-time code before a sensitive
// approval (registration decisions, station approvals, roll publication, appointments...). The
// server decides which actions need it; this dialog only appears when the server asks.
export default function StepUpDialog() {
    const [open, setOpen] = useState(false);
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const resolver = useRef(null);
    const inputRef = useRef(null);

    const send = useCallback(async () => {
        setError(""); setNotice("");
        try { const { data } = await api.post("/auth/step-up/request"); setNotice(data.message); }
        catch (err) { setError(err.response?.data?.message || "Could not send a code."); }
    }, []);

    useEffect(() => {
        setStepUpPrompt(() => new Promise((resolve) => {
            resolver.current = resolve;
            setOtp(""); setError(""); setOpen(true);
            send();
        }));
        return () => setStepUpPrompt(null);
    }, [send]);
    useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

    const finish = (ok) => { setOpen(false); resolver.current?.(ok); resolver.current = null; };
    const submit = async (e) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(otp)) { setError("Enter the six-digit code."); return; }
        setBusy(true); setError("");
        try {
            const { data } = await api.post("/auth/step-up/verify", { otp });
            rememberStepUp(data.data.stepUpToken, data.data.expiresInMinutes);
            finish(true);
        } catch (err) { setError(err.response?.data?.message || "That code did not work."); }
        finally { setBusy(false); }
    };

    if (!open) return null;
    return (
        <div className="modal-overlay reason-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) finish(false); }}
            onKeyDown={(e) => { if (e.key === "Escape" && !busy) finish(false); }}>
            <form className="reason-dialog" role="dialog" aria-modal="true" aria-labelledby="stepup-title" onSubmit={submit}>
                <h3 id="stepup-title">Confirm it's you</h3>
                <p>This action needs a fresh one-time code. Once confirmed, you won't be asked again for a few minutes.</p>
                {notice && <p className="muted" role="status"><small>{notice} In this demo the code is printed in the backend terminal.</small></p>}
                <label htmlFor="stepup-otp">One-time code</label>
                <input id="stepup-otp" ref={inputRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
                {error && <p className="reason-error" role="alert">{error}</p>}
                <div className="row-actions reason-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => finish(false)} disabled={busy}>Cancel</button>{" "}
                    <button type="button" className="btn btn-secondary" onClick={send} disabled={busy}>Send a new code</button>{" "}
                    <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Checking…" : "Confirm"}</button>
                </div>
            </form>
        </div>
    );
}
