import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { start } from '../mock_server';
import { encode } from '../lib/der';
import { genPrivateKey, getPublicKey, signCompact } from '../lib/secp';

const PORT = 8732;

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}${path}`, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, body: d }); }
      });
    }).on('error', reject);
  });
}

function postJSON(path, body) {
  return new Promise((resolve, reject) => {
    const jsonBody = JSON.stringify(body || {});
    const req = http.request(`http://127.0.0.1:${PORT}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody),
      },
    }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, body: d }); }
      });
    });
    req.on('error', reject);
    req.write(jsonBody);
    req.end();
  });
}

function cbUrl({ k1, sig, key }) {
  const params = new URLSearchParams({ k1, sig, key });
  return `/cb?${params.toString()}`;
}

function createValidSig(k1Hex) {
  const priv = genPrivateKey();
  const pub = getPublicKey(priv, true);
  const k1Bytes = Buffer.from(k1Hex, 'hex');
  const compact = signCompact(k1Bytes, priv);
  const der = encode(compact);
  return { sig: Buffer.from(der).toString('hex'), key: Buffer.from(pub).toString('hex') };
}

describe('mock_server', () => {
  let server;

  beforeAll(async () => {
    server = start(PORT);
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(() => {
    server.close();
  });

  it('GET /challenge returns valid structure', async () => {
    const ch = await getJSON('/challenge');
    expect(ch.status).toBe(200);
    expect(ch.headers['content-type']).toBe('application/json');
    expect(typeof ch.body.lnurl).toBe('string');
    expect(typeof ch.body.k1).toBe('string');
    expect(typeof ch.body.serviceUrl).toBe('string');
    expect(ch.body.lnurl).toMatch(/^lnurl1/i);
    expect(ch.body.k1).toMatch(/^[0-9a-f]{64}$/);
    expect(ch.body.serviceUrl).toContain(ch.body.k1);
  });

  it('two challenges produce different k1s', async () => {
    const ch1 = await getJSON('/challenge');
    const ch2 = await getJSON('/challenge');
    expect(ch1.body.k1).not.toBe(ch2.body.k1);
  });

  it('POST /challenge returns 404', async () => {
    const res = await postJSON('/challenge');
    expect(res.status).toBe(404);
  });

  it('GET /cb without params returns 400', async () => {
    const res = await getJSON('/cb');
    expect(res.status).toBe(400);
    expect(res.body.reason).toMatch(/missing/);
  });

  it('POST /cb returns 404', async () => {
    const res = await postJSON('/cb', {});
    expect(res.status).toBe(404);
  });

  it('GET non-existent route returns 404', async () => {
    const res = await getJSON('/nonexistent');
    expect(res.status).toBe(404);
  });

  it('GET /cb with valid signature on known k1 returns OK', async () => {
    const ch = await getJSON('/challenge');
    const sig = createValidSig(ch.body.k1);
    const res = await getJSON(cbUrl({ k1: ch.body.k1, sig: sig.sig, key: sig.key }));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  it('GET /cb with unknown k1 returns ERROR', async () => {
    const randomK1 = crypto.randomBytes(32).toString('hex');
    const sig = createValidSig(randomK1);
    const res = await getJSON(cbUrl({ k1: randomK1, sig: sig.sig, key: sig.key }));
    expect(res.status).toBe(400);
    expect(res.body.reason).toMatch(/unknown|already-used/);
  });

  it('GET /cb replay (already-used k1) returns ERROR', async () => {
    const ch = await getJSON('/challenge');
    const sig = createValidSig(ch.body.k1);
    await getJSON(cbUrl({ k1: ch.body.k1, sig: sig.sig, key: sig.key }));
    const res = await getJSON(cbUrl({ k1: ch.body.k1, sig: sig.sig, key: sig.key }));
    expect(res.status).toBe(400);
    expect(res.body.reason).toMatch(/unknown|already-used/);
  });

  it('GET /cb missing k1 returns 400', async () => {
    const res = await getJSON('/cb?sig=aa&key=bb');
    expect(res.status).toBe(400);
    expect(res.body.reason).toMatch(/missing/);
  });

  it('GET /cb missing sig returns 400', async () => {
    const ch = await getJSON('/challenge');
    const res = await getJSON(`/cb?k1=${ch.body.k1}&key=bb`);
    expect(res.status).toBe(400);
  });

  it('GET /cb missing key returns 400', async () => {
    const ch = await getJSON('/challenge');
    const res = await getJSON(`/cb?k1=${ch.body.k1}&sig=aa`);
    expect(res.status).toBe(400);
  });

  it('GET /cb with invalid DER hex returns 400', async () => {
    const ch = await getJSON('/challenge');
    const sig = createValidSig(ch.body.k1);
    const res = await getJSON(cbUrl({ k1: ch.body.k1, sig: 'zzzzzzzz', key: sig.key }));
    expect(res.status).toBe(400);
  });

  it('GET /cb with tampered signature returns ERROR', async () => {
    const ch = await getJSON('/challenge');
    const sig = createValidSig(ch.body.k1);
    const chars = sig.sig.split('');
    chars[10] = chars[10] === 'a' ? 'b' : 'a';
    const res = await getJSON(cbUrl({ k1: ch.body.k1, sig: chars.join(''), key: sig.key }));
    expect(res.status).toBe(400);
    expect(res.body.reason).toMatch(/verification/);
  });

  it('GET /cb with mismatched key returns ERROR', async () => {
    const ch = await getJSON('/challenge');
    const sig = createValidSig(ch.body.k1);
    const wrongKey = createValidSig(ch.body.k1);
    const res = await getJSON(cbUrl({ k1: ch.body.k1, sig: sig.sig, key: wrongKey.key }));
    expect(res.status).toBe(400);
    expect(res.body.reason).toMatch(/verification/);
  });

  it('GET /cb with wrong-length pubkey returns 400', async () => {
    const ch = await getJSON('/challenge');
    const sig = createValidSig(ch.body.k1);
    const res = await getJSON(cbUrl({ k1: ch.body.k1, sig: sig.sig, key: 'aa' }));
    expect(res.status).toBe(400);
  });

  it('challenge k1 is consumed on successful auth', async () => {
    const ch = await getJSON('/challenge');
    const sig = createValidSig(ch.body.k1);
    const authRes = await getJSON(cbUrl({ k1: ch.body.k1, sig: sig.sig, key: sig.key }));
    expect(authRes.body.status).toBe('OK');
    const replayRes = await getJSON(cbUrl({ k1: ch.body.k1, sig: sig.sig, key: sig.key }));
    expect(replayRes.status).toBe(400);
  });

  it('two challenges can auth independently', async () => {
    const ch1 = await getJSON('/challenge');
    const ch2 = await getJSON('/challenge');
    expect(ch1.body.k1).not.toBe(ch2.body.k1);
  });
});