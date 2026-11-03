import { useCallback, useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";

// Form 7: object to an entry in the roll, or ask for your own entry to be deleted. Electors object
// to entries in their own constituency; booth level agents for their own part (10 a day). The
// elector objected to is given notice and may reply here. The ERO decides after the BLO verifies.

const apiMessage = (err, fallback) => err?.response?.data?.message || fallback;
const STATUS = { notice: "Notice period (elector may reply)", pending_verification: "Waiting for BLO verification", field_verified: "Verified by BLO, waiting for the ERO",
    accepted: "Accepted: entry deleted", rejected: "Rejected: entry kept", withdrawn: "Withdrawn" };
const OPEN = ["notice", "pending_verification", "field_verified"];
const FILERS = ["voter", "bla"];

export default function Objection() {
    const { logged, userData } = useContext(AuthContext);
    const [data, setData] = useState(null);
    const [form, setForm] = useState({ targetEpic: "", ground: "", details: "", declaration: false });
    const [replies, setReplies] = useState({});
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const allowed = logged && FILERS.includes(userData?.role);
    const load = useCallback(async () => {
        try { setData((await api.get("/objections/my")).data.data); } catch (e) { setError(apiMessage(e, "Your objections could not be loaded.")); }
    }, []);
    useEffect(() => { if (allowed) load(); }, [allowed, load]);

    if (!allowed) {
        return (
            <>
                <PageHead title="Form 7: objection or deletion" crumbs={[{ label: "Voters", to: "/voters" }, { label: "Form 7" }]}
                    lede="Object to an entry in the electoral roll of your constituency, or ask for your own entry to be deleted." />
                <section className="section"><div className="container"><div className="panel">
                    <p>Sign in as a voter (or as a booth level agent) to file Form 7 or to answer an objection to your entry.</p>
                    <Link className="btn btn-primary" to="/signin/voter">Sign in as a voter</Link>{" "}
                    <Link className="btn btn-secondary" to="/signin/bla">Sign in as a booth level agent</Link>
                </div></div></section>
            </>
        );
    }

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { const r = await fn(); setNotice(r?.data?.message || ok); await load(); return true; }
        catch (e) { setError(apiMessage(e, "That did not work. Please try again.")); return false; }
        finally { setBusy(false); }
    };
    const submit = async (e) => {
        e.preventDefault();
        const done = await act(() => api.post("/objections", { ...form, targetEpic: form.targetEpic.trim().toUpperCase() }), "Filed.");
        if (done) setForm({ targetEpic: "", ground: "", details: "", declaration: false });
    };
    const self = form.targetEpic.trim().toUpperCase() === userData.epic;
    const grounds = data?.grounds ?? {};

    return (
        <>
            <PageHead title="Form 7: objection or deletion" crumbs={[{ label: "Voters", to: "/voters" }, { label: "Form 7" }]}
                lede={userData.role === "bla" ? "As a booth level agent you may file up to 10 objections a day, only for the part you are appointed to." : "Object to an entry in the roll of your own constituency, or enter your own EPIC number to ask for your entry to be deleted."} />
            <section className="section">
                <div className="container split">
                    <form className="panel portal-form" onSubmit={submit}>
                        <h2>File Form 7</h2>
                        <div className="field">
                            <label htmlFor="o-epic">EPIC number of the entry</label>
                            <input id="o-epic" value={form.targetEpic} onChange={set("targetEpic")} placeholder="ABC1234567" maxLength={10} required />
                            {self && <small className="muted">This is your own entry: you are asking for it to be deleted.</small>}
                        </div>
                        <div className="field">
                            <label htmlFor="o-ground">Ground</label>
                            <select id="o-ground" value={form.ground} onChange={set("ground")} required>
                                <option value="">Choose</option>
                                {Object.entries(grounds).filter(([k]) => !self || ["shifted", "duplicate"].includes(k)).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label htmlFor="o-details">Details</label>
                            <textarea id="o-details" rows={4} value={form.details} onChange={set("details")} minLength={20} maxLength={1000} required
                                placeholder="What you know, and how: for example, when the person moved and where." />
                            <small className="muted">{form.details.trim().length}/1000 (at least 20)</small>
                        </div>
                        <label className="checkbox" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <input type="checkbox" checked={form.declaration} onChange={set("declaration")} required />
                            <span>I declare that this is true to the best of my knowledge. I understand that a false statement is an offence under section 31 of the Representation of the People Act, 1950.</span>
                        </label>
                        <button className="btn btn-primary" type="submit" disabled={busy || !form.declaration}>File objection</button>
                        <p className="muted"><small>{self ? "The BLO verifies your request before the ERO decides." : `The elector is given ${data?.noticeDays ?? 7} days' notice to reply before the ERO decides. A BLO verifies the facts in the field.`} An accepted objection marks the entry deleted; the record and the order are kept.</small></p>
                    </form>
                    <div className="stack">
                        {error && <div className="alert alert-error" role="alert">{error}</div>}
                        {notice && <div className="alert alert-ok" role="status">{notice}</div>}
                        {data?.against?.length > 0 && (
                            <div className="panel">
                                <h2>Objections to your entry ({data.against.length})</h2>
                                <ul className="rows">
                                    {data.against.map((o) => (
                                        <li key={o._id}>
                                            <strong>{o.groundLabel}</strong> · {STATUS[o.status]}<br />
                                            <small className="muted">Filed {new Date(o.filedAt).toLocaleDateString()} by {o.objector.name || "an elector"}{o.objector.role === "bla" ? " (booth level agent)" : ""}{o.noticeUntil ? `; you may reply until ${new Date(o.noticeUntil).toLocaleDateString()}` : ""}</small>
                                            <p style={{ margin: "6px 0" }}>“{o.details}”</p>
                                            {o.reply ? <p className="muted">Your reply ({new Date(o.reply.at).toLocaleDateString()}): “{o.reply.text}”</p>
                                                : OPEN.includes(o.status) && (
                                                    <form onSubmit={(e) => { e.preventDefault(); act(() => api.post(`/objections/${o._id}/reply`, { reply: replies[o._id] ?? "" }), "Reply recorded."); }}>
                                                        <label htmlFor={`r-${o._id}`}>Your reply to the ERO</label>
                                                        <textarea id={`r-${o._id}`} rows={3} minLength={10} maxLength={1000} required value={replies[o._id] ?? ""} onChange={(e) => setReplies((r) => ({ ...r, [o._id]: e.target.value }))} />
                                                        <button className="btn btn-secondary btn-small" type="submit" disabled={busy}>Send reply</button>
                                                    </form>
                                                )}
                                            {o.decision?.reason && <p><strong>ERO's order:</strong> {o.decision.reason}</p>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div className="panel">
                            <h2>Objections you filed ({data?.filed?.length ?? 0})</h2>
                            {!data?.filed?.length ? <p className="muted">None yet.</p> : (
                                <ul className="rows">
                                    {data.filed.map((o) => (
                                        <li key={o._id}>
                                            <strong>{o.self ? "Your own entry" : `${o.target.name} (${o.target.epic})`}</strong> · {o.groundLabel}<br />
                                            <small className="muted">{STATUS[o.status]} · filed {new Date(o.filedAt).toLocaleDateString()}{o.reply ? " · the elector has replied" : ""}</small>
                                            {o.decision?.reason && <p style={{ margin: "6px 0" }}><strong>ERO's order:</strong> {o.decision.reason}</p>}
                                            {OPEN.includes(o.status) && <div><button className="btn btn-quiet btn-small" disabled={busy} onClick={() => act(() => api.post(`/objections/${o._id}/withdraw`), "Withdrawn.")}>Withdraw</button></div>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
