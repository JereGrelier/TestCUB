# Third-party licenses

The **TestCUB application source code** is licensed under the [MIT License](LICENSE).
The licenses below apply to **bundled libraries and remote data/tiles** used by the app.
Map imagery and transport data are **not** covered by the MIT license.

## Leaflet 1.9.4

- **Component:** JavaScript mapping library (vendored in `vendor/leaflet/`)
- **Copyright:** Vladimir Agafonkin, CloudMade
- **License:** BSD 2-Clause — SPDX `BSD-2-Clause`
- **URL:** https://leafletjs.com/

## OpenStreetMap map tiles (default basemap)

- **Product:** OpenStreetMap raster tiles
- **Copyright:** © OpenStreetMap contributors
- **License:** Open Database License (ODbL) 1.0
- **URL:** https://www.openstreetmap.org/copyright

## EOxCloudless Sentinel-2 (optional satellite basemap)

- **Product:** EOxCloudless Sentinel-2 cloudless 2020 (WMTS layer `s2cloudless-2020_3857`)
- **Provider:** EOX IT Services GmbH
- **Tile endpoint:** `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/…`
- **Data vintage:** modified Copernicus Sentinel data **2020**
- **License:** Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
  — SPDX `CC-BY-NC-SA-4.0`
  — https://creativecommons.org/licenses/by-nc-sa/4.0/
- **Terms / attribution:** https://cloudless.eox.at/license-non-commercial
- **Required attribution (display when satellite layer is active):**

  > EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)

- **Usage notes:**
  - Free WMTS use is limited to **non-commercial** purposes for 2018–2025 layers (per EOX).
  - Max useful zoom on EPSG:3857 is approximately **14** (see EOX WMTS capabilities).
  - Commercial use or redistribution of the imagery may require a separate license from EOX
    (https://cloudless.eox.at).

## Bordeaux Métropole / TBM open data

- **Data:** GTFS static data and GTFS-RT feeds (via Mecatran API)
- **License:** Licence Ouverte 2.0
- **URL:** https://opendata.bordeaux-metropole.fr/

## Mecatran Urbiplan web services

- **Service:** GTFS and real-time API endpoints
- **Documentation:** https://pub.mecatran.com/docs/urbiplan_dev_guide_en.html
- **Terms:** subject to Bordeaux Métropole open-data API key terms
