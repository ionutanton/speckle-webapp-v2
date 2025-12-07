# Build & Run (Vite)

This project uses Vite as the single bundler for development and production.

Prerequisites
- Node.js (16+ recommended)
- npm

Install dependencies:

```powershell
npm install
```

Development (hot-reload, TypeScript served directly):

```powershell
npm run dev
```

Production build:

```powershell
npm run build
```

Preview the production build:

```powershell
npm run preview
```

Notes
- `index.html` references `./src/app.ts` so Vite compiles the TypeScript entry on-the-fly during development.
- To serve the built output statically, use any static server to serve the `dist/` folder after `npm run build`.
- If TypeScript reports missing globals (e.g. `jsQR`, `cv`, `THREE`), ensure the corresponding <script> tags are present in `index.html` (they are by default).
