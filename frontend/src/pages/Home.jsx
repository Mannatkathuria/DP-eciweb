import { useState } from "react";
import { Link } from "react-router-dom";
import Tabs from "../components/Tabs";

const PICKS = [
  { to: "/voters", title: "I am a voter", desc: "Find the right form, check your name in the roll, and follow an application." },
  { to: "/candidates", title: "I am a candidate, agent or party", desc: "Nominations, campaign permissions and candidate details." },
  { to: "/signin", title: "I am an election official", desc: "Roll officers, returning officers, polling and counting teams, district, state and national offices." },
  { to: "/signin?group=observer", title: "I am an observer", desc: "General, police, expenditure, counting and micro observers." },
  { to: "/results", title: "I want to follow the results", desc: "Turnout through the day and round-by-round counting." }
];

const NOTICES = {
  notices: [
    { date: "31 Oct 2026", isNew: true, title: "Schedule for the special summary revision of electoral rolls in all States and Union Territories, with 1 January 2026 as the qualifying date" },
    { date: "28 Oct 2026", isNew: true, title: "Model Code of Conduct instructions for Parliamentary and Assembly bye-elections" },
    { date: "24 Oct 2026", title: "Advisory to recognised political parties on ethical campaigning standards" },
    { date: "19 Oct 2026", title: "Single-window campaign clearances and digital deposits now available to candidates" }
  ],
  press: [
    { date: "30 Oct 2026", isNew: true, title: "First level checking of all EVMs and VVPATs completed in the presence of political party representatives" },
    { date: "25 Oct 2026", title: "Voter helpline 1950 resolved over 4.5 lakh inquiries during the special revision fortnight" },
    { date: "21 Oct 2026", title: "Violation reports resolved in 84 minutes on average across 12,400 citizen submissions" },
    { date: "15 Oct 2026", title: "Delegation from 24 election management bodies visits IIIDEM for a capacity-building programme" }
  ],
  instructions: [
    { date: "29 Oct 2026", isNew: true, title: "Compendium of instructions on EVM and VVPAT, 2026 edition" },
    { date: "22 Oct 2026", title: "Standard procedure for flying squads and static surveillance teams" },
    { date: "18 Oct 2026", title: "Guidelines for counting of votes and round-wise tabulation in Parliamentary constituencies" }
  ],
  tenders: [
    { date: "31 Oct 2026", isNew: true, title: "Notice inviting tender for indelible ink markers for the 2026-27 elections" },
    { date: "26 Oct 2026", title: "Engagement of young professionals and technical consultants at the Commission's headquarters" },
    { date: "14 Oct 2026", title: "Request for proposals: cloud disaster recovery for the national electoral roll database" }
  ],
  stories: [
    { date: "20 Oct 2026", title: "How booth level officers in the Andaman and Nicobar Islands reach every household by boat" },
    { date: "12 Oct 2026", title: "First-time transgender voters on getting their voter ID cards" },
    { date: "5 Oct 2026", title: "Home voting for electors aged 85 and above: a district's first season" }
  ],
  court: [
    { date: "Oct 2026", title: "Supreme Court judgment on VVPAT slip verification and the purity of the electoral roll" },
    { date: "Sep 2026", title: "High Court directions on public disclosure of criminal antecedents by contesting candidates" }
  ]
};

const TABS = [
  { id: "notices", label: "Notices" }, { id: "press", label: "Press releases" }, { id: "instructions", label: "Instructions" },
  { id: "tenders", label: "Tenders and vacancies" }, { id: "stories", label: "Stories" }, { id: "court", label: "Court orders" }
];

export default function Home() {
  const [tab, setTab] = useState("notices");

  return (
    <>
      <section className="hero" aria-labelledby="home-title">
        <div className="container split">
          <div>
            <h1 id="home-title">Everyone in an election has a place here</h1>
            <p className="lede">Voters check the roll and apply to register. Officers sign in to the work assigned to their role. Everyone else can read notices, follow results and find their state election office.</p>
            <div className="helpline-note">
              <strong>1950</strong>
              <span>Voter helpline. Toll-free in every State and Union Territory, all day.</span>
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: "1.1rem" }}>Who are you?</h2>
            <div className="picks">
              {PICKS.map((p) => (
                <Link key={p.to} to={p.to} className="pick">
                  <span className="mark" aria-hidden="true" />
                  <span><strong>{p.title}</strong><span className="desc">{p.desc}</span></span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="notices-title">
        <div className="container">
          <h2 id="notices-title">From the Commission</h2>
          <Tabs tabs={TABS} active={tab} onChange={setTab} label="Commission publications" />
          <ul className="news-list">
            {NOTICES[tab].map((n) => (
              <li key={n.title}>
                <time>{n.date}</time>
                <span>{n.title}{n.isNew && <span className="tag-new">New</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
