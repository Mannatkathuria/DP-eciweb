// Remembers that the visitor has already seen the first-visit choice.
const KEY = "eci.entrySeen";
export const hasSeenEntry = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const markEntrySeen = () => { try { localStorage.setItem(KEY, "1"); } catch { /* storage unavailable: the choice is simply asked again */ } };
