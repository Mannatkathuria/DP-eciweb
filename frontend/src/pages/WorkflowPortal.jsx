import { useState } from "react";
import { Link } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import "./WorkflowPortal.css";

const workflowsData = [
  {
    id: "voter",
    title: "1. Voter Registration & Revision Workflow",
    category: "ELECTORAL ROLL (ERONET)",
    steps: [
      { num: "01", actor: "Citizen / Elector", action: "Chooses Form 6 (New), 6A (NRI), 7 (Deletion), or 8 (Modification/Shifting)." },
      { num: "02", actor: "Citizen Portal", action: "Validates proof of identity & residence; issues unique Application Reference ID." },
      { num: "03", actor: "Booth Level Officer (BLO)", action: "Conducts door-to-door physical verification and checks part/polling booth eligibility." },
      { num: "04", actor: "Electoral Registration Officer (ERO)", action: "Reviews BLO field report, verifies objections, and records statutory decision." },
      { num: "05", actor: "National Database", action: "Upon approval, inscribes elector in the roll, generates EPIC number, and issues digital e-EPIC." }
    ]
  },
  {
    id: "nomination",
    title: "2. Candidate Nomination & Scrutiny Workflow",
    category: "CANDIDATE & ENCORE",
    steps: [
      { num: "01", actor: "Candidate / Party", action: "Signs in to Suvidha; enters profile details, party affiliation, and constituency." },
      { num: "02", actor: "Candidate", action: "Fills nomination form, uploads Form 26 Affidavit (assets & criminal antecedents), and pays deposit." },
      { num: "03", actor: "Candidate", action: "Selects preferred physical appointment slot for submitting signed hardcopy to Returning Officer." },
      { num: "04", actor: "Returning Officer (RO)", action: "Digitizes nomination in ENCORE; conducts formal statutory scrutiny in presence of agents." },
      { num: "05", actor: "Returning Officer (RO)", action: "Handles withdrawal window, allots election symbols, and publishes Form 7A list of contesting candidates." }
    ]
  },
  {
    id: "permission",
    title: "3. Campaign Permission Single-Window Workflow",
    category: "SUVIDHA & NODALS",
    steps: [
      { num: "01", actor: "Candidate / Party", action: "Files online permission request for Rally, Loudspeakers, Vehicles, or Helipad in Suvidha." },
      { num: "02", actor: "ENCORE System", action: "Generates time-stamped reference ID and places request in strict First-In-First-Out (FIFO) queue." },
      { num: "03", actor: "Departmental Nodals", action: "Police, Fire, Traffic, and Municipal Nodal Officers receive alerts on Nodal App to review venue & safety." },
      { num: "04", actor: "Returning Officer (RO)", action: "Aggregates all departmental clearances and signs official permission order." },
      { num: "05", actor: "Candidate", action: "Tracks progress in real-time and downloads officially stamped NOC with secure QR verification." }
    ]
  },
  {
    id: "cvigil",
    title: "4. cVIGIL 100-Minute MCC Resolution Workflow",
    category: "MCC ENFORCEMENT",
    steps: [
      { num: "01", actor: "Vigilant Citizen", action: "Captures live photo/video evidence of cash/liquor/loudspeaker violation with automatic GPS geotag (0-5 min)." },
      { num: "02", actor: "District Control Centre (DCC)", action: "Triage operator reviews incident on live map and assigns nearest Flying Squad Team (FST) (5-10 min)." },
      { num: "03", actor: "Flying Squad (FST)", action: "Navigates using GIS investigator app, reaches site, conducts inspection, and seizes contraband (10-25 min)." },
      { num: "04", actor: "Field Unit (FST)", action: "Uploads on-site action report with evidence photos and FIR/seizure details (25-55 min)." },
      { num: "05", actor: "Returning Officer (RO)", action: "Reviews field report and takes final statutory decision: Drop, Dispose, or Escalate. Citizen notified (55-100 min)." }
    ]
  },
  {
    id: "counting",
    title: "5. Poll-Day Turnout, Counting & Index Card Workflow",
    category: "POLL OPERATIONS & RESULTS",
    steps: [
      { num: "01", actor: "RO / ARO", action: "Submits estimated cumulative voter turnout at 6 designated two-hour slots (09:00, 11:00, 13:00, 15:00, 17:00, 19:00)." },
      { num: "02", actor: "CEO Level Monitor", action: "Tracks delay or missing booth entries and triggers alerts to ensure 100% data transmission." },
      { num: "03", actor: "Counting Center", action: "Pre-counting postal ballots followed by round-wise EVM Control Unit tabulation on counting day." },
      { num: "04", actor: "Returning Officer (RO)", action: "Declares result (Form 21C) and presents Form 22 Certificate of Election to returned candidate." },
      { num: "05", actor: "Three-Tier Audit", action: "RO compiles Constituency Index Card; verified by State CEO and archived by ECI Statistical Division." }
    ]
  }
];

const rolesMatrix = [
  { role: "Citizen / Elector", jurisdiction: "Polling Part / AC", scope: "Public", permissions: "Submit Forms 6/6A/7/8, download e-EPIC, search roll, request BLO call, file cVIGIL complaints.", portal: "/voters" },
  { role: "Candidate / Party Agent", jurisdiction: "Constituency / State", scope: "Authenticated", permissions: "Manage candidate profile, file nominations, upload Form 26 affidavits, request campaign permissions.", portal: "/suvidha" },
  { role: "Booth Level Officer (BLO)", jurisdiction: "Assigned Polling Part", scope: "Field Official", permissions: "House-to-house physical verification, check address proof, verify AMF readiness, elector assistance.", portal: "/blo/login" },
  { role: "Electoral Registration Officer (ERO)", jurisdiction: "Assembly Constituency", scope: "Statutory", permissions: "Adjudicate electoral roll claims and objections, approve/reject Form 6/7/8, finalize electoral roll.", portal: "/admin" },
  { role: "Returning Officer (RO)", jurisdiction: "Constituency (AC / PC)", scope: "Statutory", permissions: "Candidate scrutiny, symbol allotment, permission approval, cVIGIL final decision, EVM counting, Form 21C declaration.", portal: "/encore" },
  { role: "District Control Centre (DCC / DEO)", jurisdiction: "District", scope: "Control Room", permissions: "Triage cVIGIL complaints, assign nearest Flying Squad Teams (FST), monitor district poll readiness.", portal: "/cvigil" },
  { role: "Chief Electoral Officer (CEO)", jurisdiction: "State / UT", scope: "State Oversight", permissions: "State-wide turnout monitoring, missing-entry tracking, cVIGIL escalation review, Index Card verification.", portal: "/ceo-himachal" },
  { role: "Departmental Nodal Officer", jurisdiction: "Department / District", scope: "Operational", permissions: "Review Suvidha permission requests assigned to department (Police, Fire, Traffic, Municipal).", portal: "/suvidha" },
  { role: "Flying Squad (FST) Investigator", jurisdiction: "Sector / Field", scope: "Mobile Unit", permissions: "Navigate to cVIGIL reported coordinates, investigate violations, seize material, submit field reports.", portal: "/cvigil" },
  { role: "ECI Statistical Division", jurisdiction: "National", scope: "Commission", permissions: "Final national validation of Constituency Index Cards, statistical compendiums, historical election archives.", portal: "/encore" }
];

export default function WorkflowPortal() {
  const [activeWf, setActiveWf] = useState("voter");
  const currentWf = workflowsData.find((w) => w.id === activeWf);

  return (
    <div className="gov-page-root">
      <GovHeader />

      {/* Breadcrumb */}
      <div className="gov-breadcrumb-strip">
        <div className="gov-breadcrumb-container">
          <Link to="/">Home</Link> &gt; <span>System Workflow Blueprints & Roles Explorer</span>
        </div>
      </div>

      <main id="main-content" className="gov-wf-main">
        {/* Hero */}
        <section className="gov-wf-hero" aria-label="Workflows and Roles Architecture">
          <div className="gov-wf-container">
            <span className="gov-wf-badge">ARCHITECTURE & STATUTORY BLUEPRINTS</span>
            <h1 className="gov-wf-title">ECIWeb Workflow Blueprints & Roles Matrix</h1>
            <p className="gov-wf-desc">
              Transparent visualization of statutory electoral processes under the Representation of the People Acts (1950 & 1951), Conduct of Elections Rules (1961), and Registration of Electors Rules (1960).
            </p>
          </div>
        </section>

        <div className="gov-wf-body-container">
          {/* Section 1: Interactive Workflows */}
          <div className="gov-tool-panel">
            <div className="gov-tool-header">
              <h2>Interactive Process Blueprints</h2>
              <p>Select any core workflow to inspect the step-by-step statutory execution chain from citizen intake to commission verification.</p>
            </div>

            {/* Workflow Selector Buttons */}
            <div className="gov-wf-selector-bar">
              {workflowsData.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`gov-wf-btn ${activeWf === w.id ? "active" : ""}`}
                  onClick={() => setActiveWf(w.id)}
                >
                  <span className="wf-btn-cat">{w.category}</span>
                  <strong>{w.title}</strong>
                </button>
              ))}
            </div>

            {/* Selected Workflow Flowchart Render */}
            {currentWf && (
              <div className="gov-wf-display-card mt-24">
                <div className="gov-wf-display-header">
                  <div>
                    <span className="gov-badge-green">{currentWf.category}</span>
                    <h3>{currentWf.title}</h3>
                  </div>
                </div>

                <div className="gov-flow-chain">
                  {currentWf.steps.map((st, i) => (
                    <div key={st.num} className="gov-flow-node">
                      <div className="gov-flow-step-num">{st.num}</div>
                      <div className="gov-flow-step-box">
                        <span className="gov-flow-actor">Actor: {st.actor}</span>
                        <p className="gov-flow-action">{st.action}</p>
                      </div>
                      {i < currentWf.steps.length - 1 && (
                        <div className="gov-flow-arrow">▼</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Roles and Access Matrix */}
          <div className="gov-tool-panel mt-36">
            <div className="gov-tool-header">
              <h2>Roles & Access Permissions Matrix</h2>
              <p>Strict jurisdictional scoping enforced across Role, Election, State, and Assembly Constituency.</p>
            </div>

            <div className="gov-matrix-table-wrapper">
              <table className="gov-matrix-table">
                <thead>
                  <tr>
                    <th>Role Designation</th>
                    <th>Jurisdiction Scope</th>
                    <th>Access Level</th>
                    <th>Statutory Responsibilities & Capabilities</th>
                    <th>Launch Sandbox</th>
                  </tr>
                </thead>
                <tbody>
                  {rolesMatrix.map((r) => (
                    <tr key={r.role}>
                      <td><strong>{r.role}</strong></td>
                      <td>
                        <span className="jurisdiction-pill">{r.jurisdiction}</span>
                      </td>
                      <td>
                        <span className={`scope-badge ${r.scope.toLowerCase()}`}>{r.scope}</span>
                      </td>
                      <td className="desc-cell">{r.permissions}</td>
                      <td>
                        <Link to={r.portal} className="gov-sandbox-btn">
                          Open Portal ➜
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <GovFooter />
    </div>
  );
}
