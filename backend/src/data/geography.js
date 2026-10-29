// State/UT -> District -> Assembly constituency data, generated from the official
// Local Government Directory by scripts/build-geography.js. Do not edit geography.json by hand.
import geography from "./geography.json" with { type: "json" };

export { geography };

const findState = (state) => geography.states.find((s) => s.name === state);

/**
 * Returns an error message if the State/UT, district and assembly constituency do not form
 * a combination present in the dataset, otherwise null. Names must match exactly.
 */
export const validateGeography = ({ state, district, assemblyConstituency }) => {
    const stateEntry = findState(state);
    if (!stateEntry) return "Select a valid State/UT.";
    const districtEntry = stateEntry.districts.find((d) => d.name === district);
    if (!districtEntry) return "Select a valid district for the selected State/UT.";
    if (stateEntry.constituencies !== "available") {
        return stateEntry.constituencies === "none"
            ? "The selected State/UT has no legislative assembly constituencies."
            : "Assembly constituency data is not yet available for the selected State/UT.";
    }
    if (!districtEntry.constituencies.includes(assemblyConstituency)) {
        return "Select a valid assembly constituency for the selected district.";
    }
    return null;
};
