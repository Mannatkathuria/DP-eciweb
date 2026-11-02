import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";
import useGeography from "../hooks/useGeography";
import { STAGE_LABEL, apiMessage } from "../config/elections";

// Results and counting, read-only. Figures come only from a registered result source: an
// authorised feed, or a mock that is labelled as such on every view. The Returning Officer's
// declaration is the official result; this page never decides one.

const nf = new Intl.NumberFormat("en-IN");
const PUBLICATION = { not_started: "Counting not started", in_progress: "Counting in progress", completed: "Counting completed", declared: "Result declared by the Returning Officer" };

export default function Results() {
  const { constituenciesOf } = useGeography();
  const [tab, setTab] = useState("counting");
  const [elections, setElections] = useState([]);
  const [sel, setSel] = useState({ electionId: "", state: "", constituency: "" });
  const [results, setResults] = useState(null);
  const [turnout, setTurnout] = useState(null);
  const [round, setRound] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/public/elections").then(({ data }) => {
      const items = data.data.items;
      setElections(items);
      const first = items.find((e) => ["completed", "counting_day"].includes(e.stage)) ?? items[0];
      if (first) setSel({ electionId: first._id, state: first.states[0], constituency: first.states[0] === "Punjab" ? "Ludhiana South" : "" });
    }).catch(() => setError("Could not load elections."));
  }, []);

  const load = useCallback(async () => {
    if (!sel.electionId || !sel.constituency) return;
    setError("");
    try {
      const [r, t] = await Promise.all([api.get("/public/results", { params: sel }), api.get("/public/turnout", { params: sel })]);
      setResults(r.data.data); setTurnout(t.data.data);
      setRound(r.data.data.rounds?.length ?? 0);
    } catch (err) { setError(apiMessage(err, "Could not load results.")); }
  }, [sel]);
  useEffect(() => { load(); }, [load]);

  const election = elections.find((e) => e._id === sel.electionId);
  const atRound = results?.available && round > 0 ? results.progression[round - 1]?.cumulative : null;
  const standingsAtRound = results?.available
    ? results.standings.map((c) => ({ ...c, shown: round === results.rounds.length ? c.total : (atRound?.[c.serial] ?? c.postal) })).sort((a, b) => b.shown - a.shown)
    : [];

  return (
    <>
      <PageHead title="Results and counting" crumbs={[{ label: "Elections" }, { label: "Results and counting" }]}
        lede="Turnout and counting round by round, shown exactly as received from the registered result source. Only the Returning Officer's declaration is the official result." />
      <section className="section">
        <div className="container stack">
          <form className="panel portal-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
            <div className="form-row" style={{ flexWrap: "wrap" }}>
              <div className="field"><label htmlFor="r-el">Election</label>
                <select id="r-el" value={sel.electionId} onChange={(e) => { const el = elections.find((x) => x._id === e.target.value); setSel({ electionId: e.target.value, state: el?.states[0] ?? "", constituency: "" }); setResults(null); setTurnout(null); }}>
                  {elections.map((e) => <option key={e._id} value={e._id}>{e.name} ({STAGE_LABEL[e.stage]})</option>)}
                </select></div>
              <div className="field"><label htmlFor="r-state">State or UT</label>
                <select id="r-state" value={sel.state} onChange={(e) => setSel({ ...sel, state: e.target.value, constituency: "" })}>
                  {(election?.states ?? []).map((s) => <option key={s}>{s}</option>)}
                </select></div>
              <div className="field"><label htmlFor="r-ac">Constituency</label>
                <select id="r-ac" value={sel.constituency} onChange={(e) => setSel({ ...sel, constituency: e.target.value })} required>
                  <option value="">Choose</option>
                  {constituenciesOf(sel.state).map((c) => <option key={c}>{c}</option>)}
                </select></div>
            </div>
          </form>
          {error && <div className="alert alert-error" role="alert">{error}</div>}

          <Tabs label="Results" active={tab} onChange={setTab}
            tabs={[{ id: "counting", label: "Counting" }, { id: "turnout", label: "Turnout" }]} />

          {tab === "counting" && results && (!results.available ? (
            <p role="status">No results have been received for {results.constituency} in this election.</p>
          ) : (
            <div className="stack">
              <div className={`alert ${results.mock ? "alert-warn" : "alert-ok"}`} role="note"><strong>{results.mock ? "Mock data" : "Source"}</strong>{results.label}</div>
              <p><span className="badge badge-progress">{PUBLICATION[results.publication.status]}</span>{" "}
                {results.declaredWinner && <><strong>{results.declaredWinner.name}</strong> ({results.declaredWinner.party}) declared elected{results.publication.declaredAt ? ` on ${new Date(results.publication.declaredAt).toLocaleString()}` : ""}.</>}
                {results.leading && <><strong>{results.leading.name}</strong> leads by <span className="figure">{nf.format(results.leading.margin)}</span> votes in the figures received.</>}
              </p>
              {results.rounds.length > 0 && (
                <div className="field" style={{ maxWidth: 360 }}>
                  <label htmlFor="round">Postal ballots and {round} of {results.rounds.length} rounds</label>
                  <input id="round" type="range" min="0" max={results.rounds.length} value={round} onChange={(e) => setRound(Number(e.target.value))} />
                </div>
              )}
              <div className="table-wrap"><table>
                <thead><tr><th>No.</th><th>Candidate</th><th>Party</th><th className="num">EVM votes</th><th className="num">Postal</th><th className="num">{round === results.rounds.length ? "Total" : `After round ${round}`}</th></tr></thead>
                <tbody>
                  {standingsAtRound.map((c) => (
                    <tr key={c.serial}><td>{c.serial}</td><td>{c.name}{results.declaredWinner?.serial === c.serial && <span className="badge badge-ok" style={{ marginLeft: 8 }}>Declared elected</span>}</td><td>{c.party}</td>
                      <td className="num">{nf.format(c.evm)}</td><td className="num">{nf.format(c.postal)}</td><td className="num"><strong>{nf.format(c.shown)}</strong></td></tr>
                  ))}
                  <tr><td></td><td>None of the above (NOTA)</td><td></td><td></td><td></td><td className="num">{nf.format(results.nota)}</td></tr>
                </tbody>
              </table></div>

              <h2>Round by round</h2>
              <div className="table-wrap"><table>
                <thead><tr><th>Round</th>{results.standings.slice().sort((a, b) => a.serial - b.serial).map((c) => <th key={c.serial} className="num">{c.name}</th>)}<th className="num">NOTA</th><th>Tables</th></tr></thead>
                <tbody>{results.rounds.map((r) => (
                  <tr key={r.round}><td>{r.round}{r.correctedAt && <><br /><small className="muted">Corrected: {r.correctionReason}</small></>}</td>
                    {results.standings.slice().sort((a, b) => a.serial - b.serial).map((c) => <td key={c.serial} className="num">{nf.format(r.votes[c.serial])}</td>)}
                    <td className="num">{r.nota}</td><td><small>{r.tables ? `${r.tables.length} tables` : "–"}</small></td></tr>
                ))}</tbody>
              </table></div>

              <h2>Checks</h2>
              <p className="muted">These checks flag differences; they never change the figures received.</p>
              <ul className="rows">{results.checks.map((c) => (
                <li key={c.code} style={{ padding: "8px 0" }}><span className={`badge ${c.ok === true ? "badge-ok" : c.ok === false ? "badge-bad" : ""}`}>{c.ok === true ? "OK" : c.ok === false ? "Check" : "Note"}</span> {c.text}</li>
              ))}</ul>
              <p className="muted"><small>Source: {results.source.name} · {results.entries} entries received · candidates from the published list of contesting candidates (<Link to="/candidates">Know your candidate</Link>).</small></p>
            </div>
          ))}

          {tab === "turnout" && turnout && (
            <div className="stack" style={{ maxWidth: 860 }}>
              <p><strong className="figure">{turnout.percent}%</strong> turnout: {nf.format(turnout.voted)} of {nf.format(turnout.electors)} electors at {turnout.stations.length} polling stations.</p>
              <p className="muted">{turnout.note}</p>
              {turnout.stations.map((s) => (
                <div className="bar-row" key={s.stationCode}>
                  <span>Part {s.partNumber}</span>
                  <span className="bar-track" role="img" aria-label={`${s.percent} per cent`}><span className="bar-fill" style={{ width: `${Math.min(100, s.percent)}%` }} /></span>
                  <span className="figure">{s.percent}%</span>
                </div>
              ))}
              <div className="table-wrap"><table>
                <thead><tr><th>Part</th><th>Polling station</th><th className="num">Electors</th><th className="num">Voted</th><th className="num">Turnout</th></tr></thead>
                <tbody>{turnout.stations.map((s) => <tr key={s.stationCode}><td>{s.partNumber}</td><td>{s.name}</td><td className="num">{s.electors}</td><td className="num">{s.voted}</td><td className="num">{s.percent}%</td></tr>)}
                  {turnout.stations.length === 0 && <tr><td colSpan={5}>No approved polling stations in this constituency.</td></tr>}</tbody>
              </table></div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
