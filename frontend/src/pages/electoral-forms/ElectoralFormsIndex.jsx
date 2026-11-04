import { Link } from "react-router-dom";

const forms = [
  {
    code: "Form 2",
    title: "Armed Forces Service Voter",
    description: "Statement of ordinary residence by a member of the Armed Forces, including eligible forces to which the Army Act applies.",
    path: "/voters/forms/form-2",
    group: "Service voters",
  },
  {
    code: "Form 2A",
    title: "State Armed Police Service Voter",
    description: "For a member of an Armed Police Force of a State serving outside that State.",
    path: "/voters/forms/form-2a",
    group: "Service voters",
  },
  {
    code: "Form 3",
    title: "Government of India Employee Posted Abroad",
    description: "For a person employed under the Government of India in a post outside India.",
    path: "/voters/forms/form-3",
    group: "Service voters",
  },
  {
    code: "Form 6A",
    title: "Overseas Elector Registration",
    description: "For an Indian citizen living abroad who has not acquired citizenship of another country.",
    path: "/voters/forms/form-6a",
    group: "Overseas electors",
  },
  {
    code: "Form 6B",
    title: "Aadhaar Information for Electoral-Roll Authentication",
    description: "For an existing elector to voluntarily provide Aadhaar information or, if they do not have Aadhaar, submit one of the alternative documents listed by ECI.",
    path: "/voters/forms/form-6b",
    group: "Existing electors",
  },
  {
    code: "Form 7",
    title: "Objection or Deletion of Name",
    description: "For an enrolled elector to object to a proposed inclusion, request deletion of another person's existing entry, or request deletion of their own name.",
    path: "/voters/forms/form-7",
    group: "Existing electors",
  },
  {
    code: "Form 8",
    title: "Shifting, Correction, Replacement EPIC or PwD Marking",
    description: "For an elector already enrolled in an electoral roll who needs to shift, correct particulars, replace an EPIC or request PwD marking.",
    path: "/voters/forms/form-8",
    group: "Existing electors",
  },
];

export default function ElectoralFormsIndex() {
  return (
    <main className="dashboard">
      <div className="voter-dashboard-header">
        <div>
          <p className="eyebrow">Election Commission of India · Voter services</p>
          <h1>Electoral applications</h1>
          <p className="hero-description">Choose the application that matches your elector category and the change you need to request.</p>
        </div>
      </div>
      {["Service voters", "Overseas electors", "Existing electors"].map((group) => (
        <section key={group} className="admin-container" style={{ marginBottom: 24 }}>
          <h2>{group}</h2>
          <div className="info-section">
            {forms.filter((form) => form.group === group).map((form) => (
              <article className="info-card" key={form.code}>
                <span className="step-number">{form.code}</span>
                <h3>{form.title}</h3>
                <p>{form.description}</p>
                <p style={{ marginTop: 16 }}><Link className="f6-link" to={form.path}>Open application →</Link></p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
