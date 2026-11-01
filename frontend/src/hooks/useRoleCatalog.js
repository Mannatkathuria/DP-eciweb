import { useEffect, useState } from "react";
import api from "../api/axios";

let cache = null;

/** Role catalogue from the backend (permissions live there). Returns { roles, loading, failed }. */
export default function useRoleCatalog() {
  const [state, setState] = useState(cache ? { roles: cache, loading: false, failed: false } : { roles: [], loading: true, failed: false });
  useEffect(() => {
    if (cache) return;
    let live = true;
    api.get("/auth/roles")
      .then(({ data }) => { cache = data.data.roles; if (live) setState({ roles: cache, loading: false, failed: false }); })
      .catch(() => { if (live) setState({ roles: [], loading: false, failed: true }); });
    return () => { live = false; };
  }, []);
  return state;
}
