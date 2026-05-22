"use strict";

// ── Score → colour ramp (same as QGIS SCORE_RAMP_4_10) ─────────────────────
function scoreColour(score) {
  if (score >= 8.5) return "#1a9850";   // Excellent
  if (score >= 7.5) return "#66bd63";   // Very good
  if (score >= 6.0) return "#a6d96a";   // Good
  if (score >= 5.0) return "#d9ef8b";   // Fair-high
  return "#fee08b";                     // Fair-low (>=4.0)
}

function scoreOpacity(score) {
  if (score >= 8.5) return 0.85;
  if (score >= 7.5) return 0.78;
  if (score >= 6.0) return 0.70;
  if (score >= 5.0) return 0.65;
  return 0.55;
}

// ── Map initialisation ─────────────────────────────────────────────────────
const map = L.map("map", {
  center: [-42.0, 146.5],
  zoom: 7,
  zoomControl: true,
  preferCanvas: true,                   // canvas renderer is much faster than SVG for many polygons
});

// ── Basemap tile layers ────────────────────────────────────────────────────
const basemaps = {
  osm:  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors", maxZoom: 19 }),
  topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenTopoMap (CC-BY-SA)", maxZoom: 17, subdomains: "abc" }),
  sat:  L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { attribution: "Tiles © Esri", maxZoom: 19 }),
};
basemaps.osm.addTo(map);
let currentBase = "osm";

// ── Habitat (bundled GeoJSON) ──────────────────────────────────────────────
function habitatStyle(f) {
  const s = f.properties.score;
  return {
    color:       "#1a3a2a",
    weight:      0.4,
    opacity:     0.8,
    fillColor:   scoreColour(s),
    fillOpacity: scoreOpacity(s),
  };
}

function habitatPopup(f) {
  const p = f.properties;
  const colour = scoreColour(p.score);
  return `
    <div class="popup-title">
      ${p.VEGCODE_D || ""}
      <span class="popup-score" style="background:${colour}">
        ${p.score?.toFixed?.(1) ?? "?"} / 10
      </span>
    </div>
    <div class="popup-meta">
      <span class="k">Quality</span><span class="v">${p.score_grp || ""}</span>
      <span class="k">Harvest year</span><span class="v">${p.disturb_yr || "?"}</span>
      <span class="k">Disturbance pts</span><span class="v">+${p.disturb_pt ?? 0}</span>
      <span class="k">Tenure</span><span class="v">${p.TEN_CLASS || ""}</span>
      <span class="k">Autumn rain</span><span class="v">${p.autumn_mm?.toFixed?.(0) ?? "?"} mm</span>
      <span class="k">Frost days/yr</span><span class="v">${p.frost_d?.toFixed?.(0) ?? "?"}</span>
    </div>
  `;
}

let habitatLayer = null;
function loadHabitat() {
  fetch("data/habitat.geojson")
    .then(r => r.json())
    .then(data => {
      habitatLayer = L.geoJSON(data, {
        renderer: L.canvas(),
        style: habitatStyle,
        onEachFeature: (f, layer) => layer.bindPopup(habitatPopup(f)),
      }).addTo(map);
    })
    .catch(e => console.error("Failed to load habitat.geojson:", e));
}
loadHabitat();

// ── Live LIST layers (esri-leaflet feature services) ──────────────────────
const LIST_TOPO    = "https://services.thelist.tas.gov.au/arcgis/rest/services/Public/TopographyAndRelief/MapServer";
const LIST_CADASTRE = "https://services.thelist.tas.gov.au/arcgis/rest/services/Public/CadastreAndAdministrative/MapServer";

// SQL filter matching the QGIS "Tenure — accessible (legal access)" subset
const ACCESSIBLE_TENURE_SQL =
  "TEN_CLASS IN ('Crown Land','Public Reserve','Nature Recreation Area'," +
  "'Regional Reserve','State Reserve','Permanent Timber Production Zone Land'," +
  "'Future Potential Production Forest (Crown)','Game Reserve','Wellington Park'," +
  "'Local Government','Local Government Act Reserve')";

// Camping pin icon (tent emoji on a coloured circle)
const campingIcon = L.divIcon({
  className: "",
  html: `<div style="
      font-size: 18px; line-height: 28px; width: 28px; height: 28px;
      text-align: center;
      background: #2a9d8f;
      border: 2px solid #0f3a35;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 6px rgba(0,0,0,.4);">
    <span style="display:inline-block; transform: rotate(45deg);">⛺</span>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

const liveLayers = {
  roads: L.esri.featureLayer({
    url: `${LIST_TOPO}/8`,
    minZoom: 10,
    simplifyFactor: 0.5,
    style: { color: "#a04000", weight: 1.2, opacity: 0.85 },
    onEachFeature: (f, layer) => layer.bindPopup(`<b>${f.properties.PRI_NAME || "Road"}</b><br>${f.properties.TRAN_CLASS || ""}`),
  }),
  walking: L.esri.featureLayer({
    url: `${LIST_TOPO}/24`,
    minZoom: 12,
    simplifyFactor: 0.4,
    style: { color: "#6b3e8c", weight: 1.6, dashArray: "4,4", opacity: 0.9 },
    onEachFeature: (f, layer) => layer.bindPopup(`<b>${f.properties.PRI_NAME || "Walking track"}</b><br>${f.properties.TRAN_CLASS || ""}`),
  }),
  streams: L.esri.featureLayer({
    url: `${LIST_TOPO}/15`,
    minZoom: 12,
    simplifyFactor: 0.5,
    style: { color: "#3b8ec2", weight: 1.0, opacity: 0.8 },
  }),
  lakes: L.esri.featureLayer({
    url: `${LIST_TOPO}/22`,
    minZoom: 9,
    simplifyFactor: 0.6,
    style: { color: "#1d3557", weight: 0.8, fillColor: "#a8dadc", fillOpacity: 0.7 },
  }),
  contours: L.esri.featureLayer({
    url: `${LIST_TOPO}/9`,
    minZoom: 13,
    simplifyFactor: 0.4,
    style: { color: "#6b5947", weight: 0.5, opacity: 0.7 },
  }),
  // Camping — uses layer 79 (Camping Area polygons, 114 named features) but
  // displayed as pin markers at each polygon's centroid. The polygons are
  // rendered transparent so only the pins show.
  camping: (() => {
    const campingMarkers = L.layerGroup();
    const polygonLayer = L.esri.featureLayer({
      url: `${LIST_TOPO}/79`,
      minZoom: 9,
      style: { fillOpacity: 0, opacity: 0, stroke: false, weight: 0 },
      onEachFeature: (feature, layer) => {
        if (layer.getBounds) {
          const center = layer.getBounds().getCenter();
          const p = feature.properties || {};
          const m = L.marker(center, { icon: campingIcon }).bindPopup(
            `<div class="popup-title">⛺ ${p.NAME || "Camping area"}</div>
             <div class="popup-meta">
               ${p.INFTY2_TXT ? `<span class="k">Type</span><span class="v">${p.INFTY2_TXT}</span>` : ""}
             </div>`
          );
          campingMarkers.addLayer(m);
        }
      },
    });
    return L.featureGroup([polygonLayer, campingMarkers]);
  })(),
  // Tenure — accessible classes only, from CadastreAndAdministrative layer 34.
  // visible at ALL zooms (minZoom 0); same SQL filter as the QGIS layer.
  tenure: L.esri.featureLayer({
    url: `${LIST_CADASTRE}/34`,
    minZoom: 0,
    where: ACCESSIBLE_TENURE_SQL,
    simplifyFactor: 0.7,
    style: { color: "#15803d", weight: 0.6, fillColor: "#4ade80", fillOpacity: 0.18 },
    onEachFeature: (f, layer) => {
      const p = f.properties || {};
      layer.bindPopup(
        `<div class="popup-title">${p.TEN_CLASS || "Public land"}</div>
         <div class="popup-meta">
           ${p.FEAT_NAME ? `<span class="k">Name</span><span class="v">${p.FEAT_NAME}</span>` : ""}
           ${p.ACT ? `<span class="k">Act</span><span class="v">${p.ACT}</span>` : ""}
         </div>`
      );
    },
  }),
};

// ── Toggle plumbing ────────────────────────────────────────────────────────
const allLayers = {
  habitat: { add: () => habitatLayer && habitatLayer.addTo(map),
             remove: () => habitatLayer && map.removeLayer(habitatLayer),
             minZoom: 0 },
};

// Wrap live layers in the same interface
for (const [name, lyr] of Object.entries(liveLayers)) {
  const btn = document.querySelector(`[data-layer="${name}"]`);
  const minZoom = btn ? parseInt(btn.dataset.minzoom || "0", 10) : 0;
  allLayers[name] = {
    add:    () => lyr.addTo(map),
    remove: () => map.removeLayer(lyr),
    minZoom,
  };
}

function setLayerState(name, on) {
  const def = allLayers[name];
  if (!def) return;
  if (on)  def.add();
  else     def.remove();
  const btn = document.querySelector(`[data-layer="${name}"]`);
  if (btn) btn.classList.toggle("on", on);
}

// Buttons (overlay layers)
document.querySelectorAll(".layer-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("disabled-zoom")) {
      showToast(`Zoom in to see ${btn.textContent.trim()}`);
      return;
    }
    const name = btn.dataset.layer;
    setLayerState(name, !btn.classList.contains("on"));
  });
});

// Habitat is on by default — actually add it once it's loaded
// (we already do that inside loadHabitat). Button shows .on initially.

// ── Basemap selector ──────────────────────────────────────────────────────
document.querySelectorAll(".base-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.base;
    if (target === currentBase) return;
    map.removeLayer(basemaps[currentBase]);
    basemaps[target].addTo(map);
    currentBase = target;
    document.querySelectorAll(".base-btn").forEach(b =>
      b.classList.toggle("on", b.dataset.base === target));
  });
});

// ── Zoom-based UI state ────────────────────────────────────────────────────
function updateZoomUI() {
  const z = map.getZoom();
  document.getElementById("zoomReadout").textContent = `zoom ${z}`;
  document.querySelectorAll(".layer-btn").forEach(btn => {
    const minZ = parseInt(btn.dataset.minzoom || "0", 10);
    btn.classList.toggle("disabled-zoom", z < minZ);
  });
}
map.on("zoomend", updateZoomUI);
updateZoomUI();

// ── Collapsible side panel ─────────────────────────────────────────────────
// Mobile users get the panel collapsed by default so the map is usable; desktop
// users get it expanded. State is remembered per session.
const panelEl     = document.getElementById("panel");
const panelOpen   = document.getElementById("panelOpenBtn");
const panelClose  = document.getElementById("panelCloseBtn");
const PANEL_KEY   = "mush_panel_collapsed";

function setPanelCollapsed(yes) {
  panelEl.classList.toggle("collapsed", yes);
  panelOpen.classList.toggle("show", yes);
  try { sessionStorage.setItem(PANEL_KEY, yes ? "yes" : "no"); } catch (e) {}
}

(function initPanelState() {
  let stored = null;
  try { stored = sessionStorage.getItem(PANEL_KEY); } catch (e) {}
  if (stored === "yes") setPanelCollapsed(true);
  else if (stored === "no") setPanelCollapsed(false);
  else setPanelCollapsed(window.innerWidth < 700);
})();

panelClose.addEventListener("click", () => setPanelCollapsed(true));
panelOpen.addEventListener("click", () => setPanelCollapsed(false));

// ── GPS "find me" button ───────────────────────────────────────────────────
// Note: geolocation requires HTTPS in modern browsers, but localhost is
// treated as secure so this works during local development.
const gpsBtn = document.getElementById("gpsBtn");
let userMarker = null;
let userAccuracy = null;

gpsBtn.addEventListener("click", () => {
  gpsBtn.classList.remove("found");
  gpsBtn.classList.add("locating");
  map.locate({
    setView: true,
    maxZoom: 14,
    enableHighAccuracy: true,
    timeout: 15000,
  });
});

map.on("locationfound", (e) => {
  gpsBtn.classList.remove("locating");
  gpsBtn.classList.add("found");

  // Clear previous markers if user clicks again
  if (userMarker)   map.removeLayer(userMarker);
  if (userAccuracy) map.removeLayer(userAccuracy);

  userMarker = L.circleMarker(e.latlng, {
    radius: 8,
    fillColor: "#2d6a4f",
    color: "#fff",
    weight: 2,
    fillOpacity: 1,
    interactive: true,
  })
  .bindPopup(
    `<div class="popup-title">You are here</div>
     <div class="popup-meta">
       <span class="k">Lat</span><span class="v">${e.latlng.lat.toFixed(5)}</span>
       <span class="k">Lon</span><span class="v">${e.latlng.lng.toFixed(5)}</span>
       <span class="k">Accuracy</span><span class="v">±${Math.round(e.accuracy)} m</span>
     </div>`
  )
  .addTo(map);

  userAccuracy = L.circle(e.latlng, {
    radius: e.accuracy,
    color: "#2d6a4f",
    weight: 1,
    fillColor: "#2d6a4f",
    fillOpacity: 0.08,
    interactive: false,
  }).addTo(map);

  showToast(`Located ±${Math.round(e.accuracy)} m`);
});

map.on("locationerror", (e) => {
  gpsBtn.classList.remove("locating", "found");
  const msg = ({
    1: "Location permission denied. Enable it in browser settings.",
    2: "Location unavailable. Try again outside or near a window.",
    3: "Location request timed out.",
  })[e.code] || `Location error: ${e.message}`;
  showToast(msg);
});

// ── Toast helper ───────────────────────────────────────────────────────────
let toastEl;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}
