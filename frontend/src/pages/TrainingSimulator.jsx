import { useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import { apiMessage } from "../config/elections";

// Poll-day training simulator: timed, step-by-step scenarios with synthetic people and places.
// Choices are recorded and scored on the server; nothing here touches a live record.

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function TrainingSimulator() {
    const { logged } = useContext(AuthContext);
    const [list, setList] = useState(null);
    const [report, setReport] = useState(null);
    const [run, setRun] = useState(null);       // { runId, startedAt, minutes, scenario }
    const [answers, setAnswers] = useState([]);
    const [result, setResult] = useState(null);
    const [now, setNow] = useState(Date.now());
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const [l, r] = await Promise.all([api.get("/training/scenarios"), api.get("/training/report")]);
            setList(l.data.data); setReport(r.data.data);
        } catch (err) { setError(apiMessage(err, "Could not load the scenarios.")); }
    }, []);
    useEffect(() => { if (logged) load(); }, [logged, load]);
    useEffect(() => { if (!run || result) return undefined; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [run, result]);
    if (!logged) return <Navigate to="/signin" replace />;

    const start = async (id) => {
        setError(""); setResult(null);
        try { const { data } = await api.post(`/training/scenarios/${id}/start`); setRun(data.data); setAnswers([]); setNow(Date.now()); }
        catch (err) { setError(apiMessage(err, "Could not start the scenario.")); }
    };
    const submit = async () => {
        try { const { data } = await api.post(`/training/runs/${run.runId}/submit`, { answers }); setResult(data.data); await load(); }
        catch (err) { setError(apiMessage(err, "Could not submit.")); }
    };
    const elapsed = run ? Math.max(0, Math.round((now - Date.parse(run.startedAt)) / 1000)) : 0;
    const left = run ? run.minutes * 60 - elapsed : 0;
    const stepNo = answers.length;

    return (
        <>
            <PageHead title="Poll-day training simulator" crumbs={[{ label: "Training", to: "/training" }, { label: "Simulator" }]}
                lede={`Practise real situations with made-up people and places. ${list ? `Pass mark ${Math.round(list.passMark * 100)}%; running over time costs 10%.` : ""}`} />
            <section className="section">
                <div className="container stack">
                    {list?.mode && list.mode !== "live" && <div className="alert alert-warn">Training environment: everything here is synthetic.</div>}
                    {error && <div className="alert alert-error" role="alert">{error}</div>}
                    <p><Link to="/training">Back to training modules</Link></p>

                    {run && !result && (
                        <div className="panel" style={{ borderColor: "var(--brand)" }}>
                            <h2 style={{ marginTop: 0 }}>{run.scenario.title} <small className={left < 0 ? "badge badge-bad" : "muted"} aria-live="off">{left >= 0 ? `${fmt(left)} left` : `${fmt(-left)} over time`}</small></h2>
                            <p><em>{run.scenario.situation}</em></p>
                            {run.scenario.steps.slice(0, stepNo).map((st, i) => <p key={i}><small className="muted">Step {i + 1}: {st.prompt}</small><br />Your choice: {st.options[answers[i]]}</p>)}
                            {stepNo < run.scenario.steps.length ? (
                                <fieldset style={{ border: 0, padding: 0 }}>
                                    <legend><strong>Step {stepNo + 1} of {run.scenario.steps.length}: {run.scenario.steps[stepNo].prompt}</strong></legend>
                                    {run.scenario.steps[stepNo].options.map((o, k) => <p key={k} style={{ margin: "6px 0" }}><button className="btn btn-quiet" style={{ textAlign: "left" }} onClick={() => setAnswers([...answers, k])}>{o}</button></p>)}
                                </fieldset>
                            ) : (
                                <p><button className="btn btn-primary" onClick={submit}>Submit my decisions</button> <button className="btn btn-quiet" onClick={() => setAnswers([])}>Start the steps again</button></p>
                            )}
                        </div>
                    )}

                    {result && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>{result.passed ? "Passed" : "Not passed yet"}: {Math.round(result.score * 100)}% <small className="muted">in {fmt(result.seconds)}{result.overTime ? " (over time)" : ""}</small></h2>
                            <ol>{result.steps.map((s, i) => (
                                <li key={i} style={{ marginBottom: 8 }}>
                                    <strong>{s.prompt}</strong><br />
                                    <span className={`badge ${s.correct ? "badge-ok" : "badge-bad"}`}>{s.correct ? "Right" : "Not right"}</span> {s.chosen}<br /><small>{s.feedback}</small>
                                    {!s.correct && <><br /><small><strong>Better:</strong> {s.rightAnswer}. {s.rightFeedback}</small></>}
                                    {s.ref && <><br /><small className="muted">See the procedure library: {s.ref}</small></>}
                                </li>
                            ))}</ol>
                            <button className="btn btn-quiet" onClick={() => { setRun(null); setResult(null); }}>Choose another scenario</button>
                        </div>
                    )}

                    {!run && list && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>Scenarios for your role ({list.items.length})</h2>
                            <ul className="rows">{list.items.map((sc) => (
                                <li key={sc.id} style={{ padding: "8px 0" }}>
                                    <strong>{sc.title}</strong> <small className="muted">{sc.steps.length} step(s), {sc.minutes} min</small>
                                    {sc.best?.passedAt ? <> <span className="badge badge-ok">Passed</span></> : sc.best ? <> <span className="badge badge-warn">Best {Math.round(sc.best.bestScore * 100)}%</span></> : null}{" "}
                                    <button className="btn btn-quiet btn-small" onClick={() => start(sc.id)}>Start</button>
                                </li>
                            ))}</ul>
                        </div>
                    )}

                    {report && !run && (
                        <div className="panel">
                            <h2 style={{ marginTop: 0 }}>Your performance</h2>
                            <p>{report.passed} of {report.total} scenarios passed; average best score {Math.round(report.averageBest * 100)}%.</p>
                            {report.certificate && (
                                <div className="alert alert-ok">
                                    <strong>Completion certificate {report.certificate.id}</strong><br />
                                    {report.certificate.name}, {report.certificate.role.replace(/_/g, " ")}: all {report.certificate.scenarios} scenarios passed, {new Date(report.certificate.issuedAt).toLocaleDateString()}.<br />
                                    <small>{report.certificate.note}</small>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>
        </>
    );
}
