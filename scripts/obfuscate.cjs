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

// Obfuscate ONLY our c-*.js application bundle (keep React vendor chunk fast & crash-free)
const files = fs.readdirSync(assetsDir).filter((f) => f.startsWith('c-') && f.endsWith('.js'));
for (const file of files) {
  const fullPath = path.join(assetsDir, file);
  const code = fs.readFileSync(fullPath, 'utf8');
  console.log(`[Obfuscator] Obfuscating ${file} (${code.length} bytes)...`);

  const result = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 2500,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 3,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 1,
    stringArrayEncoding: ['rc4', 'base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 5,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 5,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 1,
    transformObjectKeys: true,
    unicodeEscapeSequence: true,
  });

  const obfCode = result.getObfuscatedCode();
  fs.writeFileSync(fullPath, obfCode, 'utf8');
  console.log(`[Obfuscator] Done ${file}: ${obfCode.length} bytes`);
}

// Inject pre-load anti-DevTools inline guard & minify dist/index.html
if (fs.existsSync(distIndex)) {
  const preGuardSrc = `(function(){try{var h=window.__REACT_DEVTOOLS_GLOBAL_HOOK__;if(h&&typeof h==='object'){Object.keys(h).forEach(function(k){if(k==='renderers')h[k]=new Map();else if(typeof h[k]==='function')h[k]=function(){};});}}catch(e){}document.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();if(e.key==='F12'||(e.ctrlKey&&(k==='u'||k==='s'||(e.shiftKey&&(k==='i'||k==='j'||k==='c'))))){e.preventDefault();e.stopPropagation();}},true);})();`;
  const preGuardObf = JavaScriptObfuscator.obfuscate(preGuardSrc, {
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 1,
    unicodeEscapeSequence: true,
  }).getObfuscatedCode();

  let html = fs.readFileSync(distIndex, 'utf8');
  html = html.replace('</head>', `<script>${preGuardObf}</script></head>`);
  html = html.replace(/>\s+</g, '><').replace(/\r?\n/g, '').trim();
  fs.writeFileSync(distIndex, html, 'utf8');
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
