import crypto from "crypto";
import { ApiError } from "./ApiErrors.js";
import { validateDocumentProof } from "./documentProof.js";
import { geography, resolveConstituency } from "../data/geography.js";

/*
 * Server-side validation for the full Form 6 (Application Form for New Voters) sent by
 * frontend/src/pages/Register.jsx as `{ form6, documents }` in POST /auth/register.
 *
 * parseForm6 never trusts the browser: every field is re-checked here, conditional fields must
 * match the option that enables them, and the flat fields the rest of the app already uses
 * (name, dateOfBirth, gender, address, pinCode, ...) are derived from the structured data.
 */

export const FORM6_VERSION = "form6-v1";

// Documents kept in their own Redis keys. The address proof stays in the application's existing
// `referenceImage` field, which the BLO dashboard already displays.
export const SEPARATE_DOCUMENTS = ["photo", "ageProof"];
export const DOCUMENT_CATEGORIES = ["photo", "ageProof", "addressProof"];

const RELATIONS = ["Father", "Mother", "Husband", "Wife", "Legal Guardian", "Guru"];
const GENDERS = ["Male", "Female", "Third Gender"];
const AGE_DOCS = ["birth-certificate", "aadhaar", "pan", "driving-licence", "school-certificate", "passport", "other"];
const ADDRESS_DOCS = ["utility-bill", "aadhaar", "bank-passbook", "passport", "land-records", "rent-deed", "sale-deed", "other"];
const DOC_HOLDERS = ["Self", "Parent", "Spouse", "Adult child"];
const DISABILITIES = ["Locomotive", "Visual", "Deaf & Dumb"];
const OWNERS = ["Self", "Relative"];

const ENGLISH_NAME = /^[A-Z][A-Z .'-]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE = /^[6-9]\d{9}$/;
const EPIC = /^[A-Z]{3}\d{7}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const ADDRESS_MIN = 10;
const ADDRESS_MAX = 300;

const text = (value) => (typeof value === "string" || typeof value === "number" ? String(value) : "").trim().replace(/\s+/g, " ");

// ---- Aadhaar ----------------------------------------------------------------------------------

/** Format check only: exactly 12 digits. It does not verify an Aadhaar number. */
export const isAadhaarFormat = (num) => /^\d{12}$/.test(num);

const aadhaarKey = () => {
    const hex = String(process.env.AADHAAR_ENCRYPTION_KEY ?? "").trim();
    return /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, "hex") : null;
};

/**
 * What is stored about the applicant's Aadhaar. The full number is kept only encrypted
 * (AES-256-GCM, bound to the application id) and only when AADHAAR_ENCRYPTION_KEY is configured;
 * otherwise just the last four digits are kept. No API ever returns the full number.
 */
export const buildAadhaarRecord = (aadhaar, applicationId) => {
    if (aadhaar.option !== "have") return { option: "none", last4: null, numberStored: false };
    const key = aadhaarKey();
    const record = { option: "have", last4: aadhaar.number.slice(-4), numberStored: false };
    if (!key) return record;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(String(applicationId)));
    const data = Buffer.concat([cipher.update(aadhaar.number, "utf8"), cipher.final()]);
    return {
        ...record, numberStored: true,
        encrypted: { alg: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") }
    };
};

/** Removes the encrypted Aadhaar from an application before it is sent to any client. */
export const withoutSecrets = (application) => {
    if (!application?.form6?.aadhaar?.encrypted) return application;
    const { encrypted, ...aadhaar } = application.form6.aadhaar; // eslint-disable-line no-unused-vars
    return { ...application, form6: { ...application.form6, aadhaar } };
};

// ---- documents --------------------------------------------------------------------------------

const safeFileName = (value) => text(value).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 120) || "document";

const parseDocument = (doc, label, allowedTypes) => {
    if (!doc || typeof doc !== "object") throw new ApiError(400, `${label} is required. Upload a ${allowedTypes.join(" or ")} image.`);
    const dataUrl = validateDocumentProof(doc.dataUrl, label); // real type from magic bytes, 4 MB limit
    const mimeType = dataUrl.slice(5, dataUrl.indexOf(";"));
    if (!allowedTypes.includes(mimeType)) throw new ApiError(400, `${label} must be a ${allowedTypes.join(" or ")} image.`);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { dataUrl, mimeType, base64, size: Buffer.byteLength(base64, "base64"), fileName: safeFileName(doc.fileName) };
};

// ---- the form ---------------------------------------------------------------------------------

/**
 * Validates a Form 6 submission. Returns the structured record, the flat fields used by the
 * existing workflow, the parsed documents and the raw Aadhaar (kept in memory only).
 * Throws ApiError(400) with every problem listed in `errors` ([{ field, message }]).
 */
export const parseForm6 = (input, documents) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Form 6 details are missing.");
    const problems = [];
    const fail = (field, message) => { problems.push({ field, message }); return null; };
    const get = (obj, key) => (obj && typeof obj === "object" ? obj[key] : undefined);

    const optional = (field, value, max) => {
        const v = text(value);
        return v.length > max ? fail(field, `Keep this under ${max} characters.`) : v || null;
    };
    const required = (field, value, max, message) => {
        const v = text(value);
        if (!v) return fail(field, message);
        return v.length > max ? fail(field, `Keep this under ${max} characters.`) : v;
    };
    const englishName = (field, value, isRequired, label) => {
        const v = text(value).toUpperCase(); // stored in BLOCK LETTERS whatever the client sent
        if (!v) return isRequired ? fail(field, `Enter ${label}.`) : null;
        if (!ENGLISH_NAME.test(v)) return fail(field, `${label} may contain English letters, spaces, full stops, hyphens and apostrophes only.`);
        return v.length > 60 ? fail(field, "Keep this under 60 characters.") : v;
    };
    const choice = (field, value, list, message) => (list.includes(value) ? value : fail(field, message));

    // (1) name
    const applicant = get(input, "applicant");
    const name = {
        officialLanguage: { first: optional("applicant.officialLanguage.first", get(get(applicant, "officialLanguage"), "first"), 60),
            surname: optional("applicant.officialLanguage.surname", get(get(applicant, "officialLanguage"), "surname"), 60) },
        english: { first: englishName("applicant.english.first", get(get(applicant, "english"), "first"), true, "First name in English"),
            surname: englishName("applicant.english.surname", get(get(applicant, "english"), "surname"), false, "Surname in English") }
    };

    // (2) relative
    const rel = get(input, "relative");
    const relative = {
        relation: choice("relative.relation", get(rel, "relation"), RELATIONS, "Choose the relative's relationship to you."),
        officialLanguageName: optional("relative.officialLanguageName", get(rel, "officialLanguageName"), 120), // optional; null when blank
        englishName: englishName("relative.englishName", get(rel, "englishName"), true, "The relative's name in English")
    };

    // (3)-(4) contact (optional)
    const con = get(input, "contact");
    const mobile = text(get(con, "mobile")).replace(/\s/g, "");
    const email = text(get(con, "email"));
    const contact = {
        mobile: mobile ? (MOBILE.test(mobile) ? mobile : fail("contact.mobile", "Mobile number must be 10 digits starting with 6, 7, 8 or 9.")) : null,
        // Whose number / email it is (Form 6 items 3-4): the applicant's own or the relative's at item 2.
        mobileOf: mobile ? choice("contact.mobileOf", get(con, "mobileOf"), OWNERS, "Choose whose mobile number this is (Self or Relative).")
            : text(get(con, "mobileOf")) ? fail("contact.mobileOf", "Whose number it is is only given together with a mobile number.") : null,
        email: email ? (email.length <= 254 && EMAIL.test(email) ? email.toLowerCase() : fail("contact.email", "Enter a valid email address.")) : null,
        emailOf: email ? choice("contact.emailOf", get(con, "emailOf"), OWNERS, "Choose whose email address this is (Self or Relative).")
            : text(get(con, "emailOf")) ? fail("contact.emailOf", "Whose email it is is only given together with an email address.") : null
    };

    // (5) Aadhaar
    const aad = get(input, "aadhaar");
    const aadhaarOption = choice("aadhaar.option", get(aad, "option"), ["have", "none"], "Choose one of the two Aadhaar options.");
    const aadhaarNumber = text(get(aad, "number")).replace(/\s/g, "");
    if (aadhaarOption === "have" && !isAadhaarFormat(aadhaarNumber)) fail("aadhaar.number", "Enter a valid 12-digit Aadhaar number.");
    if (aadhaarOption === "none" && aadhaarNumber) fail("aadhaar.number", "Do not send an Aadhaar number when declaring that you don't have one.");

    // (6) gender, (7) date of birth
    const gender = choice("gender", get(input, "gender"), GENDERS, "Choose Male, Female or Third Gender.");
    let dateOfBirth = null;
    let dobDate = null;
    const dobMatch = ISO_DATE.exec(text(get(input, "dateOfBirth")));
    if (!dobMatch) fail("dateOfBirth", "Date of birth must be a date (YYYY-MM-DD).");
    else {
        const [, y, m, d] = dobMatch.map(Number);
        dobDate = new Date(Date.UTC(y, m - 1, d));
        if (dobDate.getUTCFullYear() !== y || dobDate.getUTCMonth() !== m - 1 || dobDate.getUTCDate() !== d) { fail("dateOfBirth", "Date of birth does not exist."); dobDate = null; }
        else if (y < 1900) { fail("dateOfBirth", "Date of birth must be from 1900 onwards."); dobDate = null; }
        else if (dobDate > new Date()) { fail("dateOfBirth", "Date of birth cannot be in the future."); dobDate = null; }
        else dateOfBirth = dobMatch[0];
    }

    // (7)(b) age proof
    const ap = get(input, "ageProof");
    const ageProofType = choice("ageProof.type", get(ap, "type"), AGE_DOCS, "Choose the age-proof document.");
    const ageOtherName = text(get(ap, "otherName"));
    if (ageProofType === "other" && !ageOtherName) fail("ageProof.otherName", "Name the other age-proof document.");
    if (ageProofType !== "other" && ageOtherName) fail("ageProof.otherName", "A document name is only given for 'any other document'.");
    if (ageOtherName.length > 120) fail("ageProof.otherName", "Keep this under 120 characters.");

    // (8)(a) address
    const ad = get(input, "address");
    const address = {
        house: optional("address.house", get(ad, "house"), 80),
        street: optional("address.street", get(ad, "street"), 120),
        town: required("address.town", get(ad, "town"), 80, "Enter the town or village."),
        postOffice: required("address.postOffice", get(ad, "postOffice"), 80, "Enter the post office."),
        pinCode: /^[1-9]\d{5}$/.test(text(get(ad, "pinCode"))) ? text(get(ad, "pinCode")) : fail("address.pinCode", "Enter a valid six-digit PIN code."),
        tehsil: required("address.tehsil", get(ad, "tehsil"), 80, "Enter the tehsil / taluqa / mandal."),
        district: text(get(ad, "district")),
        state: text(get(ad, "state")),
        assemblyConstituency: null
    };
    // The constituency arrives as its ECI identifier ("<state code>-<number>"), never as free text.
    // Its official number and name come from the dataset, and it must belong to the State/UT and
    // district chosen (backend/src/data/geography.js).
    const geo = resolveConstituency({ state: address.state, district: address.district, constituencyId: get(ad, "assemblyConstituencyId") });
    if (geo.error) fail("address.assemblyConstituency", geo.error);
    else {
        address.stateCode = geo.stateCode;
        address.districtCode = geo.districtCode;
        address.assemblyConstituency = geo.constituency.name;
        const { id, no, name, category, pcNo, pcName, type } = geo.constituency;
        address.constituency = { id, no, name, type, category, pcNo, pcName };
    }
    const formattedAddress = [address.house, address.street, address.town,
        address.postOffice && `Post Office: ${address.postOffice}`, address.tehsil && `Tehsil: ${address.tehsil}`].filter(Boolean).join(", ");
    if (address.town && (formattedAddress.length < ADDRESS_MIN || formattedAddress.length > ADDRESS_MAX)) {
        fail("address.street", `The address lines together must be ${ADDRESS_MIN} to ${ADDRESS_MAX} characters.`);
    }

    // (8)(b) address proof
    const rp = get(input, "addressProof");
    const addressProofType = choice("addressProof.type", get(rp, "type"), ADDRESS_DOCS, "Choose the address-proof document.");
    const addressOtherName = text(get(rp, "otherName"));
    if (addressProofType === "other" && !addressOtherName) fail("addressProof.otherName", "Name the other address-proof document.");
    if (addressProofType !== "other" && addressOtherName) fail("addressProof.otherName", "A document name is only given for 'any other document'.");
    if (addressOtherName.length > 120) fail("addressProof.otherName", "Keep this under 120 characters.");
    const holder = choice("addressProof.holder", get(rp, "holder") || "Self", DOC_HOLDERS, "Say whose name is on the address-proof document.");

    // (9) disability (optional)
    const dis = get(input, "disability");
    const rawCategories = get(dis, "categories") ?? [];
    const categories = Array.isArray(rawCategories) ? [...new Set(rawCategories)] : [];
    if (!Array.isArray(rawCategories) || categories.some((c) => !DISABILITIES.includes(c))) fail("disability.categories", "Unknown disability category.");
    const otherDescription = optional("disability.otherDescription", get(dis, "otherDescription"), 150);
    const hasDisability = categories.length > 0 || Boolean(otherDescription);
    const pctText = text(get(dis, "percentage"));
    let percentage = null;
    if (pctText) {
        if (!hasDisability) fail("disability.percentage", "A percentage is only given together with a disability category.");
        else if (!/^\d{1,3}$/.test(pctText) || Number(pctText) < 1 || Number(pctText) > 100) fail("disability.percentage", "Percentage must be a whole number from 1 to 100.");
        else percentage = Number(pctText);
    }
    const certText = text(get(dis, "certificateAttached"));
    if (certText && !hasDisability) fail("disability.certificateAttached", "Certificate is only answered together with a disability category.");
    if (certText && !["Yes", "No"].includes(certText)) fail("disability.certificateAttached", "Answer Yes or No.");

    // (10) family member (optional)
    const fam = get(input, "familyMember");
    const familyEpic = text(get(fam, "epic")).toUpperCase();
    const familyMember = {
        name: optional("familyMember.name", get(fam, "name"), 100),
        relation: optional("familyMember.relation", get(fam, "relation"), 50),
        epic: familyEpic ? (EPIC.test(familyEpic) ? familyEpic : fail("familyMember.epic", "EPIC number is 3 letters followed by 7 digits.")) : null
    };
    if ((familyMember.relation || familyEpic) && !familyMember.name) fail("familyMember.name", "Enter the family member's name.");

    // Declaration
    const dec = get(input, "declaration");
    const birth = get(dec, "placeOfBirth");
    const birthState = text(get(birth, "state"));
    const placeOfBirth = {
        town: required("declaration.placeOfBirth.town", get(birth, "town"), 80, "Enter the village or town of birth."),
        // The district is chosen from the selected State/UT's ECI district list.
        district: geography.states.find((s) => s.name === birthState)?.districts.some((d) => d.name === text(get(birth, "district")))
            ? text(get(birth, "district"))
            : fail("declaration.placeOfBirth.district", "Select a district of birth from the list for that State/UT."),
        state: geography.states.some((s) => s.name === birthState) ? birthState : fail("declaration.placeOfBirth.state", "Select a valid State / UT of birth.")
    };
    const since = get(dec, "residentSince");
    const sinceMonth = Number(get(since, "month"));
    const sinceYearText = text(get(since, "year"));
    let residentSince = null;
    if (!Number.isInteger(sinceMonth) || sinceMonth < 1 || sinceMonth > 12 || !/^\d{4}$/.test(sinceYearText)) {
        fail("declaration.residentSince", "Give the month (1-12) and four-digit year since when you have lived at this address.");
    } else {
        const value = Number(sinceYearText) * 12 + sinceMonth - 1;
        const now = new Date();
        if (value > now.getUTCFullYear() * 12 + now.getUTCMonth()) fail("declaration.residentSince", "This month is in the future.");
        else if (dobDate && value < dobDate.getUTCFullYear() * 12 + dobDate.getUTCMonth()) fail("declaration.residentSince", "This is before the date of birth.");
        else residentSince = { month: sinceMonth, year: Number(sinceYearText) };
    }
    if (get(dec, "firstTimeApplicant") !== true) fail("declaration.firstTimeApplicant", "Confirm that this is your first application for inclusion in an electoral roll.");
    const ageDeclaration = get(dec, "noListedAgeProof") === true;
    if (ageProofType === "other" && !ageDeclaration) fail("declaration.noListedAgeProof", "Confirm that you don't have any of the listed age-proof documents.");
    if (ageProofType !== "other" && ageDeclaration) fail("declaration.noListedAgeProof", "This declaration only applies when another age-proof document is attached.");
    if (get(dec, "confirmed") !== true) fail("declaration.confirmed", "Confirm that you have read and accept the declaration.");
    const place = required("declaration.place", get(dec, "place"), 80, "Enter the place where the form is filled in.");

    // Documents
    const docs = documents && typeof documents === "object" ? documents : {};
    const files = {};
    const docSpec = {
        photo: ["Photograph", ["image/jpeg", "image/png"]],
        ageProof: ["Age-proof document", ["image/jpeg", "image/png", "image/webp"]],
        addressProof: ["Address-proof document", ["image/jpeg", "image/png", "image/webp"]]
    };
    for (const [category, [label, types]] of Object.entries(docSpec)) {
        try { files[category] = parseDocument(docs[category], label, types); }
        catch (error) { fail(`documents.${category}`, error.message); }
    }

    if (problems.length) {
        throw new ApiError(400, problems.length === 1 ? problems[0].message : `${problems.length} details need correcting. First: ${problems[0].message}`, problems);
    }

    const uploadedAt = new Date().toISOString();
    const documentMeta = Object.fromEntries(Object.entries(files).map(([category, f]) => [category, {
        category, mimeType: f.mimeType, size: f.size, fileName: f.fileName, uploadedAt,
        storage: category === "addressProof" ? "referenceImage" : "document", retained: true
    }]));

    const record = {
        name,
        relative,
        contact,
        // aadhaar is filled in by buildAadhaarRecord once the application id exists
        gender,
        dateOfBirth,
        ageProof: { type: ageProofType, otherName: ageOtherName || null },
        address: { ...address, formatted: formattedAddress },
        addressProof: { type: addressProofType, otherName: addressOtherName || null, holder },
        disability: hasDisability ? { categories, otherDescription, percentage, certificateAttached: certText || null } : null,
        familyMember: familyMember.name ? familyMember : null,
        declaration: {
            citizenOfIndia: true,
            placeOfBirth,
            residentSince,
            firstTimeApplicant: true,
            noListedAgeProof: ageDeclaration,
            alternativeAgeProofName: ageDeclaration ? ageOtherName : null,
            confirmed: true,
            place,
            declaredAt: uploadedAt, // server time, not the browser's
            signature: null // the online form does not collect a signature or thumb impression
        }
    };

    const englishFullName = [name.english.first, name.english.surname].filter(Boolean).join(" ");
    return {
        record,
        aadhaar: { option: aadhaarOption, number: aadhaarOption === "have" ? aadhaarNumber : null },
        files,
        documentMeta,
        // The flat fields the existing registration, BLO and approval code already use.
        legacy: {
            name: englishFullName,
            dateOfBirth,
            gender: gender === "Third Gender" ? "Other" : gender,
            state: address.state,
            district: address.district,
            assemblyConstituency: address.assemblyConstituency,
            address: formattedAddress,
            pinCode: address.pinCode,
            referenceImage: files.addressProof.dataUrl
        }
    };
};

/** Marks stored documents as deleted (used when a BLO decides, matching the existing referenceImage rule). */
export const purgedDocumentMeta = (documents, at) => documents
    ? Object.fromEntries(Object.entries(documents).map(([k, v]) => [k, { ...v, retained: false, purgedAt: at }]))
    : documents;

const maskMobile = (m) => (m ? `******${m.slice(-4)}` : null);
const maskEmail = (e) => {
    if (!e) return null;
    const [user, domain] = e.split("@");
    return `${user.slice(0, 1)}${"*".repeat(Math.max(1, user.length - 1))}@${domain}`;
};

/**
 * What the public status check (reference ID only) may show: the saved application, with
 * contact details and Aadhaar masked, document metadata without the files, and no secrets.
 */
export const publicApplicationView = (application) => {
    const base = {
        name: application.name, dateOfBirth: application.dateOfBirth, gender: application.gender,
        state: application.state, district: application.district, assemblyConstituency: application.assemblyConstituency,
        address: application.address || null, pinCode: application.pinCode || null,
        formVersion: application.formVersion || null
    };
    const f = application.form6;
    if (!f) return base;
    return {
        ...base,
        form6: {
            ...f,
            contact: f.contact ? { ...f.contact, mobile: maskMobile(f.contact.mobile), email: maskEmail(f.contact.email) } : null,
            aadhaar: f.aadhaar ? { option: f.aadhaar.option, last4: f.aadhaar.last4 ? `XXXX XXXX ${f.aadhaar.last4}` : null } : null
        },
        documents: application.documents
            ? Object.fromEntries(Object.entries(application.documents).map(([k, v]) => [k, { fileName: v.fileName, mimeType: v.mimeType, size: v.size, uploadedAt: v.uploadedAt, retained: v.retained }]))
            : null
    };
};
