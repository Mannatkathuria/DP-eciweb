// Keys for finding demographically similar roll entries (DSE): the same person entered twice is
// often spelt slightly differently ("Gurpreet"/"Gurprit", "Kaur "/"kaur"). The key folds case,
// spacing, common transliteration variants and doubled letters. A shared key is only a reason to
// look; the ERO decides after notice (Registration of Electors Rules, 1960, r. 21A).
const VARIANTS = [[/ee|ii|ie/g, "i"], [/oo|uu|ou/g, "u"], [/aa/g, "a"], [/kh/g, "k"], [/gh/g, "g"], [/ph/g, "f"], [/th/g, "t"], [/dh/g, "d"], [/bh/g, "b"], [/sh/g, "s"], [/ch/g, "c"], [/w/g, "v"], [/z/g, "j"], [/y$/g, "i"]];

export const nameKey = (name) => {
    let s = String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
    for (const [re, to] of VARIANTS) s = s.replace(re, to);
    return s.replace(/(.)\1+/g, "$1") || null;
};

/** A stable fingerprint of an elector's photograph (PSE): identical images share it. */
import crypto from "crypto";
export const photoHashOf = (e) => e.photoHash ?? (e.photoUrl ? crypto.createHash("sha256").update(String(e.photoUrl)).digest("hex").slice(0, 32) : null);
