import FormWizard from "./FormWizard";
import { ABSENCE_REASONS, GENDERS, SERVICE_RELATIONS } from "./formOptions";

const f = (type, name, label, rest = {}) => ({ type, name, label, ...rest });
const text = (name, label, rest = {}) => f("text", name, label, rest);
const required = (name, label, rest = {}) => text(name, label, { required: true, ...rest });
const date = (name, label, rest = {}) => f("date", name, label, rest);
const pdfOrImage = "application/pdf,image/jpeg,image/png";

const initialValues = {
  firstName: "", lastName: "", relationType: "", relativeFirstName: "", relativeLastName: "", dateOfBirth: "",
  birthTown: "", birthDistrict: "", birthState: "", gender: "", email: "", mobile: "",
  indiaHouse: "", indiaStreet: "", indiaTownVillage: "", indiaDistrict: "", indiaPinCode: "",
  passportNumber: "", passportIssuePlace: "", passportIssueDate: "", passportExpiryDate: "",
  visaNumber: "", visaIssueDate: "", visaExpiryDate: "", visaType: "", visaAuthority: "",
  absenceReason: "", absenceOther: "", dateAbsent: "",
  foreignHouse: "", foreignStreet: "", foreignTownVillage: "", foreignState: "", foreignCountry: "", foreignZipCode: "",
  citizenshipBasis: "", noOtherCitizenship: false, passportAddressDeclaration: false,
  informCitizenshipChange: false, informForeignAddressChange: false, informReturnToIndia: false,
  noOtherApplication: false, previousRollStatus: "", previousConstituency: "", previousState: "", previousAddress: "", previousEpic: "",
  epicStatus: "", place: "", signatureDate: "",
};

const steps = [
  {
    title: "Personal details",
    sections: () => [
      {
        title: "Applicant details",
        intro: "Form 6A is for an Indian citizen who is ordinarily resident in India but is temporarily absent because of employment, education or another reason, and has not acquired citizenship of another country.",
        fields: [
          required("firstName", "First name", { uppercase: true, maxLength: 60 }),
          required("lastName", "Last name", { uppercase: true, maxLength: 60 }),
          f("select", "relationType", "Relative type", { required: true, options: SERVICE_RELATIONS }),
          required("relativeFirstName", "Relative's first name", { uppercase: true }),
          required("relativeLastName", "Relative's last name", { uppercase: true }),
          date("dateOfBirth", "Date of birth", { required: true }),
          required("birthTown", "Place of birth – village / town"),
          required("birthDistrict", "Place of birth – district"),
          required("birthState", "Place of birth – State / UT"),
          f("radio", "gender", "Gender", { required: true, options: GENDERS, columns: true }),
          f("email", "email", "Email address", { maxLength: 120, hint: "Optional." }),
          f("tel", "mobile", "Mobile number", { maxLength: 10, inputMode: "numeric", hint: "Optional. Enter 10 digits without +91." }),
          f("file", "photo", "Recent passport-size photograph", {
            required: true,
            accept: "image/jpeg,image/png",
            maxBytes: 5 * 1024 * 1024,
            hint: "The Form 6A specifies a recent 3.5 cm × 3.5 cm photograph showing a frontal view of the full face.",
          }),
        ],
      },
    ],
  },
  {
    title: "Indian passport and visa",
    sections: () => [
      {
        title: "Address in India as mentioned in the original passport",
        fields: [
          required("indiaHouse", "House number"),
          required("indiaStreet", "Street / area / locality"),
          required("indiaTownVillage", "Town / village"),
          required("indiaDistrict", "District"),
          required("indiaPinCode", "PIN code", { inputMode: "numeric", maxLength: 6, validate: (value) => value && !/^[1-9]\d{5}$/.test(value) ? "Enter a valid six-digit Indian PIN code." : null }),
        ],
      },
      {
        title: "Current Indian passport",
        fields: [
          required("passportNumber", "Passport number", { uppercase: true, sensitive: true, maxLength: 20 }),
          required("passportIssuePlace", "Place of issue"),
          date("passportIssueDate", "Date of issue", { required: true }),
          date("passportExpiryDate", "Date of expiry", {
            required: true,
            validate: (value, values) => value && values.passportIssueDate && value <= values.passportIssueDate ? "Passport expiry must be after its issue date." : null,
          }),
          f("file", "passportPages", "Passport pages containing photograph, Indian address and applicant particulars", {
            required: true, accept: pdfOrImage, maxBytes: 8 * 1024 * 1024,
            hint: "Attach the relevant pages of the passport. The official form asks for self-attested copies when sent by post.",
          }),
        ],
      },
      {
        title: "Visa of the country of current residence",
        fields: [
          required("visaNumber", "Visa number", { maxLength: 40 }),
          date("visaIssueDate", "Visa date of issue", { required: true }),
          date("visaExpiryDate", "Visa date of expiry", {
            required: true,
            validate: (value, values) => {
              if (!value) return null;
              if (values.visaIssueDate && value <= values.visaIssueDate) return "Visa expiry must be after its issue date.";
              if (value < new Date().toISOString().slice(0, 10)) return "The current visa must be valid on the date of application.";
              return null;
            },
          }),
          required("visaType", "Type of visa"),
          required("visaAuthority", "Name of issuing authority"),
          f("file", "visaEndorsement", "Copy of current valid visa endorsement", {
            required: true, accept: pdfOrImage, maxBytes: 8 * 1024 * 1024,
            hint: "Attach a copy of the page showing the valid visa endorsement.",
          }),
        ],
      },
    ],
  },
  {
    title: "Absence and overseas address",
    sections: () => [
      {
        title: "Reason for absence from ordinary residence in India",
        fields: [
          f("radio", "absenceReason", "Reason for being absent", { required: true, options: ABSENCE_REASONS, columns: true }),
          f("text", "absenceOther", "Describe the other reason", { required: true, when: (v) => v.absenceReason === "Other", wide: true }),
          date("dateAbsent", "Date from which you have been absent from ordinary residence in India", { required: true }),
        ],
      },
      {
        title: "Full current address outside India",
        fields: [
          required("foreignHouse", "House number"),
          required("foreignStreet", "Street / area / locality"),
          required("foreignTownVillage", "Town / village"),
          required("foreignState", "State / province / region"),
          required("foreignCountry", "Country"),
          text("foreignZipCode", "ZIP / postal code", { maxLength: 20 }),
        ],
      },
    ],
  },
  {
    title: "Declaration",
    sections: () => [
      {
        title: "Citizenship and residence declarations",
        intro: "The declarations below follow Form 6A. Do not confirm a statement that is not true.",
        fields: [
          f("radio", "citizenshipBasis", "I am an Indian citizen by", { required: true, options: [
            { value: "Birth", label: "Birth" }, { value: "Domicile", label: "Domicile" }, { value: "Naturalisation", label: "Naturalisation" },
          ], columns: true }),
          f("checkbox", "noOtherCitizenship", "I have not acquired citizenship of any other country.", { required: true, wide: true }),
          f("checkbox", "passportAddressDeclaration", "But for my absence for the reason stated above, I would ordinarily reside at the address in India reproduced from my original passport.", { required: true, wide: true }),
          f("checkbox", "informCitizenshipChange", "I undertake to inform the Electoral Registration Officer through the Indian Mission if I renounce Indian citizenship or acquire citizenship of another country.", { required: true, wide: true }),
          f("checkbox", "informForeignAddressChange", "I undertake to inform the Electoral Registration Officer through the Indian Mission of any change in my address in the country of current residence.", { required: true, wide: true }),
          f("checkbox", "informReturnToIndia", "If I return to India and become ordinarily resident there, I will immediately inform the Electoral Registration Officer of the concerned constituency.", { required: true, wide: true }),
          f("checkbox", "noOtherApplication", "I have not applied for inclusion of my name in the electoral roll of any other constituency.", { required: true, wide: true }),
        ],
      },
      {
        title: "Previous electoral-roll entry and EPIC status",
        fields: [
          f("radio", "previousRollStatus", "Has your name ever been included in an Indian electoral roll?", {
            required: true,
            options: [
              { value: "not-included", label: "No, my name has not been included in this or any other constituency." },
              { value: "may-be-included", label: "It may have been included in an earlier constituency; I request deletion / transposition as appropriate." },
            ],
          }),
          text("previousConstituency", "Earlier constituency", { required: true, when: (v) => v.previousRollStatus === "may-be-included" }),
          text("previousState", "Earlier State / UT", { required: true, when: (v) => v.previousRollStatus === "may-be-included" }),
          f("textarea", "previousAddress", "Full address of earlier place of ordinary residence", { required: true, when: (v) => v.previousRollStatus === "may-be-included", wide: true }),
          text("previousEpic", "Earlier EPIC number, if issued", { when: (v) => v.previousRollStatus === "may-be-included", maxLength: 10, uppercase: true }),
          f("radio", "epicStatus", "EPIC status in India", {
            required: true,
            options: [
              { value: "not-issued", label: "I have not been issued an EPIC in India." },
              { value: "issued", label: "I have been issued an EPIC and am enclosing it for cancellation." },
            ],
          }),
          f("file", "oldEpicCopy", "Copy of previously issued EPIC", {
            required: true,
            when: (v) => v.epicStatus === "issued",
            accept: pdfOrImage,
            hint: "Attach the EPIC copy that accompanies this application for cancellation.",
          }),
        ],
      },
      {
        title: "Signing",
        fields: [
          required("place", "Place of signing"),
          date("signatureDate", "Date", { required: true }),
          f("checkbox", "truthConfirmed", "I declare that the information supplied in this application is true to the best of my knowledge and belief. I understand that a false declaration is punishable under Section 31 of the Representation of the People Act, 1950.", { required: true, wide: true }),
        ],
      },
    ],
  },
];

const config = {
  code: "FORM_6A",
  title: "Form 6A – Overseas Elector Registration",
  intro: "Application for inclusion of the name of an overseas elector in the electoral roll of the Indian constituency corresponding to the address in the original Indian passport.",
  endpoint: "/elector-forms/form-6a",
  initialValues,
  steps,
};

export default function Form6A() {
  return <FormWizard config={config} />;
}
