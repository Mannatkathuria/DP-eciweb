import { useState } from "react";
import PageHead from "../components/PageHead";
import Tabs from "../components/Tabs";

const PUBLICATIONS = [
  { title: "Compendium of instructions on the conduct of elections, 2026 edition", kind: "Compendium", pages: 584, date: "October 2026", desc: "Statutory guidance on nominations, scrutiny, polling day, EVM handling and counting." },
  { title: "Manual on electronic voting machines and VVPAT, edition 6", kind: "Manual", pages: 192, date: "September 2026", desc: "Technical documentation, safeguards, first level checking checklists and mock poll protocol." },
  { title: "Handbook for returning officers, 2026", kind: "Handbook", pages: 410, date: "August 2026", desc: "Reference for returning officers running Parliamentary and Assembly elections." },
  { title: "Statistical report on the general elections to the 18th Lok Sabha", kind: "Report", pages: 920, date: "July 2026", desc: "Constituency-wise electors, votes, turnout and party performance." },
  { title: "Electoral statistics pocket book, 2026", kind: "Report", pages: 168, date: "June 2026", desc: "National elector demographics, gender ratios, polling stations and turnout." },
  { title: "Model Code of Conduct for the guidance of parties and candidates", kind: "Compendium", pages: 76, date: "May 2026", desc: "Rules on meetings, processions, polling day conduct and restrictions on the ruling party." }
];

const FAQS = [
  { q: "Can a voting machine be hacked over Wi-Fi or Bluetooth?", a: "No. The machines are standalone and battery powered, with no radio, internet, Wi-Fi or Bluetooth hardware, so there is no wireless way in." },
  { q: "Why can the machine's program not be changed?", a: "The microcontrollers use one-time programmable memory made by public sector undertakings. Once the program is written at manufacture it cannot be read back, overwritten or altered." },
  { q: "How does the paper slip check work?", a: "After a voter presses a button, the VVPAT prints a slip with the candidate's serial number, name and symbol. It is visible through a sealed window for seven seconds, then drops into a locked box." },
  { q: "How do we know which machine goes to which booth?", a: "Machines are randomised twice by computer in front of party representatives: first to constituencies, then to individual polling stations just before polling day." },
  { q: "What is the mock poll?", a: "Ninety minutes before polling opens, the presiding officer casts at least 50 votes in front of polling agents, tallies the slips, clears the machine and seals it with signed seals." }
];

const AWARENESS = [
  ["Assistance at the polling station", "Dedicated polling assistance, wheelchair help and ballot papers in Braille."],
  ["Home voting", "Electors aged 85 and above and persons with disabilities can use home voting."],
  ["Young voters", "Voter awareness work in educational institutions, so first-time voters know how to enrol and vote."],
  ["Voter helpline 1950", "Toll-free in every State and Union Territory, all day."]
];

export default function Media() {
  const [tab, setTab] = useState("pubs");
  const [open, setOpen] = useState(0);
  return (
    <>
      <PageHead title="Awareness and media" crumbs={[{ label: "Information" }, { label: "Awareness and media" }]}
        lede="Publications, straight answers about voting machines, and what the Commission does so that every eligible voter can take part." />
      <section className="section">
        <div className="container">
          <Tabs label="Information" active={tab} onChange={setTab}
            tabs={[{ id: "pubs", label: "Publications" }, { id: "evm", label: "Voting machines" }, { id: "aware", label: "Voter education" }]} />

          {tab === "pubs" && (
            <ul className="rows">{PUBLICATIONS.map((p) => (
              <li key={p.title} className="row-link" style={{ cursor: "default" }}>
                <span><strong>{p.title}</strong><small>{p.desc}</small></span>
                <span className="muted" style={{ textAlign: "right", fontSize: ".88rem" }}>{p.kind}<br />{p.pages} pages, {p.date}</span>
              </li>
            ))}</ul>
          )}

          {tab === "evm" && (
            <div style={{ maxWidth: 760 }}>{FAQS.map((f, i) => (
              <div className="disclosure" key={f.q}>
                <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>{f.q}</button>
                {open === i && <div>{f.a}</div>}
              </div>
            ))}</div>
          )}

          {tab === "aware" && (
            <dl className="facts" style={{ maxWidth: 820 }}>{AWARENESS.map(([t, d]) => <div key={t} style={{ display: "contents" }}><dt style={{ fontWeight: 600, color: "var(--text)" }}>{t}</dt><dd style={{ fontWeight: 400 }}>{d}</dd></div>)}</dl>
          )}
        </div>
      </section>
    </>
  );
}
