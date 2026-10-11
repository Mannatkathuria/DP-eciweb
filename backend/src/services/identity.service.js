/**
 * Identity-credential layer.
 *
 * The proposal states that real government integrations (Aadhaar Secure QR,
 * DigiLocker, PAN, DL) are represented by MOCK / SANDBOX interfaces unless
 * formal authorisation is obtained. fetchCredential() is the single place to
 * swap in a real integration later.
 */

// Demo overrides so all three comparison outcomes can be shown.
// Anything not listed returns a credential identical to the elector record.
const MOCK_OVERRIDES = {
    // minor spelling difference  -> "minor_discrepancy"
    MNO1357924: { name: "Kabir Sing" },
    // different date of birth    -> "significant_discrepancy" -> BLO review
    JKL9753186: { dateOfBirth: new Date("1995-12-30") }
};

export const SUPPORTED_METHODS = ["aadhaar", "digilocker", "pan", "dl"];

export const fetchCredential = async (method, elector) => {
    // simulate a network call to the issuer
    await new Promise((r) => setTimeout(r, 400));

    return {
        source: `sandbox:${method}`,
        name: elector.name,
        dateOfBirth: elector.dateOfBirth,
        gender: elector.gender,
        ...(MOCK_OVERRIDES[elector.epic] || {})
    };
};

const normalise = (s) => String(s ?? "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();

const levenshtein = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }
    return dp[a.length][b.length];
};

export const nameSimilarity = (a, b) => {
    const x = normalise(a);
    const y = normalise(b);
    if (!x && !y) return 1;
    const longest = Math.max(x.length, y.length);
    return longest === 0 ? 1 : 1 - levenshtein(x, y) / longest;
};

const sameDay = (a, b) => new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);

/**
 * Compares a credential with the electoral record.
 * consistent              -> proceed
 * minor_discrepancy       -> proceed, recorded
 * significant_discrepancy -> BLO / manual review (never an automatic rejection)
 */
export const compareIdentity = (elector, credential) => {
    if (!credential) {
        return { status: "unavailable", comparison: {}, reason: "Identity credential could not be retrieved." };
    }

    const nameScore = nameSimilarity(elector.name, credential.name);
    const dobMatch =
        elector.dateOfBirth && credential.dateOfBirth ? sameDay(elector.dateOfBirth, credential.dateOfBirth) : null;
    const genderMatch = elector.gender && credential.gender ? elector.gender === credential.gender : null;

    const comparison = { nameScore: Number(nameScore.toFixed(3)), dobMatch, genderMatch, source: credential.source };

    if (dobMatch === false || genderMatch === false || nameScore < 0.8) {
        return {
            status: "significant_discrepancy",
            comparison,
            reason: "Significant discrepancy between the identity credential and the electoral record."
        };
    }

    if (nameScore < 0.95) {
        return { status: "minor_discrepancy", comparison, note: "Minor name discrepancy recorded." };
    }

    return { status: "consistent", comparison };
};
