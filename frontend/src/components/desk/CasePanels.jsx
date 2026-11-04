// MCC complaints (cVIGIL), roll appeals, the polling party's machine log and the Presiding
// Officer's report, station reports for supervisors, and the election agent's view of the nomination.
import { useState } from "react";
import api from "../../api/axios";
import { Badge, Empty, Field, Kpis, Panel, Status, Table, day, inr, label, useAction, useLoad, when } from "./kit";

const C_TONE = { received: "warn", assigned: "info", field_reported: "info", disposed: "ok", dropped: undefined };
const SEV_TONE = { critical: "bad", high: "warn", medium: "info" };

export function ComplaintsPanel() {
    const [status, setStatus] = useState("");
    const { data, error, loading, reload } = useLoad("/complaints", status ? { status } : {});
    const [run, st] = useAction(reload);
    const [f, setF] = useState({});
    const [photo, setPhoto] = useState({});
    const v = (id, k) => f[id]?.[k] ?? "";
    const set = (id, k) => (e) => setF({ ...f, [id]: { ...f[id], [k]: e.target.value } });
    const can = data?.can ?? {};
    return (
        <Panel title="Model Code of Conduct complaints (cVIGIL)" intro={can.dispatch ? "Send a flying squad within minutes; the 100-minute clock runs from the report." : can.investigate ? "Reports assigned to your squad. Reach the spot, act, and report what you found and seized." : "Read-only."}>
            {data && <Kpis items={[{ label: "New", value: data.counts.received, tone: data.counts.received ? "warn" : undefined }, { label: "With flying squads", value: data.counts.assigned }, { label: "Awaiting disposal", value: data.counts.field_reported },
                { label: "Past 100 minutes", value: data.overdue, tone: data.overdue ? "bad" : "ok" }, { label: "Closed within 100 min", value: data.withinSla === null ? "—" : `${data.withinSla}%` },
                ...Object.entries(data.seized).map(([k, val]) => ({ label: `${data.seizureKinds[k]} seized`, value: inr(val) }))]} />}
            <div className="row-actions" style={{ margin: "12px 0" }}>
                {[["", "All"], ["received", "New"], ["assigned", "With squads"], ["field_reported", "Awaiting disposal"], ["disposed", "Disposed"]].map(([k, t]) => <button key={k} type="button" className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{t}</button>)}
            </div>
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {data && (data.items.length ? data.items.map((c) => (
                <div className="desk-item" key={c._id}>
                    <h4>{c.referenceId} · {c.categoryLabel} <Badge tone={SEV_TONE[c.severity]}>{c.severity}</Badge> <Badge tone={C_TONE[c.status]}>{c.statusText}</Badge>
                        {c.clock.minutesLeft !== null && <> <Badge tone={c.clock.minutesLeft < 0 ? "bad" : c.clock.minutesLeft < 30 ? "warn" : "ok"}>{c.clock.minutesLeft < 0 ? `${-c.clock.minutesLeft} min over` : `${c.clock.minutesLeft} min left`}</Badge></>}</h4>
                    <p className="meta">{c.place ?? "Place not given"} · {c.jurisdiction.constituency} · {when(c.receivedAt)}{c.anonymous ? " · anonymous" : c.complainant?.mobile ? ` · complainant ${c.complainant.mobile}` : ""}{c.location ? <> · <a href={`https://www.google.com/maps?q=${c.location.lat},${c.location.lng}`} target="_blank" rel="noreferrer">map</a></> : null}</p>
                    <p style={{ margin: "4px 0" }}>{c.description}</p>
                    {c.hasPhoto && (photo[c._id] ? <img src={photo[c._id]} alt="Evidence" style={{ maxWidth: 320, borderRadius: 8 }} /> : <button className="btn btn-quiet btn-small" onClick={async () => { try { setPhoto({ ...photo, [c._id]: (await api.get(`/complaints/${c._id}/photo`)).data.data.dataUrl }); } catch { /* shown as unavailable */ } }}>Show photo</button>)}
                    {c.assignedTo && <p className="meta">Flying squad {c.assignedTo.epic}, sent {when(c.assignedTo.at)}</p>}
                    {c.fieldReport && <p className="meta">Squad: {c.fieldReport.found ? "violation found" : "nothing found"} — {c.fieldReport.actions}</p>}
                    {c.seizures.length > 0 && <p className="meta">Seized: {c.seizures.map((s) => `${data.seizureKinds[s.kind]} ${inr(s.value)}${s.description ? ` (${s.description})` : ""}`).join("; ")}</p>}
                    {c.disposal && <p className="meta">Disposed: <strong>{data.disposals[c.disposal.outcome]}</strong> — {c.disposal.note}</p>}
                    {c.dropReason && <p className="meta">Dropped: {c.dropReason}</p>}
                    {can.dispatch && c.status === "received" && (
                        <div className="desk-actions">
                            <select aria-label="Flying squad" value={v(c._id, "squad")} onChange={set(c._id, "squad")}><option value="">Flying squad…</option>{data.squads.map((s) => <option key={s.epic} value={s.epic}>{s.epic} ({s.jurisdiction.constituency})</option>)}</select>
                            <button className="btn btn-primary btn-small" disabled={!v(c._id, "squad") || st.busy} onClick={() => run(() => api.post(`/complaints/${c._id}/dispatch`, { squadEpic: v(c._id, "squad") }), "Flying squad sent.")}>Send</button>
                            <input aria-label="Reason to drop" placeholder="Reason to drop" value={v(c._id, "drop")} onChange={set(c._id, "drop")} style={{ flex: "1 1 200px" }} />
                            <button className="btn btn-quiet btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/complaints/${c._id}/dispatch`, { drop: true, note: v(c._id, "drop") }), "Dropped.")}>Drop</button>
                        </div>
                    )}
                    {can.investigate && c.status === "assigned" && (
                        <div className="desk-form" style={{ marginTop: 10 }}>
                            <Field id={`fs-a-${c._id}`} text="What you found and did" wide><textarea id={`fs-a-${c._id}`} rows={2} value={v(c._id, "actions")} onChange={set(c._id, "actions")} /></Field>
                            <Field id={`fs-sk-${c._id}`} text="Seizure"><select id={`fs-sk-${c._id}`} value={v(c._id, "kind")} onChange={set(c._id, "kind")}><option value="">None</option>{Object.entries(data.seizureKinds).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                            <Field id={`fs-sv-${c._id}`} text="Value (₹)"><input id={`fs-sv-${c._id}`} inputMode="decimal" value={v(c._id, "value")} onChange={set(c._id, "value")} disabled={!v(c._id, "kind")} /></Field>
                            <div className="wide desk-actions">
                                <label className="check"><input type="checkbox" checked={v(c._id, "found") === "yes"} onChange={(e) => setF({ ...f, [c._id]: { ...f[c._id], found: e.target.checked ? "yes" : "" } })} /> Violation found</label>
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/complaints/${c._id}/field-report`, { actions: v(c._id, "actions"), found: v(c._id, "found") === "yes",
                                    seizures: v(c._id, "kind") ? [{ kind: v(c._id, "kind"), value: v(c._id, "value") }] : [] }), "Field report sent.")}>Send field report</button>
                            </div>
                        </div>
                    )}
                    {can.dispose && ["field_reported", "assigned"].includes(c.status) && (
                        <div className="desk-actions">
                            <select aria-label="Disposal" value={v(c._id, "outcome")} onChange={set(c._id, "outcome")}><option value="">Disposal…</option>{Object.entries(data.disposals).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                            <input aria-label="Reason" placeholder="Reasons (shown to the complainant)" value={v(c._id, "note")} onChange={set(c._id, "note")} style={{ flex: "1 1 240px" }} />
                            <button className="btn btn-primary btn-small" disabled={!v(c._id, "outcome") || st.busy} onClick={() => run(() => api.post(`/complaints/${c._id}/dispose`, { outcome: v(c._id, "outcome"), note: v(c._id, "note") }), "Disposed.")}>Dispose</button>
                        </div>
                    )}
                </div>
            )) : <Empty>No reports.</Empty>)}
        </Panel>
    );
}

const A_TONE = { first_appeal: "warn", second_appeal: "warn", with_ero: "info", implemented: "ok", first_decided: undefined, second_decided: undefined };
export function AppealsPanel() {
    const { data, error, loading, reload } = useLoad("/appeals");
    const [run, st] = useAction(reload);
    const [f, setF] = useState({});
    const v = (id, k) => f[id]?.[k] ?? "";
    const set = (id, k) => (e) => setF({ ...f, [id]: { ...f[id], [k]: e.target.value } });
    const can = data?.can ?? {};
    return (
        <Panel title="Roll appeals (RP Act 1950, s. 24)" intro={can.first ? "First appeals against the EROs' orders in your district. Hear the appellant, then dismiss, allow or remand; an allowed appeal goes to the ERO to implement." : can.second ? "Second appeals against the district appellate orders." : "Appellate orders you must implement in the roll."}>
            <Status loading={loading} error={error || st.error} notice={st.notice} />
            {data && (data.items.length ? data.items.map((a) => {
                const turn = (can.first && a.status === "first_appeal") ? "first" : (can.second && a.status === "second_appeal") ? "second" : null;
                return (
                    <div className="desk-item" key={a._id}>
                        <h4>{a.referenceId} · {a.appellant.name} <Badge tone={A_TONE[a.status]}>{a.statusText}</Badge></h4>
                        <p className="meta">Against {a.order.title} ({a.order.reference}), {a.order.status} on {day(a.order.decidedAt)} · {a.jurisdiction.constituency} · filed {when(a.filedAt)}</p>
                        {a.order.reason && <p className="meta">ERO's reasons: {a.order.reason}</p>}
                        <p style={{ margin: "4px 0" }}><strong>Grounds:</strong> {a.grounds}</p>
                        {a.secondGrounds && <p style={{ margin: "4px 0" }}><strong>Second appeal:</strong> {a.secondGrounds}</p>}
                        {a.first && <p className="meta">First appellate order: {data.outcomes[a.first.outcome]} — {a.first.reason}</p>}
                        {a.second && <p className="meta">Second appellate order: {data.outcomes[a.second.outcome]} — {a.second.reason}</p>}
                        {turn && (
                            <div className="desk-actions">
                                <select aria-label="Order" value={v(a._id, "outcome")} onChange={set(a._id, "outcome")}><option value="">Order…</option>{Object.entries(data.outcomes).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                                <input aria-label="Hearing date" type="date" value={v(a._id, "hearingDate")} onChange={set(a._id, "hearingDate")} />
                                <input aria-label="Reasons" placeholder="Reasons for the order" value={v(a._id, "reason")} onChange={set(a._id, "reason")} style={{ flex: "1 1 240px" }} />
                                <button className="btn btn-primary btn-small" disabled={!v(a._id, "outcome") || st.busy} onClick={() => run(() => api.post(`/appeals/${a._id}/${turn}`, f[a._id]), "Order recorded.")}>Record order</button>
                            </div>
                        )}
                        {can.implement && a.status === "with_ero" && (
                            <div className="desk-actions">
                                <input aria-label="What was done" placeholder="What you changed in the roll" value={v(a._id, "note")} onChange={set(a._id, "note")} style={{ flex: "1 1 280px" }} />
                                <button className="btn btn-primary btn-small" disabled={st.busy} onClick={() => run(() => api.post(`/appeals/${a._id}/implement`, { note: v(a._id, "note") }), "Recorded as implemented.")}>Mark implemented</button>
                            </div>
                        )}
                    </div>
                );
            }) : <Empty>No appeals.</Empty>)}
        </Panel>
    );
}

/** Presiding officer and polling officers: the machine log and, after the close, the PO's report. */
export function StationRecords() {
    const { data, error, loading, reload } = useLoad("/poll-day/records");
    const [run, st] = useAction(reload);
    const [m, setM] = useState({ event: "mock_poll_done", unit: "control_unit", serial: "", note: "" });
    const [r, setR] = useState({ electorsAssigned: "", votesRecorded: "", tenderedVotes: 0, challengedVotes: 0, votersAfterClose: 0, seals: "", controlUnit: "", vvpat: "", pollStartedAt: "07:00", pollClosedAt: "18:00", visitors: "", remarks: "", correctionReason: "" });
    if (loading || error) return <Panel title="Station records"><Status loading={loading} error={error} /></Panel>;
    const sr = (k) => (e) => setR({ ...r, [k]: e.target.value });
    return (
        <>
            <Panel title={`Machine log · part ${data.station.partNumber}, ${data.station.name}`} intro="Every event on the control unit, ballot unit and VVPAT, in order. Entries are added, never edited.">
                {data.can.machine && (
                    <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/poll-day/machine-events", m), "Recorded.").then((ok) => ok && setM({ ...m, note: "" })); }}>
                        <Field id="me-e" text="Event"><select id="me-e" value={m.event} onChange={(e) => setM({ ...m, event: e.target.value })}>{Object.entries(data.events).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Field>
                        <Field id="me-u" text="Unit"><select id="me-u" value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value })}>{data.units.map((u) => <option key={u} value={u}>{label(u)}</option>)}</select></Field>
                        <Field id="me-s" text="Serial number"><input id="me-s" value={m.serial} onChange={(e) => setM({ ...m, serial: e.target.value })} /></Field>
                        <Field id="me-n" text="Note"><input id="me-n" value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} placeholder={m.event === "replaced" ? "Required: why, and the new serial" : ""} /></Field>
                        <div className="wide"><button className="btn btn-primary" disabled={st.busy}>Add to log</button></div>
                    </form>
                )}
                <Table head={["Time", "Event", "Unit", "Serial", "By", "Note"]} empty="Nothing logged yet." rows={data.log.map((x) => (
                    <tr key={x._id}><td>{when(x.at)}</td><td>{data.events[x.event]}</td><td>{label(x.unit)}</td><td>{x.serial ?? "—"}</td><td>{x.by.epic}</td><td>{x.note ?? ""}</td></tr>))} />
                <Status error={st.error} notice={st.notice} />
            </Panel>
            {data.can.report && (
                <Panel title="Presiding Officer's report" intro={data.pollStatus === "closed" ? "The diary and account of votes recorded (Form 17C, Part I). It is compared with your register; any difference is flagged for the Returning Officer." : "Available once you close the poll."}>
                    {data.report && <div className={`alert ${data.report.flags.length ? "alert-warn" : "alert-ok"}`}>Version {data.report.version} submitted {when(data.report.at)}: {data.report.votesRecorded} votes recorded of {data.report.electorsAssigned} electors; register shows {data.report.registerMarked} marked.{data.report.flags.map((x) => <div key={x}>• {x}</div>)}</div>}
                    {data.pollStatus === "closed" && (
                        <form className="desk-form" onSubmit={(e) => { e.preventDefault(); run(() => api.post("/poll-day/po-report", r)); }}>
                            {[["electorsAssigned", "Electors assigned"], ["votesRecorded", "Votes recorded in the machine"], ["tenderedVotes", "Tendered votes"], ["challengedVotes", "Challenged votes"], ["votersAfterClose", "Slips given at the close"]].map(([k, t]) =>
                                <Field key={k} id={`po-${k}`} text={t}><input id={`po-${k}`} inputMode="numeric" value={r[k]} onChange={sr(k)} required /></Field>)}
                            <Field id="po-cu" text="Control unit"><input id="po-cu" value={r.controlUnit} onChange={sr("controlUnit")} /></Field>
                            <Field id="po-vv" text="VVPAT"><input id="po-vv" value={r.vvpat} onChange={sr("vvpat")} /></Field>
                            <Field id="po-seals" text="Seal numbers"><input id="po-seals" value={r.seals} onChange={sr("seals")} /></Field>
                            <Field id="po-start" text="Poll started"><input id="po-start" type="time" value={r.pollStartedAt} onChange={sr("pollStartedAt")} /></Field>
                            <Field id="po-close" text="Poll closed"><input id="po-close" type="time" value={r.pollClosedAt} onChange={sr("pollClosedAt")} /></Field>
                            <Field id="po-vis" text="Visitors (observers, sector officer)" wide><input id="po-vis" value={r.visitors} onChange={sr("visitors")} /></Field>
                            <Field id="po-rem" text="Remarks" wide><textarea id="po-rem" rows={2} value={r.remarks} onChange={sr("remarks")} /></Field>
                            {data.report && <Field id="po-corr" text="Reason for the correction" wide><input id="po-corr" value={r.correctionReason} onChange={sr("correctionReason")} required /></Field>}
                            <div className="wide"><button className="btn btn-primary" disabled={st.busy}>{data.report ? "Submit corrected report" : "Submit report"}</button></div>
                        </form>
                    )}
                    <Status error={st.error} notice={st.notice} />
                </Panel>
            )}
        </>
    );
}

/** RO, DEO, CEO and observers: the PO reports and machine events of their stations. */
export function StationReports() {
    const { data, error, loading } = useLoad("/poll-day/station-reports");
    if (loading || error) return <Panel title="Polling station reports"><Status loading={loading} error={error} /></Panel>;
    return (
        <Panel title="Polling station reports" intro="Presiding Officers' reports and machine events from the stations in your jurisdiction. Differences between the machine count and the register are flagged, not corrected.">
            <Kpis items={[{ label: "Approved stations", value: data.stations }, { label: "PO reports received", value: data.items.length }, { label: "Reports with differences", value: data.flagged, tone: data.flagged ? "warn" : "ok" },
                { label: "Units replaced", value: data.replacements }, { label: "Malfunctions logged", value: data.malfunctions, tone: data.malfunctions ? "warn" : undefined }]} />
            <div style={{ marginTop: 12 }}><Table head={["Station", "#Electors", "#Votes recorded", "#Register", "Flags", "Submitted"]} empty="No reports yet (they come in after the poll closes)." rows={data.items.map((r) => (
                <tr key={r._id}><td>Part {r.partNumber}: {r.stationName}</td><td className="num">{r.electorsAssigned}</td><td className="num">{r.votesRecorded}</td><td className="num">{r.registerMarked}</td><td>{r.flags.length ? r.flags.map((f) => <div key={f}><small>{f}</small></div>) : <Badge tone="ok">none</Badge>}</td><td><small>{when(r.at)} · v{r.version}</small></td></tr>))} /></div>
            <h3>Recent machine events</h3>
            <Table head={["Time", "Station", "Event", "Unit", "Note"]} empty="No machine events." rows={data.log.map((x) => <tr key={x._id}><td><small>{when(x.at)}</small></td><td>Part {x.partNumber}</td><td>{data.events[x.event]}</td><td>{label(x.unit)}</td><td><small>{x.note ?? ""}</small></td></tr>)} />
        </Panel>
    );
}

/** Election agent: the candidate's nomination, read only. */
export function AssistedNomination() {
    const { data, error, loading } = useLoad("/nominations/assisted");
    return (
        <Panel title="Your candidate's nomination" intro="Read-only. Help the candidate prepare papers and attend scrutiny; only the candidate files or withdraws.">
            <Status loading={loading} error={error} />
            {data && (data.items.length ? data.items.map((n) => (
                <div className="desk-item" key={n._id}>
                    <h4>{n.name}{n.party ? ` (${n.party})` : ""} · {n.constituency} <Badge tone={n.status === "accepted" ? "ok" : n.status === "rejected" ? "bad" : "warn"}>{label(n.status)}</Badge></h4>
                    <p className="meta">Filed {when(n.filedAt)}{n.symbol ? ` · symbol: ${n.symbol}` : ""}{n.scrutiny ? ` · scrutiny: ${label(n.scrutiny.decision ?? n.scrutiny.outcome ?? "")} ${n.scrutiny.reason ?? ""}` : " · scrutiny pending"}</p>
                </div>
            )) : <Empty>You have not been appointed for a filed nomination yet. The candidate appoints you from their desk.</Empty>)}
        </Panel>
    );
}
