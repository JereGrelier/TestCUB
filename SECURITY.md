# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| `main` and active PR branches | Yes |
| Older forks / unmaintained copies | No |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use [GitHub Security Advisories](https://github.com/JereGrelier/TestCUB/security/advisories/new) to report issues privately. We aim to acknowledge reports within a reasonable timeframe and coordinate a fix before public disclosure when appropriate.

You can also refer to `SECURITY.md` in this repository or `/.well-known/security.txt` on the deployed site for contact metadata (RFC 9116).

## Scope

### In scope

- This repository’s HTML, CSS, and JavaScript (map UI, client-side logic, configuration handling)
- Deployment configuration shipped in-repo (`_headers`, CSP meta, static assets)
- Accidental inclusion of secrets or credentials in committed files

### Out of scope

- **Third-party APIs and feeds** (Mecatran GTFS-RT, Bordeaux Métropole open data, OpenStreetMap tile servers): report issues to those providers
- **TBM / Bordeaux Métropole operations** (service disruptions, vehicle accuracy, official apps)
- **Upstream dependencies** (e.g. Leaflet): report to the upstream project; we will upgrade vendored copies when fixes are available
- Denial-of-service against public open-data endpoints
- Social engineering or physical security of the transport network

## Expectations

This project is a **client-side static map**. It does not run a backend, store user accounts, or process payments. Most security findings are expected to be low severity (XSS via untrusted feed data, misconfiguration, or information disclosure in client code).

Thank you for helping keep this project and its users safe.
