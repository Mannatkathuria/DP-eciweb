
import React, {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import api from "../api/axios";
import PollingStationMap from "../components/maps/PollingStationMap";

export default function PollingStationMapPage() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState("");

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

  return (
    <div className="min-h-screen bg-gray-50 p-5 md:p-8">
      <div className="max-w-7xl mx-auto">

        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Polling Station Map
          </h1>

          <p className="text-gray-500 mt-2">
            Explore approved polling stations across India.
            Find nearby stations and view their details.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">

          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">
              Stations loaded
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {stations.length}
            </p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">
              Data source
            </p>
            <p className="text-lg font-semibold text-gray-900 uppercase">
              {source || "—"}
            </p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">
              Map status
            </p>
            <p className={`text-lg font-semibold ${
              error
                ? "text-red-600"
                : loading
                  ? "text-amber-600"
                  : "text-green-600"
            }`}>
              {error
                ? "Error"
                : loading
                  ? "Loading"
                  : "Connected"}
            </p>
          </div>

        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border p-3 md:p-5">
          <PollingStationMap
            stations={stations}
            onBoundsChange={loadStations}
            loading={loading}
          />
        </div>

      </div>
    </div>
  );
}
