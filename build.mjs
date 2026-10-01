// Bundles the game into a single self-contained HTML file: dist/index.html
// (works from file://, any static host, or as an embedded page).
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev') || watch;

async function bundle() {
  const result = await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'iife',
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    target: ['es2020'],
    write: false,
    legalComments: 'none',
  });
  const js = result.outputFiles[0].text;
  const html = readFileSync('src/template.html', 'utf8');
  const css = readFileSync('src/styles.css', 'utf8');
  const out = html
    .replace('/*__CSS__*/', () => css)
    .replace('/*__JS__*/', () => js.replace(/<\/script/g, '<\\/script'));
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.html', out);
  console.log(`built dist/index.html (${(out.length / 1024).toFixed(0)} KB)`);
}

await bundle();
if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  let t = null;
  fsWatch('src', { recursive: true }, () => {
    clearTimeout(t);
    t = setTimeout(() => bundle().catch((e) => console.error(e.message)), 150);
  });
  console.log('watching src/ ...');
}
