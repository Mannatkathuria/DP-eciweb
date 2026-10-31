import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { PROOF_TYPES, PROOF_MAX_BYTES, readProofDocument } from "../proofDocument";
import "./Portal.css";
import "./Register.css";
import GovHeader from "../components/GovHeader";
import GovFooter from "../components/GovFooter";
import { RELATIONS, AGE_DOCS, ADDRESS_DOCS, DOC_HOLDERS, MONTHS, formatSize } from "./form6Options";

/*
 * Form 6 (Application Form for New Voters), split into stages.
 *
 * Every field is sent to POST /auth/register as { form6, documents } (see buildPayload) and is
 * validated again and stored by the backend (backend/src/utils/form6.js). Nothing is saved to the
 * browser's storage: the form lives in memory while the page is open, until it is submitted.
 */

const STEPS = [
    { key: "name", title: "Name and photograph" },
    { key: "relative", title: "Relative and contact details" },
    { key: "aadhaar", title: "Aadhaar and gender" },
    { key: "dob", title: "Date of birth and age proof" },
    { key: "address", title: "Ordinary residence and address proof" },
    { key: "other", title: "Disability and family member" },
    { key: "declaration", title: "Declaration" },
    { key: "review", title: "Review and submit" }
];


const GENDERS = [
    { value: "Male", label: "Male" },
    { value: "Female", label: "Female" },
    { value: "Third Gender", label: "Third Gender" }
];




const DISABILITIES = [
    { value: "Locomotive", label: "Locomotive" },
    { value: "Visual", label: "Visual" },
    { value: "Deaf & Dumb", label: "Deaf & Dumb" }
];

// The 22 languages of the Eighth Schedule. Names are shown in English; the placeholder is an example
// in the language's usual script (lang = BCP 47 code, so the browser picks a suitable font / keyboard).
const OFFICIAL_LANGUAGES = [
    { value: "Assamese", lang: "as", placeholder: "উদাহৰণ: আপোনাৰ নাম ইয়াত লিখক" },
    { value: "Bengali", lang: "bn", placeholder: "উদাহরণ: এখানে আপনার নাম লিখুন" },
    { value: "Bodo", lang: "brx", placeholder: "बर (देवनागरी)" },
    { value: "Dogri", lang: "doi", placeholder: "उदाहरण: अपना नां इत्थें लिखो" },
    { value: "Gujarati", lang: "gu", placeholder: "ઉદાહરણ: તમારું નામ અહીં લખો" },
    { value: "Hindi", lang: "hi", placeholder: "उदाहरण: अपना नाम यहाँ लिखें" },
    { value: "Kannada", lang: "kn", placeholder: "ಉದಾಹರಣೆ: ನಿಮ್ಮ ಹೆಸರನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ" },
    { value: "Kashmiri", lang: "ks", placeholder: "کٲشُر", dir: "rtl" },
    { value: "Konkani", lang: "kok", placeholder: "उदाहरण: तुमचें नांव हांगा बरयात" },
    { value: "Maithili", lang: "mai", placeholder: "उदाहरण: अपन नाम एतय लिखू" },
    { value: "Malayalam", lang: "ml", placeholder: "ഉദാഹരണം: നിങ്ങളുടെ പേര് ഇവിടെ എഴുതുക" },
    { value: "Manipuri", lang: "mni-Mtei", placeholder: "ꯃꯩꯇꯩ ꯃꯌꯦꯛ" },
    { value: "Marathi", lang: "mr", placeholder: "उदाहरण: तुमचे नाव येथे लिहा" },
    { value: "Nepali", lang: "ne", placeholder: "उदाहरण: आफ्नो नाम यहाँ लेख्नुहोस्" },
    { value: "Odia", lang: "or", placeholder: "ଉଦାହରଣ: ଆପଣଙ୍କ ନାମ ଏଠାରେ ଲେଖନ୍ତୁ" },
    { value: "Punjabi", lang: "pa", placeholder: "ਉਦਾਹਰਨ: ਆਪਣਾ ਨਾਮ ਇੱਥੇ ਲਿਖੋ" },
    { value: "Sanskrit", lang: "sa", placeholder: "उदाहरणम्: अत्र स्वनाम लिखतु" },
    { value: "Santali", lang: "sat", placeholder: "ᱥᱟᱱᱛᱟᱲᱤ" },
    { value: "Sindhi", lang: "sd", placeholder: "مثال: پنهنجو نالو هتي لکو", dir: "rtl" },
    { value: "Tamil", lang: "ta", placeholder: "எடுத்துக்காட்டு: உங்கள் பெயரை இங்கே எழுதவும்" },
    { value: "Telugu", lang: "te", placeholder: "ఉదాహరణ: మీ పేరు ఇక్కడ రాయండి" },
    { value: "Urdu", lang: "ur", placeholder: "مثال: اپنا نام یہاں لکھیں", dir: "rtl" }
];


const PHOTO_TYPES = ["image/jpeg", "image/png"];
const MAX_MB = PROOF_MAX_BYTES / (1024 * 1024);
const ADDRESS_MAX = 300; // backend limit for the combined address text

const emptyForm = {
    olLanguage: "", relLanguage: "", olFirst: "", olSurname: "", enFirst: "", enSurname: "",
    relation: "", relOlName: "", relEnName: "",
    mobile: "", mobileOf: "", email: "", emailOf: "",
    aadhaarOption: "", aadhaarNumber: "", gender: "",
    dobDay: "", dobMonth: "", dobYear: "", ageDocType: "", ageDocOther: "",
    house: "", street: "", town: "", postOffice: "", pinCode: "", tehsil: "",
    state: "", district: "", assemblyConstituency: "",
    addressDocType: "", addressDocOther: "", addressDocHolder: "Self",
    disabilities: [], disabilityOther: "", disabilityPercent: "", disabilityCertificate: "",
    familyName: "", familyRelation: "", familyEpic: "",
    birthTown: "", birthDistrict: "", birthState: "",
    residentMonth: "", residentYear: "", firstTime: false, ageDeclaration: false, truthConfirmed: false,
    place: ""
};
const emptyFiles = { photo: null, ageProof: null, addressProof: null };

// ---- input helpers ------------------------------------------------------------------------

/** English BLOCK LETTERS: only a-z change, so length (and the cursor position) stays the same. */
const toBlockLetters = (value) => value.replace(/[a-z]/g, (c) => c.toUpperCase());
const digitsOnly = (value, max) => value.replace(/\D/g, "").slice(0, max);
const clean = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

const ENGLISH_NAME = /^[A-Z][A-Z .'-]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE = /^[6-9]\d{9}$/;
const PIN_CODE = /^[1-9]\d{5}$/; // same rule as the backend
const EPIC = /^[A-Z]{3}\d{7}$/;

// Aadhaar: only the length (12 digits) is checked; the number is not verified.

const parseDob = (day, month, year) => {
    if (!day || !month || !year) return { error: "Enter your date of birth as DD / MM / YYYY." };
    if (year.length !== 4) return { error: "Enter the year with four digits, for example 2006." };
    const d = Number(day), m = Number(month), y = Number(year);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (m < 1 || m > 12 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        return { error: "This date does not exist. Check the day and month." };
    }
    if (y < 1900) return { error: "Enter a year from 1900 onwards." };
    if (date > new Date()) return { error: "Date of birth cannot be in the future." };
    return { date, iso: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` };
};

const englishName = (form) => [clean(form.enFirst), clean(form.enSurname)].filter(Boolean).join(" ");

/** The Form 6 address lines, joined into the single address field the backend stores. */
const combinedAddress = (form) => [
    clean(form.house), clean(form.street), clean(form.town),
    form.postOffice.trim() && `Post Office: ${clean(form.postOffice)}`,
    form.tehsil.trim() && `Tehsil: ${clean(form.tehsil)}`
].filter(Boolean).join(", ");

// ---- validation, one function per stage -----------------------------------------------------

const nameRules = (value, label, required) => {
    const v = clean(value);
    if (!v) return required ? `Enter ${label}.` : null;
    if (!ENGLISH_NAME.test(v)) return `${label[0].toUpperCase()}${label.slice(1)} can contain English letters, spaces, full stops, hyphens and apostrophes only.`;
    if (v.length > 60) return "Keep this under 60 characters.";
    return null;
};

const VALIDATORS = {
    name: (f, files) => ({
        enFirst: nameRules(f.enFirst, "your first name in English", true),
        enSurname: nameRules(f.enSurname, "the surname in English", false),
        olFirst: clean(f.olFirst).length > 60 ? "Keep this under 60 characters." : null,
        photo: files.photo ? null : "Upload a recent passport-size colour photograph."
    }),
    relative: (f) => ({
        relation: f.relation ? null : "Choose how this person is related to you.",
        relOlName: clean(f.relOlName).length > 120 ? "Keep this under 120 characters." : null, // optional
        relEnName: nameRules(f.relEnName, "the relative's name and surname in English", true),
        mobile: f.mobile && !MOBILE.test(f.mobile) ? "Enter a 10-digit mobile number starting with 6, 7, 8 or 9." : null,
        email: f.email.trim() && !EMAIL.test(f.email.trim()) ? "Enter a valid email address, for example name@example.com." : null,
        // A choice without a number/email is simply not sent (see buildPayload).
        mobileOf: f.mobile && !f.mobileOf ? "Choose whose mobile number this is." : null,
        emailOf: f.email.trim() && !f.emailOf ? "Choose whose email address this is." : null
    }),
    aadhaar: (f) => ({
        aadhaarOption: f.aadhaarOption ? null : "Choose one of the two Aadhaar options.",
        aadhaarNumber: f.aadhaarOption !== "have" ? null
            : !f.aadhaarNumber ? "Enter your 12-digit Aadhaar number."
                : f.aadhaarNumber.length !== 12 ? `Aadhaar number must have 12 digits (you entered ${f.aadhaarNumber.length}).` : null,
        gender: f.gender ? null : "Choose your gender."
    }),
    dob: (f, files) => ({
        dob: parseDob(f.dobDay, f.dobMonth, f.dobYear).error || null,
        ageDocType: f.ageDocType ? null : "Choose the document you are attaching as proof of date of birth.",
        ageDocOther: f.ageDocType === "other" && !clean(f.ageDocOther) ? "Name the document you are attaching." : null,
        ageProof: files.ageProof ? null : "Attach a copy of the age-proof document."
    }),
    address: (f, files, geo) => {
        const errors = {
            town: clean(f.town) ? null : "Enter your town or village.",
            postOffice: clean(f.postOffice) ? null : "Enter your post office.",
            pinCode: !f.pinCode ? "Enter your PIN code."
                : f.pinCode.length !== 6 ? `PIN code must have 6 digits (you entered ${f.pinCode.length}).`
                    : !PIN_CODE.test(f.pinCode) ? "PIN code cannot start with 0." : null,
            tehsil: clean(f.tehsil) ? null : "Enter your tehsil / taluqa / mandal.",
            state: f.state ? null : "Select your State / UT.",
            district: f.district ? null : "Select your district.",
            // form.assemblyConstituency holds the ECI identifier ("<state code>-<number>"); it must be
            // one of the options offered for the chosen district.
            assemblyConstituency: geo.constituencyOptions.length === 0 && f.district
                ? "No constituency is listed for this State/UT, so this form cannot be submitted for it yet."
                : !f.assemblyConstituency ? `Select your ${geo.constituencyLabel.toLowerCase()}.`
                    : !geo.constituencyOptions.some((a) => a.id === f.assemblyConstituency) ? "Select a constituency from the list for this district." : null,
            addressDocType: f.addressDocType ? null : "Choose the document you are attaching as proof of residence.",
            addressDocOther: f.addressDocType === "other" && !clean(f.addressDocOther) ? "Name the document you are attaching." : null,
            addressProof: files.addressProof ? null : "Attach a copy of the address-proof document."
        };
        const address = combinedAddress(f);
        if (!errors.town && address.length > ADDRESS_MAX) {
            errors.street = `The address lines together must be ${ADDRESS_MAX} characters or fewer (now ${address.length}). Shorten them.`;
        }
        return errors;
    },
    other: (f) => {
        const hasDisability = f.disabilities.length > 0 || clean(f.disabilityOther);
        const pct = f.disabilityPercent;
        return {
            disabilityPercent: hasDisability && pct && (Number(pct) < 1 || Number(pct) > 100) ? "Enter a percentage between 1 and 100." : null,
            familyEpic: f.familyEpic && !EPIC.test(f.familyEpic) ? "EPIC number is 3 letters followed by 7 digits, for example ABC1234567." : null,
            familyName: (f.familyRelation.trim() || f.familyEpic) && !clean(f.familyName) ? "Enter the family member's name, or clear this section." : null
        };
    },
    declaration: (f) => {
        const dob = parseDob(f.dobDay, f.dobMonth, f.dobYear);
        const now = new Date();
        let residentSince = null;
        if (!f.residentMonth || !f.residentYear) residentSince = "Enter the month and year since when you have lived at this address.";
        else if (f.residentYear.length !== 4) residentSince = "Enter the year with four digits.";
        else {
            const since = Number(f.residentYear) * 12 + Number(f.residentMonth) - 1;
            if (since > now.getFullYear() * 12 + now.getMonth()) residentSince = "This month is in the future.";
            else if (dob.date && since < dob.date.getUTCFullYear() * 12 + dob.date.getUTCMonth()) residentSince = "This is before your date of birth.";
        }
        return {
            birthTown: clean(f.birthTown) ? null : "Enter your village or town of birth.",
            birthDistrict: f.birthDistrict ? null : "Select your district of birth.",
            birthState: f.birthState ? null : "Select your State / UT of birth.",
            residentSince,
            firstTime: f.firstTime ? null : "Confirm this declaration to apply with Form 6.",
            ageDeclaration: f.ageDocType === "other" && !f.ageDeclaration ? "Confirm this declaration, because you attached another document as age proof." : null,
            place: clean(f.place) ? null : "Enter the place where you are filling in this form.",
            truthConfirmed: f.truthConfirmed ? null : "Confirm that you have read and accept the declaration."
        };
    }
};

const errorsFor = (stepKey, form, files, geo) =>
    Object.fromEntries(Object.entries(VALIDATORS[stepKey]?.(form, files, geo) || {}).filter(([, v]) => v));

// Backend field names (utils/form6.js) -> [stage, form field], to show server errors in place.
const SERVER_FIELDS = {
    "applicant.officialLanguage.first": ["name", "olFirst"], "applicant.english.first": ["name", "enFirst"],
    "applicant.english.surname": ["name", "enSurname"], "documents.photo": ["name", "photo"],
    "relative.relation": ["relative", "relation"], "relative.officialLanguageName": ["relative", "relOlName"],
    "relative.englishName": ["relative", "relEnName"], "contact.mobile": ["relative", "mobile"], "contact.email": ["relative", "email"],
    "contact.mobileOf": ["relative", "mobileOf"], "contact.emailOf": ["relative", "emailOf"],
    "aadhaar.option": ["aadhaar", "aadhaarOption"], "aadhaar.number": ["aadhaar", "aadhaarNumber"], gender: ["aadhaar", "gender"],
    dateOfBirth: ["dob", "dob"], "ageProof.type": ["dob", "ageDocType"], "ageProof.otherName": ["dob", "ageDocOther"], "documents.ageProof": ["dob", "ageProof"],
    "address.house": ["address", "house"], "address.street": ["address", "street"], "address.town": ["address", "town"],
    "address.postOffice": ["address", "postOffice"], "address.pinCode": ["address", "pinCode"], "address.tehsil": ["address", "tehsil"],
    "address.assemblyConstituency": ["address", "assemblyConstituency"], "addressProof.type": ["address", "addressDocType"],
    "addressProof.otherName": ["address", "addressDocOther"], "documents.addressProof": ["address", "addressProof"],
    "disability.percentage": ["other", "disabilityPercent"], "familyMember.name": ["other", "familyName"], "familyMember.epic": ["other", "familyEpic"],
    "declaration.placeOfBirth.town": ["declaration", "birthTown"], "declaration.placeOfBirth.district": ["declaration", "birthDistrict"],
    "declaration.placeOfBirth.state": ["declaration", "birthState"], "declaration.residentSince": ["declaration", "residentSince"],
    "declaration.firstTimeApplicant": ["declaration", "firstTime"], "declaration.noListedAgeProof": ["declaration", "ageDeclaration"],
    "declaration.confirmed": ["declaration", "truthConfirmed"], "declaration.place": ["declaration", "place"]
};

// Fields whose ids differ from their key (grouped inputs).
const FIELD_ELEMENT = { dob: "f6-dobDay", residentSince: "f6-residentMonth" };
const focusField = (key) => {
    const el = document.getElementById(FIELD_ELEMENT[key] || `f6-${key}`);
    if (el) { el.focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
};

// ---- small building blocks ------------------------------------------------------------------

const describedBy = (id, hint, error) => [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

function FieldShell({ id, label, required, hint, error, wide, children }) {
    return (
        <div className={`f6-field${wide ? " f6-wide" : ""}`}>
            <label htmlFor={id}>
                {label}
                {required ? <span className="f6-req" aria-hidden="true"> *</span> : <span className="f6-opt"> (optional)</span>}
            </label>
            {children}
            {hint && <p id={`${id}-hint`} className="f6-hint">{hint}</p>}
            {error && <p id={`${id}-error`} className="f6-error" role="alert">{error}</p>}
        </div>
    );
}

/** Text input. `block` = English BLOCK LETTERS (uppercased as typed, cursor kept); `digits` = numbers only. */
function TextField({ name, label, value, onChange, required, hint, error, wide, block, digits, ...inputProps }) {
    const id = `f6-${name}`;
    const ref = useRef(null);
    const selection = useRef(null);
    useLayoutEffect(() => {
        if (selection.current && ref.current === document.activeElement) {
            ref.current.setSelectionRange(...selection.current);
        }
        selection.current = null;
    }, [value]);

    const handle = (event) => {
        const raw = event.target.value;
        if (block) {
            selection.current = [event.target.selectionStart, event.target.selectionEnd];
            onChange(toBlockLetters(raw));
        } else if (digits) {
            onChange(digitsOnly(raw, digits));
        } else {
            onChange(raw);
        }
    };

    return (
        <FieldShell id={id} label={label} required={required} hint={hint} error={error} wide={wide}>
            <input ref={ref} id={id} name={name} value={value} onChange={handle}
                aria-required={required || undefined} aria-invalid={error ? "true" : undefined}
                aria-describedby={describedBy(id, hint, error)}
                {...(block ? { autoCapitalize: "characters", spellCheck: false } : {})}
                {...(digits ? { inputMode: "numeric", autoComplete: "off" } : {})}
                {...inputProps} />
        </FieldShell>
    );
}

function SelectField({ name, label, value, onChange, options, placeholder, required, hint, error, disabled, wide }) {
    const id = `f6-${name}`;
    return (
        <FieldShell id={id} label={label} required={required} hint={hint} error={error} wide={wide}>
            <select id={id} name={name} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
                aria-required={required || undefined} aria-invalid={error ? "true" : undefined}
                aria-describedby={describedBy(id, hint, error)}>
                <option value="">{placeholder}</option>
                {options.map((o) => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
            </select>
        </FieldShell>
    );
}

/** Radio group; the first radio carries the field id so validation can focus it. */
function ChoiceGroup({ name, legend, options, value, onChange, required, hint, error, columns }) {
    const id = `f6-${name}`;
    return (
        <fieldset className="f6-field f6-wide f6-choice" aria-invalid={error ? "true" : undefined}
            aria-describedby={describedBy(id, hint, error)}>
            <legend>
                {legend}
                {required ? <span className="f6-req" aria-hidden="true"> *</span> : <span className="f6-opt"> (optional)</span>}
            </legend>
            {hint && <p id={`${id}-hint`} className="f6-hint">{hint}</p>}
            <div className={`f6-options${columns ? " f6-options-cols" : ""}`}>
                {options.map((o, i) => (
                    <label key={o.value} className={`f6-option${value === o.value ? " is-selected" : ""}`}>
                        <input type="radio" id={i === 0 ? id : undefined} name={name} value={o.value}
                            checked={value === o.value} onChange={() => onChange(o.value)} required={required && i === 0} />
                        <span>{o.label}</span>
                    </label>
                ))}
            </div>
            {error && <p id={`${id}-error`} className="f6-error" role="alert">{error}</p>}
        </fieldset>
    );
}

function CheckField({ name, checked, onChange, required, error, children }) {
    const id = `f6-${name}`;
    return (
        <div className="f6-field f6-wide">
            <label className={`f6-check${checked ? " is-selected" : ""}`} htmlFor={id}>
                <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)}
                    aria-required={required || undefined} aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? `${id}-error` : undefined} />
                <span>{children}{required && <span className="f6-req" aria-hidden="true"> *</span>}</span>
            </label>
            {error && <p id={`${id}-error`} className="f6-error" role="alert">{error}</p>}
        </div>
    );
}

// First bytes of each accepted image type, so a renamed file is refused.
const SIGNATURES = {
    "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    "image/png": (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
    "image/webp": (b) => [0x52, 0x49, 0x46, 0x46].every((x, i) => b[i] === x) && [0x57, 0x45, 0x42, 0x50].every((x, i) => b[8 + i] === x)
};
const TYPE_LABELS = { "image/jpeg": "JPG / JPEG", "image/png": "PNG", "image/webp": "WebP" };


/** One upload control: purpose, formats, limit, preview, replace and remove. The file stays in memory. */
function FileField({ name, label, purpose, types, value, onChange, required, error, note }) {
    const id = `f6-${name}`;
    const [localError, setLocalError] = useState("");
    const [reading, setReading] = useState(false);
    const formats = types.map((t) => TYPE_LABELS[t]).join(", ");
    const shownError = localError || error;

    const choose = async (event) => {
        const input = event.target;
        const file = input.files?.[0];
        input.value = ""; // lets the same file be chosen again after a removal
        if (!file) return;
        setLocalError("");
        if (!types.includes(file.type)) { setLocalError(`This file type is not accepted. Upload ${formats}.`); return; }
        if (file.size > PROOF_MAX_BYTES) { setLocalError(`This file is ${formatSize(file.size)}. The limit is ${MAX_MB} MB.`); return; }
        setReading(true);
        try {
            const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
            if (!SIGNATURES[file.type](head)) { setLocalError("This file is not a real image of the type its name says. Choose another file."); return; }
            const dataUrl = await readProofDocument(file);
            onChange({ dataUrl, fileName: file.name, size: file.size });
        } catch (err) {
            setLocalError(err.message || "The file could not be read. Choose it again.");
        } finally {
            setReading(false);
        }
    };

    return (
        <div className="f6-field f6-wide">
            <span className="f6-label" id={`${id}-label`}>
                {label}
                {required ? <span className="f6-req" aria-hidden="true"> *</span> : <span className="f6-opt"> (optional)</span>}
            </span>
            {purpose && <div className="f6-hint f6-purpose">{purpose}</div>}
            <div className={`f6-upload${shownError ? " has-error" : ""}`}>
                {value ? (
                    <div className="f6-upload-file">
                        <img src={value.dataUrl} alt={`Preview of ${label}`} className="f6-upload-preview" />
                        <div>
                            <strong className="f6-upload-name">{value.fileName}</strong>
                            <span className="f6-upload-status">✓ Attached · {formatSize(value.size)}</span>
                        </div>
                    </div>
                ) : (
                    <p className="f6-upload-empty">{reading ? "Reading file…" : "No file attached yet."}</p>
                )}
                <div className="f6-upload-actions">
                    <input type="file" id={id} className="f6-visually-hidden" accept={types.join(",")} onChange={choose}
                        aria-labelledby={`${id}-label ${id}-button`} aria-required={required || undefined}
                        aria-invalid={shownError ? "true" : undefined}
                        aria-describedby={[`${id}-formats`, shownError && `${id}-error`].filter(Boolean).join(" ")} />
                    <label htmlFor={id} id={`${id}-button`} className="f6-btn f6-btn-secondary">{value ? "Replace file" : "Choose file"}</label>
                    {value && <button type="button" className="f6-btn f6-btn-text" onClick={() => { onChange(null); setLocalError(""); }}>Remove</button>}
                </div>
                <p id={`${id}-formats`} className="f6-hint">Accepted: {formats}. Maximum {MAX_MB} MB.{note ? ` ${note}` : ""}</p>
            </div>
            {shownError && <p id={`${id}-error`} className="f6-error" role="alert">{shownError}</p>}
        </div>
    );
}

function Section({ title, children, intro }) {
    return (
        <section className="f6-group">
            <h3>{title}</h3>
            {intro && <p className="f6-group-intro">{intro}</p>}
            <div className="f6-grid">{children}</div>
        </section>
    );
}

// ---- the page -------------------------------------------------------------------------------

function Register() {
    const { t } = useTranslation();
    const [form, setForm] = useState(emptyForm);
    const [files, setFiles] = useState(emptyFiles);
    const [step, setStep] = useState(0);
    const [errors, setErrors] = useState({});
    const [returnToReview, setReturnToReview] = useState(false);
    const [submitted, setSubmitted] = useState(null); // { referenceId, aiReview }
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const headingRef = useRef(null);
    const cardRef = useRef(null);
    const shownStep = useRef(0);


    const [geography, setGeography] = useState(null);
    const [geographyError, setGeographyError] = useState("");

    useEffect(() => {
        // "v" gives this request its own cache entry, so a copy saved before the ECI dataset is never reused.
        api.get("/auth/geography", { params: { v: "eci-2026-10-29" } })
            .then(({ data }) => setGeography(data.data))
            .catch(() => setGeographyError(t("register.geographyLoadFailed")));
    }, [t]);

    const stateEntry = useMemo(() => geography?.states.find((s) => s.name === form.state) || null, [geography, form.state]);
    const districtEntry = stateEntry?.districts.find((d) => d.name === form.district) || null;
    // Each option is { id: "<ECI state code>-<number>", no, name }; ECI's official number and name.
    const constituencyOptions = stateEntry?.constituencies === "available" ? districtEntry?.acs || [] : [];
    const parliamentaryOnly = stateEntry?.constituencyType === "parliamentary";
    const constituencyLabel = parliamentaryOnly ? "Parliamentary constituency" : "Assembly constituency";
    const selectedConstituency = constituencyOptions.find((a) => a.id === form.assemblyConstituency) || null;
    const geo = { constituencyOptions, constituencyLabel };

    // Work in progress is kept only in memory, so warn before the tab is closed or reloaded.
    const dirty = !submitted && (JSON.stringify(form) !== JSON.stringify(emptyForm) || Object.values(files).some(Boolean));
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    // Move focus to the stage heading when the stage changes (not on first load).
    useEffect(() => {
        if (shownStep.current === step) return; // first load (and React's dev double-run): leave focus alone
        shownStep.current = step;
        headingRef.current?.focus();
        cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, [step]);

    const set = (key) => (value) => {
        setForm((f) => {
            const next = { ...f, [key]: value };
            // Changing a State/UT or district clears the choices that depended on it.
            if (key === "state") { next.district = ""; next.assemblyConstituency = ""; }
            if (key === "district") next.assemblyConstituency = "";
            if (key === "birthState") next.birthDistrict = ""; // districts depend on the State/UT of birth
            if (key === "aadhaarOption" && value !== "have") next.aadhaarNumber = "";
            if (key === "ageDocType" && value !== "other") { next.ageDocOther = ""; next.ageDeclaration = false; }
            if (key === "addressDocType" && value !== "other") next.addressDocOther = "";
            return next;
        });
        setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
    };
    const setFile = (key) => (value) => {
        setFiles((f) => ({ ...f, [key]: value }));
        setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
    };
    const toggleDisability = (value) => set("disabilities")(
        form.disabilities.includes(value) ? form.disabilities.filter((d) => d !== value) : [...form.disabilities, value]
    );

    const stepKey = STEPS[step].key;
    const goTo = (index) => { setErrors({}); setStep(index); };

    const next = () => {
        const found = errorsFor(stepKey, form, files, geo);
        if (Object.keys(found).length) {
            setErrors(found);
            setTimeout(() => focusField(Object.keys(found)[0]), 0);
            return;
        }
        setErrors({});
        if (returnToReview) { setReturnToReview(false); setStep(STEPS.length - 1); return; }
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };
    const navigate = useNavigate();
    const back = () => {
        if (step > 0) { setErrors({}); setStep((s) => s - 1); return; }
        // Stage 1 has no earlier stage: Back returns to the Voter services page the form was opened from.
        if (dirty && !window.confirm("Leave the form? The details you have entered will be lost.")) return;
        navigate("/services?role=voter");
    };
    const editStep = (index) => { setReturnToReview(true); goTo(index); };

    // Every stage's problems, for the review stage.
    const allProblems = STEPS.slice(0, -1).map((s, index) => ({ index, title: s.title, errors: errorsFor(s.key, form, files, geo) }))
        .filter((s) => Object.keys(s.errors).length);

    /** The request POST /auth/register reads (backend/src/utils/form6.js -> parseForm6). */
    const buildPayload = () => {
        const hasDisability = form.disabilities.length > 0 || Boolean(clean(form.disabilityOther));
        const doc = (f) => (f ? { dataUrl: f.dataUrl, fileName: f.fileName } : null);
        return {
            form6: {
                applicant: {
                    officialLanguage: { first: clean(form.olFirst), surname: clean(form.olSurname) },
                    english: { first: clean(form.enFirst), surname: clean(form.enSurname) }
                },
                relative: { relation: form.relation, officialLanguageName: clean(form.relOlName), englishName: clean(form.relEnName) },
                contact: {
                    mobile: form.mobile, mobileOf: form.mobile ? form.mobileOf : "",
                    email: form.email.trim(), emailOf: form.email.trim() ? form.emailOf : ""
                },
                aadhaar: { option: form.aadhaarOption, number: form.aadhaarOption === "have" ? form.aadhaarNumber : "" },
                gender: form.gender,
                dateOfBirth: parseDob(form.dobDay, form.dobMonth, form.dobYear).iso,
                ageProof: { type: form.ageDocType, otherName: form.ageDocType === "other" ? clean(form.ageDocOther) : "" },
                address: {
                    house: clean(form.house), street: clean(form.street), town: clean(form.town), postOffice: clean(form.postOffice),
                    pinCode: form.pinCode, tehsil: clean(form.tehsil), district: form.district, state: form.state,
                    assemblyConstituencyId: form.assemblyConstituency
                },
                addressProof: { type: form.addressDocType, otherName: form.addressDocType === "other" ? clean(form.addressDocOther) : "", holder: form.addressDocHolder },
                disability: hasDisability
                    ? { categories: form.disabilities, otherDescription: clean(form.disabilityOther), percentage: form.disabilityPercent, certificateAttached: form.disabilityCertificate }
                    : { categories: [], otherDescription: "", percentage: "", certificateAttached: "" },
                familyMember: { name: clean(form.familyName), relation: clean(form.familyRelation), epic: form.familyEpic },
                declaration: {
                    placeOfBirth: { town: clean(form.birthTown), district: clean(form.birthDistrict), state: form.birthState },
                    residentSince: { month: Number(form.residentMonth), year: form.residentYear },
                    firstTimeApplicant: form.firstTime,
                    noListedAgeProof: form.ageDocType === "other" && form.ageDeclaration,
                    confirmed: form.truthConfirmed,
                    place: clean(form.place)
                }
            },
            documents: { photo: doc(files.photo), ageProof: doc(files.ageProof), addressProof: doc(files.addressProof) }
        };
    };

    const submit = async (event) => {
        event.preventDefault();
        if (loading) return;
        if (allProblems.length) {
            const first = allProblems[0];
            setReturnToReview(true);
            setStep(first.index);
            setErrors(first.errors);
            setTimeout(() => focusField(Object.keys(first.errors)[0]), 50);
            return;
        }
        setError(""); setLoading(true);
        try {
            const { data } = await api.post("/auth/register", buildPayload());
            setSubmitted(data.data);
            setForm(emptyForm);
            setFiles(emptyFiles);
            setReturnToReview(false);
            setStep(0);
        } catch (err) {
            // The form keeps every value, so the applicant can correct and send again.
            // Field errors from the server are shown next to the field, in its stage.
            const fieldErrors = (err.response?.data?.errors || []).filter((x) => SERVER_FIELDS[x.field]);
            if (fieldErrors.length) {
                const [targetStep, key] = SERVER_FIELDS[fieldErrors[0].field];
                const index = STEPS.findIndex((s) => s.key === targetStep);
                setReturnToReview(true);
                setStep(index);
                setErrors(Object.fromEntries(fieldErrors.filter((x) => SERVER_FIELDS[x.field][0] === targetStep).map((x) => [SERVER_FIELDS[x.field][1], x.message])));
                setTimeout(() => focusField(key), 50);
            }
            setError(err.response?.data?.message || (err.response ? t("register.submitFailed") : "Could not reach the server. Check your connection and try again."));
        } finally { setLoading(false); }
    };



    const e = errors;
    const stateNames = geography?.states.map((s) => s.name) || [];
    const birthStateEntry = geography?.states.find((s) => s.name === form.birthState) || null;
    const hasDisability = form.disabilities.length > 0 || Boolean(clean(form.disabilityOther));
    const [today] = useState(() => new Date().toLocaleDateString("en-GB"));

    // Native-script name fields: placeholder, language and text direction follow the chosen language.
    // Only attributes change, so text already typed is kept; it is never translated or uppercased.
    const officialLanguage = OFFICIAL_LANGUAGES.find((l) => l.value === form.olLanguage);
    const nativeNameProps = {
        lang: officialLanguage?.lang || "und",
        dir: officialLanguage?.dir || "auto",
        placeholder: officialLanguage?.placeholder
    };
    // The relative's name has its own language choice; until one is picked it follows stage 1's.
    const relativeLanguageValue = form.relLanguage || form.olLanguage;
    const relativeLanguage = OFFICIAL_LANGUAGES.find((l) => l.value === relativeLanguageValue);
    const relativeNameProps = {
        lang: relativeLanguage?.lang || "und",
        dir: relativeLanguage?.dir || "auto",
        placeholder: relativeLanguage?.placeholder
    };

    // Owner choices for the mobile number and email (Form 6 items 3-4: "of self, or of relative mentioned at item 2").
    const relationLabel = RELATIONS.find((r) => r.value === form.relation)?.value;
    const contactOwners = [
        { value: "Self", label: "My own (applicant)" },
        { value: "Relative", label: relationLabel ? `My relative named above (${relationLabel})` : "My relative named above" }
    ];

    const stages = {
        name: (
            <>
                <Section title="(1)(a) Name in the official language of the State"
                    intro="Write your name as it is written in the official language of your State, for example in Hindi or Punjabi script.">
                    <SelectField name="olLanguage" label="Language" value={form.olLanguage} onChange={set("olLanguage")} placeholder="Select a language" wide
                        options={OFFICIAL_LANGUAGES.map((l) => l.value)} />
                    <TextField name="olFirst" label="First name followed by middle name" value={form.olFirst} onChange={set("olFirst")} error={e.olFirst} {...nativeNameProps} />
                    <TextField name="olSurname" label="Surname" value={form.olSurname} onChange={set("olSurname")} hint="If any." {...nativeNameProps} />
                </Section>
                <Section title="(1)(b) Name in English, in BLOCK LETTERS">
                    <TextField name="enFirst" label="First name followed by middle name" value={form.enFirst} onChange={set("enFirst")} required block error={e.enFirst} autoComplete="given-name" />
                    <TextField name="enSurname" label="Surname" value={form.enSurname} onChange={set("enSurname")} block hint="If any." error={e.enSurname} autoComplete="family-name" />
                </Section>
                <Section title="Photograph">
                    <FileField name="photo" label="Recent passport-size colour photograph" types={PHOTO_TYPES} value={files.photo} onChange={setFile("photo")} required error={e.photo}
                        purpose={<ul className="f6-list"><li>Recent, unsigned, colour photograph</li><li>Frontal view of the full face</li><li>White background</li></ul>} />
                </Section>
            </>
        ),
        relative: (
            <>
                <Section title="(2) One relative's details">
                    <ChoiceGroup name="relation" legend="This relative is my" options={RELATIONS} value={form.relation} onChange={set("relation")} required error={e.relation} columns
                        hint="In case of a married female applicant, the name of the husband may preferably be mentioned." />
                    <SelectField name="relLanguage" label="Language" value={relativeLanguageValue} onChange={set("relLanguage")} placeholder="Select a language" wide
                        options={OFFICIAL_LANGUAGES.map((l) => l.value)} />
                    <TextField name="relOlName" label="Relative's name and surname in the official language of the State" value={form.relOlName} onChange={set("relOlName")} error={e.relOlName} wide {...relativeNameProps} />
                    <TextField name="relEnName" label="Relative's name and surname in English (BLOCK LETTERS)" value={form.relEnName} onChange={set("relEnName")} required block error={e.relEnName} wide />
                </Section>
                <Section title="(3)–(4) Contact details" intro="Give your own mobile number and email if you have them, or those of the relative named above.">
                    <SelectField name="mobileOf" label="Whose mobile number are you giving?" value={form.mobileOf} onChange={set("mobileOf")} placeholder="Select" options={contactOwners} error={e.mobileOf}
                        hint="Required if you enter a mobile number." />
                    <TextField name="mobile" label="Mobile number" value={form.mobile} onChange={set("mobile")} digits={10} type="tel" error={e.mobile} hint="10 digits, without +91 or 0." />
                    <SelectField name="emailOf" label="Whose email address are you giving?" value={form.emailOf} onChange={set("emailOf")} placeholder="Select" options={contactOwners} error={e.emailOf}
                        hint="Required if you enter an email address." />
                    <TextField name="email" label="Email address" value={form.email} onChange={set("email")} type="email" inputMode="email" autoComplete="email" error={e.email} />
                </Section>
            </>
        ),
        aadhaar: (
            <>
                <Section title="(5) Aadhaar details">
                    <ChoiceGroup name="aadhaarOption" legend="Choose one" value={form.aadhaarOption} onChange={set("aadhaarOption")} required error={e.aadhaarOption}
                        options={[{ value: "have", label: "I can give my Aadhaar number" }, { value: "none", label: "I am not able to furnish my Aadhaar number because I don't have an Aadhaar number" }]} />
                    {form.aadhaarOption === "have" && (
                        <TextField name="aadhaarNumber" label="Aadhaar number" value={form.aadhaarNumber} onChange={set("aadhaarNumber")} digits={12} required error={e.aadhaarNumber}
                            hint="12 digits, no spaces. The form checks the format only; it does not verify your Aadhaar." />
                    )}
                </Section>
                <Section title="(6) Gender">
                    <ChoiceGroup name="gender" legend="Gender" options={GENDERS} value={form.gender} onChange={set("gender")} required error={e.gender} columns />
                </Section>
            </>
        ),
        dob: (
            <>
                <Section title="(7)(a) Date of birth">
                    <fieldset className="f6-field f6-wide" aria-describedby={["f6-dob-hint", e.dob && "f6-dob-error"].filter(Boolean).join(" ")}>
                        <legend>Date of birth<span className="f6-req" aria-hidden="true"> *</span></legend>
                        <p id="f6-dob-hint" className="f6-hint">For example 05 / 08 / 2006 for 5 August 2006.</p>
                        <div className="f6-date">
                            {[["dobDay", "DD", 2, "Day"], ["dobMonth", "MM", 2, "Month"], ["dobYear", "YYYY", 4, "Year"]].map(([key, ph, len, aria], i) => (
                                <span key={key} className="f6-date-part">
                                    {i > 0 && <span className="f6-date-sep" aria-hidden="true">/</span>}
                                    <input id={`f6-${key}`} value={form[key]} placeholder={ph} aria-label={aria} inputMode="numeric"
                                        className={len === 4 ? "f6-date-year" : ""} autoComplete="off" aria-invalid={e.dob ? "true" : undefined}
                                        onChange={(ev) => {
                                            const v = digitsOnly(ev.target.value, len);
                                            set(key)(v);
                                            setErrors((x) => ({ ...x, dob: null }));
                                            if (v.length === len && i < 2) document.getElementById(i === 0 ? "f6-dobMonth" : "f6-dobYear")?.focus();
                                        }} />
                                </span>
                            ))}
                        </div>
                        {e.dob && <p id="f6-dob-error" className="f6-error" role="alert">{e.dob}</p>}
                    </fieldset>
                </Section>
                <Section title="(7)(b) Proof of date of birth" intro="Attach a self-attested copy of any one of these documents: sign the copy yourself, then photograph or scan it. Uploading a file does not attest it for you.">
                    <ChoiceGroup name="ageDocType" legend="Document I am attaching" options={AGE_DOCS} value={form.ageDocType} onChange={set("ageDocType")} required error={e.ageDocType} />
                    {form.ageDocType === "other" && (
                        <TextField name="ageDocOther" label="Name of the other document for proof of date of birth" value={form.ageDocOther} onChange={set("ageDocOther")} required error={e.ageDocOther} wide maxLength={120}
                            hint="You will also confirm this in the declaration." />
                    )}
                    <FileField name="ageProof" label="Copy of the age-proof document" types={PROOF_TYPES} value={files.ageProof} onChange={setFile("ageProof")} required error={e.ageProof}
                        purpose="Attach the document you chose above. Use a separate copy from your address proof, even if it is the same document type." />
                </Section>
            </>
        ),
        address: (
            <>
                <Section title="(8)(a) Present ordinary residence (full address)">
                    <TextField name="house" label="House / building / apartment no." value={form.house} onChange={set("house")} error={e.house} maxLength={80} />
                    <TextField name="street" label="Street / area / locality / mohalla / road" value={form.street} onChange={set("street")} error={e.street} maxLength={120} />
                    <TextField name="town" label="Town / village" value={form.town} onChange={set("town")} required error={e.town} maxLength={80} autoComplete="address-level2" />
                    <TextField name="postOffice" label="Post office" value={form.postOffice} onChange={set("postOffice")} required error={e.postOffice} maxLength={80} />
                    <TextField name="pinCode" label="PIN code" value={form.pinCode} onChange={set("pinCode")} required digits={6} error={e.pinCode} autoComplete="postal-code" hint="6 digits." />
                    <TextField name="tehsil" label="Tehsil / taluqa / mandal" value={form.tehsil} onChange={set("tehsil")} required error={e.tehsil} maxLength={80} />
                    <SelectField name="state" label="State / UT" value={form.state} onChange={set("state")} required error={e.state} disabled={!geography}
                        placeholder={t("register.selectState")} options={stateNames} />
                    <SelectField name="district" label="District" value={form.district} onChange={set("district")} required error={e.district} disabled={!stateEntry}
                        placeholder={stateEntry ? t("register.selectDistrict") : "Select a State / UT first"} options={stateEntry?.districts.map((d) => d.name) || []} />
                    <SelectField name="assemblyConstituency" label={constituencyLabel} value={form.assemblyConstituency} onChange={set("assemblyConstituency")} required error={e.assemblyConstituency}
                        disabled={!districtEntry || constituencyOptions.length === 0}
                        placeholder={districtEntry ? `Select ${constituencyLabel}` : "Select a district first"}
                        options={constituencyOptions.map((a) => ({ value: a.id, label: `${a.no} – ${a.name}` }))}
                        hint={!stateEntry ? "Select your State / UT and district first."
                            : stateEntry.constituencies !== "available" ? "No constituency is listed for this State/UT."
                                : [
                                    parliamentaryOnly && "This UT has no Legislative Assembly, so Form 6 asks for its Parliamentary Constituency.",
                                    districtEntry?.acScope === "state" && `ECI lists no constituency under this district, so all ${constituencyOptions.length} of ${stateEntry.name} are shown.`,
                                    "Numbers and names as listed by the Election Commission of India."
                                ].filter(Boolean).join(" ")} />
                </Section>
                <Section title="(8)(b) Proof of residence"
                    intro="Attach a self-attested copy of any one of these documents. It may be in your name, or in the name of a parent, spouse or adult child who is already enrolled as an elector at the same address.">
                    <ChoiceGroup name="addressDocType" legend="Document I am attaching" options={ADDRESS_DOCS} value={form.addressDocType} onChange={set("addressDocType")} required error={e.addressDocType}
                        hint="If you have none of these documents, the Electoral Registration Officer arranges field verification. This online form still needs one document to be attached." />
                    {form.addressDocType === "other" && (
                        <TextField name="addressDocOther" label="Name of the other document for proof of residence" value={form.addressDocOther} onChange={set("addressDocOther")} required error={e.addressDocOther} wide maxLength={120} />
                    )}
                    <ChoiceGroup name="addressDocHolder" legend="Whose name is on this document?" options={DOC_HOLDERS} value={form.addressDocHolder} onChange={set("addressDocHolder")} columns
                        hint={form.addressDocHolder !== "Self" ? "This person must already be enrolled as an elector at the same address." : undefined} />
                    <FileField name="addressProof" label="Copy of the address-proof document" types={PROOF_TYPES} value={files.addressProof} onChange={setFile("addressProof")} required error={e.addressProof}
                        purpose="This is the document your BLO reviews with your application." />
                </Section>
            </>
        ),
        other: (
            <>
                <Section title="(9) Disability, if any" intro="This whole section is optional. Fill it in only if it applies to you.">
                    <fieldset className="f6-field f6-wide f6-choice">
                        <legend>Category of disability<span className="f6-opt"> (optional)</span></legend>
                        <div className="f6-options f6-options-cols">
                            {DISABILITIES.map((d, i) => (
                                <label key={d.value} className={`f6-option${form.disabilities.includes(d.value) ? " is-selected" : ""}`}>
                                    <input type="checkbox" id={i === 0 ? "f6-disabilities" : undefined} checked={form.disabilities.includes(d.value)} onChange={() => toggleDisability(d.value)} />
                                    <span>{d.label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <TextField name="disabilityOther" label="If any other, give a description" value={form.disabilityOther} onChange={set("disabilityOther")} wide maxLength={150} />
                    {hasDisability && (
                        <>
                            <TextField name="disabilityPercent" label="Percentage of disability (%)" value={form.disabilityPercent} onChange={set("disabilityPercent")} digits={3} error={e.disabilityPercent} hint="A number from 1 to 100." />
                            <SelectField name="disabilityCertificate" label="Certificate attached?" value={form.disabilityCertificate} onChange={set("disabilityCertificate")} placeholder="Choose"
                                options={["Yes", "No"]} hint="This online form does not take an upload of the certificate." />
                        </>
                    )}
                </Section>
                <Section title="(10) Family member already on the electoral roll"
                    intro="Optional. A family member already included in the electoral roll at your current address, with whom you currently live.">
                    <TextField name="familyName" label="Name of family member" value={form.familyName} onChange={set("familyName")} error={e.familyName} maxLength={100} />
                    <TextField name="familyRelation" label="Relationship with applicant" value={form.familyRelation} onChange={set("familyRelation")} maxLength={50} />
                    <TextField name="familyEpic" label="His / her EPIC no." value={form.familyEpic} maxLength={10} error={e.familyEpic} block hint="3 letters and 7 digits, for example ABC1234567."
                        onChange={(v) => set("familyEpic")(v.replace(/[^A-Z0-9]/g, "").slice(0, 10))} autoComplete="off" />
                </Section>
            </>
        ),
        declaration: (
            <>
                <p className="f6-declare-lead"><strong>I HEREBY DECLARE</strong> that to the best of my knowledge and belief:</p>
                <Section title="(i) I am a citizen of India and my place of birth is">
                    <SelectField name="birthState" label="State / UT" value={form.birthState} onChange={set("birthState")} required error={e.birthState} disabled={!geography} placeholder={t("register.selectState")} options={stateNames} />
                    <SelectField name="birthDistrict" label="District" value={form.birthDistrict} onChange={set("birthDistrict")} required error={e.birthDistrict} disabled={!birthStateEntry}
                        placeholder={birthStateEntry ? t("register.selectDistrict") : "Select a State / UT first"} options={birthStateEntry?.districts.map((d) => d.name) || []}
                        hint="Districts as listed by the Election Commission of India for that State/UT." />
                    <TextField name="birthTown" label="Village / town" value={form.birthTown} onChange={set("birthTown")} required error={e.birthTown} maxLength={80} wide
                        hint="Type the name; there is no official list of every village and town to choose from." />
                </Section>
                <Section title="(ii) I am ordinarily a resident at the address given in item 8(a) since">
                    <fieldset className="f6-field f6-wide" aria-describedby={e.residentSince ? "f6-residentSince-error" : undefined}>
                        <legend>Month and year<span className="f6-req" aria-hidden="true"> *</span></legend>
                        <div className="f6-inline">
                            <select id="f6-residentMonth" aria-label="Month" value={form.residentMonth} aria-invalid={e.residentSince ? "true" : undefined}
                                onChange={(ev) => { set("residentMonth")(ev.target.value); setErrors((x) => ({ ...x, residentSince: null })); }}>
                                <option value="">Month</option>
                                {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
                            </select>
                            <input id="f6-residentYear" aria-label="Year" placeholder="YYYY" inputMode="numeric" value={form.residentYear} autoComplete="off"
                                aria-invalid={e.residentSince ? "true" : undefined}
                                onChange={(ev) => { set("residentYear")(digitsOnly(ev.target.value, 4)); setErrors((x) => ({ ...x, residentSince: null })); }} />
                        </div>
                        {e.residentSince && <p id="f6-residentSince-error" className="f6-error" role="alert">{e.residentSince}</p>}
                    </fieldset>
                </Section>
                <Section title="(iii) First-time application">
                    <CheckField name="firstTime" checked={form.firstTime} onChange={set("firstTime")} required error={e.firstTime}>
                        I am applying for inclusion in the Electoral Roll for the first time and my name is not included in any Assembly Constituency / Parliamentary Constituency.
                    </CheckField>
                </Section>
                {form.ageDocType === "other" && (
                    <Section title="(iv) Age-proof document">
                        <CheckField name="ageDeclaration" checked={form.ageDeclaration} onChange={set("ageDeclaration")} required error={e.ageDeclaration}>
                            I don't possess any of the documents mentioned for proof of Date of Birth / Age. Therefore, I have enclosed <strong>{clean(form.ageDocOther) || "the document named in stage 4"}</strong> in support of age proof.
                        </CheckField>
                    </Section>
                )}
                <Section title={`(${form.ageDocType === "other" ? "v" : "iv"}) Warning about false declarations`}>
                    <div className="f6-warning f6-wide" role="note">
                        I am aware that making the above statement or declaration in relation to this application which is false and which I know or believe to be false
                        or do not believe to be true, is punishable under Section 31 of Representation of the People Act, 1950 (43 of 1950) with imprisonment for a term
                        which may extend to one year or with fine or with both.
                    </div>
                    <TextField name="place" label="Place" value={form.place} onChange={set("place")} required error={e.place} maxLength={80} hint="Where you are filling in this form." />
                    <div className="f6-field">
                        <span className="f6-label">Date</span>
                        <p className="f6-static">{today}</p>
                        <p className="f6-hint">Today's date, filled in automatically.</p>
                    </div>
                    <CheckField name="truthConfirmed" checked={form.truthConfirmed} onChange={set("truthConfirmed")} required error={e.truthConfirmed}>
                        I have read the declaration above and confirm that the statements in it, and the details in this application, are true.
                    </CheckField>
                    <div className="f6-note f6-wide">
                        <strong>Signature or left-hand thumb impression.</strong> This online form does not collect a signature or thumb impression, and ticking the box above is
                        not a signature. Your BLO or Electoral Registration Officer may ask you to sign. For persons with intellectual disability, autism, cerebral palsy and
                        multiple disabilities, the signature or left-hand thumb impression of the person, or of his/her legal guardian, will be required (Rights of Persons
                        with Disabilities Act 2016 and Rules 2017).
                    </div>
                </Section>
            </>
        )
    };

    // ---- review stage ----
    const show = (v) => (clean(v) ? clean(v) : <span className="f6-muted">Not given</span>);
    const label = (list, v) => list.find((o) => o.value === v)?.label || v;
    const docLine = (list, type, other) => (type === "other" ? `Other: ${clean(other) || "not named"}` : type ? label(list, type) : null);
    const fileLine = (f) => (f ? `${f.fileName} (${formatSize(f.size)})` : null);
    const dobText = (() => { const p = parseDob(form.dobDay, form.dobMonth, form.dobYear); return p.date ? `${form.dobDay.padStart(2, "0")}/${form.dobMonth.padStart(2, "0")}/${form.dobYear}` : null; })();
    const maskedAadhaar = form.aadhaarOption === "have" && form.aadhaarNumber ? `XXXX XXXX ${form.aadhaarNumber.slice(-4)}` : null;

    const reviewSections = [
        { index: 0, rows: [
            ["Name (official language)", show([form.olFirst, form.olSurname].map(clean).filter(Boolean).join(" ")), false],
            ["Name in English", show(englishName(form)), true],
            ["Photograph", files.photo ? fileLine(files.photo) : null, false]
        ] },
        { index: 1, rows: [
            ["Relative", form.relation ? label(RELATIONS, form.relation) : null, false],
            ["Relative's name (official language)", show(form.relOlName), false],
            ["Relative's name in English", show(form.relEnName), false],
            ["Mobile number", form.mobile ? `${form.mobile} (${form.mobileOf === "Relative" ? "relative's" : form.mobileOf === "Self" ? "my own" : "owner not chosen"})` : show(""), false],
            ["Email", form.email.trim() ? `${form.email.trim()} (${form.emailOf === "Relative" ? "relative's" : form.emailOf === "Self" ? "my own" : "owner not chosen"})` : show(""), false]
        ] },
        { index: 2, rows: [
            ["Aadhaar", form.aadhaarOption === "none" ? "I don't have an Aadhaar number" : maskedAadhaar, false],
            ["Gender", form.gender ? form.gender : null, true]
        ] },
        { index: 3, rows: [
            ["Date of birth", dobText, true],
            ["Age-proof document", docLine(AGE_DOCS, form.ageDocType, form.ageDocOther), false],
            ["Age-proof file", fileLine(files.ageProof), false]
        ] },
        { index: 4, rows: [
            ["Address", show(combinedAddress(form)), true],
            ["PIN code", form.pinCode || null, true],
            ["District, State / UT", form.district && form.state ? `${form.district}, ${form.state}` : null, true],
            [constituencyLabel, selectedConstituency ? `${selectedConstituency.no} – ${selectedConstituency.name}` : null, true],
            ["Address-proof document", docLine(ADDRESS_DOCS, form.addressDocType, form.addressDocOther), false],
            ["Name on the document", label(DOC_HOLDERS, form.addressDocHolder), false],
            ["Address-proof file", fileLine(files.addressProof), true]
        ] },
        { index: 5, rows: [
            ["Disability", hasDisability ? [...form.disabilities, clean(form.disabilityOther)].filter(Boolean).join(", ")
                + (form.disabilityPercent ? `, ${form.disabilityPercent}%` : "") + (form.disabilityCertificate ? `, certificate: ${form.disabilityCertificate}` : "") : show(""), false],
            ["Family member on the roll", clean(form.familyName) ? [clean(form.familyName), clean(form.familyRelation), form.familyEpic].filter(Boolean).join(", ") : show(""), false]
        ] },
        { index: 6, rows: [
            ["Place of birth", [form.birthTown, form.birthDistrict, form.birthState].map(clean).filter(Boolean).join(", ") || null, false],
            ["Resident at this address since", form.residentMonth && form.residentYear ? `${MONTHS[Number(form.residentMonth) - 1]} ${form.residentYear}` : null, false],
            ["First-time applicant", form.firstTime ? "Declared" : null, false],
            ...(form.ageDocType === "other" ? [["Age-proof declaration", form.ageDeclaration ? "Declared" : null, false]] : []),
            ["Declaration confirmed", form.truthConfirmed ? "Yes" : null, false],
            ["Place and date", clean(form.place) ? `${clean(form.place)}, ${today}` : null, false]
        ] }
    ];

    const review = (
        <>
            {allProblems.length > 0 ? (
                <div className="f6-alert f6-alert-error" role="alert">
                    <strong>Some required details are missing or need correcting:</strong>
                    <ul>
                        {allProblems.map((p) => (
                            <li key={p.index}>
                                <button type="button" className="f6-link" onClick={() => editStep(p.index)}>Stage {p.index + 1}: {p.title}</button>
                                {" "}({Object.keys(p.errors).length} {Object.keys(p.errors).length === 1 ? "item" : "items"})
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div className="f6-alert f6-alert-ok" role="status">All required details are complete. Check them below, then submit.</div>
            )}
            <div className="f6-note">
                <strong>Everything below is sent with your application</strong>, together with the three documents. Your Aadhaar number is stored
                protected and is never shown in full again. Your documents are kept until your BLO approves or rejects the application.
            </div>
            {reviewSections.map((s) => (
                <section key={s.index} className="f6-review">
                    <div className="f6-review-head">
                        <h3>{s.index + 1}. {STEPS[s.index].title}</h3>
                        <button type="button" className="f6-btn f6-btn-secondary f6-btn-small" onClick={() => editStep(s.index)}
                            aria-label={`Edit stage ${s.index + 1}: ${STEPS[s.index].title}`}>Edit</button>
                    </div>
                    <dl>
                        {s.rows.map(([k, v]) => (
                            <div key={k} className="f6-review-row">
                                <dt>{k}</dt>
                                <dd>{v ?? <span className="f6-missing">Missing</span>}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
            {error && <div className="f6-alert f6-alert-error" role="alert">{error}</div>}
        </>
    );

    const isReview = stepKey === "review";
    const progress = Math.round(((step + 1) / STEPS.length) * 100);

    return (
        <div className="gov-page-root">
            <GovHeader />
            <div className="gov-breadcrumb-strip">
                <div className="gov-breadcrumb-container">
                    <Link to="/">Home</Link> &gt; <Link to="/voters">Citizen Services</Link> &gt; <span>Form 6 (New Voter Registration)</span>
                </div>
            </div>
            <main className="portal-page f6-page">
                <section className="portal-card portal-wide f6-card" ref={cardRef}>
                    <p className="eyebrow">{t("register.title")} · Form 6</p>
                    <h1>{t("register.applyTitle")}</h1>
                    <p className="portal-muted f6-intro">{t("register.instructions")}</p>
                    <p className="f6-legend-note">Fields marked <span className="f6-req">*</span> are required. Fields marked (optional) can be left blank.</p>

                    {geographyError && <div className="f6-alert f6-alert-error" role="alert">{geographyError}</div>}

                    {submitted && (
                        <div className="f6-alert f6-alert-ok f6-submitted" role="status">
                            <h2>✓ Application submitted to your BLO</h2>
                            <p>{t("register.submittedReference")} <strong className="f6-ref">{submitted.referenceId}</strong></p>
                            {submitted.aiReview && (
                                <div className="f6-ai">
                                    <strong>Automated document check:</strong> {submitted.aiReview.shortAiReview}
                                    <small>Risk level: {submitted.aiReview.riskLevel} · Confidence: {submitted.aiReview.confidenceScore}%</small>
                                </div>
                            )}
                            <p className="f6-hint">{t("register.saveReference")}{" "}
                                <Link to={`/check-request?ref=${encodeURIComponent(submitted.referenceId)}`}>{t("register.checkRequest")}</Link></p>
                        </div>
                    )}

                    <nav aria-label="Form 6 stages" className="f6-progress">
                        <p className="f6-progress-label" id="f6-progress-label">Stage {step + 1} of {STEPS.length}: <strong>{STEPS[step].title}</strong></p>
                        <div className="f6-bar" role="progressbar" aria-labelledby="f6-progress-label" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
                            <span style={{ width: `${progress}%` }} />
                        </div>
                        <ol className="f6-steps">
                            {STEPS.map((s, i) => (
                                <li key={s.key} className={i === step ? "is-current" : i < step ? "is-done" : ""} aria-current={i === step ? "step" : undefined}>
                                    <span className="f6-step-num" aria-hidden="true">{i < step ? "✓" : i + 1}</span>
                                    <span className="f6-step-title">{s.title}</span>
                                </li>
                            ))}
                        </ol>
                    </nav>

                    <form onSubmit={isReview ? submit : (ev) => { ev.preventDefault(); next(); }} noValidate className="f6-form">
                        <h2 className="f6-stage-title" tabIndex={-1} ref={headingRef}>{step + 1}. {STEPS[step].title}</h2>
                        {isReview ? review : stages[stepKey]}

                        <div className="f6-nav">
                            <button type="button" className="f6-btn f6-btn-secondary" onClick={back} disabled={loading}>← Back</button>
                            {isReview ? (
                                <button type="submit" className="f6-btn f6-btn-primary" disabled={loading} aria-busy={loading || undefined}>
                                    {loading ? "Submitting…" : t("register.submitToBlo")}
                                </button>
                            ) : (
                                <button type="submit" className="f6-btn f6-btn-primary">{returnToReview ? "Save and return to review" : "Next →"}</button>
                            )}
                        </div>
                        {!isReview && <p className="f6-hint f6-memory-note">Your answers stay on this page while it is open. They are not saved anywhere until you submit, so closing or reloading the page loses them.</p>}
                    </form>

                </section>
            </main>
            <GovFooter />
        </div>
    );
}

export default Register;
