# Developing slashy-windows

```bash
npm install
npm start          # build into out/ and run from source
npm run typecheck  # tsc, strict
npm test           # link parsing, bundle rules, network pass-through, page contracts (Node runs the .ts directly)
npm run dist       # typecheck, build, then dist/Slashy-Setup-<version>.exe
npm run dist:linux # typecheck, build, then dist/linux-unpacked/ and dist/Slashy-<version>.AppImage (see Linux below)
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

## Linux

Unofficial and unreleased, but it builds and runs: `npm run dist:linux` on a Linux machine gives a plain folder
(`dist/linux-unpacked/`, the binary is `slashy`) and an AppImage. The platform differences live in `src/mail.ts`
(`xdg-mime` instead of the registry: "set as default" makes Slashy the `mailto:` and `.eml` handler directly) and
the tray in `src/main.ts` (a packaged Linux binary has no embedded icon, so it uses the `icon.png` copied into
`resources/`).

Linux finds apps, their URL schemes and file types through a `.desktop` file, and that file *is* the registration:
`registerApp()` does nothing on Linux. Its name has to be `slashy.desktop`, which is `desktopName` in package.json:
Electron derives the Wayland app_id / X11 WM_CLASS (`slashy`) from it and `xdg-mime default` refers to it. The AppImage
carries a generated one. For the folder build, copy `dist/linux-unpacked/` somewhere (say `~/.local/share/slashy`)
and add `~/.local/share/applications/slashy.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=Slashy
Comment=Unofficial desktop wrapper for the Slashy email client
Exec=/home/you/.local/share/slashy/slashy %U
Icon=/home/you/.local/share/slashy/resources/icon.png
Terminal=false
Categories=Network;Email;
MimeType=x-scheme-handler/slashyemail;x-scheme-handler/mailto;message/rfc822;
StartupWMClass=slashy
```

Then `update-desktop-database ~/.local/share/applications`. `x-scheme-handler/slashyemail` is what brings the
browser sign-in back to the app, so don't drop it. The folder build doesn't update itself; the AppImage would via
electron-updater once `latest-linux.yml` and the AppImage are uploaded with a release, which `release.mjs` doesn't do
yet.

## Releasing

```bash
npm version patch   # bumps version, commits, tags vX.Y.Z
npm run release     # pushes the tag, typechecks, builds, uploads to GitHub Releases via gh
```

Installed copies pick the update up within 4 hours (or on next launch) and install it when the app quits.
