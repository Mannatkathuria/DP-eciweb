// Age eligibility for enrolment, by qualifying date.
//
// Since the Election Laws (Amendment) Act, 2021, section 14(b) of the Representation of the People
// Act, 1950 provides four qualifying dates a year: 1 January, 1 April, 1 July and 1 October. A
// person may be enrolled with reference to a qualifying date if they are 18 on that date. ECI also
// accepts advance applications from people aged 17 or more, which are processed when they reach
// the qualifying date.
//
// Age is only one condition. Citizenship, ordinary residence, absence of disqualification and the
// prescribed procedure (Form 6, field verification, ERO decision) are still required, so this
// module never enrols anyone: it only decides whether a BLO should be asked to help.

const QUALIFYING_MONTHS = [0, 3, 6, 9]; // January, April, July, October (UTC months)
const ADVANCE_AGE = 17;
const VOTING_AGE = 18;

const parseDate = (value) => {
    const s = String(value ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
};

const iso = (d) => d.toISOString().slice(0, 10);

/** The date a person reaches `years` years of age. A 29 February birthday counts from 1 March. */
export const birthdayAt = (dob, years) => {
    const d = new Date(Date.UTC(dob.getUTCFullYear() + years, dob.getUTCMonth(), dob.getUTCDate()));
    // Date.UTC rolls 29 Feb into 1 Mar in non-leap years, which is the rule we want.
    return d;
};

/** The first qualifying date on or after `date`. */
export const qualifyingDateOnOrAfter = (date) => {
    const y = date.getUTCFullYear();
    for (const year of [y, y + 1]) {
        for (const m of QUALIFYING_MONTHS) {
            const q = new Date(Date.UTC(year, m, 1));
            if (q >= date) return q;
        }
    }
    return null; // unreachable
};

/** The latest qualifying date on or before `date`. */
export const qualifyingDateOnOrBefore = (date) => {
    const y = date.getUTCFullYear();
    let found = null;
    for (const year of [y - 1, y]) {
        for (const m of QUALIFYING_MONTHS) {
            const q = new Date(Date.UTC(year, m, 1));
            if (q <= date) found = q;
        }
    }
    return found;
};

/**
 * Age eligibility on `today`:
 *   ELIGIBLE  18 or more on a qualifying date that has already passed: can be enrolled now
 *   ADVANCE   17 or more, first qualifying date still ahead: may file an advance application
 *   FUTURE    younger: nothing to do yet
 * Returns { status, qualifyingDate, eighteenOn } or null for an invalid date of birth.
 */
export const assessEligibility = (dateOfBirth, today = new Date()) => {
    const dob = parseDate(dateOfBirth);
    if (!dob) return null;
    const now = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (dob > now) return null;
    const eighteen = birthdayAt(dob, VOTING_AGE);
    const firstQualifying = qualifyingDateOnOrAfter(eighteen);
    let status;
    if (firstQualifying <= now) status = "ELIGIBLE";
    else if (birthdayAt(dob, ADVANCE_AGE) <= now) status = "ADVANCE";
    else status = "FUTURE";
    return { status, qualifyingDate: iso(firstQualifying), eighteenOn: iso(eighteen) };
};
