/** French labels for technical GTFS / SIRI fields. */
const TBM_I18N = {
  stopStatus: {
    STOPPED_AT: 'À l\'arrêt',
    IN_TRANSIT_TO: 'En route vers l\'arrêt',
    INCOMING_AT: 'Approche de l\'arrêt',
  },
  pickup: {
    0: 'Régulier',
    1: 'Interdit',
    2: 'Sur réservation',
    3: 'Demander au conducteur',
  },
  dropoff: {
    0: 'Régulier',
    1: 'Interdit',
    2: 'Sur réservation',
    3: 'Demander au conducteur',
  },
};

/**
 * @param {string} category
 * @param {string|number} key
 * @param {string} [fallback]
 */
function t(category, key, fallback = '') {
  const table = TBM_I18N[category];
  if (table && key in table) return table[key];
  return fallback || String(key);
}
