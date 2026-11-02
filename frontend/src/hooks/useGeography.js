import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";

// The ECI State -> District -> Constituency dataset, loaded once per page load.
let cache = null;
let pending = null;

export default function useGeography() {
    const [geography, setGeography] = useState(cache);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (cache) return;
        pending ??= api.get("/auth/geography").then(({ data }) => { cache = data.data; return cache; });
        pending.then(setGeography).catch(() => { pending = null; setFailed(true); });
    }, []);
    // Stable helpers, so components can use them in effect and memo dependencies.
    const helpers = useMemo(() => {
        const states = geography?.states ?? [];
        const districtsOf = (state) => states.find((s) => s.name === state)?.districts ?? [];
        const constituenciesOf = (state, district) => {
            const ds = districtsOf(state);
            return district ? ds.find((d) => d.name === district)?.constituencies ?? [] : ds.flatMap((d) => d.constituencies);
        };
        return { states, districtsOf, constituenciesOf };
    }, [geography]);
    return { geography, failed, ...helpers };
}
