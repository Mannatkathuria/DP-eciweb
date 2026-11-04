import FormWizard from "./FormWizard";
import { AADHAAR_OPTIONS, GENDERS_BINARY, SERVICE_FORCES, SERVICE_RELATIONS } from "./formOptions";

const f = (type, name, label, rest = {}) => ({ type, name, label, ...rest });
const requiredText = (name, label, rest = {}) => f("text", name, label, { required: true, ...rest });
const dateField = (name, label, rest = {}) => f("date", name, label, rest);
const photoField = f("file", "photo", "Recent unsigned passport-size colour photograph", {
  required: true,
  accept: "image/jpeg,image/png",
  maxBytes: 5 * 1024 * 1024,
  hint: "Use a recent 4.5 cm × 3.5 cm colour photograph, frontal full-face view, white background.",
});

const personalSection = [
  {
    title: "Personal details",
    intro: "Enter the applicant's particulars as they appear in official records.",
    fields: [
      requiredText("fullName", "Full name", { wide: true, uppercase: true, maxLength: 100 }),
      requiredText("relativeName", "Relative's name", { maxLength: 100 }),
      f("select", "relationType", "Relation type", { required: true, options: SERVICE_RELATIONS, placeholder: "Select relation" }),
      f("number", "ageYears", "Age (years)", { required: true, min: 0, max: 120, inputMode: "numeric" }),
      f("number", "ageMonths", "Age (months)", { required: true, min: 0, max: 11, inputMode: "numeric" }),
      dateField("dateOfBirth", "Date of birth", { required: true }),
      f("radio", "gender", "Gender", { required: true, options: GENDERS_BINARY, columns: true }),
      f("text", "epicNumber", "EPIC number (if issued)", { maxLength: 10, uppercase: true, hint: "Leave blank if an EPIC has not been issued." }),
    ],
  },
  {
    title: "Aadhaar and contact details",
    fields: [
      f("radio", "aadhaarOption", "Aadhaar details", { required: true, options: AADHAAR_OPTIONS }),
      f("text", "aadhaarNumber", "Aadhaar number", {
        required: true,
        when: (values) => values.aadhaarOption === "have",
        inputMode: "numeric",
        maxLength: 12,
        sensitive: true,
        validate: (value) => value && !/^\d{12}$/.test(value) ? "Enter all 12 digits of the Aadhaar number." : null,
      }),
      f("tel", "mobile", "Mobile number", { inputMode: "numeric", maxLength: 10, hint: "Optional. Enter 10 digits without +91." }),
      f("email", "email", "Email address", { maxLength: 120 }),
      photoField,
    ],
  },
];

const ordinaryResidenceSection = [
  {
    title: "Place of ordinary residence (native place)",
    intro: "Give the complete address where you would ordinarily reside but for the service / posting described in this form.",
    fields: [
      requiredText("house", "House / building / apartment number"),
      requiredText("street", "Street / mohalla"),
      requiredText("locality", "Locality / area"),
      requiredText("townVillage", "Town / village"),
      requiredText("postOffice", "Post office"),
      requiredText("policeStation", "Police station"),
      requiredText("tehsil", "Tehsil / taluqa / mandal"),
      f("text", "pinCode", "PIN code", { required: true, inputMode: "numeric", maxLength: 6, validate: (value) => value && !/^[1-9]\d{5}$/.test(value) ? "Enter a valid six-digit PIN code." : null }),
      requiredText("district", "District"),
      requiredText("state", "State / UT"),
      requiredText("assemblyConstituency", "Assembly constituency", { wide: true, hint: "Enter the constituency number and name, if known." }),
    ],
  },
];

const spouseAndDeclarationSection = [
  {
    title: "Spouse ordinarily residing with the applicant",
    intro: "The spouse may be included on the basis of this declaration only when he or she ordinarily resides with the applicant and is an Indian citizen.",
    fields: [
      f("radio", "includeSpouse", "Do you have a spouse ordinarily residing with you?", {
        required: true,
        options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
        wide: true,
      }),
      f("text", "spouseName", "Spouse's full name", { required: true, when: (v) => v.includeSpouse === "yes", wide: true }),
      f("number", "spouseAgeYears", "Spouse's age (years)", { required: true, when: (v) => v.includeSpouse === "yes", min: 0, max: 120 }),
      f("number", "spouseAgeMonths", "Spouse's age (months)", { required: true, when: (v) => v.includeSpouse === "yes", min: 0, max: 11 }),
      dateField("spouseDateOfBirth", "Spouse's date of birth", { required: true, when: (v) => v.includeSpouse === "yes" }),
      f("checkbox", "spouseCitizenAndResident", "I declare that my spouse ordinarily resides with me and is a citizen of India.", {
        required: true,
        when: (v) => v.includeSpouse === "yes",
        wide: true,
      }),
    ],
  },
  {
    title: "Declaration by the applicant",
    intro: "Read these statements carefully. Service-voter registration is not an additional registration: a person must not be enrolled as an elector at more than one place.",
    fields: [
      f("checkbox", "citizenDeclaration", "I am a citizen of India and, but for my eligible service / posting, I would ordinarily reside at the Indian address entered above.", { required: true, wide: true }),
      f("checkbox", "noOtherRegistration", "Neither I nor the spouse named above (if applicable) is already registered or has applied for registration as an ordinary elector at my present place of posting or in any other constituency.", { required: true, wide: true }),
      f("checkbox", "singleRegistrationAwareness", "I understand that the law prohibits registration as an elector at more than one place, and I consent to deletion of duplicate entries as applicable.", { required: true, wide: true }),
      dateField("signatureDate", "Date of declaration", { required: true }),
    ],
  },
];

const SERVICE_VARIANTS = {
  form2: {
    code: "FORM_2",
    routeCode: "form-2",
    title: "Form 2 – Armed Forces Service Voter",
    intro: "Statement as to place of ordinary residence by a member of the Armed Forces. This form also covers eligible personnel of forces to which the Army Act applies, as specified by the Election Commission.",
    serviceFields: [
      requiredText("serviceNumber", "Service / buckle number"),
      requiredText("rank", "Rank"),
      f("select", "armedForce", "Name of Armed Force", { required: true, options: SERVICE_FORCES.map((value) => ({ value, label: value })) }),
      requiredText("armedForceOther", "Specify the eligible force", { required: true, when: (v) => v.armedForce === "Other eligible force" }),
      requiredText("corpsRegiment", "Service / corps / regiment"),
      f("textarea", "recordOfficeAddress", "Name and address of Record Office", { required: true, wide: true, rows: 3 }),
    ],
    officeLabel: "Record Office / Commandant's Office",
  },
  form2a: {
    code: "FORM_2A",
    routeCode: "form-2a",
    title: "Form 2A – State Armed Police Service Voter",
    intro: "Statement as to place of ordinary residence by a member of an Armed Police Force of a State who is serving outside that State.",
    serviceFields: [
      requiredText("serviceNumber", "Service / buckle number"),
      requiredText("rank", "Rank"),
      requiredText("armedPoliceForce", "Name of State Armed Police Force"),
      f("textarea", "commandantOfficeAddress", "Name and address of the Commandant's Office", { required: true, wide: true, rows: 3 }),
    ],
    officeLabel: "Commandant's Office",
  },
  form3: {
    code: "FORM_3",
    routeCode: "form-3",
    title: "Form 3 – Government of India Employee Posted Abroad",
    intro: "Statement as to place of ordinary residence by a person employed under the Government of India in a post outside India.",
    serviceFields: [
      requiredText("uniqueId", "Unique ID number"),
      f("textarea", "postDescription", "Description of post held outside India", { required: true, wide: true, rows: 3 }),
      f("textarea", "headOfficeAddress", "Address of Head of Office", { required: true, wide: true, rows: 3 }),
    ],
    officeLabel: "Head of Office",
  },
};

const makeInitialValues = () => ({
  fullName: "", relativeName: "", relationType: "", ageYears: "", ageMonths: "", dateOfBirth: "", gender: "", epicNumber: "",
  aadhaarOption: "", aadhaarNumber: "", mobile: "", email: "",
  house: "", street: "", locality: "", townVillage: "", postOffice: "", policeStation: "", tehsil: "", pinCode: "", district: "", state: "", assemblyConstituency: "",
  serviceNumber: "", rank: "", armedForce: "", armedForceOther: "", corpsRegiment: "", recordOfficeAddress: "", armedPoliceForce: "", commandantOfficeAddress: "", uniqueId: "", postDescription: "", headOfficeAddress: "",
  includeSpouse: "no", spouseName: "", spouseAgeYears: "", spouseAgeMonths: "", spouseDateOfBirth: "", spouseCitizenAndResident: false,
  citizenDeclaration: false, noOtherRegistration: false, singleRegistrationAwareness: false, signatureDate: "",
});

export function getServiceVoterConfig(kind) {
  const variant = SERVICE_VARIANTS[kind];
  if (!variant) throw new Error(`Unknown service-voter form: ${kind}`);
  return {
    ...variant,
    endpoint: `/elector-forms/${variant.routeCode}`,
    initialValues: makeInitialValues(),
    steps: [
      { title: "Personal details", sections: () => personalSection },
      { title: "Ordinary residence", sections: () => ordinaryResidenceSection },
      { title: "Service details", sections: () => [{ title: "Service / employment details", fields: variant.serviceFields }] },
      { title: "Spouse and declaration", sections: () => spouseAndDeclarationSection },
    ],
  };
}

export function Form2() {
  return <FormWizard config={getServiceVoterConfig("form2")} />;
}

export function Form2A() {
  return <FormWizard config={getServiceVoterConfig("form2a")} />;
}

export function Form3() {
  return <FormWizard config={getServiceVoterConfig("form3")} />;
}

export default Form2;
