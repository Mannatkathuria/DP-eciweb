import { useState } from "react";
import { Link } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import "./MediaPublicationsPortal.css";

const publications = [
  {
    title: "Compendium of Instructions — Conduct of Elections (2026 Edition)",
    category: "Compendiums",
    pages: "584 Pages",
    date: "October 2026",
    desc: "Complete statutory guidance covering nominations, scrutiny, polling day arrangements, EVM handling, and counting of votes."
  },
  {
    title: "Manual on Electronic Voting Machine (EVM) and VVPAT — Edition 6",
    category: "EVM Manuals",
    pages: "192 Pages",
    date: "September 2026",
    desc: "Detailed technical documentation, administrative safeguards, First Level Checking (FLC) checklists, and mock poll protocols."
  },
  {
    title: "Handbook for Returning Officers (RO) 2026",
    category: "Handbooks",
    pages: "410 Pages",
    date: "August 2026",
    desc: "Comprehensive reference manual for Returning Officers conducting Parliamentary and Legislative Assembly elections."
  },
  {
    title: "Statistical Report on General Elections to 18th Lok Sabha",
    category: "Statistical Reports",
    pages: "920 Pages",
    date: "July 2026",
    desc: "Constituency-wise elector counts, candidate vote tallies, turnout percentages, party performance, and historical comparisons."
  },
  {
    title: "Electoral Statistics Pocket Book — 2026",
    category: "Statistical Reports",
    pages: "168 Pages",
    date: "June 2026",
    desc: "Compact statistical pocket book summarizing national elector demographics, gender ratios, polling stations, and turnout curves."
  },
  {
    title: "Model Code of Conduct (MCC) for the Guidance of Political Parties and Candidates",
    category: "Compendiums",
    pages: "76 Pages",
    date: "May 2026",
    desc: "Essential guidelines governing general conduct, meetings, processions, polling day behavior, and ruling party restrictions."
  }
];

const evmFaqs = [
  {
    q: "Can an EVM or VVPAT unit be hacked or controlled remotely via Wi-Fi or Bluetooth?",
    a: "No. ECI-EVMs are standalone, battery-powered machines. They have no radio frequency (RF) hardware, no internet receiver, no Wi-Fi, and no Bluetooth chips. There is physically no wireless communication interface."
  },
  {
    q: "What is an OTP chip and why cannot EVM code be overwritten?",
    a: "The microcontrollers used in ECI EVMs use One-Time Programmable (OTP) masked memory chips manufactured by public sector undertakings (BEL & ECIL). Once code is burned during fabrication, it cannot be read, overwritten, or altered."
  },
  {
    q: "How does the VVPAT paper slip audit verify the vote?",
    a: "When a voter presses a button on the Ballot Unit, the VVPAT prints a paper slip displaying the candidate's serial number, name, and election symbol. The voter can see the slip through a transparent sealed window for 7 seconds before it automatically cuts and drops into the locked drop box."
  },
  {
    q: "How are EVMs randomized so nobody knows which machine goes to which booth?",
    a: "EVMs undergo two-stage computerized randomization in presence of political party representatives. Stage 1 randomizes machines to Assembly Constituencies; Stage 2 randomizes them to specific Polling Stations just before poll day."
  },
  {
    q: "What is the mandatory 100% Mock Poll protocol?",
    a: "On poll day at 05:30 AM (90 minutes before poll opens), the Presiding Officer conducts a mock poll of at least 50 votes in presence of political polling agents, prints VVPAT slips, tallies totals, clears the machine to zero, and secures it with paper seals signed by the agents."
  }
];

export default function MediaPublicationsPortal() {
  const [activeTab, setActiveTab] = useState("pubs"); // pubs | evm | sveep
  const [expandedFaq, setExpandedFaq] = useState(0);

  return (
    <div className="gov-page-root">
      <GovHeader />

      {/* Breadcrumb */}
      <div className="gov-breadcrumb-strip">
        <div className="gov-breadcrumb-container">
          <Link to="/">Home</Link> &gt; <span>Media, Publications, EVM/VVPAT & SVEEP Center</span>
        </div>
      </div>

      <main id="main-content" className="gov-media-main">
        {/* Hero */}
        <section className="gov-media-hero" aria-label="Publications and Education">
          <div className="gov-media-container">
            <span className="gov-media-badge">PUBLICATIONS & ELECTORAL KNOWLEDGE</span>
            <h1 className="gov-media-title">Media, Publications & EVM Center</h1>
            <p className="gov-media-desc">
              Authoritative statutory publications, handbooks for election functionaries, statistical compendiums, EVM/VVPAT transparency manuals, and SVEEP voter awareness initiatives.
            </p>
          </div>
        </section>

        {/* Tab Switcher */}
        <section className="gov-media-tabs-bar">
          <div className="gov-media-tabs-container">
            <button
              className={`gov-m-tab ${activeTab === "pubs" ? "active" : ""}`}
              onClick={() => setActiveTab("pubs")}
            >
              📚 Handbooks & Compendiums
            </button>
            <button
              className={`gov-m-tab ${activeTab === "evm" ? "active" : ""}`}
              onClick={() => setActiveTab("evm")}
            >
              🗳️ EVM & VVPAT Trust Center & FAQs
            </button>
            <button
              className={`gov-m-tab ${activeTab === "sveep" ? "active" : ""}`}
              onClick={() => setActiveTab("sveep")}
            >
              🇮🇳 SVEEP: Voter Awareness & Oaths
            </button>
          </div>
        </section>

        <div className="gov-media-body-container">
          {/* TAB 1: PUBLICATIONS */}
          {activeTab === "pubs" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>Official Publications, Handbooks & Statistics</h2>
                <p>Download official handbooks, instructions, and statistical compendiums published by Nirvachan Sadan.</p>
              </div>

              <div className="gov-pubs-grid">
                {publications.map((pub, i) => (
                  <div key={i} className="gov-pub-card">
                    <div className="pub-card-top">
                      <span className="pub-cat-tag">{pub.category}</span>
                      <span className="pub-date">{pub.date}</span>
                    </div>
                    <h3 className="pub-title">{pub.title}</h3>
                    <p className="pub-desc">{pub.desc}</p>
                    <div className="pub-card-footer">
                      <span className="pub-pages">📄 {pub.pages}</span>
                      <button
                        type="button"
                        className="gov-download-btn-sm"
                        onClick={() => alert(`Downloading "${pub.title}" Official PDF...`)}
                      >
                        📥 Download PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: EVM & VVPAT */}
          {activeTab === "evm" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>EVM & VVPAT Transparency, Technical Safeguards & FAQs</h2>
                <p>Comprehensive answers regarding Electronic Voting Machines and Voter Verifiable Paper Audit Trail units.</p>
              </div>

              <div className="gov-evm-faq-list">
                {evmFaqs.map((faq, i) => (
                  <div key={i} className="gov-faq-item">
                    <button
                      type="button"
                      className="gov-faq-question"
                      onClick={() => setExpandedFaq(expandedFaq === i ? -1 : i)}
                      aria-expanded={expandedFaq === i}
                    >
                      <span>Q{i + 1}. {faq.q}</span>
                      <span className="faq-toggle">{expandedFaq === i ? "▲" : "▼"}</span>
                    </button>
                    {expandedFaq === i && (
                      <div className="gov-faq-answer">
                        <p>{faq.a}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="gov-flc-checklist-box mt-28">
                <h3>10-Step EVM Security Lifecycle Architecture</h3>
                <div className="gov-flc-steps-grid">
                  <div className="flc-step"><strong>1. Factory Burning</strong><span>OTP microcontrollers burned at BEL / ECIL</span></div>
                  <div className="flc-step"><strong>2. First Level Check</strong><span>100% FLC in presence of recognized political parties</span></div>
                  <div className="flc-step"><strong>3. Strong Room 1</strong><span>Double-locked security with 24x7 CCTV coverage</span></div>
                  <div className="flc-step"><strong>4. 1st Randomization</strong><span>Software allocates EVMs randomly to Constituencies</span></div>
                  <div className="flc-step"><strong>5. Candidate Setting</strong><span>Ballot papers fixed in presence of contesting candidates</span></div>
                  <div className="flc-step"><strong>6. 2nd Randomization</strong><span>Randomized allocation to specific Polling Stations</span></div>
                  <div className="flc-step"><strong>7. Mock Poll Protocol</strong><span>50+ votes cast with agents; paper slips checked</span></div>
                  <div className="flc-step"><strong>8. Poll Day Voting</strong><span>Pink paper seals signed by political polling agents</span></div>
                  <div className="flc-step"><strong>9. Strong Room 2</strong><span>Guarded by Central Armed Police Forces (CAPF)</span></div>
                  <div className="flc-step"><strong>10. Counting Day</strong><span>CU round tabulation + mandatory 5 VVPAT slip counts</span></div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SVEEP */}
          {activeTab === "sveep" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>SVEEP: Systematic Voters' Education and Electoral Participation</h2>
                <p>The flagship program of the Election Commission of India for voter education, electoral literacy, and ethical voting.</p>
              </div>

              {/* National Voters' Pledge */}
              <div className="gov-voter-pledge-card">
                <span className="pledge-tag">25TH JANUARY · NATIONAL VOTERS' DAY</span>
                <h3>National Voters' Pledge (राष्ट्रीय मतदाता प्रतिज्ञा)</h3>
                <blockquote className="gov-pledge-quote">
                  "We, the citizens of India, having abiding faith in democracy, hereby pledge to uphold the democratic traditions of our country and the dignity of free, fair and peaceful elections, and to vote in every election fearlessly and without being influenced by considerations of religion, race, caste, community, language or any inducement."
                </blockquote>
              </div>

              {/* Pillars of SVEEP */}
              <div className="gov-sveep-pillars-grid mt-24">
                <div className="sveep-card">
                  <span className="sveep-icon">♿</span>
                  <h4>Accessible Elections for PwD Electors</h4>
                  <p>Wheelchair ramps at all 10.5 lakh polling booths, braille ballot papers on EVMs, dedicated pick-and-drop assistance, and Saksham App registration.</p>
                </div>
                <div className="sveep-card">
                  <span className="sveep-icon">🏡</span>
                  <h4>Home Voting for 85+ Senior Citizens</h4>
                  <p>Optional postal ballot voting at home for electors aged 85+ and 40%+ benchmark disability citizens, conducted with videography and candidate presence.</p>
                </div>
                <div className="sveep-card">
                  <span className="sveep-icon">🎓</span>
                  <h4>Electoral Literacy Clubs (ELCs)</h4>
                  <p>Empowering young minds through experiential voting activities in high schools, colleges, and rural youth centers nationwide.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <GovFooter />
    </div>
  );
}
