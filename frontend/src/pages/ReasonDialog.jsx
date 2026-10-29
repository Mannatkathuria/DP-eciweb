import { useEffect, useRef, useState } from "react";

/**
 * In-page dialog that asks a BLO for a reason or note before a decision is sent.
 * Replaces window.prompt(), whose Cancel button returned null and was treated as an empty reason.
 *
 * - Cancel, Escape and clicking outside close the dialog without calling onConfirm.
 * - When `required` is true, a blank or whitespace-only reason cannot be submitted.
 * - onConfirm(reason) returns a promise; the dialog stays open (showing `error`) if it fails.
 */
function ReasonDialog({ title, label, hint, required = false, confirmLabel, confirmClass = "btn-reject", busy = false, error = "", onConfirm, onCancel }) {
    const [reason, setReason] = useState("");
    const [touched, setTouched] = useState(false);
    const textareaRef = useRef(null);

    useEffect(() => {
        textareaRef.current?.focus();
        const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [busy, onCancel]);

    const trimmed = reason.trim();
    const missing = required && !trimmed;

    const submit = (e) => {
        e.preventDefault();
        setTouched(true);
        if (missing || busy) return;
        onConfirm(trimmed);
    };

    return (
        <div className="modal-overlay reason-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
            <form className="reason-dialog" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title" onSubmit={submit}>
                <h3 id="reason-dialog-title">{title}</h3>
                <label htmlFor="reason-dialog-text">
                    {label}{required ? " *" : " (optional)"}
                </label>
                <textarea
                    id="reason-dialog-text"
                    ref={textareaRef}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    rows={4}
                    disabled={busy}
                    aria-invalid={touched && missing ? "true" : undefined}
                    aria-describedby="reason-dialog-help"
                />
                <p id="reason-dialog-help" className={touched && missing ? "reason-error" : "reason-hint"} role={touched && missing ? "alert" : undefined}>
                    {touched && missing ? "Enter a reason. It is shown to the applicant." : hint}
                </p>
                {error && <p className="reason-error" role="alert">{error}</p>}
                <div className="row-actions reason-actions">
                    <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
                    <button type="submit" className={confirmClass} disabled={busy}>
                        {busy ? "Saving…" : confirmLabel}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default ReasonDialog;
