import { Link } from "react-router-dom";
import EciEmblem from "./EciEmblem";
import "./GovFooter.css";

export default function GovFooter() {
  return (
    <footer className="gov-footer" role="contentinfo">
      {/* Top Banner / Pulse Bar */}
      <div className="gov-footer-top-strip">
        <div className="gov-footer-container gov-footer-strip-content">
          <div className="gov-footer-callout">
            <span className="gov-callout-icon">📞</span>
            <div>
              <strong>National Voter Helpline: 1950</strong>
              <p>Toll-free across all States and Union Territories (24x7 Citizen Support)</p>
            </div>
          </div>
          <div className="gov-footer-social">
            <span className="gov-social-label">Follow Official ECI Channels:</span>
            <div className="gov-social-links">
              <span className="gov-social-chip">Facebook</span>
              <span className="gov-social-chip">X (Twitter)</span>
              <span className="gov-social-chip">YouTube</span>
              <span className="gov-social-chip">Instagram</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main 4-Column Directory */}
      <div className="gov-footer-main">
        <div className="gov-footer-container gov-footer-grid">
          {/* Column 1 */}
          <div className="gov-footer-col">
            <h3 className="gov-footer-col-title">🗳️ Elector & Citizen Services</h3>
            <ul className="gov-footer-links">
              <li><Link to="/voters">Citizen Service Portal (Voters)</Link></li>
              <li><Link to="/register">Form 6 — New Voter Registration</Link></li>
              <li><Link to="/voters">Form 6A — Overseas (NRI) Registration</Link></li>
              <li><Link to="/voters">Form 7 — Deletion / Objection</Link></li>
              <li><Link to="/voters">Form 8 — Shifting / Correction / PwD</Link></li>
              <li><Link to="/electoral-roll">Search Name in Electoral Roll</Link></li>
              <li><Link to="/voters">Download Digital e-EPIC</Link></li>
              <li><Link to="/check-request">Track Application / Form Status</Link></li>
              <li><Link to="/voters">Book a Call with BLO</Link></li>
              <li><Link to="/voters">NGSP National Grievance Redressal</Link></li>
              <li><Link to="/voters">Special Summary Revision (SSR 2026)</Link></li>
            </ul>
          </div>

          {/* Column 2 */}
          <div className="gov-footer-col">
            <h3 className="gov-footer-col-title">🚩 Candidates & Political Parties</h3>
            <ul className="gov-footer-links">
              <li><Link to="/suvidha">Suvidha 2.0 Single Window System</Link></li>
              <li><Link to="/suvidha">Online Nomination Filing & Drafts</Link></li>
              <li><Link to="/suvidha">Candidate Affidavit Portal (Form 26)</Link></li>
              <li><Link to="/suvidha">Campaign Permission Applications</Link></li>
              <li><Link to="/suvidha">FIFO Permission Status Tracker</Link></li>
              <li><Link to="/cvigil">cVIGIL Citizen MCC Incident Reporting</Link></li>
              <li><Link to="/encore">Candidate Scrutiny & Form 7A</Link></li>
              <li><Link to="/suvidha">Know Your Candidate (KYC) Search</Link></li>
              <li><Link to="/media-publications">Political Party Registration & Symbols</Link></li>
              <li><Link to="/media-publications">Contribution & Expenditure Reports</Link></li>
            </ul>
          </div>

          {/* Column 3 */}
          <div className="gov-footer-col">
            <h3 className="gov-footer-col-title">📊 Operations, States & ENCORE</h3>
            <ul className="gov-footer-links">
              <li><Link to="/encore">ENCORE Election Management Suite</Link></li>
              <li><Link to="/encore">Two-Hour Poll Day Turnout Trends</Link></li>
              <li><Link to="/encore">EVM & Postal Ballot Round Counting</Link></li>
              <li><Link to="/encore">Constituency Index Card & Verification</Link></li>
              <li><Link to="/ceo-himachal">CEO Himachal Pradesh Portal</Link></li>
              <li><Link to="/ceo-himachal">Voter Saathi Virtual Assistant</Link></li>
              <li><Link to="/ceo-himachal">HP GIS Polling Station Map</Link></li>
              <li><Link to="/workflows">System Workflow Blueprints</Link></li>
              <li><Link to="/blo/login">BLO / Field Verification Login</Link></li>
              <li><Link to="/eci/login">ECI Official Operations Login</Link></li>
            </ul>
          </div>

          {/* Column 4 */}
          <div className="gov-footer-col">
            <h3 className="gov-footer-col-title">🏛️ Commission & Publications</h3>
            <ul className="gov-footer-links">
              <li><Link to="/media-publications">About the Election Commission of India</Link></li>
              <li><Link to="/media-publications">Hon'ble Chief Election Commissioner</Link></li>
              <li><Link to="/media-publications">Compendium of Instructions</Link></li>
              <li><Link to="/media-publications">EVM & VVPAT Manuals & FAQ</Link></li>
              <li><Link to="/media-publications">SVEEP Voter Awareness Campaign</Link></li>
              <li><Link to="/media-publications">Statistical & Narrative Reports</Link></li>
              <li><Link to="/media-publications">Right to Information (RTI)</Link></li>
              <li><Link to="/media-publications">Tenders, Notices & Vacancies</Link></li>
              <li><Link to="/media-publications">International Cooperation (IIIDEM)</Link></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Contact & Legal Section */}
      <div className="gov-footer-address-bar">
        <div className="gov-footer-container gov-footer-address-content">
          <div className="gov-address-box">
            <EciEmblem size={52} />
            <div>
              <strong>Election Commission of India</strong>
              <p>Nirvachan Sadan, Ashoka Road, New Delhi 110001, India</p>
              <p>Email: <code>complaints@eci.gov.in</code> · <code>info@eci.gov.in</code> | EPABX: +91-11-23052205</p>
            </div>
          </div>
          <div className="gov-emergency-box">
            <div className="gov-emergency-item">
              <span className="gov-em-label">Voter Helpline</span>
              <span className="gov-em-val">1950</span>
            </div>
            <div className="gov-emergency-item">
              <span className="gov-em-label">cVIGIL SLA</span>
              <span className="gov-em-val">100 Mins</span>
            </div>
            <div className="gov-emergency-item">
              <span className="gov-em-label">Total Electors</span>
              <span className="gov-em-val">96.8 Cr+</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tricolor Ribbon Bottom */}
      <div className="gov-tricolor-bar" aria-hidden="true"></div>

      {/* Copyright & Compliance */}
      <div className="gov-footer-bottom">
        <div className="gov-footer-container gov-footer-bottom-content">
          <div className="gov-bottom-left">
            <p>
              © 2026 Election Commission of India. Designed & Maintained in accordance with Indian Government Web Guidelines (GIGW) & Digital India Standards.
            </p>
            <p className="gov-last-updated">Last Updated: 31 October 2026 | Version 2.4.0</p>
          </div>
          <div className="gov-bottom-links">
            <span>Website Policies</span>
            <span>Terms & Conditions</span>
            <span>Privacy Policy</span>
            <span>Hyperlink Policy</span>
            <span>Accessibility Statement</span>
            <span>Sitemap</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
