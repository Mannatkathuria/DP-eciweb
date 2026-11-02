import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import StaffAssignments from "../components/StaffAssignments";
import useGeography from "../hooks/useGeography";
import { apiMessage } from "../config/elections";

// District Election Officer: polling stations of the district (propose new ones, propose
// relocations; the ECI approves) and election staff appointments.

const FACILITIES = [["ramp", "Ramp"], ["wheelchair", "Wheelchair access"], ["drinkingWater", "Drinking water"], ["toilet", "Toilet"], ["shade", "Shade"], ["signage", "Signage"]];
const STATUS = { ACTIVE: ["Approved", "badge-ok"], PROPOSED: ["Awaiting ECI approval", "badge-warn"], REJECTED: ["Rejected", "badge-bad"] };
const STAFF = ["presiding_officer", "polling_officer", "sector_officer", "sector_police_officer", "counting_supervisor", "counting_assistant"];
const blank = { constituency: "", partNumber: "", name: "", address: "", lat: "", lng: "", accessibility: {} };

function StationDetails({ value, onChange, prefix }) {
    const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
    return (
        <>
            <div className="form-row">
                <div className="field"><label htmlFor={`${prefix}-name`}>Building name</label><input id={`${prefix}-name`} value={value.name} onChange={set("name")} required minLength={3} maxLength={200} /></div>
                <div className="field"><label htmlFor={`${prefix}-addr`}>Address</label><input id={`${prefix}-addr`} value={value.address} onChange={set("address")} required minLength={10} maxLength={300} /></div>
            </div>
            <div className="form-row">
                <div className="field"><label htmlFor={`${prefix}-lat`}>Latitude (optional)</label><input id={`${prefix}-lat`} value={value.lat} onChange={set("lat")} inputMode="decimal" /></div>
                <div className="field"><label htmlFor={`${prefix}-lng`}>Longitude (optional)</label><input id={`${prefix}-lng`} value={value.lng} onChange={set("lng")} inputMode="decimal" /></div>
            </div>
            <fieldset style={{ border: 0, padding: 0 }}><legend>Facilities</legend>
                {FACILITIES.map(([k, label]) => (
                    <label key={k} className="check" style={{ display: "inline-flex", marginRight: 16 }}>
                        <input type="checkbox" checked={Boolean(value.accessibility[k])} onChange={(e) => onChange({ ...value, accessibility: { ...value.accessibility, [k]: e.target.checked } })} /> {label}
                    </label>
                ))}
            </fieldset>
        </>
    );
}
const toPayload = (v) => ({ name: v.name, address: v.address, accessibility: v.accessibility, ...(v.lat && v.lng ? { location: { lat: v.lat, lng: v.lng } } : {}) });

export default function DeoDesk() {
    const { logged, userData } = useContext(AuthContext);
    const { constituenciesOf } = useGeography();
    const [area, setArea] = useState(null);
    const [election, setElection] = useState(null);
    const [stations, setStations] = useState([]);
    const [form, setForm] = useState(blank);
    const [moving, setMoving] = useState(null); // { id, ...details, reason }
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const isDeo = logged && userData?.role === "deo";
    const load = useCallback(async () => {
        try {
            const [me, st] = await Promise.all([api.get("/assignments/me"), api.get("/polling-stations")]);
            const a = me.data.data.assignments.find((x) => x.jurisdiction?.district);
            setArea(a?.jurisdiction ?? null); setElection(a?.election ?? null);
            setStations(st.data.data.items);
        } catch (err) { setError(apiMessage(err, "Could not load your district.")); }
    }, []);
    useEffect(() => { if (isDeo) load(); }, [isDeo, load]);
    const constituencies = useMemo(() => (area ? constituenciesOf(area.state, area.district) : []), [area, constituenciesOf]);

    if (!logged) return <Navigate to="/signin/deo" replace />;
    if (!isDeo) return <Navigate to="/home" replace />;

    const act = async (fn, ok) => {
        setBusy(true); setError(""); setNotice("");
        try { const res = await fn(); setNotice(ok(res)); await load(); return true; }
        catch (err) { setError(apiMessage(err, "The request failed. Nothing was changed.")); return false; }
        finally { setBusy(false); }
    };
    const propose = (e) => {
        e.preventDefault();
        act(() => api.post("/polling-stations", { state: area.state, district: area.district, constituency: form.constituency || constituencies[0], partNumber: form.partNumber, ...toPayload(form) }),
            ({ data }) => data.message).then((ok) => ok && setForm(blank));
    };
    const relocate = (e) => {
        e.preventDefault();
        act(() => api.post(`/polling-stations/${moving.id}/relocation`, { ...toPayload(moving), reason: moving.reason }), () => "Relocation sent to the ECI for approval.").then((ok) => ok && setMoving(null));
    };

    return (
        <>
            <PageHead title="District election office" crumbs={[{ label: "District election office" }]}
                lede={area ? `${area.district}, ${area.state}. Propose polling stations and relocations for ECI approval, and appoint election staff.` : "Your district assignment is loading."} />
            <section className="section">
                <div className="container stack">
                    <p><Link to="/control-room">Open the control room</Link></p>
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {notice && <div className="alert alert-ok" role="status">{notice}</div>}
                    {!area && !error && <p>You do not have a district assignment yet. Ask the ECI administrator to assign you.</p>}
                    {area && (
                        <>
                            <div className="panel">
                                <h2>Polling stations in {area.district} ({stations.length})</h2>
                                <div className="table-wrap"><table>
                                    <thead><tr><th>Part</th><th>Station</th><th>Status</th><th></th></tr></thead>
                                    <tbody>{stations.map((s) => (
                                        <tr key={s._id}>
                                            <td>{s.partNumber}<br /><small>{s.constituency}</small></td>
                                            <td><strong>{s.name}</strong><br /><small>{s.address}</small><br /><small className="muted">{s.stationCode}{s.source ? ` · version ${s.source.version}` : ""}</small></td>
                                            <td><span className={`badge ${STATUS[s.status][1]}`}>{STATUS[s.status][0]}</span>
                                                {s.pendingChange?.type === "relocate" && <><br /><small>Relocation to {s.pendingChange.proposed.name} awaiting ECI approval</small></>}</td>
                                            <td>{s.status === "ACTIVE" && !s.pendingChange && (
                                                <button className="btn btn-quiet btn-small" onClick={() => setMoving({ id: s._id, name: "", address: "", lat: "", lng: "", accessibility: { ...s.accessibility }, reason: "", from: s.name })}>Propose relocation</button>
                                            )}</td>
                                        </tr>
                                    ))}
                                    {stations.length === 0 && <tr><td colSpan={4}>No stations yet.</td></tr>}</tbody>
                                </table></div>
                            </div>

                            {moving && (
                                <form className="panel portal-form" onSubmit={relocate}>
                                    <h2>Relocate {moving.from}</h2>
                                    <StationDetails prefix="mv" value={moving} onChange={(v) => setMoving({ ...moving, ...v })} />
                                    <div className="field"><label htmlFor="mv-reason">Reason *</label><input id="mv-reason" value={moving.reason} onChange={(e) => setMoving({ ...moving, reason: e.target.value })} required maxLength={500} /></div>
                                    <p className="muted"><small>Once the ECI approves, every elector of this part is moved to the new station and voters see a relocation notice.</small></p>
                                    <button className="btn btn-primary" type="submit" disabled={busy}>Send for approval</button>{" "}
                                    <button className="btn btn-quiet" type="button" onClick={() => setMoving(null)}>Cancel</button>
                                </form>
                            )}

                            <form className="panel portal-form" onSubmit={propose}>
                                <h2>Propose a polling station</h2>
                                <div className="form-row">
                                    <div className="field"><label htmlFor="ps-ac">Constituency</label>
                                        <select id="ps-ac" value={form.constituency || constituencies[0] || ""} onChange={(e) => setForm({ ...form, constituency: e.target.value })}>
                                            {constituencies.map((c) => <option key={c}>{c}</option>)}
                                        </select></div>
                                    <div className="field"><label htmlFor="ps-part">Part number</label><input id="ps-part" value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} inputMode="numeric" required /></div>
                                </div>
                                <StationDetails prefix="ps" value={form} onChange={setForm} />
                                <button className="btn btn-primary" type="submit" disabled={busy}>Propose station</button>
                            </form>

                            <StaffAssignments roles={STAFF} stations={stations} constituencies={constituencies} election={election} area={area} />
                        </>
                    )}
                </div>
            </section>
        </>
    );
}
