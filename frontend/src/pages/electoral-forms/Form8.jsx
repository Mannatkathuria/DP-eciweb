import FormWizard from "./FormWizard";
import {
  AADHAAR_OPTIONS,
  ADDRESS_PROOF_HOLDERS,
  ADDRESS_PROOF_OPTIONS,
  DISABILITY_OPTIONS,
  FORM8_CORRECTION_OPTIONS,
  GENDERS,
  RELATIONS_WITH_GUARDIAN,
} from "./formOptions";

const f = (type, name, label, rest = {}) => ({ type, name, label, ...rest });
const text = (name, label, rest = {}) => f("text", name, label, rest);
const required = (name, label, rest = {}) => text(name, label, { required: true, ...rest });
const date = (name, label, rest = {}) => f("date", name, label, rest);
const proofTypes = "application/pdf,image/jpeg,image/png";

const initialValues = {
  applicantName: "", epicNumber: "", aadhaarOption: "", aadhaarNumber: "",
  mobileSelf: "", mobileRelative: "", emailSelf: "", emailRelative: "",
  applicationType: "",
  house: "", street: "", townVillage: "", postOffice: "", pinCode: "", tehsil: "", district: "", state: "",
  addressProofType: "", addressProofOther: "", addressProofHolder: "Self",
  correctionFields: [], correctedName: "", correctedGender: "", correctedDob: "", correctedRelationType: "", correctedRelationName: "", correctedAddress: "", correctedMobile: "", correctionProofName: "",
  replacementReason: "", destructionReason: "", undertakeReturnIfFound: false, oldEpicWillBeReturned: false,
  disabilityCategories: [], disabilityOther: "", disabilityPercent: "", certificateAttached: "",
  place: "", signatureDate: "", truthConfirmed: false,
};

const identityStep = {
  title: "Applicant details",
  sections: () => [
    {
      title: "Applicant identity",
      intro: "Form 8 is for an elector already enrolled in an electoral roll. Enter the EPIC number associated with the existing entry.",
      fields: [
        required("applicantName", "Name of the applicant", { wide: true, uppercase: true, maxLength: 100 }),
        required("epicNumber", "EPIC number", { uppercase: true, maxLength: 10, hint: "Enter the EPIC number shown on your Voter ID." }),
        f("radio", "aadhaarOption", "Aadhaar details", { required: true, options: AADHAAR_OPTIONS }),
        f("text", "aadhaarNumber", "Aadhaar number", {
          required: true,
          when: (v) => v.aadhaarOption === "have",
          sensitive: true,
          inputMode: "numeric",
          maxLength: 12,
          validate: (value) => value && !/^\d{12}$/.test(value) ? "Enter all 12 digits of the Aadhaar number." : null,
        }),
      ],
    },
    {
      title: "Contact details",
      intro: "Provide your own contact details or those of a parent / other relative, as available.",
      fields: [
        f("tel", "mobileSelf", "Mobile number of self", { maxLength: 10, inputMode: "numeric" }),
        f("tel", "mobileRelative", "Mobile number of father / mother / other relative", { maxLength: 10, inputMode: "numeric" }),
        f("email", "emailSelf", "Email address of self", { maxLength: 120 }),
        f("email", "emailRelative", "Email address of father / mother / other relative", { maxLength: 120 }),
      ],
    },
  ],
};

const addressFields = [
  required("house", "House / building / apartment number"),
  required("street", "Street / area / locality / mohalla / road"),
  required("townVillage", "Town / village"),
  required("postOffice", "Post office"),
  required("pinCode", "PIN code", { inputMode: "numeric", maxLength: 6, validate: (value) => value && !/^[1-9]\d{5}$/.test(value) ? "Enter a valid six-digit PIN code." : null }),
  required("tehsil", "Tehsil / taluqa / mandal"),
  required("district", "District"),
  required("state", "State / UT"),
];

const actionStep = {
  title: "Application request",
  sections: (values) => {
    const sections = [{
      title: "Choose one application type",
      intro: "Select only one of the four requests provided in Form 8. Complete only the section relevant to that request.",
      fields: [f("radio", "applicationType", "I submit this application for", {
        required: true,
        options: [
          { value: "shift", label: "Shifting of residence" },
          { value: "correction", label: "Correction of entries in the existing electoral roll" },
          { value: "replacement", label: "Issue of replacement EPIC without correction" },
          { value: "pwd", label: "Marking as a Person with Disability (PwD)" },
        ],
      })],
    }];

    if (values.applicationType === "shift") {
      sections.push({
        title: "New ordinary residence",
        intro: "Enter the address where you have shifted and are presently staying. The application is made to the ERO for the constituency where this new address is located.",
        fields: [
          ...addressFields,
          f("select", "addressProofType", "Address-proof document", { required: true, options: ADDRESS_PROOF_OPTIONS, wide: true }),
          text("addressProofOther", "Name of other address-proof document", { required: true, when: (v) => v.addressProofType === "other", wide: true }),
          f("select", "addressProofHolder", "Name on the address-proof document", { required: true, options: ADDRESS_PROOF_HOLDERS, wide: true }),
          f("file", "addressProofFile", "Self-attested copy of address proof", {
            required: true, accept: proofTypes,
            hint: "The proof may be in the applicant's name or in the name of an eligible parent / spouse / adult child already enrolled at the same address.",
          }),
          f("checkbox", "oldEpicWillBeReturned", "I will return my old EPIC to the Electoral Registration Officer as required after approval.", { required: true, wide: true }),
        ],
      });
    }

    if (values.applicationType === "correction") {
      const selected = values.correctionFields || [];
      const correctionDescriptors = [
        text("correctedName", "Correct name", { required: true, when: (v) => (v.correctionFields || []).includes("name"), wide: true }),
        f("select", "correctedGender", "Correct gender", { required: true, when: (v) => (v.correctionFields || []).includes("gender"), options: GENDERS }),
        date("correctedDob", "Correct date of birth", { required: true, when: (v) => (v.correctionFields || []).includes("dob") }),
        f("select", "correctedRelationType", "Correct relation type", { required: true, when: (v) => (v.correctionFields || []).includes("relationType"), options: RELATIONS_WITH_GUARDIAN }),
        text("correctedRelationName", "Correct relation name", { required: true, when: (v) => (v.correctionFields || []).includes("relationName"), wide: true }),
        f("textarea", "correctedAddress", "Correct address", { required: true, when: (v) => (v.correctionFields || []).includes("address"), wide: true, rows: 3 }),
        f("tel", "correctedMobile", "Correct mobile number", { required: true, when: (v) => (v.correctionFields || []).includes("mobile"), maxLength: 10, inputMode: "numeric" }),
        f("file", "correctedPhoto", "New recent passport-size photograph", {
          required: true, when: (v) => (v.correctionFields || []).includes("photo"), accept: "image/jpeg,image/png", maxBytes: 5 * 1024 * 1024,
          hint: "Use an unsigned colour photograph with a white background, frontal full-face view (4.5 cm × 3.5 cm).",
        }),
      ];
      sections.push({
        title: "Particulars to be corrected",
        intro: "Select no more than four entries. Attach self-attested documentary proof for the requested correction.",
        fields: [
          f("multi", "correctionFields", "Select the entries to correct (maximum four)", {
            required: true, wide: true, columns: true, options: FORM8_CORRECTION_OPTIONS,
            validate: (value) => Array.isArray(value) && value.length > 4 ? "Form 8 allows a maximum of four corrections in one application." : null,
          }),
          ...correctionDescriptors,
          required("correctionProofName", "Name of documentary proof attached", { wide: true }),
          f("file", "correctionProofFile", "Self-attested documentary proof", { required: true, accept: proofTypes, wide: true }),
          f("checkbox", "oldEpicWillBeReturned", "I will return my old EPIC as required after approval of the correction.", { required: true, wide: true }),
        ],
      });
    }

    if (values.applicationType === "replacement") {
      sections.push({
        title: "Reason for replacement EPIC",
        fields: [
          f("radio", "replacementReason", "My original EPIC is", {
            required: true,
            options: [
              { value: "lost", label: "Lost" },
              { value: "destroyed", label: "Destroyed due to circumstances beyond my control, such as flood, fire or another natural disaster" },
              { value: "mutilated", label: "Mutilated" },
            ],
          }),
          f("text", "destructionReason", "Briefly describe how the EPIC was destroyed", { required: true, when: (v) => v.replacementReason === "destroyed", wide: true }),
          f("file", "lostEpicReport", "Copy of FIR / police report for lost EPIC", {
            required: true, when: (v) => v.replacementReason === "lost", accept: proofTypes,
            hint: "The official form asks for a copy of the FIR / police report when the EPIC is lost.",
          }),
          f("checkbox", "undertakeReturnIfFound", "If my lost EPIC is recovered later, I undertake to return it to the Electoral Registration Officer.", { required: true, when: (v) => v.replacementReason === "lost", wide: true }),
          f("checkbox", "oldEpicWillBeReturned", "I will return the mutilated / old EPIC to the Electoral Registration Officer.", { required: true, when: (v) => v.replacementReason === "mutilated", wide: true }),
        ],
      });
    }

    if (values.applicationType === "pwd") {
      sections.push({
        title: "Person with Disability details",
        fields: [
          f("multi", "disabilityCategories", "Category of disability", { required: true, options: DISABILITY_OPTIONS, columns: true }),
          text("disabilityOther", "Other disability – give description", { required: true, when: (v) => (v.disabilityCategories || []).includes("Other"), wide: true }),
          f("number", "disabilityPercent", "Percentage of disability", { min: 1, max: 100, inputMode: "numeric", validate: (value) => value && (Number(value) < 1 || Number(value) > 100) ? "Enter a percentage between 1 and 100." : null }),
          f("radio", "certificateAttached", "Is a disability certificate attached?", { required: true, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }], columns: true }),
          f("file", "disabilityCertificate", "Disability certificate", { required: true, when: (v) => v.certificateAttached === "yes", accept: proofTypes }),
        ],
      });
    }

    return sections;
  },
  validate: (values) => {
    if (!values.applicationType) return {};
    if (values.applicationType === "correction" && (values.correctionFields || []).length > 4) {
      return { correctionFields: "Form 8 allows a maximum of four corrections in one application." };
    }
    return {};
  },
};

const declarationStep = {
  title: "Declaration and review",
  sections: () => [
    {
      title: "Declaration",
      intro: "False statements or declarations are punishable under Section 31 of the Representation of the People Act, 1950.",
      fields: [
        required("place", "Place"),
        date("signatureDate", "Date", { required: true }),
        f("checkbox", "truthConfirmed", "I declare that I am a citizen of India and that the information and particulars in this application are true to the best of my knowledge and belief.", { required: true, wide: true }),
      ],
    },
  ],
};

const config = {
  code: "FORM_8",
  title: "Form 8 – Shifting, Correction, Replacement EPIC or PwD Marking",
  intro: "Application by an already registered elector to shift residence, correct up to four particulars, obtain a replacement EPIC, or request marking as a Person with Disability.",
  endpoint: "/elector-forms/form-8",
  initialValues,
  steps: [identityStep, actionStep, declarationStep],
};

export default function Form8() {
  return <FormWizard config={config} />;
}
