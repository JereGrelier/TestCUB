# TestCUB — Carte TBM temps réel

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Carte web statique des transports en commun TBM (Bordeaux Métropole) : arrêts et positions véhicules en quasi temps réel.

Hébergement compatible GitHub Pages (HTML/CSS/JS, sans build).

> **Avertissement** — Projet open source indépendant. **Non affilié** à TBM, Keolis ou Bordeaux Métropole. Les données affichées proviennent de flux publics ; l’application officielle reste la référence pour l’information voyageur.

## Projet

| Document | Description |
|----------|-------------|
| [LICENSE](LICENSE) | Code source sous licence MIT (© 2026 Jérémy Grelier) |
| [NOTICE](NOTICE) | Attributions tierces (OSM, Bordeaux Métropole, Leaflet, Mecatran, EOX) |
| [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) | Licences tierces (SPDX, conditions satellite EOX, tuiles OSM) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution et PR |
| [SECURITY.md](SECURITY.md) | Signalement de vulnérabilités |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Code de conduite |
| [security.txt](security.txt) | Contact sécurité (RFC 9116, racine site statique) |

## Déploiement web

### GitHub Pages (recommandé)

1. **Settings → Pages** du dépôt GitHub
2. Source : déployer depuis la branche `main`, dossier `/ (root)` (pour prévisualiser une PR, activer Pages temporairement sur la branche de la PR)
3. URL projet : `https://<user>.github.io/TestCUB/` (pages de projet)

Le site utilise des **chemins relatifs** (`css/`, `js/`, `icons/`) — compatibles avec un sous-répertoire `/TestCUB/` sans balise `<base>`. Le fichier `.nojekyll` évite le traitement Jekyll.

**Limites GitHub Pages :** pas d’en-têtes HTTP personnalisés. La CSP et la politique de referrer sont définies via balises `<meta>` dans `index.html`. Pour des en-têtes HTTP (cache, CSP stricte), voir Netlify/Cloudflare Pages et le fichier `_headers` fourni.

### Cache et versions

| Ressource | Stratégie |
|-----------|-----------|
| `index.html` | Court (navigateur + `max-age=300` via `_headers` sur Netlify/Cloudflare) |
| `css/`, `js/`, `vendor/`, `icons/` | `?v=4` dans `index.html` — incrémenter à chaque déploiement ; `immutable` via `_headers` |

### Sécurité

- Clé API **publique** open data uniquement (`config.example.js`) — pas de secret personnel dans git
- CSP meta : `script-src 'self'` ; `style-src 'self' 'unsafe-inline'` (requis par Leaflet et les styles inline des marqueurs) ; API Mecatran en `connect-src` ; tuiles OSM et satellite EOX en `img-src` — Leaflet vendu dans `vendor/leaflet/`
- `_headers` : CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (hôtes compatibles Netlify/Cloudflare)

### PWA légère

`manifest.webmanifest` + `icons/icon.svg` permettent l’ajout à l’écran d’accueil. Pas de service worker (volontairement, pour éviter la complexité du cache offline).

## Lancer en local

```bash
# Python 3
python3 -m http.server 8080

# ou Node.js
npx --yes serve .
```

Ouvrir http://localhost:8080

## Configuration (optionnelle)

La clé API publique open data est fournie dans `js/config.example.js`. Pour la personnaliser :

```bash
cp js/config.example.js js/config.js
```

Puis remplacez dans `index.html` la ligne `config.example.js` par `config.js`. Le fichier `js/config.js` est ignoré par git.

## APIs utilisées

| Donnée | Source | Fraîcheur |
|--------|--------|-----------|
| Positions véhicules | [Mecatran GTFS-RT VehiclePositions](https://bdx.mecatran.com/utw/ws/realtime/vehicles/bordeaux?apiKey=opendata-bordeaux-metropole-flux-gtfs-rt) | Quasi temps réel (~quelques secondes) |
| Prochains passages | [Mecatran realtime/stop](https://bdx.mecatran.com/utw/ws/realtime/stop/bordeaux/{stopId}) (GTFS stop id = MonitoringRef) | Temps réel / horaire théorique |
| Tracés de lignes | [Mecatran GTFS routes + patterns](https://bdx.mecatran.com/utw/ws/gtfs/routes/bordeaux?includePatterns=true) (polylignes via séquences d’arrêts) | Statique |
| Arrêts | [Mecatran GTFS stops](https://bdx.mecatran.com/utw/ws/gtfs/stops/bordeaux) | Statique (offre GTFS) |
| Fond de carte plan | [OpenStreetMap](https://www.openstreetmap.org/) | — |
| Fond satellite (option) | [EOxCloudless Sentinel-2 2020](https://cloudless.eox.at) ([CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/), usage non commercial) | 2020 |

**Ne pas utiliser** le jeu DataHub `sv_vehic_p` pour le suivi live : il accuse un retard d’environ 2 heures.

Clé API publique (open data, pas un secret personnel) : `opendata-bordeaux-metropole-flux-gtfs-rt`

Documentation Mecatran : [Urbiplan web-services](https://pub.mecatran.com/docs/urbiplan_dev_guide_en.html)

Dataset Bordeaux Métropole : [Offres de services bus tramway GTFS / GTFS-RT](https://opendata.bordeaux-metropole.fr/explore/dataset/offres-de-services-bus-tramway-gtfs/)

Les arrêts peuvent aussi être obtenus via l’ODS `sv_arret_p` ; cette carte utilise l’API GTFS Mecatran pour des identifiants cohérents avec le flux temps réel.

## Interface

- **Arrêts** : masqués en dessous du zoom 14 (configurable via `minStopZoom`) pour éviter la surcharge visuelle.
- **Couches** : véhicules et arrêts activables indépendamment ; le filtre par ligne s’applique en plus.
- **Filtre par ligne** : liste searchable multi-sélection ; filtre véhicules et arrêts associés.
- **Surlignage** : clic sur un arrêt ou véhicule surligne la/les ligne(s) associée(s), trace une polyligne (patterns GTFS) et atténue le reste ; effacer via le fond de carte ou le bouton dédié.
- **Prochains passages** : chargés à l’ouverture du popup d’arrêt (API Mecatran `realtime/stop`).
- **Véhicules** : pastilles colorées par ligne (bus / tram), badge numéro de ligne ; statuts traduits en français (`js/i18n.js`).
- **Fonds de carte** : OSM par défaut ; satellite EOxCloudless 2020 (EOX, CC BY-NC-SA 4.0, non commercial) en option via le sélecteur en bas à droite.
- **Contrôles Leaflet** : zoom et basemap en bas à droite (hors du panneau latéral).

## Limites

- Rafraîchissement véhicules : ~12 s (configurable via `vehicleRefreshMs`).
- Pas de TripUpdates ni d’alertes service pour l’instant (extensions possibles via le même flux GTFS-RT).
- Les positions dépendent de la qualité du GPS embarqué et du délai du diffuseur.
- Tracés de ligne : polylignes dérivées des patterns GTFS (séquences d’arrêts) ; l’API KML/shapes Mecatran n’est pas exposée sur ce flux — le tracé suit les arrêts, pas la géométrie fine GTFS shapes.
- Satellite EOX : imagerie Copernicus 2020, zoom ~14 max ; licence CC BY-NC-SA 4.0 (usage non commercial via WMTS gratuit) — voir [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Licence et attribution

| Composant | Licence |
|-----------|---------|
| **Code source** (ce dépôt) | [MIT](LICENSE) — © 2026 Jérémy Grelier |
| **Leaflet** 1.9.4 | [BSD 2-Clause](https://opensource.org/licenses/BSD-2-Clause) |
| **Tuiles OSM** (fond plan) | [ODbL](https://www.openstreetmap.org/copyright) — © contributeurs OpenStreetMap |
| **Imagerie satellite** (option) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — EOxCloudless / EOX IT Services GmbH |
| **Données TBM** | [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence) |

L’imagerie satellite **n’est pas** sous licence MIT. Détails, texte d’attribution obligatoire et conditions de redistribution : [NOTICE](NOTICE), [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Stack

- [Leaflet](https://leafletjs.com/) 1.9.4 (vendu localement) + tuiles OSM
- JavaScript vanilla, sans dépendance de build
