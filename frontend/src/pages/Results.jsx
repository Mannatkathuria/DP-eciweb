import { useState } from "react";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";

const TURNOUT = [
  { slot: "9:00 am", all: 12.8, male: 14.2, female: 11.3 },
  { slot: "11:00 am", all: 28.4, male: 30.1, female: 26.5 },
  { slot: "1:00 pm", all: 45.1, male: 46.8, female: 43.2 },
  { slot: "3:00 pm", all: 59.3, male: 60.5, female: 58.0 },
  { slot: "5:00 pm", all: 68.7, male: 69.4, female: 67.9 },
  { slot: "7:00 pm (final)", all: 74.2, male: 75.1, female: 73.2 }
];

const CANDIDATES = [
  { id: 1, name: "Candidate A", party: "Party One", status: "Accepted", rounds: [4210, 5120, 4890, 5340, 6100, 5800, 6420], postal: 850 },
  { id: 2, name: "Candidate B", party: "Party Two", status: "Accepted", rounds: [3890, 4610, 4720, 5010, 5450, 5600, 6010], postal: 720 },
  { id: 3, name: "Candidate C", party: "Party Three", status: "Accepted", rounds: [1200, 1450, 1380, 1600, 1750, 1890, 2040], postal: 240 },
  { id: 4, name: "Candidate D", party: "Independent", status: "Withdrawn", rounds: [0, 0, 0, 0, 0, 0, 0], postal: 0 }
];

const nf = new Intl.NumberFormat("en-IN");

export default function Results() {
  const [tab, setTab] = useState("turnout");
  const [round, setRound] = useState(7);
  const [slip, setSlip] = useState(false);

  const standings = CANDIDATES.map((c) => {
    const evm = c.rounds.slice(0, round).reduce((a, b) => a + b, 0);
    return { ...c, evm, total: evm + c.postal };
  }).sort((a, b) => b.total - a.total);
  const cast = standings.reduce((a, c) => a + c.total, 0);
  const margin = standings[0].total - standings[1].total;

  return (
    <>
      <PageHead title="Results and counting" crumbs={[{ label: "Elections" }, { label: "Results and counting" }]}
        lede="Turnout through polling day, candidate scrutiny, and counting round by round." />
      <section className="section">
        <div className="container">
          <Tabs label="Results" active={tab} onChange={setTab}
            tabs={[{ id: "turnout", label: "Turnout" }, { id: "counting", label: "Counting" }, { id: "scrutiny", label: "Scrutiny" }]} />

          {tab === "turnout" && (
            <div className="stack" style={{ maxWidth: 760 }}>
              <h2>Cumulative turnout by time of day</h2>
              {TURNOUT.map((t) => (
                <div className="bar-row" key={t.slot}>
                  <span>{t.slot}</span>
                  <span className="bar-track" role="img" aria-label={`${t.all} per cent`}><span className="bar-fill" style={{ width: `${t.all}%` }} /></span>
                  <span className="figure">{t.all}%</span>
                </div>
              ))}
              <div className="table-wrap"><table>
                <thead><tr><th>Time</th><th className="num">All</th><th className="num">Men</th><th className="num">Women</th></tr></thead>
                <tbody>{TURNOUT.map((t) => <tr key={t.slot}><td>{t.slot}</td><td className="num">{t.all}%</td><td className="num">{t.male}%</td><td className="num">{t.female}%</td></tr>)}</tbody>
              </table></div>
            </div>
          )}

          {tab === "counting" && (
            <div className="stack">
              <div className="field" style={{ maxWidth: 320 }}>
                <label htmlFor="round">Counted through round {round} of 7</label>
                <input id="round" type="range" min="1" max="7" value={round} onChange={(e) => setRound(Number(e.target.value))} />
              </div>
              <p><strong>{standings[0].name}</strong> leads {standings[1].name} by <span className="figure">{nf.format(margin)}</span> votes after {round} {round === 1 ? "round" : "rounds"}, with <span className="figure">{nf.format(cast)}</span> votes counted.</p>
              <div className="table-wrap"><table>
                <thead><tr><th>Candidate</th><th>Party</th><th className="num">Machine votes</th><th className="num">Postal</th><th className="num">Total</th></tr></thead>
                <tbody>{standings.map((c) => (
                  <tr key={c.id}><td>{c.name}{c.status === "Withdrawn" && <span className="badge" style={{ marginLeft: 8 }}>Withdrawn</span>}</td><td>{c.party}</td>
                    <td className="num">{nf.format(c.evm)}</td><td className="num">{nf.format(c.postal)}</td><td className="num"><strong>{nf.format(c.total)}</strong></td></tr>
                ))}</tbody>
              </table></div>
            </div>
          )}

          {tab === "scrutiny" && (
            <div className="stack" style={{ maxWidth: 760 }}>
              <h2>Candidates after scrutiny</h2>
              <div className="table-wrap"><table>
                <thead><tr><th>Serial</th><th>Candidate</th><th>Party</th><th>Status</th></tr></thead>
                <tbody>{CANDIDATES.map((c) => (
                  <tr key={c.id}><td className="figure">{c.id}</td><td>{c.name}</td><td>{c.party}</td>
                    <td><span className={`badge ${c.status === "Accepted" ? "badge-ok" : "badge-warn"}`}>{c.status}</span></td></tr>
                ))}</tbody>
              </table></div>
              {slip
                ? <div className="alert alert-ok" role="status"><strong>List of contesting candidates prepared.</strong>Three candidates will appear on the ballot.</div>
                : <button type="button" className="btn btn-primary" onClick={() => setSlip(true)}>Prepare the list of contesting candidates</button>}
            </div>
          )}
          <p className="muted" style={{ marginTop: 20 }}>Sample data for demonstration. Live figures appear here once counting is connected.</p>
        </div>
      </section>
    </>
  );
}
