# TestCUB — Carte TBM temps réel

Carte web statique des transports en commun TBM (Bordeaux Métropole) : arrêts et positions véhicules en quasi temps réel.

Hébergement compatible GitHub Pages (HTML/CSS/JS, sans build).

## Déploiement web

### GitHub Pages (recommandé)

1. **Settings → Pages** du dépôt GitHub
2. Source : déployer depuis la branche `main` (ou `cursor/tbm-live-map-b1f6` pour tester la PR), dossier `/ (root)`
3. URL projet : `https://<user>.github.io/TestCUB/` (pages de projet)

Le site utilise des **chemins relatifs** (`css/`, `js/`, `icons/`) — compatibles avec un sous-répertoire `/TestCUB/` sans balise `<base>`. Le fichier `.nojekyll` évite le traitement Jekyll.

**Limites GitHub Pages :** pas d’en-têtes HTTP personnalisés. La CSP et la politique de referrer sont définies via balises `<meta>` dans `index.html`. Pour des en-têtes HTTP (cache, CSP stricte), voir Netlify/Cloudflare Pages et le fichier `_headers` fourni.

### Cache et versions

| Ressource | Stratégie |
|-----------|-----------|
| `index.html` | Court (navigateur + `max-age=300` via `_headers` sur Netlify/Cloudflare) |
| `css/`, `js/`, `icons/` | `?v=2` dans `index.html` — incrémenter à chaque déploiement ; `immutable` via `_headers` |

### Sécurité

- Clé API **publique** open data uniquement (`config.example.js`) — pas de secret personnel dans git
- CSP meta : scripts limités à `self` + unpkg ; API Mecatran en `connect-src` ; tuiles OSM en `img-src`
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

## Limites

- Rafraîchissement véhicules : ~12 s (configurable via `vehicleRefreshMs`).
- Pas de TripUpdates ni d’alertes service pour l’instant (extensions possibles via le même flux GTFS-RT).
- Les positions dépendent de la qualité du GPS embarqué et du délai du diffuseur.

## Licence et attribution

- Données transport : **Bordeaux Métropole** — [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence)
- Cartographie : **© OpenStreetMap** contributeurs

## Stack

- [Leaflet](https://leafletjs.com/) + tuiles OSM
- JavaScript vanilla, sans dépendance de build
