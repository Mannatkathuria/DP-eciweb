import FormWizard from "./FormWizard";
import { AADHAAR_ALTERNATIVE_DOCUMENTS } from "./formOptions";

const f = (type, name, label, rest = {}) => ({ type, name, label, ...rest });
const required = (name, label, rest = {}) => f("text", name, label, { required: true, ...rest });
const pdfOrImage = "application/pdf,image/jpeg,image/png";

const initialValues = {
  electorName: "",
  constituencyName: "",
  epicNumber: "",
  aadhaarOption: "",
  aadhaarNumber: "",
  alternativeDocumentType: "",
  contactEmail: "",
  contactMobile: "",
  place: "",
  applicationDate: "",
  informationConfirmed: false,
};

const identityStep = {
  title: "Elector and electoral-roll details",
  sections: () => [
    {
      title: "Identify your existing electoral-roll entry",
      intro: "Form 6B is for a person whose name is already enrolled in an electoral roll. Enter the details of that existing entry; this is not an application for new voter registration.",
      fields: [
        required("electorName", "Name of elector", { maxLength: 100 }),
        required("constituencyName", "Name of Assembly / Parliamentary Constituency", { maxLength: 120 }),
        required("epicNumber", "EPIC number", {
          uppercase: true,
          maxLength: 10,
          hint: "Enter the 3-letter series followed by 7 digits, for example ABC1234567.",
          validate: (value) => value && !/^[A-Z]{3}\d{7}$/.test(value.trim().toUpperCase())
            ? "Enter a valid EPIC number: three letters followed by seven digits."
            : null,
        }),
      ],
    },
  ],
};

const aadhaarStep = {
  title: "Aadhaar or alternative document",
  sections: (values) => [
    {
      title: "Choose one method of information",
      intro: "The official Form 6B provides two routes: furnish an Aadhaar number, or state that you do not have one and submit a copy of one listed alternative document. Aadhaar submission is voluntary; an elector's name must not be deleted solely because Aadhaar information is not furnished.",
      fields: [
        f("radio", "aadhaarOption", "I am submitting", {
          required: true,
          wide: true,
          options: [
            { value: "aadhaar", label: "My Aadhaar number" },
            { value: "alternative-document", label: "I do not have an Aadhaar number; I am submitting one alternative document listed below" },
          ],
        }),
        f("text", "aadhaarNumber", "Aadhaar number", {
          required: true,
          when: (v) => v.aadhaarOption === "aadhaar",
          sensitive: true,
          inputMode: "numeric",
          maxLength: 12,
          autoComplete: "off",
          hint: "Enter 12 digits without spaces. Do not share this number outside the secure application flow.",
          validate: (value) => value && !/^\d{12}$/.test(value)
            ? "Aadhaar number must contain exactly 12 digits."
            : null,
        }),
        f("select", "alternativeDocumentType", "Alternative document type", {
          required: true,
          when: (v) => v.aadhaarOption === "alternative-document",
          options: AADHAAR_ALTERNATIVE_DOCUMENTS,
          wide: true,
          placeholder: "Select the document you are attaching",
        }),
        f("file", "alternativeDocumentFile", "Copy of the selected alternative document", {
          required: true,
          when: (v) => v.aadhaarOption === "alternative-document",
          accept: pdfOrImage,
          maxBytes: 8 * 1024 * 1024,
          hint: "Attach one legible copy of the same document selected above. Accepted: PDF, JPG or PNG; maximum 8 MB.",
        }),
      ],
    },
  ],
};

const contactStep = {
  title: "Contact and confirmation",
  sections: () => [
    {
      title: "Contact details",
      intro: "The printed Form 6B asks for an email ID / mobile number. These contact fields are optional in this prototype.",
      fields: [
        f("email", "contactEmail", "Email ID", { maxLength: 120 }),
        f("tel", "contactMobile", "Mobile number", { maxLength: 10, inputMode: "numeric" }),
      ],
    },
    {
      title: "Place, date and confirmation",
      fields: [
        required("place", "Place", { maxLength: 100 }),
        f("date", "applicationDate", "Date", { required: true }),
        f("checkbox", "informationConfirmed", "I confirm that the elector details and the Aadhaar / alternative-document information selected above are correct to the best of my knowledge.", {
          required: true,
          wide: true,
        }),
      ],
    },
  ],
};

const config = {
  code: "FORM_6B",
  title: "Form 6B – Aadhaar Information for Electoral-Roll Authentication",
  intro: "Letter of information for an already enrolled elector to provide Aadhaar information or, when the elector does not have Aadhaar, one of the alternative documents listed in the official form.",
  endpoint: "/elector-forms/form-6b",
  initialValues,
  steps: [identityStep, aadhaarStep, contactStep],
};

export default function Form6B() {
  return <FormWizard config={config} />;
}
