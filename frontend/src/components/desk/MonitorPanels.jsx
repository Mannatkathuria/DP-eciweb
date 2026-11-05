// Monitoring panels: grievances (NGSP), seizures (ESMS), party filings (IEMS), the observer
// portal, flying-squad positions, the reference library (Commission) and the data stores.
import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/axios";
import { Badge, Bars, Empty, Field, Kpis, Panel, Status, Table, day, inr, label, useAction, useLoad, useMyArea, when } from "./kit";

const G_TONE = { open: "warn", in_progress: "info", resolved: "ok", referred_cvigil: "info", reopened: "bad", closed: undefined };

export function GrievancesPanel() {
    const [status, setStatus] = useState("");
    const { data, error, loading, reload } = useLoad("/grievances", status ? { status } : {});
    const [run, st] = useAction(reload);
    const [f, setF] = useState({});
    const v = (id, k) => f[id]?.[k] ?? "";
    const set = (id, k) => (e) => setF({ ...f, [id]: { ...f[id], [k]: e.target.value } });
    const L = data?.lists;
    return (
        <Panel title="Grievances (NGSP)" intro="General complaints about election administration, routed to your office. Model Code of Conduct violations happening now belong in cVIGIL: refer them there." actions={<Link className="btn btn-quiet btn-small" to="/grievance">Public grievance page</Link>}>
            {data && <Kpis items={[{ label: "Received", value: data.counts.open ?? 0, tone: data.counts.open ? "warn" : undefined }, { label: "Under action", value: data.counts.in_progress ?? 0 }, { label: "Reopened", value: data.counts.reopened ?? 0, tone: data.counts.reopened ? "bad" : undefined },
                { label: "Pending over 72 hours", value: data.pendingOver72h, tone: data.pendingOver72h ? "bad" : "ok" }, { label: "Average response", value: data.avgResponseHours === null ? "—" : `${data.avgResponseHours} h` }]} />}
            <div className="row-actions" style={{ margin: "12px 0" }}>
                {[["", "All"], ["open", "Received"], ["in_progress", "Under action"], ["reopened", "Reopened"], ["resolved", "Resolved"]].map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{t}</button>)}
            </div>
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {data && Object.keys(data.byCategory).length > 0 && <Bars rows={Object.entries(data.byCategory).map(([k, n]) => ({ label: L.categories[k], value: n }))} />}
            {data && (data.items.length ? data.items.map((g) => (
                <div className="desk-item" key={g._id} style={{ marginTop: 10 }}>
                    <h4>{g.referenceId} · {g.subject} <Badge tone={G_TONE[g.status]}>{g.statusText}</Badge></h4>
                    <p className="meta">{g.categoryText} · {g.stakeholderText} · {L.levels[g.route.level]}{g.jurisdiction.constituency ? ` · ${g.jurisdiction.constituency}` : g.jurisdiction.district ? ` · ${g.jurisdiction.district}` : g.jurisdiction.state ? ` · ${g.jurisdiction.state}` : ""} · {when(g.createdAt)} ({g.ageHours} h){g.documentCount ? ` · ${g.documentCount} document(s)` : ""}</p>
                    <p style={{ margin: "4px 0" }}>{g.description}</p>
                    {g.reopenReason && <p className="meta"><Badge tone="bad">reopened</Badge> {g.reopenReason}</p>}
                    {g.response && <p className="meta">Response ({Math.round(g.responseMinutes / 60)} h): {g.response.text}</p>}
                    {data.can.handle && !["closed", "referred_cvigil"].includes(g.status) && (
                        <div className="desk-actions">
                            <input aria-label="Response" placeholder="Response to the complainant" value={v(g._id, "r")} onChange={set(g._id, "r")} style={{ flex: "1 1 280px" }} />
                            <button className="btn btn-primary btn-small" disabled={v(g._id, "r").length < 10 || st.busy} onClick={() => run(() => api.post(`/grievances/${g._id}/respond`, { status: "resolved", response: v(g._id, "r") }))}>Resolve</button>
                            <button className="btn btn-quiet btn-small" disabled={v(g._id, "r").length < 10 || st.busy} onClick={() => run(() => api.post(`/grievances/${g._id}/respond`, { status: "in_progress", response: v(g._id, "r") }))}>Under action</button>
                            <button className="btn btn-quiet btn-small" disabled={v(g._id, "r").length < 10 || st.busy} onClick={() => run(() => api.post(`/grievances/${g._id}/respond`, { status: "referred_cvigil", response: v(g._id, "r") }))}>Refer to cVIGIL</button>
                            <select aria-label="Route to" value={v(g._id, "lvl")} onChange={set(g._id, "lvl")}><option value="">Route to…</option>{Object.entries(L.levels).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                            <button className="btn btn-quiet btn-small" disabled={!v(g._id, "lvl") || v(g._id, "r").length < 5 || st.busy} onClick={() => run(() => api.post(`/grievances/${g._id}/route`, { level: v(g._id, "lvl"), note: v(g._id, "r") }))}>Route</button>
                        </div>
                    )}
                </div>
            )) : <Empty>No grievances.</Empty>)}
        </Panel>
    );
}

export function SeizuresPanel() {
    const area = useMyArea("constituency");
    const [kind, setKind] = useState("");
    const { data, error, loading, reload } = useLoad("/seizures", kind ? { kind } : {});
    const [run, st] = useAction(reload);
    const [s, setS] = useState({ agency: "police", kind: "cash", quantity: "", unit: "rupees", value: "", description: "", place: "", documentRef: "", constituency: "" });
    const [rel, setRel] = useState({});
    const L = data?.lists;
    return (
        <Panel title="Seizures (ESMS)" intro="Every interception by the enforcement agencies in one register; seizures in flying squads' cVIGIL reports are entered automatically. A seizure is not a finding against a candidate.">
            {data && <Kpis items={[{ label: "Value held", value: inr(data.total) }, { label: "Seizures", value: data.count }, { label: "From cVIGIL", value: data.fromCvigil }, { label: "Released by committee", value: data.released }]} />}
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {data && (
                <div className="two-col" style={{ marginTop: 12 }}>
                    <div><h4 className="subhead">By kind</h4><Bars rows={Object.entries(data.byKind).map(([k, n]) => ({ label: L.kinds[k], value: n }))} format={inr} /></div>
                    <div><h4 className="subhead">By agency</h4><Bars rows={Object.entries(data.byAgency).map(([k, n]) => ({ label: L.agencies[k], value: n }))} format={inr} /></div>
                    <div><h4 className="subhead">By {data.areaLevel}</h4><Bars rows={Object.entries(data.byArea).map(([k, n]) => ({ label: k, value: n }))} format={inr} /></div>
                </div>
            )}
            {data?.can.record && L && (
                <details className="desk-item" style={{ marginTop: 12 }}><summary><strong>Record a seizure</strong></summary>
                    <div className="desk-form" style={{ marginTop: 10 }}>
                        <Field id="sz-a" text="Agency"><select id="sz-a" value={s.agency} onChange={(e) => setS({ ...s, agency: e.target.value })}>{Object.entries(L.agencies).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                        <Field id="sz-k" text="What"><select id="sz-k" value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value })}>{Object.entries(L.kinds).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                        <Field id="sz-q" text="Quantity"><input id="sz-q" inputMode="decimal" value={s.quantity} onChange={(e) => setS({ ...s, quantity: e.target.value })} /></Field>
                        <Field id="sz-u" text="Unit"><select id="sz-u" value={s.unit} onChange={(e) => setS({ ...s, unit: e.target.value })}>{Object.entries(L.units).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                        <Field id="sz-v" text="Estimated value (₹)"><input id="sz-v" inputMode="decimal" value={s.value} onChange={(e) => setS({ ...s, value: e.target.value })} /></Field>
                        <Field id="sz-d" text="Panchnama / FIR / memo no."><input id="sz-d" value={s.documentRef} onChange={(e) => setS({ ...s, documentRef: e.target.value })} /></Field>
                        <Field id="sz-ac" text="Constituency"><input id="sz-ac" value={s.constituency || area.constituency || ""} onChange={(e) => setS({ ...s, constituency: e.target.value })} /></Field>
                        <Field id="sz-p" text="Place"><input id="sz-p" value={s.place} onChange={(e) => setS({ ...s, place: e.target.value })} /></Field>
                        <Field id="sz-desc" text="Description" wide><input id="sz-desc" value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} /></Field>
                        <div className="wide"><button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post("/seizures", { ...s, state: area.state, district: area.district, constituency: s.constituency || area.constituency }))}>Record</button></div>
                    </div>
                </details>
            )}
            <div className="row-actions" style={{ margin: "12px 0" }}>
                {[["", "All"], ...Object.entries(L?.kinds ?? {})].map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{t}</button>)}
            </div>
            {data && <Table head={["Date", "Agency", "What", "#Quantity", "#Value", "Place", "Document", ""]} rows={data.items.map((x) => (
                <tr key={x._id}><td>{day(x.interceptedOn)}</td><td>{L.agencies[x.agency]}{x.source === "cvigil" && <><br /><Badge tone="info">cVIGIL {x.linkedComplaint}</Badge></>}</td><td>{L.kinds[x.kind]}<br /><small className="muted">{x.description}</small></td>
                    <td className="num">{x.quantity ?? "—"} {x.quantity ? L.units[x.unit] : ""}</td><td className="num">{inr(x.value)}</td><td>{x.place ?? "—"}<br /><small className="muted">{x.jurisdiction.constituency}</small></td><td><code>{x.documentRef}</code></td>
                    <td>{x.status === "released" ? <Badge>released</Badge> : data.can.release && <span className="desk-actions" style={{ marginTop: 0 }}><input aria-label="Order" placeholder="Committee order" value={rel[x._id] ?? ""} onChange={(e) => setRel({ ...rel, [x._id]: e.target.value })} style={{ width: 110 }} />
                        <button className="btn btn-quiet btn-small" disabled={!rel[x._id] || st.busy} onClick={() => { const reason = window.prompt("Reason for release (the proof produced)"); if (reason) run(() => api.post(`/seizures/${x._id}/release`, { order: rel[x._id], reason })); }}>Release</button></span>}</td></tr>))} />}
        </Panel>
    );
}

export function PartyFilingsPanel() {
    const { data, error, loading, reload } = useLoad("/party-filings/mine");
    const [run, st] = useAction(reload);
    const [type, setType] = useState("contribution_24a");
    const [f, setF] = useState({ financialYear: "2025-26", csv: "", auditor: "", income: "", expenditure: "", auditReportDate: "", electionId: "", heads: {}, esignConsent: false });
    const L = data?.lists;
    return (
        <Panel title={`Statutory filings${data ? ` of ${data.party}` : ""}`} intro="Form 24A (contributions over ₹20,000, by 30 September), audited accounts (by 31 October) and election expenditure statements (75 days after an Assembly result, 90 after the Lok Sabha). Each is signed with Aadhaar eSign (simulated here).">
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {L && (
                <div className="desk-item">
                    <div className="row-actions" style={{ marginBottom: 10 }}>{Object.entries(L.types).map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={type === k} onClick={() => setType(k)}>{t}</button>)}</div>
                    <div className="desk-form">
                        {type !== "election_expenditure" && <Field id="pf-fy" text="Financial year"><input id="pf-fy" value={f.financialYear} onChange={(e) => setF({ ...f, financialYear: e.target.value })} placeholder="2025-26" /></Field>}
                        {type === "contribution_24a" && <Field id="pf-csv" text="Contributions (one per line: name, PAN, address, amount, mode, date)" wide><textarea id="pf-csv" rows={5} value={f.csv} onChange={(e) => setF({ ...f, csv: e.target.value })} placeholder={"A Donor,ABCDE1234F,Ludhiana,50000,cheque,2025-06-01"} /></Field>}
                        {type === "contribution_24a" && <div className="wide"><input type="file" accept=".csv,text/csv" aria-label="Import a CSV file" onChange={async (e) => { const file = e.target.files[0]; if (file) setF({ ...f, csv: await file.text() }); }} /> <small className="muted">Modes: {Object.keys(L.modes).join(", ")}. Cash over ₹2,000 is not allowed.</small></div>}
                        {type === "audit_accounts" && <>
                            <Field id="pf-a" text="Auditor"><input id="pf-a" value={f.auditor} onChange={(e) => setF({ ...f, auditor: e.target.value })} /></Field>
                            <Field id="pf-i" text="Total income (₹)"><input id="pf-i" inputMode="decimal" value={f.income} onChange={(e) => setF({ ...f, income: e.target.value })} /></Field>
                            <Field id="pf-e" text="Total expenditure (₹)"><input id="pf-e" inputMode="decimal" value={f.expenditure} onChange={(e) => setF({ ...f, expenditure: e.target.value })} /></Field>
                            <Field id="pf-d" text="Audit report date"><input id="pf-d" type="date" value={f.auditReportDate} onChange={(e) => setF({ ...f, auditReportDate: e.target.value })} /></Field></>}
                        {type === "election_expenditure" && <>
                            <Field id="pf-el" text="Election"><select id="pf-el" value={f.electionId} onChange={(e) => setF({ ...f, electionId: e.target.value })}><option value="">Choose…</option>{data.elections.map((e) => <option key={e._id} value={e._id}>{e.name} (due {day(e.dueOn)})</option>)}</select></Field>
                            {Object.entries(L.heads).map(([k, t]) => <Field key={k} id={`pf-h-${k}`} text={`${t} (₹)`}><input id={`pf-h-${k}`} inputMode="decimal" value={f.heads[k] ?? ""} onChange={(e) => setF({ ...f, heads: { ...f.heads, [k]: e.target.value } })} /></Field>)}</>}
                        <div className="wide desk-actions"><label className="check"><input type="checkbox" checked={f.esignConsent} onChange={(e) => setF({ ...f, esignConsent: e.target.checked })} /> I sign this filing with Aadhaar eSign</label>
                            <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post("/party-filings", { ...f, filingType: type }))}>File</button></div>
                    </div>
                </div>
            )}
            {data && <><h4 className="subhead">Filed</h4><Table head={["Filing", "Period", "Filed", "Acknowledgement", "#Total", "Scrutiny"]} empty="Nothing filed yet." rows={data.items.map((x) => (
                <tr key={x._id}><td>{L.types[x.filingType]}{x.status === "superseded" ? " (superseded)" : ""}</td><td>{x.electionName ?? x.period}</td><td>{day(x.filedOn)} {x.late && <Badge tone="bad">late</Badge>}</td><td><code>{x.acknowledgement}</code></td><td className="num">{inr(x.total ?? x.income)}</td><td>{x.scrutiny ? label(x.scrutiny.outcome) : "—"}</td></tr>))} /></>}
        </Panel>
    );
}

const C_TONE = { on_time: "ok", late: "warn", not_filed: "bad", due: undefined };
export function PartyCompliancePanel() {
    const [fy, setFy] = useState("2025-26");
    const { data, error, loading, reload } = useLoad("/party-filings/compliance", { financialYear: fy });
    const [run, st] = useAction(reload);
    const cell = (c) => c.status === "on_time" || c.status === "late" ? <><Badge tone={C_TONE[c.status]}>{label(c.status)}</Badge> <small className="muted">{day(c.filedOn)}</small>{c.scrutiny ? <><br /><small>{label(c.scrutiny)}</small></> : data?.can.review && <><br /><button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/party-filings/${c.id}/scrutiny`, { outcome: "in_order" }))}>In order</button></>}</> : <><Badge tone={C_TONE[c.status]}>{label(c.status)}</Badge> <small className="muted">due {day(c.dueOn)}</small></>;
    return (
        <Panel title="Political parties' compliance (IEMS)" intro="Form 24A, audited accounts and election expenditure statements, by party.">
            <div className="desk-form"><Field id="fy" text="Financial year"><input id="fy" value={fy} onChange={(e) => setFy(e.target.value)} /></Field></div>
            {data && <Kpis items={[{ label: "Parties", value: data.rows.length }, { label: "Filings", value: data.totals.filings }, { label: "Filed late", value: data.totals.late, tone: data.totals.late ? "warn" : undefined }, { label: `Contributions ${data.financialYear}`, value: inr(data.totals.contributions) }]} />}
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {data && <Table head={["Party", "Form 24A", "Audited accounts", "Election expenditure"]} rows={data.rows.map((r) => (
                <tr key={r.party}><td>{r.party}</td><td>{cell(r.contribution_24a)}</td><td>{cell(r.audit_accounts)}</td><td>{r.election_expenditure.length ? r.election_expenditure.map((x) => <div key={x.id}>{x.election}: {inr(x.total)} {x.late && <Badge tone="warn">late</Badge>}</div>) : "—"}</td></tr>))} />}
        </Panel>
    );
}

/** The observer's own portal. */
export function ObserverPortalPanel() {
    const { data, error, loading, reload } = useLoad("/observers/me");
    const squads = useLoad("/observers/squads");
    const [run, st] = useAction(reload);
    const [p, setP] = useState(null);
    const prof = p ?? { localContact: data?.profile?.localContact ?? "", localAddress: data?.profile?.localAddress ?? "", service: data?.profile?.service ?? "", bankAccount: "", ifsc: data?.profile?.bank?.ifsc ?? "", bankName: data?.profile?.bank?.bankName ?? "" };
    const setProf = (k) => (e) => setP({ ...prof, [k]: e.target.value });
    if (!data) return <Panel title="Your observer portal"><Status loading={loading} error={error} /></Panel>;
    const c = data.constituency;
    return (
        <Panel title="Your observer portal" intro="Your deployment, the constituency, the officers you deal with, the contesting candidates, the Commission's notices and your identity card.">
            <Status error={st.error} notice={st.notice} />
            <div className="two-col">
                <div className="desk-item">
                    <h4>Deployment</h4>
                    {data.deployment.length ? data.deployment.map((d, i) => <p key={i} className="meta">{d.constituency ?? d.district ?? d.state}, {d.state}{d.election ? ` · ${d.election}` : ""} · from {day(d.from)}{d.until ? ` to ${day(d.until)}` : ""} · <Badge tone={d.status === "deployed" ? "ok" : "warn"}>{d.status}</Badge></p>) : <Empty>No deployment order yet.</Empty>}
                    {c && <p className="meta">{c.stations} polling stations · {c.parts} parts · {c.electors.toLocaleString("en-IN")} electors ({c.women.toLocaleString("en-IN")} women)</p>}
                    {data.election && <p className="meta">{data.election.name}: poll {day(data.election.schedule.pollDate)}, counting {day(data.election.schedule.countingDate)}</p>}
                </div>
                <div className="id-card">
                    <h3>Observer identity card</h3>
                    <p style={{ margin: "2px 0" }}><strong>{data.idCard.name}</strong></p>
                    <p className="meta">{label(data.idCard.role)} · {data.idCard.constituency ?? "—"}</p>
                    <p className="meta">No. {data.idCard.number}{data.idCard.election ? ` · ${data.idCard.election}` : ""}</p>
                    <button className="btn btn-quiet btn-small no-print" onClick={() => window.print()}>Print</button>
                </div>
            </div>
            <h4 className="subhead">Officers and contacts</h4>
            <Table head={["Office", "Name", "Phone", "Office"]} empty="No officers found for your area." rows={data.officers.map((o) => <tr key={`${o.role}${o.epic}`}><td>{o.roleText}</td><td>{o.name ?? o.epic}</td><td>{o.phone ?? "—"}</td><td>{o.office}</td></tr>)} />
            <h4 className="subhead">Contesting candidates (Form 7A)</h4>
            {data.contesting ? <Table head={["#", "Candidate", "Party", "Symbol"]} rows={data.contesting.candidates.map((x) => <tr key={x.serial}><td>{x.serial}</td><td>{x.name}</td><td>{x.party}</td><td>{x.symbol ?? "—"}</td></tr>)} /> : <Empty>The list of contesting candidates is not published yet.</Empty>}
            <h4 className="subhead">Notices from the Commission</h4>
            {data.notices.length ? data.notices.map((n) => <div key={n._id} className="desk-item"><h4>{n.reference} <Badge>{label(n.status)}</Badge></h4><p className="meta">{when(n.issuedAt)}</p><p style={{ margin: 0 }}>{n.instruction}</p></div>) : <Empty>No notices addressed to you.</Empty>}
            <h4 className="subhead">Flying squads now</h4>
            {squads.data?.items.length ? <Table head={["Squad", "Vehicle", "Position", "Updated", "On"]} rows={squads.data.items.map((s) => <tr key={s.epic}><td>{s.epic}</td><td>{s.vehicle ?? "—"}</td><td><a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</a></td><td>{s.minutesAgo} min ago</td><td>{s.onComplaint ? `${s.onComplaint.referenceId} (${label(s.onComplaint.category)})` : "patrol"}</td></tr>)} /> : <Empty>No squad has reported its position in the last {squads.data?.ttlMinutes ?? 30} minutes.</Empty>}
            <details className="desk-item" style={{ marginTop: 12 }}><summary><strong>Your contact and bank details</strong></summary>
                <div className="desk-form" style={{ marginTop: 10 }}>
                    <Field id="op-ph" text="Local mobile (published)"><input id="op-ph" value={prof.localContact} onChange={setProf("localContact")} /></Field>
                    <Field id="op-ad" text="Staying at (published)"><input id="op-ad" value={prof.localAddress} onChange={setProf("localAddress")} /></Field>
                    <Field id="op-sv" text="Service"><input id="op-sv" value={prof.service} onChange={setProf("service")} placeholder="IAS / IPS / IRS" /></Field>
                    <Field id="op-ba" text={`Bank account${data.profile?.bank?.account ? ` (now ${data.profile.bank.account})` : ""}`}><input id="op-ba" inputMode="numeric" value={prof.bankAccount} onChange={setProf("bankAccount")} /></Field>
                    <Field id="op-if" text="IFSC"><input id="op-if" value={prof.ifsc} onChange={setProf("ifsc")} /></Field>
                    <Field id="op-bn" text="Bank"><input id="op-bn" value={prof.bankName} onChange={setProf("bankName")} /></Field>
                    <div className="wide"><button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post("/observers/me/profile", prof))}>Save</button></div>
                </div>
            </details>
        </Panel>
    );
}

/** Flying squad: report the team's position; everyone allowed: see where squads are. */
export function SquadPanel() {
    const { data, error, loading, reload } = useLoad("/observers/squads");
    const [run, st] = useAction(reload);
    const [msg, setMsg] = useState("");
    const report = () => {
        if (!navigator.geolocation) { setMsg("This device cannot give a position."); return; }
        navigator.geolocation.getCurrentPosition((p) => run(() => api.post("/observers/squads/location", { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }), "Position sent."),
            () => setMsg("Position not available: allow location access."), { enableHighAccuracy: true, timeout: 10000 });
    };
    return (
        <Panel title="Flying squads on the map" intro="Positions are kept for 30 minutes and then disappear: they are live data, not a record." actions={data?.canReport ? <button className="btn btn-primary btn-small" disabled={st.busy} onClick={report}>Send my position</button> : null}>
            <Status loading={loading} error={error || st.error || msg} notice={st.notice} />
            {data && (data.items.length ? <Table head={["Squad", "Vehicle", "Position", "Updated", "On"]} rows={data.items.map((s) => <tr key={s.epic}><td>{s.epic}</td><td>{s.vehicle ?? "—"}</td><td><a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</a></td><td>{s.minutesAgo} min ago</td><td>{s.onComplaint ? s.onComplaint.referenceId : "patrol"}</td></tr>)} /> : <Empty>No positions in the last 30 minutes.</Empty>)}
        </Panel>
    );
}

/** The Commission: publish to the reference library. */
export function LibraryAdminPanel() {
    const meta = useLoad("/library/meta");
    const [run, st] = useAction(meta.reload);
    const [f, setF] = useState({ type: "compendium", title: "", summary: "", body: "", category: "", reference: "" });
    return (
        <Panel title="Reference library" intro="Publish handbooks, instructions, eBooks, FAQ answers and training material. Republishing the same title makes a new version." actions={<Link className="btn btn-quiet btn-small" to="/library">Open the library</Link>}>
            {meta.data && <Kpis items={Object.entries(meta.data.types).map(([k, t]) => ({ label: t, value: meta.data.counts[k] ?? 0 }))} />}
            <Status loading={meta.loading} error={meta.error || st.error} notice={st.notice} />
            {meta.data && <div className="desk-form" style={{ marginTop: 12 }}>
                <Field id="lb-t" text="Type"><select id="lb-t" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(meta.data.types).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                <Field id="lb-c" text="Category"><input id="lb-c" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
                <Field id="lb-r" text="Reference"><input id="lb-r" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
                <Field id="lb-ti" text="Title" wide><input id="lb-ti" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
                <Field id="lb-s" text="Summary (the answer, for an FAQ)" wide><textarea id="lb-s" rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
                <Field id="lb-b" text="Text" wide><textarea id="lb-b" rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
                <div className="wide"><button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post("/library", f))}>Publish</button></div>
            </div>}
        </Panel>
    );
}

/** The Commission's administrators: where each kind of data lives and whether the copies match. */
export function DataStoresPanel() {
    const { data, error, loading, reload } = useLoad("/data-stores");
    const [run, st] = useAction(reload);
    return (
        <Panel title="Data stores: Redis and MongoDB" intro="Redis holds every transactional workflow, sessions, codes, locks and live operations. MongoDB holds read models copied from Redis (checked here against Redis) and is the system of record for document and registry data."
            actions={data?.mongodb === "ok" ? <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post("/data-stores/sync", {}))}>Copy pending changes now</button> : null}>
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {data && <>
                <Kpis items={[{ label: "MongoDB", value: data.mongodb, tone: data.mongodb === "ok" ? "ok" : data.mongodb === "not configured" ? undefined : "bad" }, { label: "Document store", value: data.documentStore },
                    { label: "Waiting to copy", value: (data.backlog?.stations ?? 0) + (data.backlog?.docs ?? 0) + (data.backlog?.events ?? 0) + (data.backlog?.audit ?? 0) }]} />
                <p className="muted" style={{ marginTop: 8 }}>{data.note}</p>
                <div className="two-col">
                    <div><h4 className="subhead">Redis only (system of record)</h4><Table head={["Data", "#Records"]} rows={[...data.redisOnly.map((r) => [r.label, r.redis]), ...Object.entries(data.hot)].map(([l, n]) => <tr key={l}><td>{l}</td><td className="num">{Number(n).toLocaleString("en-IN")}</td></tr>)} /></div>
                    <div><h4 className="subhead">MongoDB (system of record)</h4><Table head={["Collection", "#Documents"]} rows={data.documents.map((d) => <tr key={d.collection}><td><code>{d.collection}</code></td><td className="num">{d.count ?? "—"}</td></tr>)} /></div>
                </div>
                <h4 className="subhead">Copied from Redis to MongoDB (read models)</h4>
                <Table head={["Data", "#In Redis", "#In MongoDB", "Match"]} rows={data.projected.map((p) => <tr key={p.label}><td>{p.label}</td><td className="num">{p.redis}</td><td className="num">{p.mongodb ?? "—"}</td><td>{p.inSync === null ? "—" : <Badge tone={p.inSync ? "ok" : "warn"}>{p.inSync ? "in sync" : "differs"}</Badge>}</td></tr>)} />
                {data.archives && <p className="meta">Archives in MongoDB: {Object.entries(data.archives).map(([k, n]) => `${k} ${n}`).join(" · ")}</p>}
            </>}
        </Panel>
    );
}
