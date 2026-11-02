import { useState } from "react";
import api from "../api/axios";
import { apiMessage } from "../config/elections";

// ECI administrator: suspend or reinstate an account. A suspended account cannot sign in, its
// sessions stop working at once and none of its assignments apply. Needs a reason and a fresh
// one-time code; both steps are audited.
export default function AccountSuspension() {
    const [epic, setEpic] = useState("");
    const [reason, setReason] = useState("");
    const [account, setAccount] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const find = async (e) => {
        e.preventDefault(); setError(""); setNotice(""); setAccount(null);
        try { setAccount((await api.get(`/users/${encodeURIComponent(epic.trim().toUpperCase())}`)).data.data); }
        catch (err) { setError(apiMessage(err, "No account found.")); }
    };
    const act = async (suspend) => {
        setBusy(true); setError(""); setNotice("");
        try {
            const { data } = await api.post(`/users/${account.epic}/${suspend ? "suspend" : "reinstate"}`, { reason });
            setNotice(data.message); setReason("");
            setAccount((await api.get(`/users/${account.epic}`)).data.data);
        } catch (err) { setError(apiMessage(err, "Nothing was changed.")); }
        finally { setBusy(false); }
    };

    return (
        <section className="panel" style={{ marginTop: 24 }}>
            <h2>Account suspension</h2>
            <p className="muted">Suspending stops the account at once without deleting its assignments. Reinstating restores them.</p>
            <form className="portal-form" onSubmit={find} style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <div className="field" style={{ margin: 0, flex: 1 }}><label htmlFor="sus-epic">Sign-in ID</label>
                    <input id="sus-epic" value={epic} onChange={(e) => setEpic(e.target.value)} required placeholder="ERO1000001" /></div>
                <button className="btn btn-secondary" type="submit">Find</button>
            </form>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {notice && <div className="alert alert-ok" role="status">{notice}</div>}
            {account && (
                <div style={{ marginTop: 12 }}>
                    <p><strong>{account.name ?? account.epic}</strong> ({account.epic}, {account.role}) ·{" "}
                        {account.suspended ? <span className="badge badge-bad">Suspended {new Date(account.suspendedAt).toLocaleDateString()}: {account.suspensionReason}</span> : <span className="badge badge-ok">Active</span>}</p>
                    <div className="field"><label htmlFor="sus-reason">Reason</label>
                        <input id="sus-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} /></div>
                    <button className={account.suspended ? "btn btn-primary" : "btn-reject"} disabled={busy || reason.trim().length < 5} onClick={() => act(!account.suspended)}>
                        {account.suspended ? "Reinstate account" : "Suspend account"}</button>
                </div>
            )}
        </section>
    );
}
