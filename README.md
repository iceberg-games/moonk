# MOONK

VR tag (WebXR). Public client: **https://iceberg-games.github.io/moonk/**

This is a standalone game repository under the iceberg-games account. It is not the Iceberg block game, the company site, or Playforge — do not merge it into those repos.

## Client (GitHub Pages)

The site is a Vite production build served under the `/moonk/` base path (project Pages).

1. Set a repo **variable** (Settings → Secrets and variables → Actions → Variables) named `VITE_WS_URL` to the public `wss://` server URL (for now `wss://moonk-server.onrender.com`, until the live Render hostname is confirmed).
2. Pages is published by GitHub Actions (`.github/workflows/pages.yml`). The build runs `vite build --base=/moonk/` with that variable.

The client reads the server URL from `import.meta.env.VITE_WS_URL` in `src/net.js`. A `?ws=` query override still works for one-off tests.

To refresh this tree from the working copy on the box (does not push):

```bash
VITE_WS_URL=wss://moonk-server.onrender.com VITE_BASE=/moonk/ /workspace/moonk-publish/sync.sh
```

## Server (Render, free web service)

`render.yaml` defines **moonk-server**, a free Node service:

- start: `node server/server.mjs`
- listens on `process.env.PORT` (Render sets this; default 8787 locally)
- health check: `GET /health`

The free plan sleeps after about 15 minutes idle and takes about a minute to wake.

## Local dev

```bash
npm ci
npm run dev          # server + Vite (dev server uses base /)
npm run dev:server
npm run dev:client
```

Do not commit `node_modules`, `dist`, `.owner-key`, `.env`, or `server/accounts.json`.
