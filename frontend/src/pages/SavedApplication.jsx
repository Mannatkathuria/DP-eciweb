import { RELATIONS, AGE_DOCS, ADDRESS_DOCS, DOC_HOLDERS, MONTHS, formatSize } from "./form6Options";

/** The saved application returned by the status check (contact details and Aadhaar arrive masked). */
export default function SavedApplication({ application: a }) {
    const f = a.form6;
    const v = (x) => (x === null || x === undefined || x === "" ? "—" : x);
    const lbl = (list, x) => list.find((o) => o.value === x)?.label || x;
    const docText = (list, d) => (d ? (d.type === "other" ? `Other: ${d.otherName}` : lbl(list, d.type)) : null);
    const fileText = (key) => {
        const d = a.documents?.[key];
        return d ? `${d.fileName} (${formatSize(d.size)})${d.retained === false ? " — deleted after the BLO decision" : ""}` : null;
    };
    const rows = f ? [
        ["Name (official language)", [f.name?.officialLanguage?.first, f.name?.officialLanguage?.surname].filter(Boolean).join(" ")],
        ["Name in English", [f.name?.english?.first, f.name?.english?.surname].filter(Boolean).join(" ")],
        ["Photograph", fileText("photo")],
        ["Relative", f.relative && `${lbl(RELATIONS, f.relative.relation)}: ${f.relative.englishName}${f.relative.officialLanguageName ? ` (${f.relative.officialLanguageName})` : ""}`],
        ["Mobile", f.contact?.mobile && `${f.contact.mobile} (${f.contact.mobileOf === "Relative" ? "relative's" : "own"})`],
        ["Email", f.contact?.email && `${f.contact.email} (${f.contact.emailOf === "Relative" ? "relative's" : "own"})`],
        ["Aadhaar", f.aadhaar?.option === "none" ? "Declared: no Aadhaar number" : f.aadhaar?.last4],
        ["Gender", f.gender],
        ["Date of birth", f.dateOfBirth?.split("-").reverse().join("/")],
        ["Age proof", docText(AGE_DOCS, f.ageProof)], ["Age-proof file", fileText("ageProof")],
        ["Address", f.address?.formatted], ["PIN code", f.address?.pinCode],
        ["District, State / UT", f.address && `${f.address.district}, ${f.address.state}`], [f.address?.constituency?.type === "parliamentary" ? "Parliamentary constituency" : "Assembly constituency",
            f.address?.constituency ? `${f.address.constituency.no} – ${f.address.constituency.name}` : f.address?.assemblyConstituency],
        ["Address proof", docText(ADDRESS_DOCS, f.addressProof)], ["Name on the document", f.addressProof && lbl(DOC_HOLDERS, f.addressProof.holder)],
        ["Address-proof file", fileText("addressProof")],
        ["Disability", f.disability && [...(f.disability.categories || []), f.disability.otherDescription].filter(Boolean).join(", ")
            + (f.disability.percentage ? `, ${f.disability.percentage}%` : "") + (f.disability.certificateAttached ? `, certificate: ${f.disability.certificateAttached}` : "")],
        ["Family member on the roll", f.familyMember && [f.familyMember.name, f.familyMember.relation, f.familyMember.epic].filter(Boolean).join(", ")],
        ["Place of birth", f.declaration?.placeOfBirth && [f.declaration.placeOfBirth.town, f.declaration.placeOfBirth.district, f.declaration.placeOfBirth.state].join(", ")],
        ["Resident since", f.declaration?.residentSince && `${MONTHS[f.declaration.residentSince.month - 1]} ${f.declaration.residentSince.year}`],
        ["Declaration", f.declaration?.confirmed && `Confirmed at ${f.declaration.place} on ${new Date(f.declaration.declaredAt).toLocaleDateString("en-GB")}`]
    ] : [
        ["Name", a.name], ["Date of birth", a.dateOfBirth && new Date(a.dateOfBirth).toLocaleDateString("en-GB")], ["Gender", a.gender],
        ["Address", a.address], ["PIN code", a.pinCode], ["District, State / UT", `${a.district}, ${a.state}`], ["Assembly constituency", a.assemblyConstituency]
    ];
    return (
        <section className="f6-review f6-saved" aria-label="Saved application">
            <div className="f6-review-head"><h3>Your saved application</h3></div>
            {!f && <p className="f6-hint">This application was made with the earlier, shorter form.</p>}
            <dl>
                {rows.map(([k, val]) => (
                    <div key={k} className="f6-review-row"><dt>{k}</dt><dd>{v(val)}</dd></div>
                ))}
            </dl>
        </section>
    );
}

