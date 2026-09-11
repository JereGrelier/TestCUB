/**
 * @typedef {Object} TbmConfig
 * @property {string} feedKey
 * @property {string} apiKey
 * @property {number} vehicleRefreshMs
 * @property {[number, number]} mapCenter
 * @property {number} mapZoom
 * @property {number} minStopZoom
 */

/** @type {TbmConfig} */
const CONFIG = {
  feedKey: 'bordeaux',
  apiKey: 'opendata-bordeaux-metropole-flux-gtfs-rt',
  vehicleRefreshMs: 12_000,
  mapCenter: [44.8378, -0.5792],
  mapZoom: 12,
  minStopZoom: 14,
  ...window.TBM_CONFIG,
};

const API_BASE = 'https://bdx.mecatran.com/utw/ws';
const TRAM_ROUTE_TYPE = 0;
const HEX_COLOR = /^[0-9A-Fa-f]{6}$/;
const DEFAULT_ROUTE_COLOR = '#1565c0';
const DEFAULT_ROUTE_TEXT_COLOR = '#ffffff';
const VEHICLE_FETCH_TIMEOUT_MS = 15_000;
const STATIC_FETCH_TIMEOUT_MS = 30_000;

const statusEl = document.getElementById('status');
const stopsToggle = document.getElementById('stops-toggle');
const routeSearchEl = document.getElementById('route-search');
const routeListEl = document.getElementById('route-list');
const routeResetEl = document.getElementById('route-reset');

/** @type {L.LayerGroup} */
let vehicleLayer;
/** @type {L.LayerGroup} */
let stopsLayer;
/** @type {ReturnType<typeof setTimeout>|null} */
let refreshTimer = null;
let refreshInFlight = false;
let refreshGeneration = 0;
/** @type {string|null} */
let routesError = null;
/** @type {string|null} */
let stopsError = null;
/** @type {{ kind: string, message: string }} */
let vehiclesStatus = { kind: 'loading', message: 'Chargement des véhicules…' };
/** @type {Map<string, object>} */
const routesById = new Map();
/** @type {Set<string>} */
const selectedRouteIds = new Set();
/** @type {Set<string>} */
const activeRouteIds = new Set();
/** @type {object[]} */
let stopsData = [];
/** @type {object[]} */
let lastVehiclePositions = [];
/** @type {Date|null} */
let lastVehicleFetchAt = null;
let stopsZoomHint = '';

const map = L.map('map', { zoomControl: true }).setView(CONFIG.mapCenter, CONFIG.mapZoom);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Données TBM — Bordeaux Métropole (Licence Ouverte)',
  maxZoom: 19,
}).addTo(map);

vehicleLayer = L.layerGroup().addTo(map);
stopsLayer = L.layerGroup();

function apiUrl(path) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('apiKey', CONFIG.apiKey);
  return url.toString();
}

function routeLabel(routeId) {
  const route = routesById.get(routeId);
  return route?.shortName || routeId;
}

function sanitizeHexColor(color, fallback) {
  return typeof color === 'string' && HEX_COLOR.test(color) ? `#${color}` : fallback;
}

function routeColor(routeId) {
  const route = routesById.get(routeId);
  return sanitizeHexColor(route?.color, DEFAULT_ROUTE_COLOR);
}

function routeTextColor(routeId) {
  const route = routesById.get(routeId);
  return sanitizeHexColor(route?.textColor, DEFAULT_ROUTE_TEXT_COLOR);
}

function stopAccessibleName(stop) {
  const name = stop.name || stop.id || 'inconnu';
  return `Arrêt ${name}`;
}

function vehicleAccessibleName(vehicle) {
  const line = routeLabel(vehicle.routeId);
  const id = vehicle.vehicleId ?? 'inconnu';
  return `Véhicule ligne ${line}, ${id}`;
}

function isTramVehicle(vehicle) {
  if (typeof vehicle.vehicleId === 'string' && vehicle.vehicleId.startsWith('ineo-tram:')) {
    return true;
  }
  const route = routesById.get(vehicle.routeId);
  return route?.type === TRAM_ROUTE_TYPE;
}

function matchesRouteFilter(routeId) {
  return selectedRouteIds.size === 0 || selectedRouteIds.has(routeId);
}

function stopMatchesFilter(stop) {
  if (selectedRouteIds.size === 0) return true;
  const ids = stop.routeIds || [];
  return ids.some((id) => selectedRouteIds.has(id));
}

function selectedRoutesSummary() {
  if (selectedRouteIds.size === 0) return '';
  const labels = [...selectedRouteIds].map(routeLabel).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  return ` · lignes ${labels.join(', ')}`;
}

function renderStatus() {
  const parts = [];
  let kind = 'ok';

  if (routesError) {
    parts.push(`Erreur lignes : ${routesError}`);
    kind = 'error';
  }

  if (stopsError) {
    parts.push(`Erreur arrêts : ${stopsError}`);
    kind = 'error';
  }

  if (stopsZoomHint) {
    parts.push(stopsZoomHint);
    if (kind === 'ok') kind = 'loading';
  }

  parts.push(vehiclesStatus.message + selectedRoutesSummary());

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
  const route = routesById.get(v.routeId);
  title.textContent = route?.longName ? `Ligne ${routeLabel(v.routeId)} — ${route.longName}` : `Ligne ${routeLabel(v.routeId)}`;
  el.appendChild(title);
  appendLine(el, `Véhicule : ${v.vehicleId ?? ''}`);
  if (v.stopId) appendLine(el, `Arrêt : ${v.stopId}`);
  if (v.stopStatus) appendLine(el, `Statut : ${v.stopStatus}`);
  return el;
}

function vehicleIcon(vehicle) {
  const bearing = Number.isFinite(vehicle.bearing) ? vehicle.bearing : 0;
  const routeId = vehicle.routeId || '?';
  const kind = isTramVehicle(vehicle) ? 'tram' : 'bus';
  const marker = document.createElement('div');
  marker.className = `vehicle-marker vehicle-marker--${kind}`;

  const badge = document.createElement('div');
  badge.className = 'vehicle-badge';
  badge.textContent = routeLabel(routeId);
  badge.style.backgroundColor = routeColor(routeId);
  badge.style.color = routeTextColor(routeId);

  const heading = document.createElement('div');
  heading.className = 'vehicle-heading';
  heading.style.transform = `rotate(${bearing}deg)`;
  heading.setAttribute('aria-hidden', 'true');

  marker.setAttribute('role', 'img');
  marker.setAttribute('aria-label', vehicleAccessibleName(vehicle));

  marker.appendChild(badge);
  marker.appendChild(heading);
  return L.divIcon({
    className: '',
    html: marker.outerHTML,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function stopPopup(stop) {
  const el = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = stop.name || stop.id || '';
  el.appendChild(title);
  appendLine(el, `ID : ${stop.id ?? ''}`);
  if (stop.code) appendLine(el, `Code : ${stop.code}`);
  const lines = (stop.routeIds || []).map(routeLabel).join(', ');
  if (lines) appendLine(el, `Lignes : ${lines}`);
  return el;
}

function stopIcon(stop) {
  const el = document.createElement('div');
  el.className = 'stop-icon';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', stopAccessibleName(stop));
  return L.divIcon({
    className: '',
    html: el.outerHTML,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

function formatFetchError(error) {
  if (error.name === 'TimeoutError') return 'délai dépassé';
  return error.message;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function loadRoutes(options = {}) {
  const routes = await fetchJson(apiUrl(`/gtfs/routes/${CONFIG.feedKey}`), options);
  routesById.clear();
  for (const route of routes) {
    routesById.set(route.id, route);
  }
  renderRouteList();
}

async function loadStops(options = {}) {
  const url = apiUrl(`/gtfs/stops/${CONFIG.feedKey}?includeStations=false&includeRoutes=true`);
  stopsData = await fetchJson(url, options);
  renderStops();
}

function renderStops() {
  stopsLayer.clearLayers();
  stopsZoomHint = '';

  if (!stopsToggle.checked) {
    if (stopsLayer && map.hasLayer(stopsLayer)) map.removeLayer(stopsLayer);
    renderStatus();
    return;
  }

  if (map.getZoom() < CONFIG.minStopZoom) {
    stopsZoomHint = `Arrêts masqués (zoomez au niveau ${CONFIG.minStopZoom}+)`;
    if (map.hasLayer(stopsLayer)) map.removeLayer(stopsLayer);
    renderStatus();
    return;
  }

  let rendered = 0;
  for (const stop of stopsData) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) continue;
    if (!stopMatchesFilter(stop)) continue;
    const stopName = stopAccessibleName(stop);
    L.marker([stop.latitude, stop.longitude], {
      icon: stopIcon(stop),
      alt: stopName,
      title: stopName,
    })
      .bindPopup(stopPopup(stop))
      .addTo(stopsLayer);
    rendered += 1;
  }

  if (rendered > 0) {
    stopsLayer.addTo(map);
  } else if (map.hasLayer(stopsLayer)) {
    map.removeLayer(stopsLayer);
  }

  renderStatus();
}

function renderVehicles(positions) {
  vehicleLayer.clearLayers();
  let rendered = 0;

  for (const vehicle of positions) {
    if (!Number.isFinite(vehicle.latitude) || !Number.isFinite(vehicle.longitude)) continue;
    if (!matchesRouteFilter(vehicle.routeId)) continue;
    const vehicleName = vehicleAccessibleName(vehicle);
    L.marker([vehicle.latitude, vehicle.longitude], {
      icon: vehicleIcon(vehicle),
      alt: vehicleName,
      title: vehicleName,
    })
      .bindPopup(vehiclePopup(vehicle))
      .addTo(vehicleLayer);
    rendered += 1;
  }

  const timeLabel = lastVehicleFetchAt ? formatTime(lastVehicleFetchAt) : '—';
  vehiclesStatus = { kind: 'ok', message: `${rendered} véhicules — ${timeLabel}` };
  renderStatus();
}

function renderRouteList() {
  routeListEl.replaceChildren();
  const query = routeSearchEl.value.trim().toLowerCase();

  const routes = [...routesById.values()].sort((a, b) =>
    (a.shortName || a.id).localeCompare(b.shortName || b.id, 'fr', { numeric: true }),
  );

  for (const route of routes) {
    const haystack = `${route.shortName || ''} ${route.longName || ''} ${route.id}`.toLowerCase();
    if (query && !haystack.includes(query)) continue;

    const item = document.createElement('label');
    item.className = 'route-item';
    if (activeRouteIds.has(route.id)) item.classList.add('route-item--active');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = route.id;
    checkbox.checked = selectedRouteIds.has(route.id);

    const swatch = document.createElement('span');
    swatch.className = 'route-swatch';
    swatch.style.backgroundColor = routeColor(route.id);

    const name = document.createElement('span');
    name.className = 'route-name';
    name.textContent = route.longName ? `${route.shortName} — ${route.longName}` : route.shortName || route.id;

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedRouteIds.add(route.id);
      else selectedRouteIds.delete(route.id);
      renderStops();
      renderVehicles(lastVehiclePositions);
    });

    item.append(checkbox, swatch, name);
    routeListEl.appendChild(item);
  }
}

function activeRouteSetsEqual(next) {
  if (next.size !== activeRouteIds.size) return false;
  for (const routeId of next) {
    if (!activeRouteIds.has(routeId)) return false;
  }
  return true;
}

function updateRouteListActiveState() {
  for (const item of routeListEl.querySelectorAll('.route-item')) {
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (!checkbox) continue;
    item.classList.toggle('route-item--active', activeRouteIds.has(checkbox.value));
  }
}

function updateActiveRoutes(positions) {
  const nextActiveRouteIds = new Set();
  for (const vehicle of positions) {
    if (vehicle.routeId) nextActiveRouteIds.add(vehicle.routeId);
  }
  if (activeRouteSetsEqual(nextActiveRouteIds)) return;

  activeRouteIds.clear();
  for (const routeId of nextActiveRouteIds) {
    activeRouteIds.add(routeId);
  }
  updateRouteListActiveState();
}

async function refreshVehicles() {
  if (refreshInFlight || document.hidden) return;

  refreshInFlight = true;
  const generation = ++refreshGeneration;
  vehiclesStatus = { kind: 'loading', message: 'Actualisation des véhicules…' };
  renderStatus();

  try {
    const data = await fetchJson(apiUrl(`/realtime/vehicles/${CONFIG.feedKey}`), {
      signal: AbortSignal.timeout(VEHICLE_FETCH_TIMEOUT_MS),
    });
    if (generation !== refreshGeneration) return;

    lastVehicleFetchAt = new Date();
    lastVehiclePositions = data.vehiclePositions || [];
    updateActiveRoutes(lastVehiclePositions);
    renderVehicles(lastVehiclePositions);
  } catch (error) {
    if (generation === refreshGeneration) {
      vehiclesStatus = { kind: 'error', message: `Erreur véhicules : ${formatFetchError(error)}` };
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

routeSearchEl.addEventListener('input', renderRouteList);

routeResetEl.addEventListener('click', () => {
  selectedRouteIds.clear();
  routeSearchEl.value = '';
  renderRouteList();
  renderStops();
  renderVehicles(lastVehiclePositions);
});

stopsToggle.addEventListener('change', renderStops);

map.on('zoomend', renderStops);

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
  vehiclesStatus = { kind: 'loading', message: 'Chargement des données…' };
  renderStatus();
  startVehicleRefresh();

  const staticFetchOptions = { signal: AbortSignal.timeout(STATIC_FETCH_TIMEOUT_MS) };
  const [routesResult, stopsResult] = await Promise.allSettled([
    loadRoutes(staticFetchOptions),
    loadStops(staticFetchOptions),
  ]);

  routesError = routesResult.status === 'fulfilled' ? null : formatFetchError(routesResult.reason);
  stopsError = stopsResult.status === 'fulfilled' ? null : formatFetchError(stopsResult.reason);
  renderStatus();
}

init();
