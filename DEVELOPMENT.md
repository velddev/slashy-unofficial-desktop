# Developing slashy-windows

```bash
npm install
npm start          # build into out/ and run from source
npm run typecheck  # tsc, strict
npm test           # link parsing, bundle rules, network pass-through, page contracts (Node runs the .ts directly)
npm run dist       # typecheck, build, then dist/Slashy-Setup-<version>.exe
```

TypeScript throughout; esbuild builds (`build.mjs`), `tsc` only type-checks. Only erasable syntax (no enums or
namespaces) so Node can run the tests without a compile step.

QA helpers: `npm start -- --simulate-offline` cuts the app off the network (it must come up from the copy on disk), and
`--user-data-dir=<folder>` runs a separate, signed-out profile next to your real one. Stamp local QA installers with a
plain version below the next release, not a `-qa.N` suffix: prerelease installs never auto-update to stable releases.

## Contracts

- **`src/contracts.ts`**: every message between the app and its pages. Requests from the page carry a zod schema the
  main process validates at runtime (the bridge is exposed to remote web content; malformed calls are dropped with an
  `[ipc]` warning). Schemas are loose: they check the fields we use and pass through anything else Slashy sends. Both
  sides are typed against it, so a renamed channel or changed payload fails `npm run typecheck`.
- **`src/slashy.ts`**: everything we depend on from slashy.com (hosts, routes, DOM selectors, store actions), plus types
  for the Slashy data we touch and the `window.electronAPI` bridge Slashy calls, which the preload implements
  (`satisfies SlashyBridge`). Start here when a Slashy deploy breaks something.

## Layout

| File | What it does |
|---|---|
| `src/main.ts` | App lifecycle: single instance, tray, launch args, notifications |
| `src/contracts.ts`, `src/slashy.ts` | The contracts above |
| `src/ipc.ts`, `src/preload/ipc.ts` | Typed `handle`/`send` (main) and `invoke`/`on` (page) over those contracts |
| `src/windows.ts` | Main window, link and compose pop-outs (+ warm spare), zoom, context menu |
| `src/mail.ts` | Registering as mail app, `mailto:` into Slashy's composer, the "set as default" card |
| `src/eml.ts`, `src/eml.html` | The `.eml` viewer |
| `src/desktop.ts` | App updates, web bundle schedule, startup timer, Settings > Desktop data |
| `src/bundle.ts` | The web app on disk, and the network pass-through for everything else |
| `src/links.ts`, `src/settings.ts` | Link parsing, profile folder + settings.json |
| `src/preload/` | Preload sources, bundled into `out/preload.cjs` (sandboxed preloads can't `require` local files) |

## Releasing

```bash
npm version patch   # bumps version, commits, tags vX.Y.Z
npm run release     # pushes the tag, typechecks, builds, uploads to GitHub Releases via gh
```

Installed copies pick the update up within 4 hours (or on next launch) and install it when the app quits.
