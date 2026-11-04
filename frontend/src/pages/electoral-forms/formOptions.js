// Shared option lists for the additional ECI elector application forms.
// Values follow the service-voter / Form 6A / Form 8 form terminology.

export const SERVICE_RELATIONS = [
  { value: "Father", label: "Father" },
  { value: "Mother", label: "Mother" },
  { value: "Husband", label: "Husband" },
  { value: "Wife", label: "Wife" },
  { value: "Other", label: "Other" },
];

export const RELATIONS_WITH_GUARDIAN = [
  ...SERVICE_RELATIONS,
  { value: "Legal Guardian", label: "Legal guardian" },
];

export const GENDERS_BINARY = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];

export const GENDERS = [
  ...GENDERS_BINARY,
  { value: "Third Gender", label: "Third Gender" },
];

export const AADHAAR_OPTIONS = [
  { value: "have", label: "I can furnish my Aadhaar number" },
  { value: "not-available", label: "I am unable to furnish it because I do not have an Aadhaar number" },
];

export const ADDRESS_PROOF_OPTIONS = [
  { value: "utility-bill", label: "Water / electricity / gas connection bill for that address (at least 1 year)" },
  { value: "aadhaar", label: "Aadhaar card" },
  { value: "bank-passbook", label: "Current passbook of a nationalised / scheduled bank / post office" },
  { value: "passport", label: "Indian passport" },
  { value: "land-records", label: "Revenue Department land-owning records, including Kisan Bahi" },
  { value: "rent-deed", label: "Registered rent lease deed (tenant)" },
  { value: "sale-deed", label: "Registered sale deed (own house)" },
  { value: "other", label: "Any other document (specify below)" },
];

export const ADDRESS_PROOF_HOLDERS = [
  { value: "Self", label: "Self (applicant)" },
  { value: "Parent", label: "Parent" },
  { value: "Spouse", label: "Spouse" },
  { value: "Adult child", label: "Adult child already enrolled at this address" },
];

// These labels intentionally preserve the category names printed on Form 8.
export const DISABILITY_OPTIONS = [
  { value: "Locomotive", label: "Locomotive" },
  { value: "Visual", label: "Visual" },
  { value: "Deaf & Dumb", label: "Deaf & Dumb" },
  { value: "Other", label: "Other (give description)" },
];

export const FORM8_CORRECTION_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "gender", label: "Gender" },
  { value: "dob", label: "Date of birth / Age" },
  { value: "relationType", label: "Relation type" },
  { value: "relationName", label: "Relation name" },
  { value: "address", label: "Address" },
  { value: "mobile", label: "Mobile number" },
  { value: "photo", label: "Photograph" },
];

export const SERVICE_FORCES = [
  "Indian Army",
  "Indian Navy",
  "Indian Air Force",
  "Border Security Force (BSF)",
  "Central Reserve Police Force (CRPF)",
  "Central Industrial Security Force (CISF)",
  "Indo-Tibetan Border Police (ITBP)",
  "Sashastra Seema Bal (SSB)",
  "Assam Rifles",
  "National Security Guard (NSG)",
  "General Reserve Engineer Force / Border Roads Organisation",
  "Other eligible force",
];

export const ABSENCE_REASONS = [
  { value: "Employment", label: "Employment" },
  { value: "Education", label: "Education" },
  { value: "Other", label: "Other (give description)" },
];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];


// Form 6B's alternative documents for an elector who does not have an Aadhaar number.
// Keep the labels aligned with the official ECI Form 6B.
export const AADHAAR_ALTERNATIVE_DOCUMENTS = [
  { value: "mgnrega", label: "MGNREGA Job Card" },
  { value: "bank-passbook", label: "Passbook with photograph issued by Bank / Post Office" },
  { value: "health-insurance-card", label: "Health Insurance Smart Card issued under the scheme of the Ministry of Labour" },
  { value: "driving-licence", label: "Driving License" },
  { value: "pan", label: "PAN Card" },
  { value: "npr-smart-card", label: "Smart Card issued by the Registrar General of India under NPR" },
  { value: "indian-passport", label: "Indian Passport" },
  { value: "pension-document", label: "Pension document with photograph" },
  { value: "service-identity-card", label: "Service Identity Card with photograph issued to employees by Central / State Government, PSUs or Public Limited Companies" },
  { value: "mp-mla-identity-card", label: "Official Identity Card issued to MPs / MLAs / MLCs" },
  { value: "udid-card", label: "Unique Identity ID (UDID) Card issued by the Ministry of Social Justice and Empowerment, Government of India" },
];

export const FORM7_REASONS_FOR_OTHER_ELECTORS = [
  { value: "death", label: "Death" },
  { value: "under-age", label: "Under age" },
  { value: "absent-shifted", label: "Absent / permanently shifted" },
  { value: "already-enrolled", label: "Already enrolled in the electoral roll" },
  { value: "not-indian-citizen", label: "Not an Indian citizen" },
];

export const FORM7_REASONS_FOR_SELF_DELETION = [
  { value: "permanently-shifted", label: "Permanently shifted" },
  { value: "already-enrolled", label: "Already enrolled" },
  { value: "not-indian-citizen", label: "Not an Indian citizen" },
];
