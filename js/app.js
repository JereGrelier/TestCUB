/**
 * @typedef {Object} TbmConfig
 * @property {string} feedKey
 * @property {string} apiKey
 * @property {number} vehicleRefreshMs
 * @property {[number, number]} mapCenter
 * @property {number} mapZoom
 */

/** @type {TbmConfig} */
const CONFIG = {
  feedKey: 'bordeaux',
  apiKey: 'opendata-bordeaux-metropole-flux-gtfs-rt',
  vehicleRefreshMs: 12_000,
  mapCenter: [44.8378, -0.5792],
  mapZoom: 12,
  ...window.TBM_CONFIG,
};

const API_BASE = 'https://bdx.mecatran.com/utw/ws';
const statusEl = document.getElementById('status');
const stopsToggle = document.getElementById('stops-toggle');

/** @type {L.LayerGroup} */
let vehicleLayer;
/** @type {L.LayerGroup|null} */
let stopsLayer = null;
/** @type {ReturnType<typeof setInterval>|null} */
let refreshTimer = null;

const map = L.map('map', { zoomControl: true }).setView(CONFIG.mapCenter, CONFIG.mapZoom);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Données TBM — Bordeaux Métropole (Licence Ouverte)',
  maxZoom: 19,
}).addTo(map);

vehicleLayer = L.layerGroup().addTo(map);

function apiUrl(path) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('apiKey', CONFIG.apiKey);
  return url.toString();
}

function setStatus(kind, message) {
  statusEl.className = kind;
  statusEl.textContent = message;
}

function formatTime(date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function vehiclePopup(v) {
  const route = v.routeId ? `Ligne ${v.routeId}` : 'Ligne inconnue';
  const status = v.stopStatus ? `<br>Statut : ${v.stopStatus}` : '';
  const stop = v.stopId ? `<br>Arrêt : ${v.stopId}` : '';
  return `<strong>${route}</strong>Véhicule : ${v.vehicleId}${stop}${status}`;
}

function vehicleIcon(bearing) {
  const rotation = Number.isFinite(bearing) ? bearing : 0;
  return L.divIcon({
    className: '',
    html: `<div class="vehicle-icon" style="transform: rotate(${rotation}deg)">🚌</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function stopPopup(stop) {
  const code = stop.code ? `<br>Code : ${stop.code}` : '';
  return `<strong>${stop.name || stop.id}</strong>ID : ${stop.id}${code}`;
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} : HTTP ${response.status}`);
  }
  return response.json();
}

async function loadStops() {
  const url = apiUrl(`/gtfs/stops/${CONFIG.feedKey}?includeStations=false`);
  const stops = await fetchJson(url, 'Arrêts');
  stopsLayer = L.layerGroup();

  for (const stop of stops) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) continue;
    L.marker([stop.latitude, stop.longitude], {
      icon: L.divIcon({ className: '', html: '<div class="stop-icon"></div>', iconSize: [8, 8], iconAnchor: [4, 4] }),
    })
      .bindPopup(stopPopup(stop))
      .addTo(stopsLayer);
  }

  if (stopsToggle.checked) {
    stopsLayer.addTo(map);
  }
}

async function refreshVehicles() {
  setStatus('loading', 'Actualisation des véhicules…');
  try {
    const data = await fetchJson(apiUrl(`/realtime/vehicles/${CONFIG.feedKey}`), 'Véhicules');
    vehicleLayer.clearLayers();

    const positions = data.vehiclePositions || [];
    for (const v of positions) {
      if (!Number.isFinite(v.latitude) || !Number.isFinite(v.longitude)) continue;
      L.marker([v.latitude, v.longitude], { icon: vehicleIcon(v.bearing) })
        .bindPopup(vehiclePopup(v))
        .addTo(vehicleLayer);
    }

    setStatus('ok', `${positions.length} véhicules — ${formatTime(new Date())}`);
  } catch (error) {
    setStatus('error', `Erreur véhicules : ${error.message}`);
  }
}

function startVehicleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshVehicles();
  refreshTimer = setInterval(refreshVehicles, CONFIG.vehicleRefreshMs);
}

stopsToggle.addEventListener('change', () => {
  if (!stopsLayer) return;
  if (stopsToggle.checked) {
    stopsLayer.addTo(map);
  } else {
    map.removeLayer(stopsLayer);
  }
});

async function init() {
  setStatus('loading', 'Chargement des arrêts…');
  try {
    await loadStops();
    startVehicleRefresh();
  } catch (error) {
    setStatus('error', `Erreur arrêts : ${error.message}`);
    startVehicleRefresh();
  }
}

init();
