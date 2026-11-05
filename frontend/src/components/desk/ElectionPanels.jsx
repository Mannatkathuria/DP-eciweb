// Election management panels: ePlan, EVMs (EMS 2.0), nominations (deposit, paper nominations,
// symbols, Form 7A), the Index Card and service-voter postal ballots (ETPB).
import { useState } from "react";
import api from "../../api/axios";
import { Badge, ElectionSelect, Empty, Field, Kpis, Panel, Status, Table, day, inr, label, useAction, useElections, useLoad, useMyArea, when } from "./kit";

const today = () => new Date().toISOString().slice(0, 10);

/** Commission planning division and CEOs. */
export function EplanPanel() {
    const { data, error, loading, reload } = useLoad("/eplan");
    const [run, st] = useAction(reload);
    const [vac, setVac] = useState({ state: "", house: "assembly", constituency: "", reason: "death", occurredOn: "" });
    const [plan, setPlan] = useState({ name: "", kind: "bye_election", pollDate: "", vacancyIds: [] });
    const [hol, setHol] = useState({ state: "", date: "", name: "" });
    const [msg, setMsg] = useState({ channel: "email", state: "", subject: "", text: "" });
    const [open, setOpen] = useState(null);
    if (!data) return <Panel title="Election planning"><Status loading={loading} error={error} /></Panel>;
    const can = data.can;
    return (
        <Panel title="Election planning (ePlan)" intro="Vacancies and bye-election deadlines, preparation calendars built back from the poll date, holidays, overdue alerts and messages to State officials.">
            <Kpis items={[{ label: "Open vacancies", value: data.vacancies.filter((v) => v.status === "open").length, tone: data.vacancies.some((v) => v.status === "open" && v.daysLeft < 60) ? "warn" : undefined },
                { label: "Plans", value: data.plans.length }, { label: "Overdue activities", value: data.alerts.filter((a) => a.overdue).length, tone: data.alerts.some((a) => a.overdue) ? "bad" : "ok" },
                { label: "Due within 7 days", value: data.alerts.filter((a) => !a.overdue).length }, { label: "Upcoming elections", value: data.upcomingElections.length }]} />
            <Status error={st.error} notice={st.notice} />
            {data.alerts.length > 0 && <div className="desk-item"><h4>Alerts</h4><ul style={{ margin: 0 }}>{data.alerts.slice(0, 10).map((a, i) => <li key={i}><Badge tone={a.overdue ? "bad" : "warn"}>{a.overdue ? "overdue" : "due soon"}</Badge> {a.title} — {a.planName} ({day(a.dueOn)})</li>)}</ul>
                {can.manage && <button className="btn btn-quiet btn-small" style={{ marginTop: 8 }} disabled={st.busy} onClick={() => run(() => api.post("/eplan/messages", { overdueReminders: true, channel: "sms" }))}>Send overdue reminders to the CEOs</button>}</div>}
            <h4 className="subhead">Vacancies</h4>
            <Table head={["Seat", "Reason", "Vacant since", "Bye-election due", "Status"]} empty="No vacancies." rows={data.vacancies.map((v) => (
                <tr key={v._id}><td>{v.seat.constituency}<br /><small className="muted">{v.seat.state} · {data.lists.houses[v.seat.house]}</small></td><td>{data.lists.reasons[v.reason]}</td><td>{day(v.occurredOn)}</td>
                    <td>{v.status === "exempt" ? <small>{v.exemption}</small> : <>{day(v.dueBy)} <Badge tone={v.daysLeft < 0 ? "bad" : v.daysLeft < 60 ? "warn" : undefined}>{v.daysLeft < 0 ? `${-v.daysLeft} days late` : `${v.daysLeft} days left`}</Badge></>}</td><td>{label(v.status)}</td></tr>))} />
            {can.manage && (
                <details className="desk-item"><summary><strong>Record a vacancy</strong></summary>
                    <div className="desk-form" style={{ marginTop: 10 }}>
                        <Field id="v-st" text="State/UT"><input id="v-st" value={vac.state} onChange={(e) => setVac({ ...vac, state: e.target.value })} placeholder="Punjab" /></Field>
                        <Field id="v-h" text="House"><select id="v-h" value={vac.house} onChange={(e) => setVac({ ...vac, house: e.target.value })}>{Object.entries(data.lists.houses).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                        <Field id="v-ac" text="Constituency"><input id="v-ac" value={vac.constituency} onChange={(e) => setVac({ ...vac, constituency: e.target.value })} /></Field>
                        <Field id="v-r" text="Reason"><select id="v-r" value={vac.reason} onChange={(e) => setVac({ ...vac, reason: e.target.value })}>{Object.entries(data.lists.reasons).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                        <Field id="v-d" text="Vacant since"><input id="v-d" type="date" max={today()} value={vac.occurredOn} onChange={(e) => setVac({ ...vac, occurredOn: e.target.value })} /></Field>
                        <Field id="v-t" text="House's term ends (optional)"><input id="v-t" type="date" value={vac.termEndsOn ?? ""} onChange={(e) => setVac({ ...vac, termEndsOn: e.target.value })} /></Field>
                        <div className="wide"><button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post("/eplan/vacancies", vac))}>Record</button></div>
                    </div>
                </details>
            )}
            <h4 className="subhead">Plans</h4>
            {data.plans.length ? data.plans.map((p) => (
                <div className="desk-item" key={p._id}>
                    <h4>{p.name} <Badge tone={p.status === "announced" ? "ok" : "info"}>{label(p.status)}</Badge></h4>
                    <p className="meta">{data.lists.kinds[p.planKind]} · poll {day(p.pollDate)} · {p.states.join(", ")} · {p.progress.done} of {p.progress.total} done{p.progress.overdue ? ` · ${p.progress.overdue} overdue` : ""}</p>
                    {p.warnings.map((w) => <p key={w} className="meta"><Badge tone="warn">warning</Badge> {w}</p>)}
                    <div className="desk-actions">
                        <button className="btn btn-quiet btn-small" onClick={() => setOpen(open === p._id ? null : p._id)}>{open === p._id ? "Hide calendar" : "Show calendar"}</button>
                        {can.manage && !p.electionId && <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => { const ref = window.prompt("Commission order reference for the announcement"); if (ref) run(() => api.post(`/eplan/plans/${p._id}/announce`, { orderReference: ref })); }}>Announce the election</button>}
                    </div>
                    {open === p._id && <Table head={["Activity", "Area", "Due", "Status", ""]} rows={p.activities.map((a) => (
                        <tr key={a._id}><td>{a.title}{a.clashes?.length ? <><br /><small className="muted">Clashes with {a.clashes.join(", ")}</small></> : null}</td><td>{label(a.area)}</td><td>{day(a.dueOn)} {a.overdue && <Badge tone="bad">overdue</Badge>}{a.dueSoon && <Badge tone="warn">soon</Badge>}</td>
                            <td>{label(a.status)}</td><td>{a.status !== "done" && <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/eplan/activities/${a._id}`, { status: "done" }), "Marked done.")}>Done</button>}</td></tr>))} />}
                </div>
            )) : <Empty>No plans yet.</Empty>}
            {can.manage && (
                <details className="desk-item"><summary><strong>New plan</strong></summary>
                    <div className="desk-form" style={{ marginTop: 10 }}>
                        <Field id="p-n" text="Name"><input id="p-n" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} /></Field>
                        <Field id="p-k" text="Kind"><select id="p-k" value={plan.kind} onChange={(e) => setPlan({ ...plan, kind: e.target.value })}>{Object.entries(data.lists.kinds).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                        <Field id="p-d" text="Proposed poll date"><input id="p-d" type="date" min={today()} value={plan.pollDate} onChange={(e) => setPlan({ ...plan, pollDate: e.target.value })} /></Field>
                        <Field id="p-s" text="States (for a general election)"><input id="p-s" placeholder="Punjab, Himachal Pradesh" value={plan.states ?? ""} onChange={(e) => setPlan({ ...plan, states: e.target.value })} /></Field>
                        <div className="wide"><span className="muted">Vacancies it fills: </span>{data.vacancies.filter((v) => v.status === "open").map((v) => <label key={v._id} className="check" style={{ marginRight: 12 }}><input type="checkbox" checked={plan.vacancyIds.includes(v._id)} onChange={(e) => setPlan({ ...plan, vacancyIds: e.target.checked ? [...plan.vacancyIds, v._id] : plan.vacancyIds.filter((x) => x !== v._id) })} /> {v.seat.constituency}</label>)}</div>
                        <div className="wide"><button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post("/eplan/plans", { ...plan, states: String(plan.states ?? "").split(",").map((x) => x.trim()).filter(Boolean) }))}>Build the calendar</button></div>
                    </div>
                </details>
            )}
            <div className="two-col" style={{ marginTop: 12 }}>
                <div className="desk-item"><h4>Holidays</h4>
                    <ul style={{ margin: "0 0 8px" }}>{data.holidays.slice(0, 12).map((h) => <li key={h._id}>{day(h.date)} — {h.name} <small className="muted">({h.state === "ALL" ? "national" : h.state})</small></li>)}</ul>
                    <div className="desk-actions"><input aria-label="State" placeholder="State or ALL" value={hol.state} onChange={(e) => setHol({ ...hol, state: e.target.value })} style={{ width: 120 }} /><input type="date" aria-label="Date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} /><input aria-label="Holiday" placeholder="Holiday" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} /><button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post("/eplan/holidays", hol))}>Add</button></div>
                </div>
                <div className="desk-item"><h4>Messages to State officials</h4>
                    <ul style={{ margin: "0 0 8px" }}>{data.messages.slice(0, 6).map((m) => <li key={m._id}><Badge>{m.channel}</Badge> {m.subject} <small className="muted">→ {m.states.join(", ")}, {when(m.createdAt)}</small></li>)}</ul>
                    <div className="desk-form">
                        <Field id="m-c" text="Channel"><select id="m-c" value={msg.channel} onChange={(e) => setMsg({ ...msg, channel: e.target.value })}><option value="email">Email</option><option value="sms">SMS</option></select></Field>
                        <Field id="m-s" text="State/UT"><input id="m-s" value={msg.state} onChange={(e) => setMsg({ ...msg, state: e.target.value })} /></Field>
                        <Field id="m-sub" text="Subject" wide><input id="m-sub" value={msg.subject} onChange={(e) => setMsg({ ...msg, subject: e.target.value })} /></Field>
                        <Field id="m-t" text="Message" wide><textarea id="m-t" rows={2} value={msg.text} onChange={(e) => setMsg({ ...msg, text: e.target.value })} /></Field>
                        <div className="wide"><button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post("/eplan/messages", { ...msg, states: [msg.state] }))}>Send (simulated)</button></div>
                    </div>
                </div>
            </div>
            {data.electorData.length > 0 && <><h4 className="subhead">Electoral data at a glance</h4><Table head={["State/UT", "#Electors", "#Women", "#Service voters", "#Overseas"]} rows={data.electorData.map((r) => <tr key={r.state}><td>{r.state}</td><td className="num">{r.electors.toLocaleString("en-IN")}</td><td className="num">{r.women.toLocaleString("en-IN")}</td><td className="num">{r.serviceVoters}</td><td className="num">{r.overseas}</td></tr>)} /></>}
        </Panel>
    );
}

const EVM_TONE = { received: undefined, flc_ok: "ok", flc_rejected: "bad", allotted_ac: "info", allotted_station: "info", reserve: undefined, commissioned: "ok" };

/** DEO / district nodal (EVM): receive, FLC, first randomisation. RO: second randomisation and commissioning. Others read. */
export function EvmPanel() {
    const area = useMyArea("district");
    const [electionId, setElectionId] = useState("");
    const { data, error, loading, reload } = useLoad("/evm", area.district ? { district: area.district } : {});
    const [run, st] = useAction(reload);
    const [recv, setRecv] = useState({ unitType: "BU", manufacturer: "BEL", count: "", startAt: "1" });
    const [witnesses, setWitnesses] = useState("");
    const [flc, setFlc] = useState({ serials: "", result: "rejected", defect: "" });
    const [station, setStation] = useState(null);
    if (!data) return <Panel title="EVMs and VVPATs"><Status loading={loading} error={error} /></Panel>;
    const can = data.can;
    const types = Object.keys(data.lists.unitTypes);
    const statuses = Object.keys(data.lists.statuses);
    return (
        <Panel title="EVMs and VVPATs (EMS 2.0)" intro="Every unit by serial number: warehouse, first-level checking, first randomisation (district to constituencies), second randomisation (constituency to stations), commissioning. Randomisations are witnessed by the parties' representatives.">
            <Kpis items={[{ label: "Units", value: data.total }, ...types.map((t) => ({ label: `${data.lists.unitTypes[t]}s commissioned`, value: data.summary[t]?.commissioned ?? 0 })), { label: "FLC rejected", value: types.reduce((n, t) => n + (data.summary[t]?.flc_rejected ?? 0), 0), tone: "warn" }]} />
            <Status error={st.error} notice={st.notice} />
            <Table head={["Status", ...types.map((t) => `#${t}`)]} rows={statuses.map((s) => (
                <tr key={s}><td><Badge tone={EVM_TONE[s]}>{data.lists.statuses[s]}</Badge></td>{types.map((t) => <td key={t} className="num">{data.summary[t]?.[s] ?? 0}</td>)}</tr>))} />
            {Object.keys(data.byConstituency).length > 0 && <><h4 className="subhead">By constituency</h4><Table head={["Constituency", "#BU", "#CU", "#VVPAT", "#With stations"]} rows={Object.entries(data.byConstituency).map(([ac, r]) => <tr key={ac}><td>{ac}</td><td className="num">{r.BU}</td><td className="num">{r.CU}</td><td className="num">{r.VVPAT}</td><td className="num">{r.toStations}</td></tr>)} /></>}
            {(can.manage || can.allocate) && (
                <div className="desk-item" style={{ marginTop: 12 }}>
                    <h4>Randomisation</h4>
                    <div className="desk-form">
                        <ElectionSelect value={electionId} onChange={setElectionId} filter={(e) => e.stage !== "completed"} />
                        <Field id="evm-w" text="Party representatives present (comma separated)" wide><input id="evm-w" value={witnesses} onChange={(e) => setWitnesses(e.target.value)} placeholder="Name, party; Name, party" /></Field>
                        <div className="wide desk-actions" style={{ marginTop: 0 }}>
                            {can.manage && <button className="btn btn-primary btn-small" disabled={!electionId || !witnesses || st.busy} onClick={() => run(() => api.post("/evm/randomise/first", { electionId, state: area.state, district: area.district, witnesses }))}>First randomisation for {area.district ?? "the district"}</button>}
                            {can.allocate && area.constituency && <>
                                <button className="btn btn-primary btn-small" disabled={!electionId || !witnesses || st.busy} onClick={() => run(() => api.post("/evm/randomise/second", { electionId, ...area, witnesses }))}>Second randomisation for {area.constituency}</button>
                                <button className="btn btn-quiet btn-small" disabled={!electionId || st.busy} onClick={() => run(() => api.post("/evm/commission", { electionId, ...area }))}>Commission for the candidates</button></>}
                        </div>
                    </div>
                </div>
            )}
            {can.manage && (
                <div className="two-col" style={{ marginTop: 12 }}>
                    <div className="desk-item"><h4>Units received at the warehouse</h4>
                        <div className="desk-form">
                            <Field id="evm-t" text="Unit"><select id="evm-t" value={recv.unitType} onChange={(e) => setRecv({ ...recv, unitType: e.target.value })}>{types.map((t) => <option key={t} value={t}>{data.lists.unitTypes[t]}</option>)}</select></Field>
                            <Field id="evm-m" text="Manufacturer"><select id="evm-m" value={recv.manufacturer} onChange={(e) => setRecv({ ...recv, manufacturer: e.target.value })}>{Object.entries(data.lists.manufacturers).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                            <Field id="evm-c" text="How many"><input id="evm-c" inputMode="numeric" value={recv.count} onChange={(e) => setRecv({ ...recv, count: e.target.value })} /></Field>
                            <Field id="evm-s" text="First serial number"><input id="evm-s" inputMode="numeric" value={recv.startAt} onChange={(e) => setRecv({ ...recv, startAt: e.target.value })} /></Field>
                            <div className="wide"><button className="btn btn-quiet btn-small" disabled={!recv.count || st.busy} onClick={() => run(() => api.post("/evm/units", { ...recv, state: area.state, district: area.district }))}>Register</button></div>
                        </div>
                    </div>
                    <div className="desk-item"><h4>First-level checking</h4>
                        <p className="meta">{types.reduce((n, t) => n + (data.summary[t]?.received ?? 0), 0)} unit(s) awaiting FLC.</p>
                        <div className="desk-actions"><button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post("/evm/flc", { state: area.state, district: area.district, allPending: true, result: "ok", engineer: "Manufacturer's engineers" }))}>All awaiting units passed FLC</button></div>
                        <div className="desk-form" style={{ marginTop: 8 }}>
                            <Field id="flc-s" text="Rejected serial numbers" wide><input id="flc-s" value={flc.serials} onChange={(e) => setFlc({ ...flc, serials: e.target.value })} placeholder="CUB0000012, CUB0000031" /></Field>
                            <Field id="flc-d" text="Defect"><input id="flc-d" value={flc.defect} onChange={(e) => setFlc({ ...flc, defect: e.target.value })} /></Field>
                            <div><button className="btn btn-quiet btn-small" disabled={!flc.serials || st.busy} onClick={() => run(() => api.post("/evm/flc", flc))}>Record rejection</button></div>
                        </div>
                    </div>
                </div>
            )}
            <h4 className="subhead">Randomisations</h4>
            <Table head={["Round", "Area", "Election", "Witnesses", "Units", "When"]} empty="None yet." rows={data.randomisations.map((r) => (
                <tr key={r._id}><td>{r.round === 1 ? "First" : "Second"}</td><td>{r.jurisdiction.constituency ?? r.jurisdiction.district}</td><td>{r.electionName}</td><td><small>{r.witnesses.join("; ")}</small></td><td className="num">{r.allocationCount}</td><td>{when(r.createdAt)}</td></tr>))} />
            <h4 className="subhead">Units</h4>
            <Table head={["Serial", "Type", "Make", "Status", "Constituency", "Station"]} rows={data.items.slice(0, 60).map((u) => (
                <tr key={u._id}><td><code>{u.serial}</code></td><td>{u.unitType}</td><td>{u.manufacturer}</td><td><Badge tone={EVM_TONE[u.status]}>{label(u.status)}</Badge></td><td>{u.location.constituency ?? "—"}</td>
                    <td>{u.allocation?.stationId ? <button className="btn btn-quiet btn-small" onClick={async () => setStation((await api.get(`/evm/stations/${u.allocation.stationId}`)).data.data)}>Part {u.allocation.partNumber}</button> : u.allocation?.reserve ? "reserve" : "—"}</td></tr>))} />
            {station && <div className="desk-item"><h4>Machines for part {station.station.partNumber}: {station.station.name}</h4><p className="meta">{station.machines.map((m) => `${m.unitType} ${m.serial}`).join(" · ")}</p><button className="btn btn-quiet btn-small" onClick={() => setStation(null)}>Close</button></div>}
        </Panel>
    );
}

/** RO: paper nominations, deposits and symbols (before Form 7A). */
export function EncorePanel() {
    const area = useMyArea("constituency");
    const [electionId, setElectionId] = useState("");
    const noms = useLoad(electionId ? "/nominations" : null, { electionId });
    const sym = useLoad("/nominations/symbols");
    const [run, st] = useAction(noms.reload);
    const [f, setF] = useState({});
    const [paper, setPaper] = useState({ name: "", dateOfBirth: "", party: "", independent: false, sets: 1, deposit: { category: "general", amount: "", receiptNumber: "", mode: "cash" } });
    const v = (id, k) => f[id]?.[k] ?? "";
    const set = (id, k) => (e) => setF({ ...f, [id]: { ...f[id], [k]: e.target.value } });
    const items = noms.data?.items ?? [];
    return (
        <Panel title="Nominations: deposits, paper nominations and symbols" intro="Digitise nominations delivered on paper, record security deposits, and allot symbols to accepted candidates after withdrawals close. Form 7A then lists recognised national parties, State parties, registered unrecognised parties and independents, in that order.">
            <div className="desk-form"><ElectionSelect value={electionId} onChange={setElectionId} /></div>
            <Status loading={noms.loading} error={noms.error || st.error} notice={st.notice} />
            <Table head={["Candidate", "Party", "Status", "Deposit", "Antecedents", "Papers", "Symbol"]} empty="No nominations in this election." rows={items.map((n) => (
                <tr key={n._id}><td>{n.name}<br /><small className="muted">{n.source === "physical" ? "paper, digitised" : "online"}</small></td><td>{n.party}</td><td>{label(n.status)}</td>
                    <td>{n.deposit ? `${inr(n.deposit.amount)} (${n.deposit.category.toUpperCase()})` : (
                        <span className="desk-actions" style={{ marginTop: 0 }}><input aria-label="Receipt" placeholder="Receipt no." value={v(n._id, "r")} onChange={set(n._id, "r")} style={{ width: 100 }} /><select aria-label="Category" value={v(n._id, "c") || "general"} onChange={set(n._id, "c")}><option value="general">General</option><option value="sc">SC</option><option value="st">ST</option></select>
                            <button className="btn btn-quiet btn-small" disabled={!v(n._id, "r") || st.busy} onClick={() => run(() => api.post(`/nominations/${n._id}/deposit`, { category: v(n._id, "c") || "general", amount: (v(n._id, "c") || "general") === "general" ? 10000 : 5000, receiptNumber: v(n._id, "r") }))}>Record</button></span>)}</td>
                    <td>{n.affidavit?.criminalCases ? `${n.affidavit.criminalCases} case(s)${n.criminalAntecedents?.publicityDue ? `, publicity ${n.criminalAntecedents.publicity?.length ?? 0}/3` : ""}` : "None declared"}</td><td className="num">{n.sets ?? 1}</td>
                    <td>{n.status === "accepted" ? (n.symbolAllotted ? <Badge tone="ok">{n.symbol}</Badge> : (
                        <span className="desk-actions" style={{ marginTop: 0 }}><select aria-label="Party category" value={v(n._id, "pc") || (n.independent ? "independent" : "registered_unrecognised")} onChange={set(n._id, "pc")}>{Object.entries(sym.data?.categories ?? {}).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                            {["recognised_national", "recognised_state"].includes(v(n._id, "pc")) ? <input aria-label="Reserved symbol" placeholder="Reserved symbol" value={v(n._id, "s") || n.symbol || ""} onChange={set(n._id, "s")} style={{ width: 110 }} />
                                : <select aria-label="Free symbol" value={v(n._id, "s")} onChange={set(n._id, "s")}><option value="">Free symbol…</option>{(sym.data?.freeSymbols ?? []).map((s) => <option key={s} value={s}>{s}</option>)}</select>}
                            <button className="btn btn-primary btn-small" disabled={st.busy || !(v(n._id, "s") || n.symbol)} onClick={() => run(() => api.post(`/nominations/${n._id}/symbol`, { partyCategory: v(n._id, "pc") || (n.independent ? "independent" : "registered_unrecognised"), symbol: v(n._id, "s") || n.symbol }))}>Allot</button></span>)) : n.symbol ?? "—"}</td></tr>))} />
            <details className="desk-item" style={{ marginTop: 12 }}><summary><strong>Digitise a paper nomination</strong></summary>
                <div className="desk-form" style={{ marginTop: 10 }}>
                    <Field id="pn-n" text="Candidate's name"><input id="pn-n" value={paper.name} onChange={(e) => setPaper({ ...paper, name: e.target.value })} /></Field>
                    <Field id="pn-d" text="Date of birth"><input id="pn-d" type="date" value={paper.dateOfBirth} onChange={(e) => setPaper({ ...paper, dateOfBirth: e.target.value })} /></Field>
                    <Field id="pn-p" text="Party"><input id="pn-p" value={paper.party} disabled={paper.independent} onChange={(e) => setPaper({ ...paper, party: e.target.value })} /></Field>
                    <Field id="pn-s" text="Nomination papers (1-4)"><input id="pn-s" type="number" min={1} max={4} value={paper.sets} onChange={(e) => setPaper({ ...paper, sets: e.target.value })} /></Field>
                    <Field id="pn-dc" text="Deposit category"><select id="pn-dc" value={paper.deposit.category} onChange={(e) => setPaper({ ...paper, deposit: { ...paper.deposit, category: e.target.value } })}><option value="general">General</option><option value="sc">SC</option><option value="st">ST</option></select></Field>
                    <Field id="pn-dr" text="Deposit receipt / challan"><input id="pn-dr" value={paper.deposit.receiptNumber} onChange={(e) => setPaper({ ...paper, deposit: { ...paper.deposit, receiptNumber: e.target.value } })} /></Field>
                    <div className="wide desk-actions"><label className="check"><input type="checkbox" checked={paper.independent} onChange={(e) => setPaper({ ...paper, independent: e.target.checked })} /> Independent</label>
                        <button className="btn btn-primary btn-small" disabled={!electionId || st.busy} onClick={() => run(() => api.post("/nominations/digitise", { electionId, ...area, ...paper, sets: Number(paper.sets), deposit: paper.deposit.receiptNumber ? { ...paper.deposit, amount: paper.deposit.category === "general" ? 10000 : 5000 } : undefined }))}>Digitise</button></div>
                </div>
            </details>
        </Panel>
    );
}

const IC_TONE = { draft: "info", submitted: "warn", returned: "bad", ceo_verified: "info", finalised: "ok" };

/** RO prepares and submits; CEO examines; the Commission finalises. */
export function IndexCardPanel() {
    const area = useMyArea("constituency");
    const { data, error, loading, reload } = useLoad("/index-cards");
    const [run, st] = useAction(reload);
    const [electionId, setElectionId] = useState("");
    const [edit, setEdit] = useState({});
    const [remarks, setRemarks] = useState("");
    const elections = useElections();
    const can = data?.can ?? {};
    const num = (card, path, val) => setEdit({ ...edit, [card]: { ...(edit[card] ?? {}), [path]: val } });
    const save = (c) => {
        const e = edit[c._id] ?? {};
        const body = { votes: {}, electors: {}, candidates: [] };
        for (const [k, val] of Object.entries(e)) {
            const [grp, key] = k.split(".");
            if (grp === "cand") { const [serial, f] = key.split(":"); let row = body.candidates.find((x) => x.serial === Number(serial)); if (!row) { row = { serial: Number(serial) }; body.candidates.push(row); } row[f] = val; }
            else body[grp][key] = val;
        }
        return run(() => api.post(`/index-cards/${c._id}`, body), "Saved.");
    };
    return (
        <Panel title="Index Card" intro="The statistical record of the election in a constituency, pre-filled from the roll, the station list, Form 7A and the result. Due within 72 hours of the declaration; the CEO checks it and the Commission finalises it.">
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {can.prepare && area.constituency && (
                <div className="desk-form" style={{ marginBottom: 12 }}>
                    <ElectionSelect value={electionId} onChange={setElectionId} filter={(e) => e.schedule.countingDate <= today()} text="Election (counted)" />
                    <div><button className="btn btn-primary btn-small" disabled={!electionId || st.busy} onClick={() => run(() => api.post("/index-cards", { electionId, ...area }))}>Prepare the card for {area.constituency}</button></div>
                </div>
            )}
            {data && (data.items.length ? data.items.map((c) => {
                const editable = can.prepare && ["draft", "returned"].includes(c.status);
                const val = (k, d) => edit[c._id]?.[k] ?? d;
                const inp = (k, d) => editable ? <input aria-label={k} inputMode="numeric" style={{ width: 90 }} value={val(k, d)} onChange={(e) => num(c._id, k, e.target.value)} /> : Number(d).toLocaleString("en-IN");
                return (
                    <div className="desk-item" key={c._id}>
                        <h4>{c.jurisdiction.constituency} · {c.electionName} <Badge tone={IC_TONE[c.status]}>{c.statusText}</Badge>{c.locked && <> <Badge tone="ok">locked</Badge></>}</h4>
                        <p className="meta">Sources: {Object.entries(c.sources).map(([k, s]) => `${k}: ${s}`).join(" · ")}{c.result.mockFigures ? " · the votes are MOCK figures" : ""}{c.dueAt ? ` · due ${when(c.dueAt)}` : ""}</p>
                        <div className="two-col">
                            <Table head={["Electors", "#"]} rows={[["general", "General"], ["serviceVoters", "Service voters"], ["overseas", "Overseas"], ["total", "Total"], ["men", "Men"], ["women", "Women"], ["thirdGender", "Third gender"]].map(([k, t]) => <tr key={k}><td>{t}</td><td className="num">{inp(`electors.${k}`, c.electors[k])}</td></tr>)} />
                            <Table head={["Votes", "#"]} rows={[["polled", "Polled"], ["valid", "Valid"], ["rejected", "Rejected"], ["notaEvm", "NOTA (EVM)"], ["notaPostal", "NOTA (postal)"], ["tendered", "Tendered"]].map(([k, t]) => <tr key={k}><td>{t}</td><td className="num">{inp(`votes.${k}`, c.votes[k])}</td></tr>)} />
                        </div>
                        <Table head={["#", "Candidate", "Party", "#EVM", "#Postal", "#Total"]} rows={c.candidates.map((x) => (
                            <tr key={x.serial}><td>{x.serial}{c.result.returnedSerial === x.serial ? " ★" : ""}</td><td>{x.name}</td><td>{x.party}</td><td className="num">{inp(`cand.${x.serial}:evm`, x.evm)}</td><td className="num">{inp(`cand.${x.serial}:postal`, x.postal)}</td><td className="num">{(x.evm + x.postal).toLocaleString("en-IN")}</td></tr>))} />
                        <p className="meta">Turnout {c.validation.derived.turnoutPercent}% · margin {c.validation.derived.margin?.toLocaleString("en-IN") ?? "—"} · deposits forfeited: {c.validation.derived.forfeitedDeposits.length}</p>
                        {c.validation.errors.map((e) => <p key={e} className="meta"><Badge tone="bad">error</Badge> {e}</p>)}
                        {c.validation.warnings.map((e) => <p key={e} className="meta"><Badge tone="warn">check</Badge> {e}</p>)}
                        {c.ceoRemarks && <p className="meta">CEO: {c.ceoRemarks}</p>}
                        <div className="desk-actions">
                            {editable && <><button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => save(c)}>Save figures</button><button className="btn btn-primary btn-small" disabled={st.busy || c.validation.errors.length > 0} onClick={() => run(() => api.post(`/index-cards/${c._id}/submit`, {}))}>Submit to the CEO</button></>}
                            {can.examine && c.status === "submitted" && <><input aria-label="Remarks" placeholder="Remarks (needed to return it)" value={remarks} onChange={(e) => setRemarks(e.target.value)} style={{ flex: "1 1 220px" }} />
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/index-cards/${c._id}/examine`, { decision: "accept", remarks }))}>Verify</button>
                                <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/index-cards/${c._id}/examine`, { decision: "return", remarks }))}>Return to the RO</button></>}
                            {can.finalise && c.status === "ceo_verified" && <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/index-cards/${c._id}/finalise`, {}))}>Finalise and lock</button>}
                        </div>
                    </div>
                );
            }) : <Empty>No index cards yet.{elections.length ? "" : " There are no elections."}</Empty>)}
        </Panel>
    );
}

const B_TONE = { generated: undefined, transmitted: "info", downloaded: "info", in_post: "info", received: "warn", late: "bad", counted: "ok", rejected: "bad" };

/** RO: postal ballots for service voters (generate, transmit, receive, validate at counting). */
export function EtpbPanel() {
    const area = useMyArea("constituency");
    const [electionId, setElectionId] = useState("");
    const { data, error, loading, reload } = useLoad("/etpb", electionId ? { electionId } : {});
    const [run, st] = useAction(reload);
    const [scan, setScan] = useState("");
    const can = data?.can ?? {};
    return (
        <Panel title="Postal ballots for service voters (ETPBS)" intro="Generate a ballot for every service voter once Form 7A is published, transmit it (the PIN goes separately to the Record Officer), record the marked ballot's arrival, and scan each one once at counting. No vote is cast online.">
            <div className="desk-form"><ElectionSelect value={electionId} onChange={setElectionId} filter={(e) => e.stage !== "completed"} /></div>
            {data && <Kpis items={Object.entries(data.statuses).map(([k, t]) => ({ label: t, value: data.counts[k] ?? 0, tone: B_TONE[k] === "bad" && data.counts[k] ? "bad" : undefined }))} />}
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {can.manage && area.constituency && (
                <div className="desk-actions">
                    <button className="btn btn-primary btn-small" disabled={!electionId || st.busy} onClick={() => run(() => api.post(`/etpb/${electionId}/generate`, area))}>Generate ballots for {area.constituency}</button>
                    <button className="btn btn-quiet btn-small" disabled={!electionId || st.busy} onClick={() => run(() => api.post(`/etpb/${electionId}/transmit`, area))}>Transmit generated ballots</button>
                    <input aria-label="Ballot code" placeholder="Scan ballot code at counting" value={scan} onChange={(e) => setScan(e.target.value.toUpperCase())} />
                    <button className="btn btn-quiet btn-small" disabled={!scan || st.busy} onClick={() => run(() => api.post(`/etpb/ballots/${scan}/validate`, { form13AValid: true }))}>Validate (13A attested)</button>
                </div>
            )}
            {data && <Table head={["Ballot", "Service voter", "Status", "Speed Post", "Counting", ""]} empty="No ballots." rows={data.items.map((b) => (
                <tr key={b._id}><td><code>{b.ballotId}</code></td><td>{b.name}<br /><small className="muted">{b.elector}{b.serviceNumber ? ` · ${b.serviceNumber}` : ""}</small></td><td><Badge tone={B_TONE[b.status]}>{b.statusText}</Badge></td>
                    <td>{b.post?.article ?? "—"}</td><td>{b.counting ? (b.counting.form13AValid ? "valid" : b.counting.reason) : "—"}</td>
                    <td>{can.manage && ["in_post", "downloaded", "transmitted"].includes(b.status) && <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/etpb/ballots/${b.ballotId}/receive`, { envelopeIntact: true }))}>Received</button>}</td></tr>))} />}
        </Panel>
    );
}
