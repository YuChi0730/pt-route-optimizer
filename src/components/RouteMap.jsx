import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

function makeMarkerIcon(label, color) {
  return L.divIcon({
    className: "route-marker",
    html: `<div class="route-marker-pin" style="background:${color}">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -14],
  });
}

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, bounds]);
  return null;
}

export default function RouteMap({ route }) {
  const points = useMemo(
    () =>
      route
        .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude))
        .map((stop) => [stop.latitude, stop.longitude]),
    [route],
  );

  const bounds = useMemo(() => (points.length ? L.latLngBounds(points) : null), [points]);

  if (!points.length) {
    return (
      <p className="muted">無有效座標，無法顯示地圖。請確認個案皆已填入經緯度。</p>
    );
  }

  return (
    <div className="route-map">
      <MapContainer
        center={points[0]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: "420px", width: "100%", borderRadius: "16px" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={points} pathOptions={{ color: "#fca311", weight: 4, opacity: 0.85 }} />
        {route.map((stop, index) => {
          if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) return null;
          const isStart = index === 0;
          const isEnd = index === route.length - 1;
          const label = isStart ? "S" : isEnd ? "E" : String(index);
          const color = isStart ? "#10b981" : isEnd ? "#ef4444" : "#14213d";
          return (
            <Marker
              key={`${stop.id}-${index}`}
              position={[stop.latitude, stop.longitude]}
              icon={makeMarkerIcon(label, color)}
            >
              <Popup>
                <strong>{stop.name}</strong>
                <br />
                {stop.address}
              </Popup>
            </Marker>
          );
        })}
        <FitBounds bounds={bounds} />
      </MapContainer>
    </div>
  );
}
