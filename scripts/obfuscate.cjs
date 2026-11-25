const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const assetsDir = path.join(__dirname, '..', 'dist', 'assets');
if (!fs.existsSync(assetsDir)) {
  console.error('dist/assets not found');
  process.exit(1);
}

const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
for (const file of files) {
  const fullPath = path.join(assetsDir, file);
  const code = fs.readFileSync(fullPath, 'utf8');
  console.log(`[Obfuscator] Obfuscating ${file} (${code.length} bytes)...`);

  const result = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.45,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    rotateStringArray: true,
    selfDefending: false,
    shuffleStringArray: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.8,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
  });

  const obfCode = result.getObfuscatedCode();
  fs.writeFileSync(fullPath, obfCode, 'utf8');
  console.log(`[Obfuscator] Done ${file}: ${obfCode.length} bytes`);
}
