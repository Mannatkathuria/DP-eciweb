import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import ReasonDialog from "../pages/ReasonDialog";
import { apiMessage } from "../config/elections";

// Appoint election staff and see who is appointed. The server decides what the caller may do:
// the DEO appoints polling, counting and sector staff in the district; the RO/ARO arranges
// presiding and polling officers in the constituency, at approved polling stations.

const ROLE_LABEL = {
    presiding_officer: "Presiding officer", polling_officer: "Polling officer", counting_supervisor: "Counting supervisor",
    counting_assistant: "Counting assistant", sector_officer: "Sector officer", sector_police_officer: "Sector police officer"
};
const AT_STATION = ["presiding_officer", "polling_officer"];

export default function StaffAssignments({ roles, stations, constituencies, election, area }) {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState({ epic: "", role: roles[0], constituency: constituencies[0] || "", stationId: "" });
    const [revoking, setRevoking] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get("/assignments");
            setItems(data.data.items.filter((a) => roles.includes(a.role)));
        } catch (err) { setError(apiMessage(err, "Could not load assignments.")); }
    }, [roles]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (constituencies.length) setForm((f) => (f.constituency ? f : { ...f, constituency: constituencies[0] })); }, [constituencies]);

    const atStation = AT_STATION.includes(form.role);
    const choices = stations.filter((s) => s.status === "ACTIVE" && s.constituency === form.constituency);
    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError(""); setNotice("");
        const station = choices.find((s) => s._id === form.stationId);
        const jurisdiction = { state: area.state, district: area.district, constituency: form.constituency,
            ...(atStation && station ? { pollingStation: station.name, partNumber: station.partNumber } : {}) };
        try {
            await api.post("/assignments", { epic: form.epic.trim().toUpperCase(), role: form.role, election, jurisdiction });
            setNotice(`${ROLE_LABEL[form.role]} appointed.`);
            setForm((f) => ({ ...f, epic: "" }));
            await load();
        } catch (err) { setError(apiMessage(err, "Could not appoint. Nothing was changed.")); }
        finally { setBusy(false); }
    };
    const revoke = async (reason) => {
        setBusy(true); setError("");
        try { await api.post(`/assignments/${revoking._id}/revoke`, { reason }); setRevoking(null); setNotice("Appointment revoked."); await load(); }
        catch (err) { setError(apiMessage(err, "Could not revoke.")); }
        finally { setBusy(false); }
    };

    return (
        <div className="panel">
            <h2>Election staff</h2>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {notice && <div className="alert alert-ok" role="status">{notice}</div>}
            <form className="portal-form" onSubmit={submit}>
                <div className="form-row" style={{ flexWrap: "wrap" }}>
                    <div className="field"><label htmlFor="st-epic">Officer's sign-in ID</label>
                        <input id="st-epic" value={form.epic} onChange={(e) => setForm({ ...form, epic: e.target.value })} placeholder="PRO1000001" required /></div>
                    <div className="field"><label htmlFor="st-role">Role</label>
                        <select id="st-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select></div>
                    <div className="field"><label htmlFor="st-ac">Constituency</label>
                        <select id="st-ac" value={form.constituency} onChange={(e) => setForm({ ...form, constituency: e.target.value, stationId: "" })} required>
                            {constituencies.map((c) => <option key={c}>{c}</option>)}
                        </select></div>
                    {atStation && (
                        <div className="field"><label htmlFor="st-ps">Polling station</label>
                            <select id="st-ps" value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })} required>
                                <option value="">Choose an approved station</option>
                                {choices.map((s) => <option key={s._id} value={s._id}>Part {s.partNumber}: {s.name}</option>)}
                            </select></div>
                    )}
                </div>
                {atStation && choices.length === 0 && <p className="muted"><small>No approved polling station in this constituency yet.</small></p>}
                <button className="btn btn-primary" type="submit" disabled={busy}>Appoint</button>
            </form>
            <div className="table-wrap" style={{ marginTop: 16 }}><table>
                <thead><tr><th>Officer</th><th>Role</th><th>Where</th><th></th></tr></thead>
                <tbody>
                    {items.map((a) => (
                        <tr key={a._id}>
                            <td>{a.epic}</td><td>{ROLE_LABEL[a.role]}</td>
                            <td><small>{[a.jurisdiction.pollingStation && `${a.jurisdiction.pollingStation} (part ${a.jurisdiction.partNumber})`, a.jurisdiction.constituency].filter(Boolean).join(", ")}</small></td>
                            <td><button className="btn-reject" onClick={() => setRevoking(a)} disabled={busy}>Revoke</button></td>
                        </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={4}>Nobody appointed yet.</td></tr>}
                </tbody>
            </table></div>
            {revoking && <ReasonDialog title={`Revoke ${revoking.epic}`} label="Reason" required confirmLabel="Revoke" busy={busy} error={error} onCancel={() => setRevoking(null)} onConfirm={revoke} />}
        </div>
    );
}
