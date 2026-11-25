const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const assetsDir = path.join(distDir, 'assets');

// Rename dist/vite.html -> dist/index.html
const viteHtml = path.join(distDir, 'vite.html');
const distIndex = path.join(distDir, 'index.html');
if (fs.existsSync(viteHtml)) {
  fs.renameSync(viteHtml, distIndex);
}

// Obfuscate ONLY our app-*.js bundle (keep React vendor chunk fast & crash-free)
const files = fs.readdirSync(assetsDir).filter((f) => f.startsWith('app-') && f.endsWith('.js'));
for (const file of files) {
  const fullPath = path.join(assetsDir, file);
  const code = fs.readFileSync(fullPath, 'utf8');
  console.log(`[Obfuscator] Obfuscating ${file} (${code.length} bytes)...`);

  const result = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: false,
    shuffleStringArray: true,
    splitStrings: true,
    splitStringsChunkLength: 6,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.9,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
  });

  const obfCode = result.getObfuscatedCode();
  fs.writeFileSync(fullPath, obfCode, 'utf8');
  console.log(`[Obfuscator] Done ${file}: ${obfCode.length} bytes`);
}

// Sync built dist/* to repo root so GitHub Pages (main root) serves the compiled obfuscated site directly!
const rootAssets = path.join(rootDir, 'assets');
if (fs.existsSync(rootAssets)) fs.rmSync(rootAssets, { recursive: true, force: true });
fs.mkdirSync(rootAssets, { recursive: true });

for (const f of fs.readdirSync(assetsDir)) {
  fs.copyFileSync(path.join(assetsDir, f), path.join(rootAssets, f));
}
fs.copyFileSync(distIndex, path.join(rootDir, 'index.html'));
if (fs.existsSync(path.join(distDir, 'logo.jpg'))) {
  fs.copyFileSync(path.join(distDir, 'logo.jpg'), path.join(rootDir, 'logo.jpg'));
}
console.log('[Obfuscator] Synced compiled site to repo root for GitHub Pages!');
