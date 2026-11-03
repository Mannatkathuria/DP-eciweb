import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// A map of polling stations (OpenStreetMap tiles through Leaflet). Markers are drawn as circles,
// so no marker images are needed. `centre` (optional) marks the point that was searched from.
// Stations without a recorded location are simply not drawn; the list beside the map has them all.
export default function StationMap({ stations = [], centre = null, height = 360 }) {
    const box = useRef(null);
    const map = useRef(null);
    const layer = useRef(null);

    useEffect(() => {
        map.current = L.map(box.current, { scrollWheelZoom: false }).setView([22.5, 79], 4);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"
        }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
        return () => { map.current.remove(); map.current = null; };
    }, []);

    useEffect(() => {
        if (!map.current) return;
        layer.current.clearLayers();
        const points = [];
        for (const s of stations) {
            if (!s.location) continue;
            const at = [s.location.lat, s.location.lng];
            points.push(at);
            L.circleMarker(at, { radius: 8, color: "#0b4f8a", weight: 2, fillColor: "#1f7ae0", fillOpacity: 0.85 })
                .bindPopup(`<strong>${escape(s.name)}</strong><br>${escape(s.address)}<br>Part ${escape(s.partNumber)}${s.distanceKm !== undefined ? ` · ${s.distanceKm} km` : ""}`)
                .addTo(layer.current);
        }
        if (centre) {
            const at = [centre.lat, centre.lng];
            points.push(at);
            L.circleMarker(at, { radius: 6, color: "#b3261e", weight: 2, fillColor: "#b3261e", fillOpacity: 1 }).bindPopup("You searched from here").addTo(layer.current);
        }
        if (points.length === 1) map.current.setView(points[0], 15);
        else if (points.length > 1) map.current.fitBounds(points, { padding: [30, 30], maxZoom: 16 });
    }, [stations, centre]);

    const drawn = stations.filter((s) => s.location).length;
    return (
        <figure style={{ margin: 0 }}>
            <div ref={box} role="region" aria-label="Map of polling stations" style={{ height, borderRadius: 8, border: "1px solid var(--line, #ccd)" }} />
            <figcaption className="muted"><small>{drawn} of {stations.length} station{stations.length === 1 ? "" : "s"} on the map{drawn < stations.length ? " (the others have no recorded location)" : ""}. Map data © OpenStreetMap contributors.</small></figcaption>
        </figure>
    );
}

const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
