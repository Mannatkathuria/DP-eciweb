import { useCallback, useEffect, useState } from "react";
import api from "../api/axios";
import ReasonDialog from "../pages/ReasonDialog";
import { apiMessage } from "../config/elections";

// Agents a candidate appoints (Conduct of Elections Rules, 1961): one election agent (Form 8),
// one polling agent per polling station (Form 10) and counting agents (Form 18). The election
// agent may appoint polling and counting agents too. The server checks every rule.

const TYPE_LABEL = { election: "Election agent", polling: "Polling agent", counting: "Counting agent" };

export default function AgentAppointments({ electionId, isCandidate }) {
    const [data, setData] = useState(null);
    const [stations, setStations] = useState([]);
    const [form, setForm] = useState({ type: isCandidate ? "election" : "polling", epic: "", stationId: "" });
    const [revoking, setRevoking] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!electionId) return;
        try {
            const { data: res } = await api.get("/agents/mine", { params: { electionId } });
            setData(res.data);
        } catch (err) { setData(null); setError(apiMessage(err, "Could not load your agents.")); }
    }, [electionId]);
    useEffect(() => { load(); }, [load]);
    const area = data?.area;
    useEffect(() => {
        if (!area) return;
        api.get("/public/stations", { params: { state: area.state, constituency: area.constituency } })
            .then(({ data: res }) => setStations(res.data.items ?? [])).catch(() => setStations([]));
    }, [area?.state, area?.constituency]); // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true); setError(""); setNotice("");
        try {
            const { data: res } = await api.post("/agents", { electionId, type: form.type, epic: form.epic.trim().toUpperCase(), stationId: form.type === "polling" ? form.stationId : undefined });
            setNotice(res.message); setForm((f) => ({ ...f, epic: "" })); await load();
        } catch (err) { setError(apiMessage(err, "Could not appoint. Nothing was changed.")); }
        finally { setBusy(false); }
    };
    const revoke = async (reason) => {
        setBusy(true); setError("");
        try { await api.post(`/agents/${revoking._id}/revoke`, { reason }); setRevoking(null); setNotice("Appointment revoked."); await load(); }
        catch (err) { setError(apiMessage(err, "Could not revoke.")); }
        finally { setBusy(false); }
    };

    if (!data) return error ? <div className="alert alert-error" role="alert">{error}</div> : null;
    const active = data.items.filter((a) => a.status === "active");

    return (
        <div className="panel">
            <h2>Agents for {data.candidateName}</h2>
            <p className="muted">One election agent, one polling agent per polling station, and counting agents for the counting centre. Each agent needs their own account of the matching type.</p>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {notice && <div className="alert alert-ok" role="status">{notice}</div>}
            <form className="portal-form" onSubmit={submit}>
                <div className="form-row" style={{ flexWrap: "wrap" }}>
                    <div className="field"><label htmlFor="ag-type">Appoint</label>
                        <select id="ag-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                            {isCandidate && <option value="election">Election agent</option>}
                            <option value="polling">Polling agent</option>
                            <option value="counting">Counting agent</option>
                        </select></div>
                    <div className="field"><label htmlFor="ag-epic">Agent's sign-in ID</label>
                        <input id="ag-epic" value={form.epic} onChange={(e) => setForm({ ...form, epic: e.target.value })} required placeholder={form.type === "election" ? "EAG1000001" : form.type === "polling" ? "PAG1000001" : "CAG1000001"} /></div>
                    {form.type === "polling" && (
                        <div className="field"><label htmlFor="ag-ps">Polling station</label>
                            <select id="ag-ps" value={form.stationId} onChange={(e) => setForm({ ...form, stationId: e.target.value })} required>
                                <option value="">Choose</option>
                                {stations.map((s) => <option key={s._id} value={s._id}>Part {s.partNumber}: {s.name}</option>)}
                            </select></div>
                    )}
                </div>
                {form.type === "polling" && stations.length === 0 && <p className="muted"><small>No approved polling stations in {area?.constituency} yet.</small></p>}
                <button className="btn btn-primary" type="submit" disabled={busy}>Appoint</button>
            </form>
            <div className="table-wrap" style={{ marginTop: 16 }}><table>
                <thead><tr><th>Agent</th><th>Type</th><th>Where</th><th>Appointed by</th><th></th></tr></thead>
                <tbody>
                    {active.map((a) => (
                        <tr key={a._id}><td>{a.epic}</td><td>{TYPE_LABEL[a.agentType]}</td>
                            <td><small>{a.jurisdiction.pollingStation ? `Part ${a.jurisdiction.partNumber}: ${a.jurisdiction.pollingStation}` : a.jurisdiction.constituency}</small></td>
                            <td><small>{a.grantedBy} ({a.grantedByRole === "candidate" ? "candidate" : "election agent"})</small></td>
                            <td>{(isCandidate || a.agentType !== "election") && <button className="btn-reject" disabled={busy} onClick={() => setRevoking(a)}>Revoke</button>}</td></tr>
                    ))}
                    {active.length === 0 && <tr><td colSpan={5}>No agents appointed.</td></tr>}
                </tbody>
            </table></div>
            {revoking && <ReasonDialog title={`Revoke ${TYPE_LABEL[revoking.agentType].toLowerCase()} ${revoking.epic}`} label="Reason" required confirmLabel="Revoke" busy={busy} error={error} onCancel={() => setRevoking(null)} onConfirm={revoke} />}
        </div>
    );
}
