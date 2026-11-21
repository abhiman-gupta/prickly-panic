// One-time setup: makes the VAPID key pair and the two random secrets.
//   node scripts/setup-keys.mjs
// Writes .dev.vars (for `wrangler dev`) and secrets.local.json (for `wrangler secret bulk`),
// both gitignored, and puts the public VAPID key into wrangler.toml. Won't overwrite existing keys.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('secrets.local.json')) { console.log('secrets.local.json already exists; keeping the existing keys.'); process.exit(0); }
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const rand = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
const secrets = { PLAYER_SECRET: rand(32), ADMIN_TOKEN: rand(24), VAPID_PRIVATE_JWK: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y }) };

writeFileSync('secrets.local.json', JSON.stringify(secrets, null, 2) + '\n', { mode: 0o600 });
writeFileSync('.dev.vars', Object.entries(secrets).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { mode: 0o600 });
const toml = readFileSync('wrangler.toml', 'utf8').replace(/^VAPID_PUBLIC = ".*"$/m, `VAPID_PUBLIC = "${pub}"`);
writeFileSync('wrangler.toml', toml);
console.log('Made secrets.local.json and .dev.vars, and set VAPID_PUBLIC in wrangler.toml.');
