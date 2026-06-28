import { build } from 'esbuild'

const shared = { bundle: true, minify: false, target: 'chrome120' }

await Promise.all([
  build({ ...shared, format: 'esm', entryPoints: ['background/index.js'], outfile: 'dist/background.js' }),
  build({ ...shared, format: 'iife', entryPoints: ['content/index.js'],    outfile: 'dist/content.js' }),
  build({ ...shared, format: 'esm', entryPoints: ['popup/popup.js'],       outfile: 'dist/popup.js' }),
])

console.log('build done → dist/')
