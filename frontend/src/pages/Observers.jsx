import { useEffect, useState } from "react";
import api from "../api/axios";
import "../styles/desk.css";
import PageHead from "../components/PageHead";
import { apiMessage } from "../config/elections";
import useGeography from "../hooks/useGeography";

// The observers deployed by the Commission in a State, with the contact numbers they publish, so
// anyone can reach them during the election.
export default function Observers() {
    const { states, districtsOf, constituenciesOf } = useGeography();
    const [area, setArea] = useState({ state: "Punjab", district: "", constituency: "" });
    const [rows, setRows] = useState(null);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!area.state) return;
        api.get("/observers/public", { params: { state: area.state, ...(area.constituency ? { constituency: area.constituency } : {}) } })
            .then((r) => { setRows(r.data.data); setError(""); }).catch((e) => setError(apiMessage(e, "Could not load the observers.")));
    }, [area.state, area.constituency]);
    const ROLE = { general_observer: "General observer", police_observer: "Police observer", expenditure_observer: "Expenditure observer", counting_observer: "Counting observer" };
    return (
        <>
            <PageHead title="Election observers" crumbs={[{ label: "Voters" }, { label: "Observers" }]}
                lede="The Commission's general, police and expenditure observers watch the election in each constituency. You can tell them about anything that is going wrong; they report directly to the Commission." />
            <section className="section">
                <div className="container stack">
                    <div className="panel portal-form"><div className="form-row">
                        <div className="field"><label htmlFor="ob-s">State/UT</label><select id="ob-s" value={area.state} onChange={(e) => setArea({ state: e.target.value, district: "", constituency: "" })}>{states.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></div>
                        <div className="field"><label htmlFor="ob-d">District</label><select id="ob-d" value={area.district} onChange={(e) => setArea({ ...area, district: e.target.value, constituency: "" })}><option value="">All</option>{districtsOf(area.state).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select></div>
                        <div className="field"><label htmlFor="ob-c">Constituency</label><select id="ob-c" value={area.constituency} disabled={!area.district} onChange={(e) => setArea({ ...area, constituency: e.target.value })}><option value="">All</option>{constituenciesOf(area.state, area.district).map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                    </div></div>
                    {error && <div className="alert alert-error">{error}</div>}
                    {rows && (rows.length ? (
                        <div className="table-wrap"><table className="desk-table"><thead><tr><th>Observer</th><th>Name</th><th>Constituency</th><th>Phone</th><th>Staying at</th></tr></thead>
                            <tbody>{rows.filter((r) => !area.district || r.district === area.district).map((r, i) => <tr key={i}><td>{ROLE[r.role] ?? r.role}</td><td>{r.name}</td><td>{r.constituency ?? r.district ?? "—"}</td><td>{r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : "—"}</td><td>{r.stayingAt ?? "—"}</td></tr>)}</tbody></table></div>
                    ) : <p className="muted">No observers are deployed here at the moment.</p>)}
                </div>
            </section>
        </>
    );
}
