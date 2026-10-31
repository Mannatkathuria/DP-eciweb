import { useState } from "react";
import { Link } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import "./SuvidhaPortal.css";

const permissionCategories = [
  { id: "rally", title: "Public Rallies & Processions", icon: "📢", nodals: ["Police", "Traffic", "Fire"] },
  { id: "speaker", title: "Use of Loudspeakers", icon: "🔊", nodals: ["Police", "Pollution Control"] },
  { id: "vehicle", title: "Campaign Vehicles & Convoys", icon: "🚙", nodals: ["Transport", "Traffic", "Police"] },
  { id: "office", title: "Temporary Party Offices", icon: "🏢", nodals: ["Municipal Corp", "Fire"] },
  { id: "helipad", title: "Helicopter / Helipad Landing", icon: "🚁", nodals: ["DGCA", "District Police", "PWD"] }
];

const mockPermissionsList = [
  {
    refId: "SUV-2026-DL-00192",
    applicant: "Vikas Aggarwal (Independent)",
    category: "Campaign Vehicles & Convoys",
    venue: "Vikaspuri AC (5 Vehicles)",
    appliedDate: "30 Oct 2026",
    nodalsStatus: { Police: "Approved", Traffic: "Approved", Transport: "Approved" },
    status: "APPROVED",
    fifoQueue: "Processed (#12)"
  },
  {
    refId: "SUV-2026-DL-00198",
    applicant: "Rajesh Mehra (National Party)",
    category: "Public Rallies & Processions",
    venue: "DDA Ground, Janakpuri",
    appliedDate: "31 Oct 2026",
    nodalsStatus: { Police: "Approved", Traffic: "Under Review", Fire: "Approved" },
    status: "PENDING_NODAL",
    fifoQueue: "Current (#04 in queue)"
  }
];

export default function SuvidhaPortal() {
  const [activeTab, setActiveTab] = useState("permissions"); // nomination | permissions | kyc
  const [selectedPermCat, setSelectedPermCat] = useState("rally");
  const [venue, setVenue] = useState("");
  const [eventDate, setEventDate] = useState("2026-11-05");
  const [newPermSubmission, setNewPermSubmission] = useState(null);

  // Nomination form state
  const [nomination, setNomination] = useState({
    candidateName: "Amit Kumar",
    partyName: "Rashtriya Vikas Party",
    acName: "31 – Vikaspuri",
    epicNo: "ABC9876543",
    depositAmount: "₹10,000",
    affidavitUploaded: true,
    roSlot: "04 Nov 2026, 11:30 AM",
    submitted: false,
    nominationId: ""
  });

  const handlePermissionSubmit = (e) => {
    e.preventDefault();
    const id = "SUV-2026-DL-" + Math.floor(10000 + Math.random() * 90000);
    setNewPermSubmission({
      id,
      category: permissionCategories.find((c) => c.id === selectedPermCat)?.title,
      venue,
      date: eventDate,
      status: "RO_DISPATCHED"
    });
  };

  const handleNominationSubmit = (e) => {
    e.preventDefault();
    const nomId = "NOM-2026-AC31-" + Math.floor(100 + Math.random() * 900);
    setNomination({ ...nomination, submitted: true, nominationId: nomId });
  };

  return (
    <div className="gov-page-root">
      <GovHeader />

      {/* Breadcrumb */}
      <div className="gov-breadcrumb-strip">
        <div className="gov-breadcrumb-container">
          <Link to="/">Home</Link> &gt; <span>Suvidha 2.0 Single-Window Candidate & Party Portal</span>
        </div>
      </div>

      <main id="main-content" className="gov-suvidha-main">
        {/* Suvidha Hero */}
        <section className="gov-suvidha-hero" aria-label="Suvidha Candidate Services">
          <div className="gov-suvidha-container">
            <div className="gov-suvidha-content">
              <span className="gov-suvidha-badge">SINGLE-WINDOW CANDIDATE SYSTEM</span>
              <h1 className="gov-suvidha-title">Suvidha 2.0 Candidate Portal</h1>
              <p className="gov-suvidha-desc">
                Streamlining election processes for candidates and recognized political parties. File nominations, submit mandatory affidavits, and obtain multi-department campaign permissions under a transparent First-In-First-Out (FIFO) queue.
              </p>
            </div>
            <div className="gov-suvidha-fifo-badge">
              <span className="fifo-icon">⚖️</span>
              <div>
                <strong>FIRST-IN-FIRST-OUT (FIFO) MANDATE</strong>
                <span>Transparent Time-Stamped Permission Processing</span>
              </div>
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <section className="gov-suvidha-tabs-bar">
          <div className="gov-suvidha-tabs-container">
            <button
              className={`gov-s-tab ${activeTab === "permissions" ? "active" : ""}`}
              onClick={() => setActiveTab("permissions")}
            >
              🚩 Campaign Permission Requests (FIFO)
            </button>
            <button
              className={`gov-s-tab ${activeTab === "nomination" ? "active" : ""}`}
              onClick={() => setActiveTab("nomination")}
            >
              📝 Online Candidate Nomination & Deposit
            </button>
            <button
              className={`gov-s-tab ${activeTab === "kyc" ? "active" : ""}`}
              onClick={() => setActiveTab("kyc")}
            >
              🔍 Know Your Candidate (KYC & Affidavits)
            </button>
          </div>
        </section>

        <div className="gov-suvidha-body-container">
          {/* TAB 1: CAMPAIGN PERMISSIONS */}
          {activeTab === "permissions" && (
            <div className="gov-suvidha-perm-layout">
              <div className="gov-perm-left">
                <div className="gov-tool-panel">
                  <div className="gov-tool-header">
                    <h2>Apply for Campaign Permission</h2>
                    <p>Applications are auto-forwarded through ENCORE to designated departmental nodal officers.</p>
                  </div>

                  {newPermSubmission ? (
                    <div className="gov-success-banner">
                      <div className="gov-success-icon">📜</div>
                      <h3>Permission Application Submitted!</h3>
                      <p>
                        Reference ID: <strong>{newPermSubmission.id}</strong>
                      </p>
                      <div className="gov-booking-details-box">
                        <div><strong>Category:</strong> {newPermSubmission.category}</div>
                        <div><strong>Venue / Details:</strong> {newPermSubmission.venue}</div>
                        <div><strong>Requested Date:</strong> {newPermSubmission.date}</div>
                        <div><strong>Current Status:</strong> Dispatched to Police & Fire Nodal Officers</div>
                      </div>
                      <button
                        type="button"
                        className="gov-btn-primary"
                        onClick={() => alert(`Official Stamped NOC Preview for ${newPermSubmission.id} ready with QR Seal!`)}
                      >
                        Preview Digital NOC / Permission 📄
                      </button>
                      <button
                        type="button"
                        className="gov-btn-secondary mt-12"
                        onClick={() => setNewPermSubmission(null)}
                      >
                        Apply for Another Permission
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handlePermissionSubmit}>
                      <div className="gov-input-group">
                        <label>Select Permission Category *</label>
                        <div className="gov-perm-cat-pills">
                          {permissionCategories.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`gov-perm-pill ${selectedPermCat === c.id ? "active" : ""}`}
                              onClick={() => setSelectedPermCat(c.id)}
                            >
                              <span>{c.icon}</span>
                              <strong>{c.title}</strong>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="gov-input-group">
                        <label htmlFor="venue-input">Proposed Venue / Route / Convoy Details *</label>
                        <input
                          id="venue-input"
                          type="text"
                          placeholder="e.g. Ground near DDA Community Center, Vikaspuri"
                          value={venue}
                          onChange={(e) => setVenue(e.target.value)}
                          required
                        />
                      </div>

                      <div className="gov-form-row">
                        <div className="gov-input-group">
                          <label htmlFor="event-date">Proposed Date of Event *</label>
                          <input
                            id="event-date"
                            type="date"
                            value={eventDate}
                            onChange={(e) => setEventDate(e.target.value)}
                            required
                          />
                        </div>
                        <div className="gov-input-group">
                          <label>Time Window</label>
                          <select>
                            <option>10:00 AM – 02:00 PM</option>
                            <option>02:00 PM – 06:00 PM</option>
                            <option>06:00 PM – 10:00 PM (Strict cutoff)</option>
                          </select>
                        </div>
                      </div>

                      <div className="gov-nodal-chain-box">
                        <strong>Automated Nodal Clearances Required:</strong>
                        <div className="nodal-tags">
                          {permissionCategories
                            .find((c) => c.id === selectedPermCat)
                            ?.nodals.map((n) => (
                              <span key={n} className="nodal-tag">✓ {n} Nodal Officer</span>
                            ))}
                        </div>
                      </div>

                      <button type="submit" className="gov-btn-primary full-width mt-12">
                        Submit for Multi-Nodal Clearance 🚀
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Live Permission Track Queue */}
              <div className="gov-perm-right">
                <div className="gov-tool-panel">
                  <div className="gov-tool-header">
                    <h2>FIFO Live Permission Status Tracker</h2>
                    <p>Track multi-nodal approvals and download official digitally-stamped NOC certificates.</p>
                  </div>

                  <div className="gov-queue-list">
                    {mockPermissionsList.map((p) => (
                      <div key={p.refId} className="gov-queue-item">
                        <div className="gov-queue-top">
                          <div>
                            <span className="gov-queue-ref">{p.refId}</span>
                            <h4>{p.category}</h4>
                            <span className="gov-queue-app">{p.applicant}</span>
                          </div>
                          <span className={`gov-perm-status ${p.status.toLowerCase()}`}>
                            {p.status}
                          </span>
                        </div>

                        <div className="gov-queue-mid">
                          <div>📍 {p.venue}</div>
                          <div>📅 Applied: {p.appliedDate}</div>
                        </div>

                        {/* Nodal Clearances */}
                        <div className="gov-nodal-status-row">
                          <span className="nodal-lbl">Nodal Approvals:</span>
                          {Object.entries(p.nodalsStatus).map(([dept, st]) => (
                            <span key={dept} className={`nodal-chip ${st === "Approved" ? "ok" : "wait"}`}>
                              {dept}: {st}
                            </span>
                          ))}
                        </div>

                        {p.status === "APPROVED" && (
                          <button
                            type="button"
                            className="gov-download-btn-sm full-width mt-12"
                            onClick={() => alert(`Official Stamped Permission Certificate for ${p.refId} downloaded!`)}
                          >
                            📥 Download Stamped Permission Certificate (PDF)
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ONLINE NOMINATION */}
          {activeTab === "nomination" && (
            <div className="gov-tool-panel max-w-800">
              <div className="gov-tool-header">
                <h2>Candidate Nomination & Security Deposit Filing</h2>
                <p>
                  Official digital workflow for candidate nomination under the Conduct of Elections Rules, 1961. Physical verification slot with the Returning Officer is booked upon submission.
                </p>
              </div>

              {nomination.submitted ? (
                <div className="gov-success-banner">
                  <div className="gov-success-icon">🗳️</div>
                  <h3>Nomination Filing Intimated to Returning Officer!</h3>
                  <p>
                    Nomination Application ID: <strong>{nomination.nominationId}</strong>
                  </p>
                  <div className="gov-booking-details-box">
                    <div><strong>Candidate:</strong> {nomination.candidateName}</div>
                    <div><strong>Party:</strong> {nomination.partyName}</div>
                    <div><strong>Constituency:</strong> {nomination.acName}</div>
                    <div><strong>Security Deposit Status:</strong> Paid ({nomination.depositAmount} via Treasury Gateway)</div>
                    <div><strong>RO Appointment Slot:</strong> {nomination.roSlot} (Court Room of RO)</div>
                  </div>
                  <button
                    type="button"
                    className="gov-btn-primary"
                    onClick={() => alert("Downloading Digitally Generated Nomination Form 2A/2B...")}
                  >
                    📥 Download Digitized Nomination Form
                  </button>
                </div>
              ) : (
                <form onSubmit={handleNominationSubmit}>
                  <div className="gov-form-row">
                    <div className="gov-input-group">
                      <label>Candidate Full Name *</label>
                      <input
                        type="text"
                        value={nomination.candidateName}
                        onChange={(e) => setNomination({ ...nomination, candidateName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="gov-input-group">
                      <label>EPIC (Voter ID) Number *</label>
                      <input
                        type="text"
                        value={nomination.epicNo}
                        onChange={(e) => setNomination({ ...nomination, epicNo: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="gov-form-row">
                    <div className="gov-input-group">
                      <label>Party Affiliation / Independent</label>
                      <input
                        type="text"
                        value={nomination.partyName}
                        onChange={(e) => setNomination({ ...nomination, partyName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="gov-input-group">
                      <label>Assembly Constituency</label>
                      <input type="text" value={nomination.acName} disabled />
                    </div>
                  </div>

                  {/* Affidavit & Deposit */}
                  <div className="gov-nom-cards-row">
                    <div className="gov-nom-box">
                      <strong>📄 Form 26 Affidavit & Criminal Antecedents</strong>
                      <p>Mandatory affidavit sworn before an Oath Commissioner or Magistrate.</p>
                      <span className="gov-badge-green">✓ e-Affidavit Uploaded</span>
                    </div>

                    <div className="gov-nom-box">
                      <strong>💰 Statutory Security Deposit</strong>
                      <p>Statutory deposit under Section 34 of RPA 1951.</p>
                      <span className="gov-deposit-val">{nomination.depositAmount} (General Category)</span>
                    </div>
                  </div>

                  <div className="gov-input-group mt-12">
                    <label>Preferred Physical Scrutiny / Verification Slot with RO</label>
                    <select
                      value={nomination.roSlot}
                      onChange={(e) => setNomination({ ...nomination, roSlot: e.target.value })}
                    >
                      <option>04 Nov 2026, 11:30 AM (RO Office, West Delhi)</option>
                      <option>04 Nov 2026, 02:30 PM (RO Office, West Delhi)</option>
                      <option>05 Nov 2026, 11:30 AM (RO Office, West Delhi)</option>
                    </select>
                  </div>

                  <button type="submit" className="gov-btn-primary full-width mt-12">
                    Submit Nomination & Book RO Verification Slot 🗳️
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: KYC */}
          {activeTab === "kyc" && (
            <div className="gov-tool-panel">
              <div className="gov-tool-header">
                <h2>🔍 Know Your Candidate (KYC) Public Portal</h2>
                <p>
                  As mandated by the Hon'ble Supreme Court of India, candidates must publicly disclose criminal antecedents, assets, liabilities, and educational qualifications.
                </p>
              </div>

              <div className="gov-kyc-grid">
                <div className="gov-kyc-card">
                  <div className="gov-kyc-header">
                    <div className="gov-kyc-avatar">👤</div>
                    <div>
                      <h3>Amit Kumar</h3>
                      <span className="gov-kyc-party">Rashtriya Vikas Party · Vikaspuri AC</span>
                    </div>
                  </div>
                  <div className="gov-kyc-details">
                    <div><strong>Education:</strong> Post Graduate (M.A. Public Administration)</div>
                    <div><strong>Declared Assets:</strong> ₹2.45 Crore</div>
                    <div><strong>Liabilities:</strong> ₹18.5 Lakhs (Home Loan)</div>
                    <div className="gov-kyc-clean">
                      <span className="clean-dot">✓</span> Zero Criminal Cases Declared
                    </div>
                  </div>
                  <button
                    type="button"
                    className="gov-download-btn-sm full-width mt-12"
                    onClick={() => alert("Downloading Candidate Form 26 Affidavit PDF...")}
                  >
                    📥 View Complete Form 26 Affidavit (PDF)
                  </button>
                </div>

                <div className="gov-kyc-card">
                  <div className="gov-kyc-header">
                    <div className="gov-kyc-avatar">👤</div>
                    <div>
                      <h3>Rajesh Mehra</h3>
                      <span className="gov-kyc-party">National People's Party · Vikaspuri AC</span>
                    </div>
                  </div>
                  <div className="gov-kyc-details">
                    <div><strong>Education:</strong> Graduate (B.Com)</div>
                    <div><strong>Declared Assets:</strong> ₹4.10 Crore</div>
                    <div><strong>Liabilities:</strong> ₹42.0 Lakhs</div>
                    <div className="gov-kyc-clean">
                      <span className="clean-dot">✓</span> Zero Criminal Cases Declared
                    </div>
                  </div>
                  <button
                    type="button"
                    className="gov-download-btn-sm full-width mt-12"
                    onClick={() => alert("Downloading Candidate Form 26 Affidavit PDF...")}
                  >
                    📥 View Complete Form 26 Affidavit (PDF)
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
