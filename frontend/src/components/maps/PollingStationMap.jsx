
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const EMPTY_GEOJSON = {
  type: "FeatureCollection",
  features: []
};

// Used when the vector style cannot be fetched (offline, blocked network): OpenStreetMap raster
// tiles over a plain background, so the stations still show.
const FALLBACK_STYLE = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors" } },
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef1f5" } }, { id: "osm", type: "raster", source: "osm" }]
};

// Approximate geographical bounds of India.
const INDIA = {
  west: 68,
  south: 6,
  east: 98,
  north: 38
};

const FACILITY = { ramp: "ramp", wheelchair: "wheelchair", drinkingWater: "drinking water", toilet: "toilet", shade: "shade", signage: "signage" };

function toGeoJSON(stations = []) {
  return {
    type: "FeatureCollection",
    features: stations
      .filter((s) =>
        Number.isFinite(Number(s.location?.lat)) &&
        Number.isFinite(Number(s.location?.lng)) &&
        s.location?.lat !== null &&
        s.location?.lng !== null
      )
      .map((s) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [
            Number(s.location.lng),
            Number(s.location.lat)
          ]
        },
        properties: {
          id: s._id,
          name: s.name,
          stationCode: s.stationCode,
          address: s.address,
          district: s.district,
          constituency: s.constituency,
          partNumber: s.partNumber,
          facilities: Object.entries(s.accessibility ?? {}).filter(([, v]) => v).map(([k]) => FACILITY[k] ?? k).join(", "),
          missing: Object.entries(s.accessibility ?? {}).filter(([, v]) => !v).map(([k]) => FACILITY[k] ?? k).join(", "),
          relocated: s.relocationNotice ? `Moved from ${s.relocationNotice.from}` : "",
          survey: s.facilitySurvey ? `Facility survey ${new Date(s.facilitySurvey.at).toLocaleDateString("en-IN")}: ${s.facilitySurvey.amfScore}% of assured minimum facilities${s.facilitySurvey.missing?.length ? `; missing ${s.facilitySurvey.missing.slice(0, 3).join(", ")}` : ""}${s.facilitySurvey.distances?.hospital !== undefined ? `; hospital ${s.facilitySurvey.distances.hospital} km` : ""}` : ""
        }
      }))
  };
}

function getIndiaBounds(map) {
  const bounds = map.getBounds();

  const west = Math.max(bounds.getWest(), INDIA.west);
  const south = Math.max(bounds.getSouth(), INDIA.south);
  const east = Math.min(bounds.getEast(), INDIA.east);
  const north = Math.min(bounds.getNorth(), INDIA.north);

  // No intersection with India.
  if (west >= east || south >= north) {
    return null;
  }

  return [west, south, east, north]
    .map((value) => value.toFixed(5))
    .join(",");
}

export default function PollingStationMap({
  stations = [],
  onBoundsChange,
  loading = false,
  focus = null
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const stationsRef = useRef(stations);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const locationWatchRef = useRef(null);

  // Keep the latest station data and callback.
  useEffect(() => {
    stationsRef.current = stations;

    const source = mapRef.current?.getSource("polling-stations");

    if (source) {
      source.setData(toGeoJSON(stations));
    }
  }, [stations]);

  useEffect(() => {
    onBoundsChangeRef.current = onBoundsChange;
  }, [onBoundsChange]);

  // Fly to a station the page asks for (for example after an EPIC lookup).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || !Number.isFinite(Number(focus.lat))) return;
    map.flyTo({ center: [Number(focus.lng), Number(focus.lat)], zoom: 15 });
  }, [focus]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds: [[68, 6.5], [97.5, 36.5]],
      fitBoundsOptions: { padding: 10 },
      minZoom: 3,
      maxZoom: 18
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl(),
      "top-right"
    );

    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: {
          enableHighAccuracy: true
        },
        trackUserLocation: true,
        showUserHeading: true
      }),
      "top-right"
    );

    // Fetch stations for the currently visible geographical area.
    const loadVisibleStations = () => {
      const bbox = getIndiaBounds(map);

      if (bbox) {
        onBoundsChangeRef.current?.(bbox);
      }
    };

    map.on("load", () => {
      // Polling station GeoJSON source.
      map.addSource("polling-stations", {
        type: "geojson",
        data: toGeoJSON(stationsRef.current),
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 13
      });

      // Station clusters.
      map.addLayer({
        id: "station-clusters",
        type: "circle",
        source: "polling-stations",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            10, 20,
            50, 26,
            100, 32
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });

      // Cluster counts.
      map.addLayer({
        id: "station-cluster-count",
        type: "symbol",
        source: "polling-stations",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      // Individual stations.
      map.addLayer({
        id: "station-points",
        type: "circle",
        source: "polling-stations",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5, 4,
            12, 7,
            16, 10
          ],
          "circle-color": "#2563eb",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2
        }
      });

      // User location source.
      map.addSource("my-location", {
        type: "geojson",
        data: EMPTY_GEOJSON
      });

      map.addLayer({
        id: "my-location-point",
        type: "circle",
        source: "my-location",
        paint: {
          "circle-radius": 9,
          "circle-color": "#ef4444",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3
        }
      });

      // Individual station popup.
      map.on("click", "station-points", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const p = feature.properties;

        const content = document.createElement("div");
        content.className = "p-1";

        const name = document.createElement("strong");
        name.textContent = p.name || "Polling Station";

        const code = document.createElement("p");
        code.textContent = `Code: ${p.stationCode || "N/A"}`;

        const address = document.createElement("p");
        address.textContent = p.address || "Address unavailable";

        const district = document.createElement("p");
        district.textContent = `District: ${p.district || "N/A"}`;

        const constituency = document.createElement("p");
        constituency.textContent =
          `Constituency: ${p.constituency || "N/A"}`;

        const part = document.createElement("p");
        part.textContent = `Part: ${p.partNumber || "N/A"}`;

        const facilities = document.createElement("p");
        facilities.textContent = p.facilities ? `Facilities: ${p.facilities}` : "";
        const missing = document.createElement("p");
        missing.textContent = p.missing ? `Not available: ${p.missing}` : "";
        const moved = document.createElement("p");
        moved.textContent = p.relocated || "";
        const survey = document.createElement("p");
        survey.textContent = p.survey || "";
        const directions = document.createElement("a");
        directions.href = `https://www.google.com/maps/dir/?api=1&destination=${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}`;
        directions.target = "_blank";
        directions.rel = "noopener noreferrer";
        directions.textContent = "Directions";

        content.append(
          name,
          code,
          address,
          district,
          constituency,
          part,
          ...[facilities, missing, survey, moved].filter((x) => x.textContent),
          directions
        );

        new maplibregl.Popup({ maxWidth: "300px" })
          .setLngLat(feature.geometry.coordinates)
          .setDOMContent(content)
          .addTo(map);
      });

      map.on("mouseenter", "station-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "station-points", () => {
        map.getCanvas().style.cursor = "";
      });

      // Expand clusters on click.
      map.on("click", "station-clusters", (event) => {
        const feature = map.queryRenderedFeatures(event.point, {
          layers: ["station-clusters"]
        })[0];

        if (!feature) return;

        const source = map.getSource("polling-stations");

        source.getClusterExpansionZoom(
          feature.properties.cluster_id,
          (error, zoom) => {
            if (error) return;

            map.easeTo({
              center: feature.geometry.coordinates,
              zoom
            });
          }
        );
      });

      // Initial API request.
      loadVisibleStations();

      // Fetch whenever the user finishes moving or zooming.
      map.on("moveend", loadVisibleStations);

      // Browser GPS location.
      if (navigator.geolocation) {
        locationWatchRef.current =
          navigator.geolocation.watchPosition(
            ({ coords }) => {
              map.getSource("my-location")?.setData({
                type: "FeatureCollection",
                features: [{
                  type: "Feature",
                  geometry: {
                    type: "Point",
                    coordinates: [
                      coords.longitude,
                      coords.latitude
                    ]
                  },
                  properties: {}
                }]
              });
            },
            (error) => {
              console.warn(
                "Location unavailable:",
                error.message
              );
            },
            {
              enableHighAccuracy: true,
              maximumAge: 10000
            }
          );
      }
    });

    let fellBack = false;
    map.on("error", (event) => {
      // The style itself failed: switch once to the fallback so the station layers can load.
      if (!fellBack && !map.isStyleLoaded() && /style|liberty|Failed to fetch/i.test(String(event.error?.message ?? event.error))) {
        fellBack = true;
        map.setStyle(FALLBACK_STYLE);
        return;
      }
      console.warn("Map:", event.error?.message ?? event.error);
    });

    return () => {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(
          locationWatchRef.current
        );
        locationWatchRef.current = null;
      }

      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div>
      <div className="row-actions" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="row-actions" style={{ gap: 18, fontSize: ".9rem" }}>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 12, height: 12, borderRadius: 99, background: "#2563eb", marginRight: 6, verticalAlign: "middle" }} />Polling stations</span>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 12, height: 12, borderRadius: 99, background: "#ef4444", marginRight: 6, verticalAlign: "middle" }} />Your location</span>
        </div>
        <span className="muted" role="status">{loading ? "Updating stations…" : `${stations.length} stations in view`}</span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: "min(650px, 70vh)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}
        role="region" aria-label="Map of approved polling stations" />
    </div>
  );
}
