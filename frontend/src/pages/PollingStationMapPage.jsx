
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import api from "../api/axios";
import PageHead from "../components/PageHead";
import { Link } from "react-router-dom";
import PollingStationMap from "../components/maps/PollingStationMap";

export default function PollingStationMapPage() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");

  const [epic, setEpic] = useState("");
  const [found, setFound] = useState(null);
  const [focus, setFocus] = useState(null);
  const controllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const loadStations = useCallback(async (bbox) => {
    // Cancel the previous viewport request.
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError("");

    try {
      const response = await api.get(
        "/public/stations/map",
        {
          params: {
            bbox,
            limit: 2000
          },
          signal: controller.signal
        }
      );

      if (requestId !== requestIdRef.current) return;

      const items = response.data?.data?.items;

      if (!Array.isArray(items)) {
        throw new Error("Invalid polling station response.");
      }

      setStations(items);
      setSource(response.data.data.source || "");
    } catch (err) {
      if (
        err.name === "CanceledError" ||
        err.code === "ERR_CANCELED"
      ) {
        return;
      }

      if (requestId !== requestIdRef.current) return;

      console.error("Polling station API error:", err);

      setError(
        err.response?.data?.message ||
        err.message ||
        "Unable to load polling stations."
      );

      setStations([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      requestIdRef.current++;
    };
  }, []);

  // Find the station of one EPIC and fly the map to it. Only the part and station come back.
  const lookup = async (e) => {
    e.preventDefault();
    setFound(null);
    try {
      const { data } = await api.get(`/public/stations/epic/${encodeURIComponent(epic.trim().toUpperCase())}`);
      const station = data.data?.station ?? data.data;
      setFound({ ok: true, station });
      if (station?.location) setFocus({ ...station.location, at: Date.now() });
    } catch (err) {
      setFound({ ok: false, message: err.response?.data?.message || "No polling station was found for that EPIC number." });
    }
  };

  return (
    <>
      <PageHead title="Polling station map" crumbs={[{ label: "Voters" }, { label: "Polling station map" }]}
        lede="Approved polling stations, from the published list. Move or zoom the map to load the stations in view, or find yours by EPIC number. Proposals that are still being considered are never shown." />
      <section className="section">
        <div className="container stack">
          <form className="panel" onSubmit={lookup} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
            <div style={{ flex: "1 1 260px" }}>
              <label htmlFor="map-epic" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Find my polling station (EPIC number)</label>
              <input id="map-epic" value={epic} onChange={(e) => setEpic(e.target.value)} placeholder="e.g. ABC1234567" autoComplete="off" style={{ width: "100%" }} />
            </div>
            <button className="btn btn-primary" disabled={!epic.trim()}>Find</button>
            <Link className="btn btn-quiet" to="/booths">Search by area instead</Link>
          </form>
          {found && (found.ok
            ? <div className="alert alert-ok" role="status"><strong>{found.station?.name}</strong> · part {found.station?.partNumber}, {found.station?.constituency}{found.station?.location ? "" : " (this station has no map location yet)"}</div>
            : <div className="alert alert-error" role="alert">{found.message}</div>)}
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <div className="panel">
            <PollingStationMap stations={stations} onBoundsChange={loadStations} loading={loading} focus={focus} />
            <p className="muted" style={{ marginTop: 10 }}><small>Data: {source ? `${source} read model` : "—"}. Map tiles © OpenFreeMap / OpenStreetMap contributors.</small></p>
          </div>
        </div>
      </section>
    </>
  );
}
