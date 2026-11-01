import { useState } from "react";
import { Link } from "react-router-dom";
import PageHead from "../components/PageHead";

// A decision aid: choose your situation, get the one form and the next step.
const SITUATIONS = [
  { id: "new", label: "I am registering for the first time", form: "Form 6", what: "Application for inclusion of your name in the electoral roll. You need proof of age and proof of address.", action: { to: "/register", label: "Start Form 6" } },
  { id: "overseas", label: "I am an Indian citizen living abroad", form: "Form 6A", what: "Registration for overseas electors, using your Indian passport details." },
  { id: "delete", label: "I want to object to or remove an entry", form: "Form 7", what: "An objection to an entry in the roll, or a request to delete one." },
  { id: "correct", label: "I moved, or need to correct my details", form: "Form 8", what: "Shifting your residence, correcting your entry, replacing a card, or marking yourself as a person with disability.", note: "Sign in as a voter, then submit the change from your dashboard so a booth level officer can review it." },
  { id: "aadhaar", label: "I want to link my Aadhaar number", form: "Form 6B", what: "Voluntary intimation of your Aadhaar number, used to authenticate your entry." },
  { id: "service", label: "I am in the armed forces or a service voter", form: "Forms 2, 2A and 3", what: "Enrolment of service voters, such as the armed forces, ITBP and State armed police." },
  { id: "find", label: "I want to know whether I am on the roll", form: "No form needed", what: "Search by EPIC number or by your details.", action: { to: "/electoral-roll", label: "Search the roll" } }
];

export default function Voters() {
  const [id, setId] = useState("");
  const pick = SITUATIONS.find((s) => s.id === id);
  return (
    <>
      <PageHead title="Forms and services" crumbs={[{ label: "Voters" }]}
        lede="Tell us your situation and we will point you to the right form. The same services and forms apply in every State and Union Territory." />
      <section className="section">
        <div className="container split">
          <div className="panel">
            <div className="field">
              <label htmlFor="situation">What is your situation?</label>
              <select id="situation" value={id} onChange={(e) => setId(e.target.value)}>
                <option value="">Choose one</option>
                {SITUATIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div aria-live="polite" style={{ marginTop: 20 }}>
              {pick ? (
                <>
                  <h2>{pick.form}</h2>
                  <p>{pick.what}</p>
                  {pick.note && <div className="alert">{pick.note}</div>}
                  {pick.action && <Link className="btn btn-primary" to={pick.action.to}>{pick.action.label}</Link>}
                </>
              ) : <p className="muted">Your answer will appear here.</p>}
            </div>
          </div>
          <aside className="stack">
            <div className="panel">
              <h2>Before you start</h2>
              <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                <li>You must be 18 on the qualifying date, 1 January 2026.</li>
                <li>Keep proof of age and proof of address ready.</li>
                <li>Every application is reviewed by a booth level officer. You will get a reference ID to follow it.</li>
              </ul>
            </div>
            <div className="panel">
              <h2>Need a person?</h2>
              <p>Call <a href="tel:1950"><strong>1950</strong></a>, the voter helpline, or ask your booth level officer.</p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
