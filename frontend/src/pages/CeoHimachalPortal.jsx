import { useState } from "react";
import { Link } from "react-router-dom";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import "./CeoHimachalPortal.css";

const hpDistricts = [
  { name: "Kangra", hq: "Dharamshala", acCount: 15, electors: "12.8 Lakh", stations: "1,625" },
  { name: "Mandi", hq: "Mandi", acCount: 10, electors: "8.2 Lakh", stations: "1,190" },
  { name: "Shimla", hq: "Shimla", acCount: 8, electors: "6.1 Lakh", stations: "1,046" },
  { name: "Solan", hq: "Solan", acCount: 5, electors: "4.3 Lakh", stations: "589" },
  { name: "Sirmaur", hq: "Nahan", acCount: 5, electors: "3.9 Lakh", stations: "565" },
  { name: "Una", hq: "Una", acCount: 5, electors: "4.1 Lakh", stations: "515" },
  { name: "Hamirpur", hq: "Hamirpur", acCount: 5, electors: "4.0 Lakh", stations: "531" },
  { name: "Kullu", hq: "Kullu", acCount: 4, electors: "3.2 Lakh", stations: "572" },
  { name: "Chamba", hq: "Chamba", acCount: 5, electors: "4.1 Lakh", stations: "629" },
  { name: "Bilaspur", hq: "Bilaspur", acCount: 4, electors: "3.1 Lakh", stations: "389" },
  { name: "Kinnaur", hq: "Reckong Peo", acCount: 1, electors: "0.6 Lakh", stations: "135" },
  { name: "Lahaul & Spiti", hq: "Keylong", acCount: 1, electors: "0.3 Lakh", stations: "92" }
];

const voterSaathiCategories = [
  { id: "new_voter", label: "New Elector / Voter", reply: "First time voter? Fill Form 6 online if you are 18 or turning 18 on 01.01.2026. You will need age proof and address proof.", link: "/register", linkText: "Fill Form 6" },
  { id: "existing_voter", label: "Existing Elector / Voter", reply: "Check your name in the electoral roll or apply for correction/shifting using Form 8.", link: "/electoral-roll", linkText: "Search Voter Roll" },
  { id: "overseas", label: "Overseas Elector", reply: "Indian citizens living abroad can register via Form 6A with Indian passport details.", link: "/voters", linkText: "Form 6A Details" },
  { id: "pwd", label: "PwD Elector / Voter", reply: "Persons with Disability can mark themselves in the roll using Form 8 to receive wheelchair assistance and postal ballot facilities.", link: "/voters", linkText: "PwD Facilities" },
  { id: "service", label: "Service Electors", reply: "Armed forces and state police stationed outside use Form 2 / 2A / 3 for service voter enrollment through ETPBMS.", link: "/voters", linkText: "Service Forms" },
  { id: "complaints", label: "Complaints", reply: "Register grievance via NGSP or report Model Code of Conduct violations in 100 minutes with cVIGIL.", link: "/cvigil", linkText: "File cVIGIL Report" },
  { id: "candidates", label: "Candidates", reply: "Candidates can file online nominations, upload Form 26 affidavits, and apply for campaign permissions via Suvidha.", link: "/suvidha", linkText: "Suvidha Portal" },
  { id: "parties", label: "Political Parties", reply: "Recognized political parties can apply for rally and vehicle permissions with FIFO queue clearance.", link: "/suvidha", linkText: "Campaign Permissions" },
  { id: "kyc", label: "Know Your Candidate (KYC)", reply: "View criminal antecedent disclosures and asset/liability affidavits of all contesting candidates.", link: "/suvidha", linkText: "KYC Search" },
  { id: "know_blo", label: "Know your BLO, ERO, DEO", reply: "Contact your local Booth Level Officer or District Election Officer via helpline 1950 or book a direct call.", link: "/voters", linkText: "Book BLO Call" },
  { id: "gis_maps", label: "GIS Maps of HP", reply: "Explore digital GIS boundaries for all 12 districts, 68 assembly constituencies, and 4 parliamentary constituencies in HP.", link: "#gis-section", linkText: "View GIS Maps Below" },
  { id: "polling_stations", label: "Final list of Polling Stations-2024/25", reply: "All 7,990+ polling stations in Himachal Pradesh are equipped with Assured Minimum Facilities (AMF).", link: "#stations-section", linkText: "Explore Stations" },
  { id: "fill_instructions", label: "Instructions to fill form online/offline", reply: "Download statutory PDF instructions and checklists for Form 6, 6A, 7, and 8.", link: "/voters", linkText: "Read Guidelines" }
];

export default function CeoHimachalPortal() {
  const [selectedDistrict, setSelectedDistrict] = useState("Kangra");
  const [saathiChatHistory, setSaathiChatHistory] = useState([
    {
      sender: "saathi",
      text: "Namaste! I am Voter Saathi (मतदाता साथी), your 24x7 Virtual Assistant for Chief Electoral Officer, Himachal Pradesh. How can I assist you with your voter services today?"
    }
  ]);

  const handleSaathiSelect = (cat) => {
    setSaathiChatHistory((prev) => [
      ...prev,
      { sender: "user", text: cat.label },
      { sender: "saathi", text: cat.reply, link: cat.link, linkText: cat.linkText }
    ]);
  };

  const distData = hpDistricts.find((d) => d.name === selectedDistrict);

  return (
    <div className="gov-page-root">
      <GovHeader />

      {/* Breadcrumb */}
      <div className="gov-breadcrumb-strip">
        <div className="gov-breadcrumb-container">
          <Link to="/">Home</Link> &gt; <span>Chief Electoral Officer, Himachal Pradesh (राज्य निर्वाचन कार्यालय)</span>
        </div>
      </div>

      <main id="main-content" className="gov-hp-main">
        {/* CEO HP Hero */}
        <section className="gov-hp-hero" aria-label="CEO Himachal Pradesh Portal">
          <div className="gov-hp-container">
            <div className="gov-hp-hero-content">
              <span className="gov-hp-badge">ELECTION DEPARTMENT · GOVERNMENT OF HIMACHAL PRADESH</span>
              <h1 className="gov-hp-title">Chief Electoral Officer, Himachal Pradesh</h1>
              <p className="gov-hp-desc">
                Official electoral portal for the State of Himachal Pradesh. 38, SDA Complex, Kasumpti, Shimla - 171009. Committed to accessible, inclusive, and ethical elections across 12 Districts and 68 Assembly Constituencies.
              </p>
            </div>

            <div className="gov-hp-highest-booth">
              <span className="tashigang-icon">🏔️</span>
              <div>
                <strong>TASHIGANG POLLING STATION</strong>
                <span>World's Highest Polling Booth at 15,256 ft (Lahaul & Spiti)</span>
              </div>
            </div>
          </div>
        </section>

        <div className="gov-hp-body-container">
          {/* 2-Column Main Layout: Left Profile & GIS, Right Voter Saathi Assistant */}
          <div className="gov-hp-grid">
            {/* Left Column: State Profile & GIS */}
            <div className="gov-hp-col-left">
              {/* Profile Card */}
              <div className="gov-tool-panel">
                <div className="gov-tool-header">
                  <h2>Himachal Pradesh Electoral Profile (2025–2026)</h2>
                  <p>Comprehensive electoral statistics compiled under the Special Summary Revision.</p>
                </div>

                <div className="gov-hp-stats-row">
                  <div className="hp-stat-card">
                    <strong>12</strong>
                    <span>Districts</span>
                  </div>
                  <div className="hp-stat-card">
                    <strong>68</strong>
                    <span>Assembly ACs</span>
                  </div>
                  <div className="hp-stat-card">
                    <strong>4</strong>
                    <span>Lok Sabha PCs</span>
                  </div>
                  <div className="hp-stat-card">
                    <strong>55.4 Lakh+</strong>
                    <span>Electors</span>
                  </div>
                  <div className="hp-stat-card">
                    <strong>7,990+</strong>
                    <span>Polling Stations</span>
                  </div>
                </div>

                {/* District Selector & Details */}
                <div className="gov-district-explorer mt-24">
                  <label htmlFor="dist-sel"><strong>Select District for Electoral Details:</strong></label>
                  <select
                    id="dist-sel"
                    value={selectedDistrict}
                    onChange={(e) => setSelectedDistrict(e.target.value)}
                    className="gov-dist-select"
                  >
                    {hpDistricts.map((d) => (
                      <option key={d.name} value={d.name}>{d.name} District</option>
                    ))}
                  </select>

                  {distData && (
                    <div className="gov-dist-info-box mt-14">
                      <h4>District Electoral Summary: {distData.name}</h4>
                      <div className="dist-specs-grid">
                        <div><strong>District HQ:</strong> {distData.hq}</div>
                        <div><strong>Assembly Constituencies:</strong> {distData.acCount} ACs</div>
                        <div><strong>Total Electors:</strong> {distData.electors}</div>
                        <div><strong>Total Polling Stations:</strong> {distData.stations}</div>
                      </div>
                      <div className="dist-actions-row mt-12">
                        <Link to="/electoral-roll" className="gov-btn-primary">
                          Search Electors in {distData.name} →
                        </Link>
                        <button
                          type="button"
                          className="gov-btn-secondary"
                          onClick={() => alert(`Downloading Draft Polling Station List for ${distData.name} District...`)}
                        >
                          📥 Polling Station List (PDF)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* GIS Maps Explorer Section */}
              <div id="gis-section" className="gov-tool-panel mt-28">
                <div className="gov-tool-header">
                  <h2>🗺️ GIS Constituency & Polling Station Maps</h2>
                  <p>Geospatial boundary maps and digital polling station locators with verified GPS coordinates.</p>
                </div>

                <div className="gov-gis-viewer-card">
                  <div className="gis-map-placeholder">
                    <span className="gis-icon">🧭</span>
                    <strong>Interactive GIS Boundary Map: Himachal Pradesh</strong>
                    <p>4 Parliamentary Constituencies: 01-Kangra, 02-Mandi, 03-Hamirpur, 04-Shimla (SC)</p>
                    <div className="gis-coordinates-badge">
                      State Center: 31.1048° N, 77.1734° E · Elevation: 2,276 m
                    </div>
                  </div>
                  <div className="gis-controls mt-14">
                    <span className="gis-layer-tag">✓ Parliamentary Layer</span>
                    <span className="gis-layer-tag">✓ Assembly Layer</span>
                    <span className="gis-layer-tag">✓ Polling Station Coordinates</span>
                    <span className="gis-layer-tag">✓ Accessibility (AMF) Audit</span>
                  </div>
                </div>
              </div>

              {/* State Voter Forms Box */}
              <div className="gov-tool-panel mt-28">
                <div className="gov-tool-header">
                  <h2>📑 Statutory Forms for Himachal Electors (Hindi & English)</h2>
                  <p>Forms published under the Registration of Electors Rules, 1960 for Himachal Pradesh.</p>
                </div>
                <div className="hp-forms-list">
                  <div className="hp-form-row">
                    <div>
                      <strong>Form 6 (प्रारूप 6)</strong>
                      <span>New voter registration in Himachal Pradesh</span>
                    </div>
                    <Link to="/register" className="gov-btn-sm-primary">Fill Online</Link>
                  </div>
                  <div className="hp-form-row">
                    <div>
                      <strong>Form 6B (प्रारूप 6ख)</strong>
                      <span>Voluntary Aadhaar intimation for authentication</span>
                    </div>
                    <Link to="/voters" className="gov-btn-sm-primary">Intimate</Link>
                  </div>
                  <div className="hp-form-row">
                    <div>
                      <strong>Form 8 (प्रारूप 8)</strong>
                      <span>Shifting, correction of entries, and PwD marking</span>
                    </div>
                    <Link to="/voters" className="gov-btn-sm-primary">Modify</Link>
                  </div>
                  <div className="hp-form-row">
                    <div>
                      <strong>Form 2 / 2A / 3 (सेवा मतदाता प्रारूप)</strong>
                      <span>Service voters (Armed forces, ITBP, State armed police)</span>
                    </div>
                    <Link to="/voters" className="gov-btn-sm-primary">View</Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: 24x7 Voter Saathi Assistant */}
            <div className="gov-hp-col-right">
              <div className="gov-saathi-panel">
                <div className="gov-saathi-header">
                  <div className="saathi-avatar">🤖</div>
                  <div>
                    <h3>Voter Saathi (मतदाता साथी)</h3>
                    <span>24x7 AI & Interactive Assistant · CEO Himachal Pradesh</span>
                  </div>
                  <span className="saathi-online-pill">ONLINE</span>
                </div>

                {/* Chat window */}
                <div className="gov-saathi-chat-window">
                  {saathiChatHistory.map((msg, i) => (
                    <div key={i} className={`saathi-bubble ${msg.sender}`}>
                      <p>{msg.text}</p>
                      {msg.link && (
                        <div className="mt-8">
                          {msg.link.startsWith("#") ? (
                            <a href={msg.link} className="saathi-link-btn">
                              {msg.linkText} →
                            </a>
                          ) : (
                            <Link to={msg.link} className="saathi-link-btn">
                              {msg.linkText} →
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 13 Evidenced Topic Categories from research */}
                <div className="gov-saathi-topics-area">
                  <span className="saathi-topics-label">Select topic for immediate guidance:</span>
                  <div className="saathi-pills-cloud">
                    {voterSaathiCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className="saathi-pill-btn"
                        onClick={() => handleSaathiSelect(cat)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Call helpline prompt */}
                <div className="saathi-footer-help">
                  <span>Need human assistance?</span>
                  <a href="tel:1950" className="saathi-tel-btn">
                    📞 Call Voter Helpline 1950
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <GovFooter />
    </div>
  );
}
