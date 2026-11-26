const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.join(__dirname, '..');
const envPath = path.join(rootDir, '.env.local');
const outDir = path.join(rootDir, 'src', 'core');
const outFile = path.join(outDir, 'vault.js');

function loadEnv() {
  const result = {
    VITE_CLOUD_EP: process.env.VITE_CLOUD_EP || '',
    VITE_CLOUD_SEC: process.env.VITE_CLOUD_SEC || '',
  };
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if ((k === 'VITE_CLOUD_EP' || k === 'VITE_CLOUD_SEC') && !result[k]) {
        result[k] = v;
      }
    }
  }
  return result;
}

function splitRandomChunks(str, count) {
  if (str.length < count) {
    throw new Error(`String too short to split into ${count} chunks.`);
  }
  const cuts = new Set();
  while (cuts.size < count - 1) {
    const pos = 1 + crypto.randomInt(str.length - 1);
    cuts.add(pos);
  }
  const sorted = [0, ...Array.from(cuts).sort((a, b) => a - b), str.length];
  const chunks = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    chunks.push(str.slice(sorted[i], sorted[i + 1]));
  }
  return chunks;
}

function rc4Transform(bytes, keyBytes) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + keyBytes[i % keyBytes.length]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
  }
  const out = new Uint8Array(bytes.length);
  let i = 0;
  j = 0;
  for (let idx = 0; idx < bytes.length; idx++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
    const k = s[(s[i] + s[j]) & 0xff];
    out[idx] = bytes[idx] ^ k;
  }
  return out;
}

function encryptChunk(str, rc4Key) {
  const utf8 = Buffer.from(str, 'utf8');
  const rot = 1 + crypto.randomInt(7); // 1..7
  const delta = crypto.randomInt(1, 255);
  const salt = crypto.randomBytes(4).readUInt32BE(0);

  // Layer 1 + Layer 2
  const stage2 = new Uint8Array(utf8.length);
  let state = salt >>> 0;
  for (let i = 0; i < utf8.length; i++) {
    const b = utf8[i];
    const r = ((b << rot) | (b >>> (8 - rot))) & 0xff;
    const a = (r + delta) & 0xff;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const lcgByte = (state >>> 24) & 0xff;
    stage2[i] = a ^ lcgByte;
  }

  // Layer 3: RC4
  const enc = rc4Transform(stage2, rc4Key);
  return {
    data: Array.from(enc),
    salt,
    rot,
    delta,
  };
}

function decryptChunk(entry, rc4Key) {
  const stage2 = rc4Transform(Uint8Array.from(entry.data), rc4Key);
  const out = new Uint8Array(stage2.length);
  let state = entry.salt >>> 0;
  for (let i = 0; i < stage2.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const lcgByte = (state >>> 24) & 0xff;
    const a = stage2[i] ^ lcgByte;
    const r = (a - entry.delta) & 0xff;
    out[i] = ((r >>> entry.rot) | (r << (8 - entry.rot))) & 0xff;
  }
  return Buffer.from(out).toString('utf8');
}

function shuffleIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function numExpr(val) {
  const mask = crypto.randomInt(0x1000, 0xffff);
  const add = crypto.randomInt(17, 250);
  const base = (val ^ mask) - add;
  return `(((${base} + ${add}) ^ ${mask}) >>> 0)`;
}

function byteExpr(val) {
  const m = crypto.randomInt(1, 255);
  const a = crypto.randomInt(1, 127);
  const x = (val ^ m) - a;
  return `(((${x} + ${a}) ^ ${m}) & 255)`;
}

function main() {
  const env = loadEnv();
  const ep = env.VITE_CLOUD_EP;
  const sec = env.VITE_CLOUD_SEC;

  if (!ep || !sec) {
    if (fs.existsSync(outFile)) {
      console.log('[Vault] No .env.local or env vars found; preserving existing encrypted src/core/vault.js');
      process.exit(0);
    }
    console.error('[Vault] Missing VITE_CLOUD_EP or VITE_CLOUD_SEC in .env.local or environment!');
    process.exit(1);
  }

  const epChunks = splitRandomChunks(ep, 5);
  const secChunks = splitRandomChunks(sec, 4);
  const decoyChunks = [
    'https://cdn-edge.telemetry-node.invalid/v1/metrics',
    'https://api.service-mesh.local/oauth2/token',
    'JEB_DECOY_8F12A4C9_DO_NOT_USE',
    'https://edge-proxy.cloud-gateway.invalid/rpc/v4',
    'TOKEN_HONEYPOT_2026_00FFAA11',
    '/v2/internal/session/heartbeat',
  ];

  const rawItems = [
    ...epChunks.map((text, idx) => ({ kind: 'ep', idx, text })),
    ...secChunks.map((text, idx) => ({ kind: 'sec', idx, text })),
    ...decoyChunks.map((text, idx) => ({ kind: 'decoy', idx, text })),
  ];

  const perm = shuffleIndices(rawItems.length);
  const rc4Key = Array.from(crypto.randomBytes(16));
  const pool = new Array(rawItems.length);
  const epMap = new Array(epChunks.length);
  const secMap = new Array(secChunks.length);

  for (let i = 0; i < rawItems.length; i++) {
    const slot = perm[i];
    const item = rawItems[i];
    pool[slot] = encryptChunk(item.text, rc4Key);
    if (item.kind === 'ep') epMap[item.idx] = slot;
    if (item.kind === 'sec') secMap[item.idx] = slot;
  }

  // Self-check before writing
  const verifyEp = epMap.map((idx) => decryptChunk(pool[idx], rc4Key)).join('');
  const verifySec = secMap.map((idx) => decryptChunk(pool[idx], rc4Key)).join('');
  if (verifyEp !== ep || verifySec !== sec) {
    throw new Error('[Vault] Self-check failed: decrypted output did not match inputs!');
  }

  const mapMask = crypto.randomInt(11, 240);
  const encEpMap = epMap.map((v) => v ^ mapMask);
  const encSecMap = secMap.map((v) => v ^ mapMask);

  const poolSource = pool
    .map(
      (p) =>
        `  [${JSON.stringify(p.data)}, ${numExpr(p.salt)}, ${byteExpr(p.rot)}, ${byteExpr(p.delta)}]`
    )
    .join(',\n');

  const keyExprs = rc4Key.map((b) => byteExpr(b)).join(', ');

  const vaultCode = `// Auto-generated polymorphic secret vault — do not edit manually
let _locked = false;

export function lockVault() {
  _locked = true;
}

export function isGuardLocked() {
  return _locked;
}

const _P = [
${poolSource}
];

const _M = ${byteExpr(mapMask)};
const _E = [${encEpMap.map((v) => byteExpr(v)).join(', ')}];
const _S = [${encSecMap.map((v) => byteExpr(v)).join(', ')}];

function _rk() {
  return [${keyExprs}];
}

function _rc4(bytes, key) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
  }
  const out = new Uint8Array(bytes.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < bytes.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    const t = s[i];
    s[i] = s[j];
    s[j] = t;
    out[k] = bytes[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

function _decChunk(slot, key) {
  const entry = _P[slot];
  const s2 = _rc4(Uint8Array.from(entry[0]), key);
  const out = new Uint8Array(s2.length);
  let st = entry[1] >>> 0;
  const rot = entry[2];
  const delta = entry[3];
  for (let i = 0; i < s2.length; i++) {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    const a = s2[i] ^ ((st >>> 24) & 0xff);
    const r = (a - delta) & 0xff;
    out[i] = ((r >>> rot) | (r << (8 - rot))) & 0xff;
  }
  return new TextDecoder().decode(out);
}

function _reassemble(indices) {
  const key = _rk();
  let out = '';
  for (let i = 0; i < indices.length; i++) {
    out += _decChunk(indices[i] ^ _M, key);
  }
  return out;
}

export async function pingVault() {
  if (_locked) {
    throw new Error('Phiên bảo mật đã bị khóa.');
  }
  const ep = _reassemble(_E);
  const res = await fetch(ep, { redirect: 'follow' });
  return res.json();
}

export async function callVault(action, payload = {}) {
  if (_locked) {
    throw new Error('Phiên bảo mật đã bị khóa.');
  }
  const ep = _reassemble(_E);
  const sec = _reassemble(_S);
  const res = await fetch(ep, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({ secret: sec, action, ...payload }),
  });
  return res.json();
}
`;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, vaultCode, 'utf8');
  console.log(`[Vault] Generated polymorphic vault (${pool.length} shuffled encrypted chunks) -> src/core/vault.js`);
}

main();
