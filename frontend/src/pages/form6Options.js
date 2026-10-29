// Form 6 option lists shared by the register page and the "Check your request" page.

export const RELATIONS = [
    { value: "Father", label: "Father" },
    { value: "Mother", label: "Mother" },
    { value: "Husband", label: "Husband" },
    { value: "Wife", label: "Wife" },
    { value: "Legal Guardian", label: "Legal guardian (in case of orphan)" },
    { value: "Guru", label: "Guru (in case of Third Gender)" }
];

export const AGE_DOCS = [
    { value: "birth-certificate", label: "Birth certificate issued by competent local body / municipal authority / Registrar of Births & Deaths" },
    { value: "aadhaar", label: "Aadhaar card" },
    { value: "pan", label: "PAN card" },
    { value: "driving-licence", label: "Driving licence" },
    { value: "school-certificate", label: "Certificate of Class X or Class XII issued by CBSE / ICSE / State Education Board, if it contains date of birth" },
    { value: "passport", label: "Indian passport" },
    { value: "other", label: "Any other document for proof of date of birth (none of the above is available)" }
];

export const ADDRESS_DOCS = [
    { value: "utility-bill", label: "Water / electricity / gas connection bill for that address (at least 1 year)" },
    { value: "aadhaar", label: "Aadhaar card" },
    { value: "bank-passbook", label: "Current passbook of nationalised / scheduled bank / post office" },
    { value: "passport", label: "Indian passport" },
    { value: "land-records", label: "Revenue Department's land owning records, including Kisan Bahi" },
    { value: "rent-deed", label: "Registered rent lease deed (in case of tenant)" },
    { value: "sale-deed", label: "Registered sale deed (in case of own house)" },
    { value: "other", label: "Any other document for proof of residence (none of the above is available)" }
];

export const DOC_HOLDERS = [
    { value: "Self", label: "Myself (the applicant)" },
    { value: "Parent", label: "My parent" },
    { value: "Spouse", label: "My spouse" },
    { value: "Adult child", label: "My adult child" }
];

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const formatSize = (bytes) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
