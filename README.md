# TestCUB — Carte TBM temps réel

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Carte web statique des transports en commun TBM (Bordeaux Métropole) : arrêts et positions véhicules en quasi temps réel.

Hébergement compatible GitHub Pages (HTML/CSS/JS, sans build).

> **Avertissement** — Projet open source indépendant. **Non affilié** à TBM, Keolis ou Bordeaux Métropole. Les données affichées proviennent de flux publics ; l’application officielle reste la référence pour l’information voyageur.

## Projet

| Document | Description |
|----------|-------------|
| [LICENSE](LICENSE) | Code source sous licence MIT (© 2026 Jérémy Grelier) |
| [NOTICE](NOTICE) | Attributions tierces (OSM, Bordeaux Métropole, Leaflet, Mecatran) |
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
| `css/`, `js/`, `vendor/`, `icons/` | `?v=3` dans `index.html` — incrémenter à chaque déploiement ; `immutable` via `_headers` |

### Sécurité

- Clé API **publique** open data uniquement (`config.example.js`) — pas de secret personnel dans git
- CSP meta : `script-src 'self'` ; `style-src 'self' 'unsafe-inline'` (requis par Leaflet et les styles inline des marqueurs) ; API Mecatran en `connect-src` ; tuiles OSM en `img-src` — Leaflet vendu dans `vendor/leaflet/`
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
| Arrêts | [Mecatran GTFS stops](https://bdx.mecatran.com/utw/ws/gtfs/stops/bordeaux) | Statique (offre GTFS) |
| Fond de carte | [OpenStreetMap](https://www.openstreetmap.org/) | — |

**Ne pas utiliser** le jeu DataHub `sv_vehic_p` pour le suivi live : il accuse un retard d’environ 2 heures.

Clé API publique (open data, pas un secret personnel) : `opendata-bordeaux-metropole-flux-gtfs-rt`

Documentation Mecatran : [Urbiplan web-services](https://pub.mecatran.com/docs/urbiplan_dev_guide_en.html)

Dataset Bordeaux Métropole : [Offres de services bus tramway GTFS / GTFS-RT](https://opendata.bordeaux-metropole.fr/explore/dataset/offres-de-services-bus-tramway-gtfs/)

Les arrêts peuvent aussi être obtenus via l’ODS `sv_arret_p` ; cette carte utilise l’API GTFS Mecatran pour des identifiants cohérents avec le flux temps réel.

## Interface

- **Arrêts** : masqués en dessous du zoom 14 (configurable via `minStopZoom`) pour éviter la surcharge visuelle.
- **Filtre par ligne** : liste searchable multi-sélection ; filtre véhicules et arrêts associés.
- **Véhicules** : pastilles colorées par ligne (bus / tram), badge numéro de ligne.

## Limites

- Rafraîchissement véhicules : ~12 s (configurable via `vehicleRefreshMs`).
- Pas de TripUpdates ni d’alertes service pour l’instant (extensions possibles via le même flux GTFS-RT).
- Les positions dépendent de la qualité du GPS embarqué et du délai du diffuseur.

## Licence et attribution

Le **code** de ce dépôt est sous [licence MIT](LICENSE) (© 2026 Jérémy Grelier).

Les **données et bibliothèques tierces** sont listées dans [NOTICE](NOTICE), notamment :

- **OpenStreetMap** — tuiles © contributeurs ([ODbL](https://www.openstreetmap.org/copyright))
- **Bordeaux Métropole / TBM** — open data transport ([Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence))
- **Mecatran** — API GTFS-RT temps réel
- **Leaflet** 1.9.4 — [BSD 2-Clause](https://opensource.org/licenses/BSD-2-Clause), vendu dans `vendor/leaflet/`

## Stack

- [Leaflet](https://leafletjs.com/) 1.9.4 (vendu localement) + tuiles OSM
- JavaScript vanilla, sans dépendance de build
