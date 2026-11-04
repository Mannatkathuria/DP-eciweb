import FormWizard from "./FormWizard";
import { FORM7_REASONS_FOR_OTHER_ELECTORS, FORM7_REASONS_FOR_SELF_DELETION } from "./formOptions";

const f = (type, name, label, rest = {}) => ({ type, name, label, ...rest });
const required = (name, label, rest = {}) => f("text", name, label, { required: true, ...rest });
const proofTypes = "application/pdf,image/jpeg,image/png";

const initialValues = {
  applicantName: "",
  applicantEpic: "",
  constituencyType: "assembly",
  constituencyNumber: "",
  constituencyName: "",
  mobileSelf: "",
  mobileRelative: "",
  applicationType: "",
  reason: "",
  deathCertificateAttached: "",
  personName: "",
  personSurname: "",
  personEpic: "",
  house: "",
  street: "",
  townVillage: "",
  postOffice: "",
  pinCode: "",
  tehsil: "",
  district: "",
  state: "",
  place: "",
  applicationDate: "",
  declarationConfirmed: false,
};

const applicantStep = {
  title: "Applicant details",
  sections: () => [
    {
      title: "Your details as an enrolled elector",
      intro: "The applicant must already be registered in the electoral roll of the constituency in which the objection is made. Provide your own name and EPIC details.",
      fields: [
        required("applicantName", "Name of applicant", { maxLength: 100 }),
        required("applicantEpic", "Applicant's EPIC number", {
          uppercase: true,
          maxLength: 10,
          validate: (value) => value && !/^[A-Z]{3}\d{7}$/.test(value.trim().toUpperCase())
            ? "Enter a valid EPIC number: three letters followed by seven digits."
            : null,
        }),
        f("radio", "constituencyType", "Constituency type", {
          required: true,
          options: [
            { value: "assembly", label: "Assembly Constituency" },
            { value: "parliamentary", label: "Parliamentary Constituency (only for a Union Territory without a Legislative Assembly)" },
          ],
          wide: true,
        }),
        required("constituencyNumber", "Constituency number", { inputMode: "numeric", maxLength: 5 }),
        required("constituencyName", "Constituency name", { maxLength: 120 }),
        f("tel", "mobileSelf", "Mobile number of self", { maxLength: 10, inputMode: "numeric" }),
        f("tel", "mobileRelative", "Mobile number of relative (if using a relative's number)", { maxLength: 10, inputMode: "numeric" }),
      ],
    },
  ],
  validate: (values) => (!values.mobileSelf && !values.mobileRelative)
    ? { mobileSelf: "Enter either your own mobile number or a relative's mobile number." }
    : {},
};

const requestStep = {
  title: "Objection or deletion request",
  sections: (values) => {
    const selfDeletion = values.applicationType === "self-deletion";
    const reasonOptions = selfDeletion ? FORM7_REASONS_FOR_SELF_DELETION : FORM7_REASONS_FOR_OTHER_ELECTORS;
    const sections = [
      {
        title: "Choose one application type",
        fields: [
          f("radio", "applicationType", "I am submitting this Form 7 to", {
            required: true,
            wide: true,
            options: [
              { value: "delete-existing", label: "Request deletion of another person's name already included in the current electoral roll" },
              { value: "object-proposed", label: "Object to the proposed inclusion of another person's name in the electoral roll" },
              { value: "self-deletion", label: "Request deletion of my own name from the electoral roll" },
            ],
          }),
        ],
      },
    ];

    if (values.applicationType) {
      sections.push({
        title: "Reason for the request",
        intro: selfDeletion
          ? "Select the one reason that applies to your request for deletion of your own name."
          : "Select the one reason for objecting to the proposed inclusion or requesting deletion of the person's existing entry. The applicant is responsible for substantiating the reason with relevant information / proof.",
        fields: [
          f("radio", "reason", "Reason", { required: true, options: reasonOptions, wide: true }),
          f("radio", "deathCertificateAttached", "Is the death certificate attached?", {
            required: true,
            when: (v) => v.reason === "death",
            options: [
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ],
            columns: true,
          }),
          f("file", "deathCertificateFile", "Copy of death certificate", {
            required: true,
            when: (v) => v.reason === "death" && v.deathCertificateAttached === "yes",
            accept: proofTypes,
            maxBytes: 8 * 1024 * 1024,
            hint: "Attach a legible copy when you have selected 'Yes'.",
          }),
        ],
      });
    }

    return sections;
  },
};

const personStep = {
  title: "Details of the person concerned",
  sections: (values) => {
    const own = values.applicationType === "self-deletion";
    return [
      {
        title: own ? "Your details in the electoral roll" : "Details of the person against whom the objection is made",
        intro: own
          ? "Enter your own particulars as they appear in the electoral roll."
          : "Enter the particulars of the person whose existing entry is to be deleted or whose proposed inclusion is being challenged.",
        fields: [
          required("personName", own ? "Your name" : "Person's name", { maxLength: 100 }),
          required("personSurname", own ? "Your surname" : "Person's surname", { maxLength: 100 }),
          f("text", "personEpic", "EPIC number of the person (if available)", {
            uppercase: true,
            maxLength: 10,
            validate: (value) => value && !/^[A-Z]{3}\d{7}$/.test(value.trim().toUpperCase())
              ? "Enter a valid EPIC number or leave this field blank if it is unavailable."
              : null,
          }),
        ],
      },
      {
        title: "Address of the person concerned",
        fields: [
          required("house", "House / building / apartment number", { wide: true }),
          required("street", "Street / area / locality / mohalla / road", { wide: true }),
          required("townVillage", "Town / village"),
          required("postOffice", "Post office"),
          required("pinCode", "PIN code", {
            inputMode: "numeric",
            maxLength: 6,
            validate: (value) => value && !/^[1-9]\d{5}$/.test(value)
              ? "Enter a valid six-digit Indian PIN code."
              : null,
          }),
          required("tehsil", "Tehsil / taluka / mandal"),
          required("district", "District"),
          required("state", "State / UT"),
        ],
      },
    ];
  },
};

const declarationStep = {
  title: "Declaration and review",
  sections: () => [
    {
      title: "Declaration",
      intro: "The official Form 7 declaration states that a knowingly false statement or declaration, or one not believed to be true, is punishable under Section 31 of the Representation of the People Act, 1950, with imprisonment up to one year, or fine, or both. The official form also permits the signature or left-hand thumb impression of the elector or, in the specified disability cases, the legal guardian.",
      fields: [
        required("place", "Place", { maxLength: 100 }),
        f("date", "applicationDate", "Date", { required: true }),
        f("checkbox", "declarationConfirmed", "I declare that, to the best of my knowledge and belief, the facts and particulars stated in this application are true, and I understand the legal consequence of making a false declaration.", {
          required: true,
          wide: true,
        }),
      ],
    },
  ],
};

const config = {
  code: "FORM_7",
  title: "Form 7 – Objection to Inclusion / Request for Deletion",
  intro: "Application by an elector already enrolled in the relevant constituency to object to a proposed inclusion, request deletion of another person's existing entry, or request deletion of the applicant's own name.",
  endpoint: "/elector-forms/form-7",
  initialValues,
  steps: [applicantStep, requestStep, personStep, declarationStep],
};

export default function Form7() {
  return <FormWizard config={config} />;
}
