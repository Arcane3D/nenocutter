# Nenocutter

Nenocutter is a browser studio for cookie cutters, stamps, stencils, and a few related tools. Draw or trace artwork, tune a printable blade, orbit a glossy preview, and download STL, 3MF, OBJ, or a 1:1 PDF outline. Exports, the library, image editing, and share links are free. An account is optional and only used to sync designs.

The app is an independent implementation. It does not include code, text, icons, or trademarks from other cutter designers.

## Features

- Trace PNG, JPG, WebP, or SVG by drop, file picker, or paste. Adjust threshold, smoothing, despeckle, brightness, contrast, and invert. Choose filled edge-trace or line-drawing mode.
- When a file contains several shapes, choose **Largest only**, **Outline all**, or a set (cutter, imprint cutter, stamp, or cutter + stamp).
- Tools: cutter, imprint cutter, stamp, cutter + stamp, sets of each, multi cutter, stencil, cake topper, practice cookie, texture roller, sandwich cutter, and cake pop mold.
- Size in millimetres or inches, by longest side or width and height, with an aspect lock.
- Blade depth, thickness, support blade, sharp chamfer (tip width and height), rounded edge, and a one-sided fondant taper.
- Imprint depth (0 is flush), width, flat/dome/round/chamfer curves, invert, and delete-outer-edge.
- Base height and width, rectangular / chamfered / round feet, and an optional press handle.
- Stamp back, relief, tolerance, and a threaded or glue-chamfer grip with auto or manual placement.
- Center bars, auto outline, mirror and mirrored pair, wall text, and a name plate.
- Resolution control and an option to keep parts as separate 3MF objects.
- Live three.js preview: orbit, fit, dough, cut mark, loose cookie, a second cutter, ruler, 25 mm coin, layer list, surface presets, and print-look presets (solid, dual colour, gradient, glitter) with layer lines. Appearance does not change the export.
- Built-in 2D editor: pen, freehand, nodes, basic shapes, text, union, subtract, snap, zoom, and pan.
- Undo, redo, and autosave on this device.
- Starter gallery, including a 16-motif heart sheet.
- Print warnings for thin walls, steep chamfers, tiny details, and parts larger than the chosen bed. Thin walls block export until you confirm.
- Rough filament and time estimate.
- Profiles you can save and reuse.
- STL (binary, millimetres), 3MF (`unit="millimeter"`, multiple objects when parts stay separate), OBJ, and a 1:1 PDF outline.
- Guest mode in IndexedDB. Optional Supabase accounts (email, Google, password reset, profile) and a private library with rename, duplicate, delete, tags, search, favorites, and trash.
- Share links: a compressed link that needs no account, plus shorter cloud links (view or copy) when Supabase is configured.
- Embed route, `postMessage` API, and `embed.js`.
- PWA shell with offline caching of the built site.
- Light cream theme by default, with a dark toggle.

## Local development

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173/ . The dev server uses base path `/`. A production build uses `/nenocutter/` so GitHub Pages project sites resolve assets correctly.

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run preview
```

`npm run preview` serves the production build at http://127.0.0.1:4173/nenocutter/ .

## Supabase (optional)

Without keys, Nenocutter stays in guest mode. Designs, image editing, and downloads keep working.

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). It creates `profiles`, `designs`, and `shares`, enables row level security, and adds `get_shared_design` for public share links.
3. Optionally run [`supabase/migrations/0002_storage.sql`](supabase/migrations/0002_storage.sql) for a public thumbnails bucket.
4. Authentication → Providers: enable Email and Google.
5. Authentication → URL configuration. Add:
   - `http://127.0.0.1:5173`
   - `https://arcane3d.github.io/nenocutter/`
6. Copy the project URL and the anon key into `.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Use the anon key only. Do not put the service role key in the frontend.

For GitHub Actions, add the same values as repository secrets named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The Pages workflow injects them at build time. If the secrets are missing, the deployed site still runs in guest mode.

## GitHub Pages

The workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds on every push to `main` and deploys the `dist` folder to Pages.

After the workflow exists on `main`:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Push to `main` (or run the workflow manually).
3. The site is served at <https://arcane3d.github.io/nenocutter/>.

This repository may be private. GitHub Pages on a private repository requires GitHub Pro, GitHub Team, GitHub Enterprise, or a similar paid plan. A public repository can use Pages on the free plan. Until Pages is enabled and a deploy succeeds, that URL will not load.

Deep links use hash routes (`/#/library`, `/#/embed`) so they work on static hosting. `404.html` also redirects an unknown path back into the hash router.

## Embed

The embed view is minimal and does not send headers that block framing.

```html
<iframe
  src="https://arcane3d.github.io/nenocutter/#/embed"
  title="Nenocutter designer"
  style="width: 100%; height: 720px; border: 0; border-radius: 24px;"
  allow="clipboard-write"
></iframe>
```

Or use the helper:

```html
<div id="nenocutter"></div>
<script src="https://arcane3d.github.io/nenocutter/embed.js"></script>
<script>
  NenocutterEmbed.mount('#nenocutter', {
    onMessage(message) {
      if (message.type === 'ready') console.log('Nenocutter is ready');
      if (message.type === 'design-changed') console.log(message.design);
      if (message.type === 'export-complete') console.log(message.format, message.byteLength);
    },
  });
</script>
```

`postMessage` events from the frame (`source: "nenocutter"`):

- `ready`
- `design-changed` with the design document
- `export-complete` with `format`, `fileName`, and `byteLength`
- `error`

Commands from the host (`source: "nenocutter-host"`):

- `load-design` with a design document
- `set-settings` with a partial settings object
- `export` with `format` set to `stl`, `3mf`, `obj`, or `pdf`

For local development, pass `origin: 'http://127.0.0.1:5173/'`.

## Defaults

Everyday cutter values: blade depth 12.5 mm, wall 0.8 mm, sharp edge on, tip 0.4 mm, chamfer height 2 mm, base height 3.5 mm, base width 4 mm, minimum wall 0.5 mm, resolution 100. Stamp back 5.5 mm, relief 3 mm, cutter tolerance 0.9 mm. Mirrored pair gap 10 mm. Name plate thickness 3.5 mm, raised text 0.6 mm. Grip, when enabled: socket depth 4 mm, clearance 0.2 mm, thread diameter 15 mm, grip height 35 mm, bottom rounding 4 mm.

## Geometry

2D offsets and booleans use [manifold-3d](https://github.com/elalish/manifold) (Apache-2.0). Solids are extruded, unioned, and checked with Manifold’s status before export. Meshes sit on the bed in millimetres. Tracing tries VTracer (MIT or Apache-2.0) first, then ImageTracer.js (Unlicense), then a built-in contour walk. Text uses Nunito Medium (SIL Open Font License, see `src/assets/fonts/OFL.txt`).

Heavy builds run in a worker. If a sheet is too large, resolution is reduced and the status bar says so. A build that runs too long is stopped instead of freezing the page.

## License

Nenocutter’s own code is MIT, see [LICENSE](LICENSE). Third-party pieces keep their own licenses: Manifold is Apache-2.0, VTracer is MIT or Apache-2.0, ImageTracer.js is Unlicense, and Nunito is SIL OFL 1.1. Those licenses are compatible with shipping this app under MIT; they are not replaced by the MIT grant.
