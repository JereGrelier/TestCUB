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
/** @type {ReturnType<typeof setTimeout>|null} */
let refreshTimer = null;
/** @type {boolean} */
let refreshInFlight = false;
/** @type {number} */
let refreshGeneration = 0;
/** @type {string|null} */
let stopsError = null;
/** @type {{ kind: string, message: string }} */
let vehiclesStatus = { kind: 'loading', message: 'Chargement des véhicules…' };

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

function renderStatus() {
  const parts = [];
  let kind = 'ok';

  if (stopsError) {
    parts.push(`Erreur arrêts : ${stopsError}`);
    kind = 'error';
  }

  parts.push(vehiclesStatus.message);

  if (vehiclesStatus.kind === 'error') {
    kind = 'error';
  } else if (vehiclesStatus.kind === 'loading' && kind !== 'error') {
    kind = 'loading';
  }

  statusEl.className = kind;
  statusEl.textContent = parts.join(' · ');
}

function formatTime(date) {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function appendLine(parent, text) {
  const line = document.createElement('div');
  line.textContent = text;
  parent.appendChild(line);
}

function vehiclePopup(v) {
  const el = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = v.routeId ? `Ligne ${v.routeId}` : 'Ligne inconnue';
  el.appendChild(title);
  appendLine(el, `Véhicule : ${v.vehicleId ?? ''}`);
  if (v.stopId) appendLine(el, `Arrêt : ${v.stopId}`);
  if (v.stopStatus) appendLine(el, `Statut : ${v.stopStatus}`);
  return el;
}

function vehicleIcon(bearing) {
  const rotation = Number.isFinite(bearing) ? bearing : 0;
  const icon = document.createElement('div');
  icon.className = 'vehicle-icon';
  icon.style.transform = `rotate(${rotation}deg)`;
  icon.textContent = '🚌';
  return L.divIcon({
    className: '',
    html: icon.outerHTML,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function stopPopup(stop) {
  const el = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = stop.name || stop.id || '';
  el.appendChild(title);
  appendLine(el, `ID : ${stop.id ?? ''}`);
  if (stop.code) appendLine(el, `Code : ${stop.code}`);
  return el;
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
  if (refreshInFlight || document.hidden) return;

  refreshInFlight = true;
  const generation = ++refreshGeneration;
  vehiclesStatus = { kind: 'loading', message: 'Actualisation des véhicules…' };
  renderStatus();

  try {
    const data = await fetchJson(apiUrl(`/realtime/vehicles/${CONFIG.feedKey}`), 'Véhicules');
    if (generation !== refreshGeneration) return;

    vehicleLayer.clearLayers();

    const positions = data.vehiclePositions || [];
    for (const v of positions) {
      if (!Number.isFinite(v.latitude) || !Number.isFinite(v.longitude)) continue;
      L.marker([v.latitude, v.longitude], { icon: vehicleIcon(v.bearing) })
        .bindPopup(vehiclePopup(v))
        .addTo(vehicleLayer);
    }

    vehiclesStatus = { kind: 'ok', message: `${positions.length} véhicules — ${formatTime(new Date())}` };
  } catch (error) {
    if (generation === refreshGeneration) {
      vehiclesStatus = { kind: 'error', message: `Erreur véhicules : ${error.message}` };
    }
  } finally {
    refreshInFlight = false;
    if (generation === refreshGeneration) {
      renderStatus();
      scheduleVehicleRefresh();
    }
  }
}

function scheduleVehicleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (document.hidden) return;
  refreshTimer = setTimeout(refreshVehicles, CONFIG.vehicleRefreshMs);
}

function startVehicleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshVehicles();
}

stopsToggle.addEventListener('change', () => {
  if (!stopsLayer) return;
  if (stopsToggle.checked) {
    stopsLayer.addTo(map);
  } else {
    map.removeLayer(stopsLayer);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  } else {
    scheduleVehicleRefresh();
    if (!refreshInFlight) refreshVehicles();
  }
});

async function init() {
  vehiclesStatus = { kind: 'loading', message: 'Chargement des arrêts…' };
  renderStatus();

  try {
    await loadStops();
    stopsError = null;
  } catch (error) {
    stopsError = error.message;
  }

  startVehicleRefresh();
}

init();
