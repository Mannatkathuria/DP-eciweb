
import React, { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const EMPTY_GEOJSON = {
  type: "FeatureCollection",
  features: []
};

// Approximate geographical bounds of India.
const INDIA = {
  west: 68,
  south: 6,
  east: 98,
  north: 38
};

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
          partNumber: s.partNumber
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
  loading = false
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [78.9629, 20.5937],
      zoom: 4.5,
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

        content.append(
          name,
          code,
          address,
          district,
          constituency,
          part
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

    map.on("error", (event) => {
      console.error("MapLibre error:", event.error);
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
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600" />
            Polling stations
          </span>

          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            Your location
          </span>
        </div>

        <div className="text-sm text-gray-500">
          {loading
            ? "Updating stations..."
            : `${stations.length} stations loaded`}
        </div>
      </div>

      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden border border-gray-200"
        style={{ height: "650px" }}
      />
    </div>
  );
}
