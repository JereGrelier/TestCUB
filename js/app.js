/**
 * @typedef {Object} TbmConfig
 * @property {string} feedKey
 * @property {string} apiKey
 * @property {number} vehicleRefreshMs
 * @property {[number, number]} mapCenter
 * @property {number} mapZoom
 * @property {number} minStopZoom
 * @property {number} departureLookAheadSec
 */

/** @type {TbmConfig} */
const CONFIG = {
  feedKey: 'bordeaux',
  apiKey: 'opendata-bordeaux-metropole-flux-gtfs-rt',
  vehicleRefreshMs: 12_000,
  mapCenter: [44.8378, -0.5792],
  mapZoom: 12,
  minStopZoom: 14,
  departureLookAheadSec: 7200,
  ...window.TBM_CONFIG,
};

const API_BASE = 'https://bdx.mecatran.com/utw/ws';
const TRAM_ROUTE_TYPE = 0;
const HEX_COLOR = /^[0-9A-Fa-f]{6}$/;
const DEFAULT_ROUTE_COLOR = '#1565c0';
const DEFAULT_ROUTE_TEXT_COLOR = '#ffffff';
const VEHICLE_FETCH_TIMEOUT_MS = 15_000;
const STATIC_FETCH_TIMEOUT_MS = 30_000;
const DEPARTURE_FETCH_TIMEOUT_MS = 10_000;

const statusEl = document.getElementById('status');
const stopsToggle = document.getElementById('stops-toggle');
const vehiclesToggle = document.getElementById('vehicles-toggle');
const routeSearchEl = document.getElementById('route-search');
const routeListEl = document.getElementById('route-list');
const routeResetEl = document.getElementById('route-reset');
const highlightClearEl = document.getElementById('highlight-clear');

/** @type {L.LayerGroup} */
let vehicleLayer;
/** @type {L.LayerGroup} */
let stopsLayer;
/** @type {L.LayerGroup} */
let routeLayer;
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
/** @type {Map<string, object>} */
const stopsById = new Map();
/** @type {Map<string, object[]>} */
const patternsByRouteId = new Map();
/** @type {Set<string>} */
const selectedRouteIds = new Set();
/** @type {Set<string>} */
const highlightedRouteIds = new Set();
/** @type {Set<string>} */
const activeRouteIds = new Set();
/** @type {object[]} */
let stopsData = [];
/** @type {object[]} */
let lastVehiclePositions = [];
/** @type {Date|null} */
let lastVehicleFetchAt = null;
let stopsZoomHint = '';
let patternsLoadPromise = null;
let polylineRenderGeneration = 0;
/** @type {string|null} */
let pendingPopupStopId = null;
/** @type {string|null} */
let pendingPopupVehicleId = null;
/** @type {string|null} */
let programmaticPopupStopId = null;

const map = L.map('map', { zoomControl: false }).setView(CONFIG.mapCenter, CONFIG.mapZoom);

const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Données TBM — Bordeaux Métropole (Licence Ouverte)',
  maxZoom: 19,
});

const satelliteLayer = L.tileLayer(
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg',
  {
    attribution:
      'Imagerie <a href="https://s2maps.eu">Sentinel-2 cloudless</a> © <a href="https://eox.at">EOX</a> / <a href="https://sentinel.esa.int">ESA</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)',
    maxZoom: 15,
  },
);

osmLayer.addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control
  .layers(
    { Plan: osmLayer, Satellite: satelliteLayer },
    null,
    { position: 'bottomright', collapsed: true },
  )
  .addTo(map);

vehicleLayer = L.layerGroup().addTo(map);
stopsLayer = L.layerGroup();
routeLayer = L.layerGroup().addTo(map);

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

function isHighlighted(routeId) {
  return highlightedRouteIds.size > 0 && highlightedRouteIds.has(routeId);
}

function isDimmed(routeId) {
  return highlightedRouteIds.size > 0 && !highlightedRouteIds.has(routeId);
}

function stopServesHighlight(routeIds) {
  return routeIds.some((id) => isHighlighted(id));
}

function selectedRoutesSummary() {
  if (selectedRouteIds.size === 0) return '';
  const labels = [...selectedRouteIds].map(routeLabel).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  return ` · lignes ${labels.join(', ')}`;
}

function highlightSummary() {
  if (highlightedRouteIds.size === 0) return '';
  const labels = [...highlightedRouteIds].map(routeLabel).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  return ` · surligné : ${labels.join(', ')}`;
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

  parts.push(vehiclesStatus.message + selectedRoutesSummary() + highlightSummary());

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

function formatDepartureTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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
  title.textContent = route?.longName
    ? `Ligne ${routeLabel(v.routeId)} — ${route.longName}`
    : `Ligne ${routeLabel(v.routeId)}`;
  el.appendChild(title);
  appendLine(el, `Véhicule : ${v.vehicleId ?? ''}`);
  if (v.stopId) appendLine(el, `Arrêt : ${v.stopId}`);
  if (v.stopStatus) appendLine(el, `Statut : ${t('stopStatus', v.stopStatus, v.stopStatus)}`);
  return el;
}

function vehicleIcon(vehicle, dimmed) {
  const bearing = Number.isFinite(vehicle.bearing) ? vehicle.bearing : 0;
  const routeId = vehicle.routeId || '?';
  const kind = isTramVehicle(vehicle) ? 'tram' : 'bus';
  const marker = document.createElement('div');
  marker.className = `vehicle-marker vehicle-marker--${kind}${dimmed ? ' marker-dimmed' : ''}`;

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

function stopPopupShell(stop) {
  const el = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = stop.name || stop.id || '';
  el.appendChild(title);
  appendLine(el, `ID : ${stop.id ?? ''}`);
  if (stop.code) appendLine(el, `Code : ${stop.code}`);
  const lines = (stop.routeIds || []).map(routeLabel).join(', ');
  if (lines) appendLine(el, `Lignes : ${lines}`);

  const deps = document.createElement('div');
  deps.className = 'stop-departures loading';
  deps.textContent = 'Prochains passages…';
  el.appendChild(deps);
  return { el, deps };
}

function renderDepartures(container, data, errorMessage) {
  container.classList.remove('loading');
  container.replaceChildren();

  if (errorMessage) {
    container.textContent = errorMessage;
    return;
  }

  const departures = (data?.departures || []).filter((dep) => !dep.cancelled);
  if (!departures.length) {
    container.textContent = 'Aucun passage prévu dans les prochaines heures';
    return;
  }

  const heading = document.createElement('div');
  heading.className = 'departures-title';
  heading.textContent = 'Prochains passages';
  container.appendChild(heading);

  for (const dep of departures.slice(0, 8)) {
    const line = document.createElement('div');
    line.className = 'departure-row';
    const label = routeLabel(dep.routeId);
    const time = formatDepartureTime(dep.departureTime || dep.arrivalTime);
    const realtime = dep.realtime ? '' : ' (horaire)';
    const headsign = dep.headsign ? ` → ${dep.headsign}` : '';
    line.textContent = `Ligne ${label}${headsign} : ${time}${realtime}`;
    container.appendChild(line);
  }
}

async function loadStopDepartures(stopId, container) {
  container.classList.add('loading');
  container.textContent = 'Prochains passages…';
  try {
    const url = apiUrl(
      `/realtime/stop/${CONFIG.feedKey}/${encodeURIComponent(stopId)}?lookAheadSec=${CONFIG.departureLookAheadSec}`,
    );
    const data = await fetchJson(url, { signal: AbortSignal.timeout(DEPARTURE_FETCH_TIMEOUT_MS) });
    renderDepartures(container, data, null);
  } catch (error) {
    renderDepartures(container, null, `Horaires indisponibles (${formatFetchError(error)})`);
  }
}

function stopIcon(stop, dimmed) {
  const el = document.createElement('div');
  el.className = `stop-icon${dimmed ? ' marker-dimmed' : ''}`;
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

async function ensureRoutePatterns() {
  if (patternsByRouteId.size > 0) return;
  if (patternsLoadPromise) return patternsLoadPromise;

  patternsLoadPromise = (async () => {
    const routes = await fetchJson(
      apiUrl(`/gtfs/routes/${CONFIG.feedKey}?includePatterns=true`),
      { signal: AbortSignal.timeout(STATIC_FETCH_TIMEOUT_MS) },
    );
    for (const route of routes) {
      if (route.patterns?.length) patternsByRouteId.set(route.id, route.patterns);
    }
  })();

  try {
    await patternsLoadPromise;
  } catch {
    patternsLoadPromise = null;
  }
}

function longestPatternsPerDirection(patterns) {
  const byDirection = new Map();
  for (const pattern of patterns) {
    const direction = pattern.directionId ?? 0;
    const stopCount = pattern.stops?.length || pattern.stopIds?.length || 0;
    const existing = byDirection.get(direction);
    const existingCount = existing?.stops?.length || existing?.stopIds?.length || 0;
    if (!existing || stopCount > existingCount) byDirection.set(direction, pattern);
  }
  return [...byDirection.values()];
}

function patternLatLngs(pattern) {
  const stopRefs = pattern.stops || (pattern.stopIds || []).map((stopId) => ({ stopId }));
  const latlngs = [];
  for (const ref of stopRefs) {
    const stop = stopsById.get(ref.stopId);
    if (stop && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)) {
      latlngs.push([stop.latitude, stop.longitude]);
    }
  }
  return latlngs;
}

async function renderRoutePolylines() {
  const generation = ++polylineRenderGeneration;
  if (highlightedRouteIds.size === 0) {
    routeLayer.clearLayers();
    return;
  }

  await ensureRoutePatterns();
  if (generation !== polylineRenderGeneration) return;

  routeLayer.clearLayers();

  for (const routeId of highlightedRouteIds) {
    const patterns = patternsByRouteId.get(routeId);
    if (!patterns?.length) continue;

    const color = routeColor(routeId);
    for (const pattern of longestPatternsPerDirection(patterns)) {
      const latlngs = patternLatLngs(pattern);
      if (latlngs.length < 2) continue;
      L.polyline(latlngs, {
        color,
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer);
    }
  }
}

function setHighlight(routeIds) {
  highlightedRouteIds.clear();
  for (const routeId of routeIds) {
    if (routeId) highlightedRouteIds.add(routeId);
  }
  highlightClearEl.hidden = highlightedRouteIds.size === 0;
  updateRouteListHighlightState();
  renderRoutePolylines();
  renderStops();
  renderVehicles(lastVehiclePositions);
  renderStatus();
}

function clearHighlight() {
  if (highlightedRouteIds.size === 0) return;
  setHighlight([]);
}

function onMarkerActivate(routeIds, event, stopId = null, vehicleId = null) {
  L.DomEvent.stopPropagation(event);
  pendingPopupStopId = stopId;
  pendingPopupVehicleId = vehicleId;
  setHighlight(routeIds);
  pendingPopupStopId = null;
  pendingPopupVehicleId = null;
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
  stopsById.clear();
  for (const stop of stopsData) {
    stopsById.set(stop.id, stop);
  }
  renderStops();
  if (highlightedRouteIds.size > 0) renderRoutePolylines();
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
  /** @type {L.Marker|null} */
  let popupMarker = null;
  for (const stop of stopsData) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) continue;
    if (!stopMatchesFilter(stop)) continue;

    const routeIds = stop.routeIds || [];
    const dimmed = highlightedRouteIds.size > 0 && !routeIds.some((id) => highlightedRouteIds.has(id));
    const stopName = stopAccessibleName(stop);
    const popupParts = stopPopupShell(stop);
    const marker = L.marker([stop.latitude, stop.longitude], {
      icon: stopIcon(stop, dimmed),
      alt: stopName,
      title: stopName,
      zIndexOffset: dimmed ? -100 : stopServesHighlight(routeIds) ? 200 : 0,
    })
      .bindPopup(popupParts.el)
      .addTo(stopsLayer);

    marker.on('click', (event) => onMarkerActivate(routeIds, event, stop.id));
    marker.on('popupopen', () => {
      if (programmaticPopupStopId !== stop.id) return;
      programmaticPopupStopId = null;
      loadStopDepartures(stop.id, popupParts.deps);
    });
    if (pendingPopupStopId === stop.id) popupMarker = marker;
    rendered += 1;
  }

  if (popupMarker) {
    programmaticPopupStopId = pendingPopupStopId;
    popupMarker.openPopup();
  }

  if (rendered > 0) {
    stopsLayer.addTo(map);
  } else if (map.hasLayer(stopsLayer)) {
    map.removeLayer(stopsLayer);
  }

  renderStatus();
}

function renderVehicles(positions) {
  const list = Array.isArray(positions) ? positions : lastVehiclePositions;
  vehicleLayer.clearLayers();

  if (!vehiclesToggle.checked) {
    if (map.hasLayer(vehicleLayer)) map.removeLayer(vehicleLayer);
    const timeLabel = lastVehicleFetchAt ? formatTime(lastVehicleFetchAt) : '—';
    vehiclesStatus = { kind: 'ok', message: `Véhicules masqués — ${timeLabel}` };
    renderStatus();
    return;
  }

  if (!map.hasLayer(vehicleLayer)) vehicleLayer.addTo(map);

  let rendered = 0;
  /** @type {L.Marker|null} */
  let popupMarker = null;
  for (const vehicle of positions) {
    if (!Number.isFinite(vehicle.latitude) || !Number.isFinite(vehicle.longitude)) continue;
    if (!matchesRouteFilter(vehicle.routeId)) continue;

    const dimmed = isDimmed(vehicle.routeId);
    const vehicleName = vehicleAccessibleName(vehicle);
    const marker = L.marker([vehicle.latitude, vehicle.longitude], {
      icon: vehicleIcon(vehicle, dimmed),
      alt: vehicleName,
      title: vehicleName,
      zIndexOffset: dimmed ? -100 : isHighlighted(vehicle.routeId) ? 300 : 0,
    })
      .bindPopup(vehiclePopup(vehicle))
      .addTo(vehicleLayer);

    marker.on('click', (event) => {
      if (vehicle.routeId) onMarkerActivate([vehicle.routeId], event, null, vehicle.vehicleId ?? null);
    });
    if (pendingPopupVehicleId && vehicle.vehicleId === pendingPopupVehicleId) popupMarker = marker;
    rendered += 1;
  }

  if (popupMarker) popupMarker.openPopup();

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
    if (highlightedRouteIds.has(route.id)) item.classList.add('route-item--highlighted');

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

function updateRouteListHighlightState() {
  for (const item of routeListEl.querySelectorAll('.route-item')) {
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (!checkbox) continue;
    item.classList.toggle('route-item--highlighted', highlightedRouteIds.has(checkbox.value));
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

highlightClearEl.addEventListener('click', clearHighlight);

stopsToggle.addEventListener('change', renderStops);
vehiclesToggle.addEventListener('change', () => renderVehicles(lastVehiclePositions));

map.on('zoomend', renderStops);
map.on('click', clearHighlight);

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
