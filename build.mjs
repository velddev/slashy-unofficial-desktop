// Builds the app into out/: the main process (ESM, dependencies left to node_modules), the preload (one CJS file,
// since sandboxed preloads can't require local files) and the .eml viewer page.
import { build } from 'esbuild'
import fs from 'node:fs/promises'

await Promise.all([
  build({
    entryPoints: ['src/main.ts'],
    outfile: 'out/main.js',
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    target: 'node22',
    logLevel: 'warning',
  }),
  build({
    entryPoints: ['src/preload/index.ts'],
    outfile: 'out/preload.cjs',
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    external: ['electron'],
    loader: { '.svg': 'dataurl' }, // images the preload draws into Slashy's page (its CSP allows data: images)
    target: 'chrome140',
    logLevel: 'warning',
  }),
])
await fs.copyFile('src/eml.html', 'out/eml.html')
