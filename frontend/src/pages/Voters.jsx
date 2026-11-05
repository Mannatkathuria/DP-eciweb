import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "../api/axios";
import PageHead from "../components/PageHead";
import { apiMessage } from "../config/elections";

// Voter Mitra: ask in your own words (English, Hindi or Hinglish) or pick a service. The answer
// comes from the Commission's service catalogue, never invented: what it is, the steps, the form,
// the documents, and where to start. It can be read aloud and shown in simpler words.

const VOICE = { en: "en-IN", hi: "hi-IN", pa: "pa-IN", te: "te-IN", ta: "ta-IN", kn: "kn-IN" };
const EXAMPLES = ["I turned 18, how do I get my name on the roll?", "My father passed away", "I moved to another city", "I lost my voter card", "मेरा नाम गलत छपा है"];

export default function Voters() {
  const { i18n } = useTranslation();
  const [catalogue, setCatalogue] = useState({ groups: [], services: [] });
  const [group, setGroup] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null); // { answer, related, faqs, fallback }
  const [simple, setSimple] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answerRef = useRef(null);

  useEffect(() => {
    api.get("/assist/services").then((r) => setCatalogue(r.data.data)).catch(() => setError("The list of services could not be loaded. You can still ask a question."));
    return () => window.speechSynthesis?.cancel();
  }, []);

  const show = (data) => { window.speechSynthesis?.cancel(); setSpeaking(false); setResult(data); setTimeout(() => answerRef.current?.focus(), 0); };
  const ask = async (q) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text); setBusy(true); setError("");
    try { show((await api.post("/assist/ask", { question: text })).data.data); }
    catch (e) { setError(apiMessage(e, "Voter Mitra could not answer just now. Call 1950 for help.")); }
    finally { setBusy(false); }
  };
  const open = (id) => {
    const s = catalogue.services.find((x) => x.id === id);
    if (s) show({ answer: s, related: [], faqs: [] }); else ask(id);
  };

  const a = result?.answer;
  const speak = () => {
    const synth = window.speechSynthesis;
    if (!synth || !a) return;
    if (speaking) { synth.cancel(); setSpeaking(false); return; }
    const text = [a.title, simple ? a.simple : a.summary, ...(a.steps ?? []).map((s, i) => `Step ${i + 1}. ${s}`), a.documents?.length ? `Documents: ${a.documents.join(". ")}` : ""].join(". ");
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE[i18n.resolvedLanguage] ?? "en-IN";
    u.onend = () => setSpeaking(false);
    synth.cancel(); synth.speak(u); setSpeaking(true);
  };

  const shown = catalogue.services.filter((s) => !group || s.group === group);

  return (
    <>
      <PageHead title="Voter Mitra" crumbs={[{ label: "Voters" }, { label: "Voter Mitra" }]}
        lede="Tell us what you need in your own words, or pick a service. We will tell you which form to use, what to keep ready and where to start." />
      <section className="section">
        <div className="container split">
          <div className="stack">
            <form className="panel" onSubmit={(e) => { e.preventDefault(); ask(); }}>
              <div className="field">
                <label htmlFor="mitra-q">What do you need help with?</label>
                <input id="mitra-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="For example: I moved to another city" autoComplete="off" />
              </div>
              <div className="cluster">
                <button className="btn btn-primary" disabled={busy || !question.trim()}>{busy ? "Finding…" : "Ask"}</button>
                <span className="muted" style={{ fontSize: ".9rem" }}>English, हिन्दी or Hinglish</span>
              </div>
              {!result && (
                <div className="pill-cloud" style={{ marginTop: 14 }}>
                  {EXAMPLES.map((x) => <button key={x} type="button" className="chip" onClick={() => ask(x)}>{x}</button>)}
                </div>
              )}
            </form>

            {error && <div className="alert alert-error" role="alert">{error}</div>}

            {result && (
              <article className="panel" ref={answerRef} tabIndex={-1} aria-live="polite" style={{ outline: "none" }}>
                {a ? (
                  <>
                    <p className="eyebrow" style={{ margin: 0 }}>{a.form || a.group}</p>
                    <h2 style={{ marginTop: 4 }}>{a.title}</h2>
                    <p>{simple ? a.simple : a.summary}</p>
                    {a.steps?.length > 0 && (<><h3>What to do</h3><ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>{a.steps.map((s) => <li key={s}>{s}</li>)}</ol></>)}
                    {a.documents?.length > 0 && (<><h3>Keep ready</h3><ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>{a.documents.map((d) => <li key={d}>{d}</li>)}</ul></>)}
                    <div className="cluster" style={{ marginTop: 16 }}>
                      {a.action && <Link className="btn btn-primary" to={a.action.to}>{a.action.label}</Link>}
                      {a.also && <Link className="btn btn-secondary" to={a.also.to}>{a.also.label}</Link>}
                      {a.track && <Link className="btn btn-quiet" to="/check-request">Track an application</Link>}
                    </div>
                    <div className="cluster" style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                      <button type="button" className="chip" aria-pressed={simple} onClick={() => setSimple(!simple)}>Simpler words</button>
                      {"speechSynthesis" in window && <button type="button" className="chip" aria-pressed={speaking} onClick={speak}>{speaking ? "Stop reading" : "Read aloud"}</button>}
                      {a.library && <Link to={`/library/${a.library}`}>Read more</Link>}
                    </div>
                    {a.source && <p className="muted" style={{ fontSize: ".85rem", marginTop: 12 }}>Based on: {a.source}. The official forms and guidelines are authoritative.</p>}
                  </>
                ) : (
                  <>
                    <h2 style={{ marginTop: 0 }}>We could not match that to a service</h2>
                    <p>{result.fallback}</p>
                    <p className="muted">Try different words, or pick a service from the list.</p>
                  </>
                )}
                {result.related?.length > 0 && (
                  <p style={{ marginBottom: 0 }}><span className="muted">Did you mean: </span>
                    {result.related.map((r, i) => <span key={r.id}>{i > 0 && " · "}<button type="button" className="link-button" onClick={() => open(r.id)}>{r.title}</button></span>)}
                  </p>
                )}
                {result.faqs?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h3>From the library</h3>
                    <ul className="rows">{result.faqs.map((f) => <li key={f.slug}><Link className="row-link" to={`/library/${f.slug}`}><span><strong>{f.question}</strong></span><span className="go">Open</span></Link></li>)}</ul>
                  </div>
                )}
              </article>
            )}
          </div>

          <aside className="stack">
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>All services</h2>
              <div className="pill-cloud" style={{ marginBottom: 12 }}>
                <button type="button" className="chip" aria-pressed={!group} onClick={() => setGroup("")}>All</button>
                {catalogue.groups.map((g) => <button key={g} type="button" className="chip" aria-pressed={group === g} onClick={() => setGroup(g)}>{g}</button>)}
              </div>
              <ul className="rows">
                {shown.map((s) => (
                  <li key={s.id}><button type="button" className="row-link" style={{ width: "100%", background: "none", border: 0, textAlign: "left", font: "inherit" }} aria-current={a?.id === s.id ? "true" : undefined} onClick={() => open(s.id)}>
                    <span><strong>{s.title}</strong>{s.form && <small>{s.form}</small>}</span><span className="go">›</span>
                  </button></li>
                ))}
              </ul>
            </div>
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Need a person?</h2>
              <p style={{ marginBottom: 0 }}>Call <a href="tel:1950"><strong>1950</strong></a>, the voter helpline, or ask your booth level officer.</p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
