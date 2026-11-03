import { useEffect, useState } from "react";
import api from "../api/axios";

// The documents of a Form 6 application (photograph, proof of age, proof of address), fetched
// with the officer's session (the server checks jurisdiction) and shown in a dialog. Documents
// are deleted once the ERO/AERO decides, so a decided application shows none.
const LABEL = { photo: "Photograph", ageProof: "Proof of age", addressProof: "Proof of address" };

export default function ApplicationDocuments({ application }) {
    const [open, setOpen] = useState(null); // { category, url, type }
    const [error, setError] = useState("");
    const [busy, setBusy] = useState("");

    useEffect(() => () => { if (open?.url) URL.revokeObjectURL(open.url); }, [open]);

    const show = async (category) => {
        setBusy(category); setError("");
        try {
            const res = await api.get(`/admin/registrations/${application._id}/documents/${category}`, { responseType: "blob" });
            setOpen({ category, url: URL.createObjectURL(res.data), type: res.data.type });
        } catch (err) {
            let message = "The document could not be opened.";
            try { message = JSON.parse(await err.response.data.text()).message || message; } catch { /* keep the default */ }
            setError(message);
        } finally { setBusy(""); }
    };

    return (
        <div style={{ marginBottom: 6 }}>
            {Object.entries(LABEL).map(([category, label]) => (
                <button key={category} type="button" className="tab-btn" style={{ padding: "4px 8px", fontSize: "11px", marginRight: 4, marginBottom: 4 }}
                    disabled={busy === category} onClick={() => show(category)}>🔍 {label}</button>
            ))}
            {error && <p className="row-error" role="alert">{error}</p>}
            {open && (
                <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={LABEL[open.category]} onClick={() => setOpen(null)}
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "grid", placeItems: "center", zIndex: 1000 }}>
                    <div className="panel" style={{ maxWidth: "90vw", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ marginTop: 0 }}>{LABEL[open.category]}: {application.name}</h3>
                        {open.type === "application/pdf"
                            ? <iframe title={LABEL[open.category]} src={open.url} style={{ width: "80vw", height: "75vh", border: 0 }} />
                            : <img src={open.url} alt={`${LABEL[open.category]} of ${application.name}`} style={{ maxWidth: "80vw", maxHeight: "75vh" }} />}
                        <p><button className="btn btn-secondary" onClick={() => setOpen(null)}>Close</button></p>
                    </div>
                </div>
            )}
        </div>
    );
}
