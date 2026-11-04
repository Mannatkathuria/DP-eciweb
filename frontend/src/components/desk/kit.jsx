// Small building blocks shared by the role desk panels.
import { useCallback, useEffect, useState } from "react";
import api from "../../api/axios";
import { apiMessage } from "../../config/elections";
import useGeography from "../../hooks/useGeography";

/** Loads `path` (GET) and reloads on demand. Returns { data, error, loading, reload }. */
export function useLoad(path, params) {
    const [state, setState] = useState({ data: null, error: "", loading: true });
    const key = JSON.stringify(params ?? {});
    const reload = useCallback(async () => {
        if (!path) return;
        setState((s) => ({ ...s, loading: true }));
        try { setState({ data: (await api.get(path, { params: JSON.parse(key) })).data.data, error: "", loading: false }); }
        catch (e) { setState({ data: null, error: apiMessage(e, "This could not be loaded."), loading: false }); }
    }, [path, key]);
    useEffect(() => { reload(); }, [reload]);
    return { ...state, reload };
}

/** Runs a write, shows its message, then calls `after`. Returns [run, { busy, error, notice, clear }]. */
export function useAction(after) {
    const [s, setS] = useState({ busy: false, error: "", notice: "" });
    const run = async (fn, okText) => {
        setS({ busy: true, error: "", notice: "" });
        try {
            const res = await fn();
            setS({ busy: false, error: "", notice: okText ?? res?.data?.message ?? "Saved." });
            if (after) await after(res);
            return res ?? true;
        } catch (e) { setS({ busy: false, error: apiMessage(e, "That did not work."), notice: "" }); return null; }
    };
    return [run, { ...s, clear: () => setS({ busy: false, error: "", notice: "" }) }];
}

export const Panel = ({ title, intro, children, actions }) => (
    <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <h2 style={{ marginTop: 0 }}>{title}</h2>{actions}
        </div>
        {intro && <p className="muted" style={{ marginTop: 0 }}>{intro}</p>}
        {children}
    </section>
);

export const Status = ({ error, notice, loading }) => (
    <>
        {loading && <p className="muted" role="status">Loading…</p>}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {notice && <div className="alert alert-ok" role="status">{notice}</div>}
    </>
);

export const Empty = ({ children }) => <p className="muted">{children}</p>;

const TONE = { ok: "badge-ok", warn: "badge-warn", bad: "badge-bad", info: "badge-progress" };
export const Badge = ({ tone, children }) => <span className={`badge ${TONE[tone] ?? ""}`}>{children}</span>;

export const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
export const day = (iso) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");
export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const label = (s) => String(s ?? "").replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function Kpis({ items }) {
    return (
        <div className="kpis">
            {items.filter(Boolean).map((k) => {
                const Tag = k.onClick ? "button" : "div";
                return (
                    <Tag key={k.label} type={k.onClick ? "button" : undefined} className={`kpi${k.tone ? ` is-${k.tone}` : ""}`} onClick={k.onClick}>
                        <strong>{k.value ?? "—"}</strong><span>{k.label}</span>
                    </Tag>
                );
            })}
        </div>
    );
}

export function Table({ head, rows, empty = "Nothing to show yet." }) {
    if (!rows.length) return <Empty>{empty}</Empty>;
    return (
        <div className="table-wrap">
            <table className="desk-table">
                <thead><tr>{head.map((h) => <th key={h} className={h.startsWith("#") ? "num" : undefined}>{h.replace(/^#/, "")}</th>)}</tr></thead>
                <tbody>{rows}</tbody>
            </table>
        </div>
    );
}

/** A form field: label + control. */
export const Field = ({ id, text, wide, children }) => (
    <div className={wide ? "wide" : undefined}><label htmlFor={id}>{text}</label>{children}</div>
);

/** State / district / constituency pickers, starting from the caller's own area. */
export function AreaPicker({ value, onChange, level = "constituency", lock = {} }) {
    const { states, districtsOf, constituenciesOf } = useGeography();
    const set = (k) => (e) => onChange({ ...value, [k]: e.target.value, ...(k === "state" ? { district: "", constituency: "" } : k === "district" ? { constituency: "" } : {}) });
    return (
        <>
            <Field id="ap-state" text="State/UT">
                <select id="ap-state" value={value.state ?? ""} onChange={set("state")} disabled={lock.state} required>
                    <option value="">Choose…</option>{states.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
            </Field>
            {level !== "state" && (
                <Field id="ap-district" text="District">
                    <select id="ap-district" value={value.district ?? ""} onChange={set("district")} disabled={lock.district} required={level !== "state"}>
                        <option value="">Choose…</option>{districtsOf(value.state).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                    </select>
                </Field>
            )}
            {level === "constituency" && (
                <Field id="ap-ac" text="Assembly constituency">
                    <select id="ap-ac" value={value.constituency ?? ""} onChange={set("constituency")} disabled={lock.constituency} required>
                        <option value="">Choose…</option>{constituenciesOf(value.state, value.district).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </Field>
            )}
        </>
    );
}

/** Downloads rows as a CSV file. */
export function downloadCsv(filename, rows) {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The caller's assignments (from the server). */
export function useMyAssignments() {
    const { data } = useLoad("/assignments/me");
    return data?.assignments ?? [];
}
