import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import { apiMessage } from "../config/elections";

// Training for election staff: the modules for the signed-in person's role, each with steps
// through the real screens and a short knowledge check marked on the server. Supervisors also
// see how their staff are getting on.

function Module({ mod, passMark, onDone }) {
    const [open, setOpen] = useState(false);
    const [answers, setAnswers] = useState(mod.questions.map(() => null));
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const submit = async (e) => {
        e.preventDefault(); setError("");
        try { const { data } = await api.post(`/training/modules/${mod.id}/attempts`, { answers }); setResult(data.data); onDone(); }
        catch (err) { setError(apiMessage(err, "Could not check your answers.")); }
    };
    const p = mod.progress;
    return (
        <div className="panel">
            <h2 style={{ marginTop: 0 }}>{mod.title} {p?.passedAt ? <span className="badge badge-ok">Passed</span> : p ? <span className="badge badge-warn">Not passed yet</span> : <span className="badge">Not started</span>}</h2>
            <p>{mod.summary}</p>
            {p && <p className="muted"><small>{p.attempts} attempt(s), best score {Math.round(p.bestScore * 100)}%{p.passedAt ? `, passed ${new Date(p.passedAt).toLocaleDateString()}` : ""}</small></p>}
            <button className="btn btn-quiet btn-small" onClick={() => setOpen(!open)}>{open ? "Close" : "Open module"}</button>
            {open && (
                <div className="stack" style={{ marginTop: 12 }}>
                    <ol>{mod.steps.map((s, i) => <li key={i}>{s.text} {s.link && <Link to={s.link}>Go to the screen</Link>}</li>)}</ol>
                    <form onSubmit={submit} className="stack">
                        <h3>Knowledge check (pass mark {Math.round(passMark * 100)}%)</h3>
                        {mod.questions.map((q, i) => (
                            <fieldset key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
                                <legend>{i + 1}. {q.text}</legend>
                                {q.options.map((o, j) => (
                                    <label key={j} className="check"><input type="radio" name={`${mod.id}-${i}`} checked={answers[i] === j} onChange={() => setAnswers(answers.map((a, k) => (k === i ? j : a)))} /> {o}</label>
                                ))}
                                {result && <p className={result.results[i].correct ? "" : "muted"} style={{ margin: "6px 0 0" }}><small>{result.results[i].correct ? "✓ Correct. " : "✗ "}{result.results[i].explain}</small></p>}
                            </fieldset>
                        ))}
                        {error && <div className="alert alert-error" role="alert">{error}</div>}
                        {result && <div className={`alert ${result.passed ? "alert-ok" : "alert-warn"}`} role="status">You scored {Math.round(result.score * 100)}%. {result.passed ? "Module passed." : "Read the explanations and try again."}</div>}
                        <button className="btn btn-primary" type="submit" disabled={answers.some((a) => a === null)}>Check my answers</button>
                    </form>
                </div>
            )}
        </div>
    );
}

export default function Training() {
    const { logged, userData } = useContext(AuthContext);
    const [data, setData] = useState(null);
    const [team, setTeam] = useState(null);
    const [error, setError] = useState("");
    const load = useCallback(async () => {
        try { setData((await api.get("/training/modules")).data.data); }
        catch (err) { setError(apiMessage(err, "Could not load your training.")); }
        try { setTeam((await api.get("/training/team")).data.data.items); } catch { setTeam(null); }
    }, []);
    useEffect(() => { if (logged) load(); }, [logged, load]);
    if (!logged || !userData) return <Navigate to="/signin" replace />;

    return (
        <>
            <PageHead title="Training" crumbs={[{ label: "Training" }]}
                lede="Practice modules for your role. Each walks through the screens you use and ends with a short knowledge check. Prototype material, not official ECI training." />
            <section className="section">
                <div className="container stack">
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    {data && data.items.length === 0 && <p>There are no training modules for your role yet.</p>}
                    {data?.items.map((m) => <Module key={m.id} mod={m} passMark={data.passMark} onDone={load} />)}
                    {team && (
                        <div className="panel">
                            <h2>Your staff's training</h2>
                            <div className="table-wrap"><table>
                                <thead><tr><th>Officer</th><th>Role</th><th>Where</th><th>Modules passed</th></tr></thead>
                                <tbody>{team.map((t) => (
                                    <tr key={`${t.epic}-${t.role}-${t.jurisdiction.pollingStation ?? ""}`}><td>{t.epic}</td><td>{t.role.replace(/_/g, " ")}</td>
                                        <td><small>{[t.jurisdiction.pollingStation, t.jurisdiction.constituency].filter(Boolean).join(", ")}</small></td>
                                        <td><span className={`badge ${t.passed === t.modules ? "badge-ok" : "badge-warn"}`}>{t.passed} of {t.modules}</span></td></tr>
                                ))}
                                {team.length === 0 && <tr><td colSpan={4}>No staff in your jurisdiction yet.</td></tr>}</tbody>
                            </table></div>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}
