# Build & Run (minimal)

This project now includes a minimal TypeScript build configuration that compiles `src/*.ts` into `dist/`.

Prerequisites
- Node.js (16+ recommended)
````markdown
# Build & Run (minimal)

This project includes a minimal TypeScript build configuration and also supports using `src/app.ts` as the development entry (served by Vite).

Prerequisites
- Node.js (16+ recommended)
- npm

Install dependencies:

```powershell
npm install
```

Build TypeScript (standalone compile):

```powershell
npm run tsc:build
```

Serve the project (simple static server):

```powershell
npm run serve
```

Development with TypeScript as the main script

The project is configured so you can use `src/app.ts` as the entry during development. Vite will compile TypeScript on-the-fly and serve it as ES modules. `index.html` references `./src/app.ts`.

```powershell
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173) in your browser.

Notes
- The `tsc` output goes to `dist/` (used for a simple static serve). If you prefer to build a production bundle with Vite, use `npm run build`.
- If TypeScript reports missing globals (e.g. `jsQR`, `cv`, `THREE`), ensure the corresponding <script> tags are present in `index.html` (they are by default).
````