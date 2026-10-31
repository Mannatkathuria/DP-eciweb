import { useState } from "react";
import { Link } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import "./EncorePortal.css";

const turnoutSlots = [
  { slot: "09:00 AM", estimated: "12.8%", male: "14.2%", female: "11.3%", third: "9.5%", entriesReceived: "100%" },
  { slot: "11:00 AM", estimated: "28.4%", male: "30.1%", female: "26.5%", third: "22.0%", entriesReceived: "100%" },
  { slot: "01:00 PM", estimated: "45.1%", male: "46.8%", female: "43.2%", third: "38.5%", entriesReceived: "100%" },
  { slot: "03:00 PM", estimated: "59.3%", male: "60.5%", female: "58.0%", third: "54.0%", entriesReceived: "98.5%" },
  { slot: "05:00 PM", estimated: "68.7%", male: "69.4%", female: "67.9%", third: "65.2%", entriesReceived: "99.2%" },
  { slot: "07:00 PM (Final)", estimated: "74.2%", male: "75.1%", female: "73.2%", third: "70.8%", entriesReceived: "100%" }
];

const mockCandidates = [
  {
    id: "CAN-01",
    name: "Amit Kumar",
    party: "Rashtriya Vikas Party",
    symbol: "Lotus",
    status: "ACCEPTED",
    rounds: [4210, 5120, 4890, 5340, 6100, 5800, 6420],
    postal: 850
  },
  {
    id: "CAN-02",
    name: "Rajesh Mehra",
    party: "National People's Party",
    symbol: "Hand",
    status: "ACCEPTED",
    rounds: [3890, 4610, 4720, 5010, 5450, 5600, 6010],
    postal: 720
  },
  {
    id: "CAN-03",
    name: "Dr. Sunita Devi",
    party: "Lok Jan Seva Party",
    symbol: "Elephant",
    status: "ACCEPTED",
    rounds: [1200, 1450, 1380, 1600, 1750, 1890, 2040],
    postal: 240
  },
  {
    id: "CAN-04",
    name: "Mohan Lal",
    party: "Independent",
    symbol: "Clock",
    status: "WITHDRAWN",
    rounds: [0, 0, 0, 0, 0, 0, 0],
    postal: 0
  }
];

export default function EncorePortal() {
  const [activeModule, setActiveModule] = useState("turnout"); // turnout | scrutiny | counting | indexcard
  const [currentRound, setCurrentRound] = useState(7); // up to 7
  const [form7aGenerated, setForm7aGenerated] = useState(false);
  const [indexCardVerified, setIndexCardVerified] = useState(false);

  // Compute total votes up to current round
  const candidateResults = mockCandidates.map((c) => {
    const evmVotes = c.rounds.slice(0, currentRound).reduce((acc, v) => acc + v, 0);
    const totalVotes = evmVotes + c.postal;
    return { ...c, evmVotes, totalVotes };
  }).sort((a, b) => b.totalVotes - a.totalVotes);

  const totalVotesCast = candidateResults.reduce((acc, c) => acc + c.totalVotes, 0);
  const leadingCandidate = candidateResults[0];
  const trailingCandidate = candidateResults[1];
  const margin = leadingCandidate.totalVotes - trailingCandidate.totalVotes;

  return (
    <div className="gov-page-root">
      <GovHeader />

      {/* Breadcrumb */}
      <div className="gov-breadcrumb-strip">
        <div className="gov-breadcrumb-container">
          <Link to="/">Home</Link> &gt; <span>ENCORE Election Management & Counting Suite</span>
        </div>
      </div>

      <main id="main-content" className="gov-encore-main">
        {/* ENCORE Hero */}
        <section className="gov-encore-hero" aria-label="ENCORE Election Operations">
          <div className="gov-encore-container">
            <div className="gov-encore-content">
              <span className="gov-encore-badge">ECI OFFICIAL OPERATIONS PLATFORM</span>
              <h1 className="gov-encore-title">ENCORE: Operations & Results Suite</h1>
              <p className="gov-encore-desc">
                Enabling Returning Officers (RO), District Election Officers (DEO), and Chief Electoral Officers (CEO) to manage candidate scrutiny, live 2-hour poll day turnout, EVM round counting, and post-poll statutory Index Cards.
              </p>
            </div>
            <div className="gov-encore-role-badge">
              <span className="enc-role-icon">🏛️</span>
              <div>
                <strong>OFFICIAL RO / CEO CONSOLE</strong>
                <span>Constituency: 31 – Vikaspuri (NCT of Delhi)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Modules Nav Bar */}
        <section className="gov-encore-tabs-bar">
          <div className="gov-encore-tabs-container">
            <button
              className={`gov-enc-tab ${activeModule === "turnout" ? "active" : ""}`}
              onClick={() => setActiveModule("turnout")}
            >
              ⏱️ Poll-Day Voter Turnout Trends
            </button>
            <button
              className={`gov-enc-tab ${activeModule === "counting" ? "active" : ""}`}
              onClick={() => setActiveModule("counting")}
            >
              📊 Live EVM & Postal Counting
            </button>
            <button
              className={`gov-enc-tab ${activeModule === "scrutiny" ? "active" : ""}`}
              onClick={() => setActiveModule("scrutiny")}
            >
              ⚖️ Candidate Scrutiny & Form 7A
            </button>
            <button
              className={`gov-enc-tab ${activeModule === "indexcard" ? "active" : ""}`}
              onClick={() => setActiveModule("indexcard")}
            >
              📑 Constituency Index Card
            </button>
          </div>
        </section>

        <div className="gov-encore-body-container">
          {/* MODULE 1: TURNOUT TRENDS */}
          {activeModule === "turnout" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <div className="flex-between">
                  <div>
                    <h2>Poll Day Cumulative Turnout Trends (2-Hour Slots)</h2>
                    <p>Mandatory time-slot reporting recorded by Returning Officers and verified at CEO / ECI levels.</p>
                  </div>
                  <div className="gov-turnout-final-badge">
                    <span>FINAL ESTIMATED TURNOUT</span>
                    <strong>74.2%</strong>
                  </div>
                </div>
              </div>

              {/* Turnout Table */}
              <div className="gov-turnout-table-wrapper">
                <table className="gov-turnout-table">
                  <thead>
                    <tr>
                      <th>Time Slot</th>
                      <th>Estimated Cumulative Turnout</th>
                      <th>Male Turnout</th>
                      <th>Female Turnout</th>
                      <th>Third Gender</th>
                      <th>Booth Entries Received</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turnoutSlots.map((ts) => (
                      <tr key={ts.slot}>
                        <td><strong>{ts.slot}</strong></td>
                        <td>
                          <div className="turnout-bar-wrapper">
                            <div className="turnout-bar" style={{ width: ts.estimated }}></div>
                            <span className="turnout-val">{ts.estimated}</span>
                          </div>
                        </td>
                        <td>{ts.male}</td>
                        <td>{ts.female}</td>
                        <td>{ts.third}</td>
                        <td>
                          <span className="booth-count-badge">✓ {ts.entriesReceived}</span>
                        </td>
                        <td>
                          <span className="gov-badge-green">PUBLISHED</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="gov-ceo-alert-box mt-20">
                <span className="alert-icon">🛡️</span>
                <div>
                  <strong>CEO Level Missing-Entry Monitor: Active</strong>
                  <p>All 240 polling stations in Constituency 31-Vikaspuri have submitted final 7:00 PM turnout figures. Zero missing entries.</p>
                </div>
              </div>
            </div>
          )}

          {/* MODULE 2: COUNTING & RESULTS */}
          {activeModule === "counting" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <div className="flex-between">
                  <div>
                    <h2>Round-wise EVM & Postal Ballot Tabulation</h2>
                    <p>Live vote tabulation from Counting Tables in presence of Counting Agents and ECI Observers.</p>
                  </div>
                  <div className="gov-round-stepper">
                    <label>Round Progression:</label>
                    <select
                      value={currentRound}
                      onChange={(e) => setCurrentRound(Number(e.target.value))}
                    >
                      <option value={1}>Round 1 / 7</option>
                      <option value={2}>Round 2 / 7</option>
                      <option value={3}>Round 3 / 7</option>
                      <option value={4}>Round 4 / 7</option>
                      <option value={5}>Round 5 / 7</option>
                      <option value={6}>Round 6 / 7</option>
                      <option value={7}>Round 7 / 7 (Final Round)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Lead & Margin Banner */}
              <div className="gov-lead-margin-card">
                <div className="gov-lead-info">
                  <span className="gov-lead-tag">LEADING CANDIDATE</span>
                  <h3>{leadingCandidate.name} ({leadingCandidate.party})</h3>
                  <div className="gov-lead-votes">
                    <strong>{leadingCandidate.totalVotes.toLocaleString("en-IN")} Votes</strong>
                    <span className="gov-margin-pill">Leading by {margin.toLocaleString("en-IN")} votes over {trailingCandidate.name}</span>
                  </div>
                </div>
                <div className="gov-total-votes-box">
                  <span>TOTAL VOTES COUNTED</span>
                  <strong>{totalVotesCast.toLocaleString("en-IN")}</strong>
                  <span>Round {currentRound} of 7 Completed</span>
                </div>
              </div>

              {/* Candidate Round Wise Table */}
              <div className="gov-counting-table-wrapper">
                <table className="gov-counting-table">
                  <thead>
                    <tr>
                      <th>Candidate Name</th>
                      <th>Party</th>
                      <th>Symbol</th>
                      <th>Postal Votes</th>
                      <th>EVM Votes (Rounds 1–{currentRound})</th>
                      <th>Total Votes</th>
                      <th>Vote Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateResults.map((c) => (
                      <tr key={c.id} className={c.id === leadingCandidate.id ? "row-lead" : ""}>
                        <td>
                          <strong>{c.name}</strong>
                          {c.id === leadingCandidate.id && <span className="lead-star"> ⭐ LEADING</span>}
                        </td>
                        <td>{c.party}</td>
                        <td>
                          <span className="sym-badge">{c.symbol}</span>
                        </td>
                        <td>{c.postal.toLocaleString("en-IN")}</td>
                        <td>{c.evmVotes.toLocaleString("en-IN")}</td>
                        <td>
                          <strong className="c-total-val">{c.totalVotes.toLocaleString("en-IN")}</strong>
                        </td>
                        <td>
                          {totalVotesCast > 0 ? ((c.totalVotes / totalVotesCast) * 100).toFixed(1) + "%" : "0%"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {currentRound === 7 && (
                <div className="gov-declaration-card mt-20">
                  <div className="dec-icon">🏆</div>
                  <div>
                    <h4>Statutory Declaration of Result (Form 21C) Ready</h4>
                    <p>
                      <strong>{leadingCandidate.name}</strong> of <strong>{leadingCandidate.party}</strong> has secured the highest number of valid votes ({leadingCandidate.totalVotes.toLocaleString("en-IN")}) and is declared elected.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="gov-btn-primary"
                    onClick={() => alert("Downloading Form 22 Certificate of Election with RO Digital Seal...")}
                  >
                    📥 Download Form 22 Certificate
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MODULE 3: SCRUTINY & FORM 7A */}
          {activeModule === "scrutiny" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>Candidate Scrutiny & Finalization (Form 7A)</h2>
                <p>Returning Officer console to scrutinize affidavits, record withdrawals, allot symbols, and finalize contesting candidates.</p>
              </div>

              <div className="gov-scrutiny-table-wrapper">
                <table className="gov-scrutiny-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Party</th>
                      <th>Deposit & Affidavit</th>
                      <th>Symbol Allotted</th>
                      <th>Scrutiny Status</th>
                      <th>RO Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockCandidates.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.name}</strong></td>
                        <td>{c.party}</td>
                        <td>
                          <span className="gov-badge-green">✓ Verified & Clear</span>
                        </td>
                        <td>
                          <span className="sym-badge">{c.symbol}</span>
                        </td>
                        <td>
                          <span className={`scrutiny-status ${c.status.toLowerCase()}`}>
                            {c.status}
                          </span>
                        </td>
                        <td>
                          <span className="ro-action-ok">Scrutinized & Signed</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="gov-form7a-box mt-20">
                <div className="flex-between">
                  <div>
                    <h4>Form 7A: List of Contesting Candidates</h4>
                    <p>Published in alphabetical order in the official language as required by Rule 10(1) of the Conduct of Elections Rules, 1961.</p>
                  </div>
                  <button
                    type="button"
                    className="gov-btn-primary"
                    onClick={() => {
                      setForm7aGenerated(true);
                      alert("Official Form 7A generated and published on citizen KYC portal!");
                    }}
                  >
                    {form7aGenerated ? "✓ Form 7A Published" : "Generate & Finalize Form 7A 📄"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODULE 4: CONSTITUENCY INDEX CARD */}
          {activeModule === "indexcard" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>Constituency Index Card & Statistical Verification</h2>
                <p>Consolidated statutory dataset prepared by the Returning Officer within 72 hours of result declaration for CEO and ECI Statistical Division validation.</p>
              </div>

              <div className="gov-indexcard-card">
                <div className="indexcard-top">
                  <div className="indexcard-header">
                    <h3>INDEX CARD FOR CONSTITUENCY: 31 – VIKASPURI</h3>
                    <span>Election: Legislative Assembly General Election 2026 · State: NCT of Delhi</span>
                  </div>
                  <span className={`indexcard-status ${indexCardVerified ? "verified" : "pending"}`}>
                    {indexCardVerified ? "✓ ECI VERIFIED & ARCHIVED" : "PENDING CEO / ECI VERIFICATION"}
                  </span>
                </div>

                <div className="indexcard-grid">
                  <div className="indexcard-block">
                    <strong>I. ELECTORS & POLLING STATIONS</strong>
                    <div>Total Electors: 2,84,120 (Men: 1,48,200 | Women: 1,35,900 | Third Gender: 20)</div>
                    <div>Total Polling Stations: 240 (All AMF Compliant)</div>
                    <div>Voters Polled: 2,10,817 (Turnout: 74.2%)</div>
                  </div>

                  <div className="indexcard-block">
                    <strong>II. NOMINATIONS & SCRUTINY</strong>
                    <div>Nominations Filed: 6 | Rejected: 1 | Withdrawn: 1</div>
                    <div>Contesting Candidates: 4</div>
                    <div>Forfeited Deposits: 2 Candidates (Secured &lt; 1/6th valid votes)</div>
                  </div>

                  <div className="indexcard-block">
                    <strong>III. RESULTS & ELECTED CANDIDATE</strong>
                    <div>Returned Candidate: Amit Kumar (Rashtriya Vikas Party)</div>
                    <div>Total Valid Votes Polled: 2,10,247 | Rejected Postal: 570</div>
                    <div>Winning Margin: 3,920 Votes</div>
                  </div>
                </div>

                <div className="indexcard-footer mt-20">
                  <div className="three-tier-sigs">
                    <div className="sig-item">
                      <span>Tier 1: Returning Officer</span>
                      <strong>✓ Signed & Submitted</strong>
                    </div>
                    <div className="sig-item">
                      <span>Tier 2: Chief Electoral Officer</span>
                      <strong>{indexCardVerified ? "✓ Verified & Stamped" : "Under Review"}</strong>
                    </div>
                    <div className="sig-item">
                      <span>Tier 3: ECI Statistical Division</span>
                      <strong>{indexCardVerified ? "✓ Archived in National Archive" : "Awaiting Verification"}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="gov-btn-primary mt-14"
                    onClick={() => {
                      setIndexCardVerified(true);
                      alert("CEO and ECI Statistical Division Verification complete! Index Card officially published.");
                    }}
                  >
                    {indexCardVerified ? "✓ Index Card Formally Published" : "Verify & Archive Index Card (CEO / ECI) 🏛️"}
                  </button>
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
