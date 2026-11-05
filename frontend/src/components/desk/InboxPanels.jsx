import { useEffect, useMemo, useState } from "react";
import { Badge, Kpis, Panel, Status, Table, useLoad, when } from "./kit";

// The officer's inbox (every case waiting for them, across all modules, by due date) and the
// workload report for supervisors. Both are read-only views: work is done in the desk's panels.

const SEEN_KEY = "inbox-seen";
const TONE = { high: "bad", medium: "warn", normal: "info" };
const waited = (h) => (h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`);
const due = (x) => (x.overdue ? `Overdue since ${when(x.dueAt)}` : `Due ${when(x.dueAt)}`);
const area = (a = {}) => [a.partNumber && `Part ${a.partNumber}`, a.constituency, a.district].filter(Boolean).join(", ") || a.state || "";

function Row({ x, onOpen, canOpen, fresh }) {
    return (
        <tr>
            <td><Badge tone={TONE[x.priority]}>{x.priority === "normal" ? "Normal" : x.priority === "high" ? "High" : "Medium"}</Badge></td>
            <td><strong>{x.kind}</strong>{fresh && <span className="tag-new" style={{ marginLeft: 6 }}>New</span>}<br /><span className="muted">{x.title}{x.ref ? ` · ${x.ref}` : ""}</span></td>
            <td>{area(x.area)}</td>
            <td>{waited(x.waitedHours)}</td>
            <td style={{ color: x.overdue ? "var(--danger)" : undefined }}>{due(x)}</td>
            <td>{canOpen ? <button type="button" className="btn btn-secondary btn-small" onClick={() => onOpen(x.tab)}>{x.action}</button> : <span className="muted">{x.action}</span>}</td>
        </tr>
    );
}

export function InboxPanel({ onOpen, tabs }) {
    const { data, error, loading, reload } = useLoad("/inbox");
    const [filter, setFilter] = useState("all");
    const [seen] = useState(() => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } });
    const has = useMemo(() => new Set(tabs), [tabs]);
    const items = data?.items ?? [];
    useEffect(() => { if (data) try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch { /* ignore */ } }, [data]);
    const fresh = (x) => Boolean(seen) && Date.parse(x.since) > seen;
    const shown = items.filter((x) => filter === "all" || (filter === "overdue" ? x.overdue : filter === "today" ? !x.overdue && Date.parse(x.dueAt) - Date.now() < 864e5 : filter === "new" ? fresh(x) : true));
    const c = data?.counts ?? {};
    const newCount = items.filter(fresh).length;
    if (!loading && !error && !items.length && !data?.escalated?.length) {
        return <Panel title="Your inbox" actions={<button type="button" className="link-button" onClick={reload}>Refresh</button>}><p className="muted" style={{ margin: 0 }}>Nothing is waiting for you. New work appears here as it arrives.</p></Panel>;
    }
    return (
        <Panel title="Your inbox" intro="Everything waiting for you, most urgent first. Each item has a time limit; overdue work goes to your supervisor." actions={<button type="button" className="link-button" onClick={reload}>Refresh</button>}>
            <Status error={error} loading={loading && !data} />
            {data && (
                <>
                    <Kpis items={[
                        { label: "Waiting for you", value: c.total, onClick: () => setFilter("all") },
                        { label: "Overdue", value: c.overdue, tone: c.overdue ? "bad" : "ok", onClick: () => setFilter("overdue") },
                        { label: "Due within a day", value: c.dueToday, tone: c.dueToday ? "warn" : undefined, onClick: () => setFilter("today") },
                        newCount > 0 && { label: "New since your last visit", value: newCount, onClick: () => setFilter("new") },
                    ]} />
                    <div className="pill-cloud" style={{ margin: "12px 0" }}>
                        {[["all", "All"], ["overdue", "Overdue"], ["today", "Due today"], ["new", "New"]].map(([id, l]) => <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>{l}</button>)}
                    </div>
                    <Table head={["Priority", "Case", "Area", "Waiting", "Time limit", ""]} empty="Nothing in this view."
                        rows={shown.slice(0, 50).map((x) => <Row key={`${x.kind}-${x.id}`} x={x} onOpen={onOpen} canOpen={has.has(x.tab)} fresh={fresh(x)} />)} />
                    {shown.length > 50 && <p className="muted">Showing the 50 most urgent of {shown.length}.</p>}
                    {data.escalated?.length > 0 && (
                        <>
                            <h3 className="subhead">Escalated to you ({data.escalated.length})</h3>
                            <p className="muted" style={{ marginTop: 0 }}>Work under your supervision that has waited more than twice its time limit.</p>
                            <Table head={["Priority", "Case", "Area", "Waiting", "Time limit", "Needed"]}
                                rows={data.escalated.slice(0, 20).map((x) => <Row key={`e-${x.kind}-${x.id}`} x={x} onOpen={onOpen} canOpen={false} />)} />
                        </>
                    )}
                </>
            )}
        </Panel>
    );
}

export function WorkloadPanel() {
    const { data, error, loading } = useLoad("/inbox/workload");
    const a = data?.applications ?? {};
    const hrs = (h) => (h == null ? "—" : h < 48 ? `${h} h` : `${Math.round(h / 24)} days`);
    return (
        <>
            <Panel title="Applications" intro="Forms 6 to 8 in your jurisdiction: how many came in, how many are waiting and how long decisions take.">
                <Status error={error} loading={loading} />
                {data && <Kpis items={[
                    { label: "Received", value: a.received },
                    { label: "Pending", value: a.pending, tone: a.pending ? "warn" : "ok" },
                    { label: "Awaiting field verification", value: a.awaitingField },
                    { label: "Awaiting decision", value: a.awaitingDecision },
                    { label: "Overdue", value: a.overdue, tone: a.overdue ? "bad" : "ok" },
                    { label: "Average disposal", value: hrs(a.avgDisposalHours) },
                    { label: "Verified more than once", value: a.repeatedVerification },
                    { label: "Reassigned", value: a.reassigned },
                ]} />}
            </Panel>
            {data && (
                <div className="cols-2">
                    <Panel title="By officer">
                        <Table head={["Officer", "Work", "#Done", "Average time"]} empty="No decided or verified applications yet."
                            rows={data.officers.map((o) => <tr key={`${o.epic}-${o.role}`}><td>{o.epic}</td><td>{o.role === "field" ? "Field verification" : "Decisions"}</td><td className="num">{o.done}</td><td>{hrs(o.avgHours)}</td></tr>)} />
                    </Panel>
                    <Panel title="By district">
                        <Table head={["District", "#Received", "#Pending", "#Overdue"]} empty="No applications yet."
                            rows={data.districts.map((d) => <tr key={d.district}><td>{d.district}</td><td className="num">{d.received}</td><td className="num">{d.pending}</td><td className="num" style={{ color: d.overdue ? "var(--danger)" : undefined }}>{d.overdue}</td></tr>)} />
                    </Panel>
                </div>
            )}
            {data && (
                <Panel title="Complaints and grievances">
                    <Kpis items={[
                        { label: "cVIGIL complaints", value: data.complaints.total },
                        { label: "Disposed", value: data.complaints.closed },
                        { label: "Within 100 minutes", value: data.complaints.within100, tone: "ok" },
                        { label: "Average disposal", value: data.complaints.avgMinutes == null ? "—" : `${data.complaints.avgMinutes} min` },
                        { label: "Grievances", value: data.grievances.total },
                        { label: "Resolved", value: data.grievances.resolved },
                        { label: "Average first response", value: hrs(data.grievances.avgResponseHours) },
                    ]} />
                </Panel>
            )}
        </>
    );
}
