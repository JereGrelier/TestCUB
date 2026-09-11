# Contributing

Thank you for your interest in improving this project.

## Before you start

- This is a **static** map (HTML/CSS/JS, no build step). Keep changes simple and GitHub Pages–friendly.
- Do **not** commit personal API keys or secrets. Use `js/config.example.js` and a local, gitignored `js/config.js` for overrides.
- This project is **not affiliated** with TBM or Bordeaux Métropole. It consumes their public open data.

## Local setup

```bash
git clone https://github.com/JereGrelier/TestCUB.git
cd TestCUB
python3 -m http.server 8080
# open http://localhost:8080
```

Optional: `npx --yes serve .`

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make focused changes with a clear commit message (what and why).
3. Test locally: map loads, vehicles refresh, stops behave at zoom 14+, line filter works, no console errors.
4. Open a PR against `main` with a short description and test notes.
5. Ensure third-party attributions remain correct if you add dependencies (prefer vendoring with version + NOTICE update).

## Code style

- Match existing patterns in `js/app.js` and `css/style.css`.
- Use DOM APIs with `textContent` for user-facing strings from external feeds (XSS-safe popups).
- Prefer relative asset paths for GitHub Pages project sites (`/TestCUB/`).
- See `.editorconfig` for basic formatting defaults.

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/JereGrelier/TestCUB/security/advisories/new), not public issues.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful and constructive.
