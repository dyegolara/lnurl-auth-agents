var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
__export(index_exports, {
  Point: () => Point,
  Signature: () => Signature,
  __TEST: () => __TEST,
  etc: () => etc,
  getPublicKey: () => getPublicKey,
  getSharedSecret: () => getSharedSecret,
  hash: () => hash,
  hashes: () => hashes,
  keygen: () => keygen,
  recoverPublicKey: () => recoverPublicKey,
  recoverPublicKeyAsync: () => recoverPublicKeyAsync,
  schnorr: () => schnorr,
  sign: () => sign,
  signAsync: () => signAsync,
  utils: () => utils,
  verify: () => verify,
  verifyAsync: () => verifyAsync
});
module.exports = __toCommonJS(index_exports);
/*! noble-secp256k1 - MIT License (c) 2019 Paul Miller (paulmillr.com) */
const secp256k1_CURVE = Object.freeze({
  p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
  n: 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,
  h: 1n,
  a: 0n,
  b: 7n,
  Gx: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
  Gy: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n
});
const { p: P, n: N, Gx, Gy, b: _b } = secp256k1_CURVE;
const L = 32;
const L2 = 64;
const lengths = {
  publicKey: L + 1,
  publicKeyUncompressed: L2 + 1,
  signature: L2,
  // 48-byte keygen seed floor: 384 bits exceeds FIPS 186-5 Table A.2's
  // 352-bit recommendation for 256-bit prime curves.
  seed: L + L / 2
};
const err = (message = "", E = Error) => {
  const e = new E(message);
  const { captureStackTrace } = Error;
  if (typeof captureStackTrace === "function")
    captureStackTrace(e, err);
  throw e;
};
const isBytes = (a) => a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && a.BYTES_PER_ELEMENT === 1;
const abytes = (value, length, title = "") => {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    const msg = prefix + "expected Uint8Array" + ofLen + ", got " + got;
    return bytes ? err(msg, RangeError) : err(msg, TypeError);
  }
  return value;
};
const u8n = (len) => new Uint8Array(len);
const padh = (n, pad) => n.toString(16).padStart(pad, "0");
const bytesToHex = (b) => {
  let hex = "";
  for (const e of abytes(b))
    hex += padh(e, 2);
  return hex;
};
const C = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
const _ch = (ch) => ch >= C._0 && ch <= C._9 ? ch - C._0 : ch >= C.A && ch <= C.F ? ch - (C.A - 10) : ch >= C.a && ch <= C.f ? ch - (C.a - 10) : void 0;
const hexToBytes = (hex) => {
  const e = "hex invalid";
  if (typeof hex !== "string")
    return err(e);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    return err(e);
  const array = u8n(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = _ch(hex.charCodeAt(hi));
    const n2 = _ch(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0)
      return err(e);
    array[ai] = n1 * 16 + n2;
  }
  return array;
};
const subtle = () => globalThis?.crypto?.subtle ?? err("crypto.subtle must be defined, consider polyfill");
const concatBytes = (...arrs) => {
  let len = 0;
  for (const a of arrs)
    len += abytes(a).length;
  const r = u8n(len);
  let pad = 0;
  for (const a of arrs)
    r.set(a, pad), pad += a.length;
  return r;
};
const randomBytes = (len = L) => (globalThis?.crypto).getRandomValues(u8n(len));
const big = BigInt;
const arange = (n, min, max, msg = "bad number: out of range") => {
  if (typeof n !== "bigint")
    return err(msg, TypeError);
  if (min <= n && n < max)
    return n;
  return err(msg, RangeError);
};
const M = (a, b = P) => {
  const r = a % b;
  return r >= 0n ? r : b + r;
};
const modN = (a) => M(a, N);
const invert = (num, md) => {
  if (num === 0n || md <= 0n)
    err("no inverse n=" + num + " mod=" + md);
  let a = M(num, md), b = md, x = 0n, y = 1n, u = 1n, v = 0n;
  while (a !== 0n) {
    const q = b / a, r = b % a;
    const m = x - u * q, n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  return b === 1n ? M(x, md) : err("no inverse");
};
const callHash = (name) => {
  const fn = hashes[name];
  if (typeof fn !== "function")
    err("hashes." + name + " not set");
  return fn;
};
const gh = (name, a, b) => abytes(callHash(name)(a, b), L, "digest");
const gha = (name, a, b) => Promise.resolve(callHash(name)(a, b)).then((r) => abytes(r, L, "digest"));
const hash = (msg) => gh("sha256", abytes(msg, void 0, "message"));
const apoint = (p) => p instanceof Point ? p : err("Point expected");
const koblitz = (x) => M(M(x * x) * x + _b);
const FpIsValid = (n) => arange(n, 0n, P);
const FpIsValidNot0 = (n) => arange(n, 1n, P);
const FnIsValidNot0 = (n) => arange(n, 1n, N);
const isEven = (y) => !(y & 1n);
const u8of = (n) => Uint8Array.of(n);
const getPrefix = (y) => u8of(isEven(y) ? 2 : 3);
const lift_x = (x) => {
  const c = koblitz(FpIsValidNot0(x));
  let r = 1n;
  for (let num = c, e = (P + 1n) / 4n; e > 0n; e >>= 1n) {
    if (e & 1n)
      r = r * num % P;
    num = num * num % P;
  }
  if (M(r * r) !== c)
    err("sqrt invalid");
  return isEven(r) ? r : M(-r);
};
const __TEST = /* @__PURE__ */ Object.freeze({
  // Shared tests expect the BIP340 helper to expose the canonical even-y point, not just the root.
  lift_x: (x) => Point.fromAffine({ x, y: lift_x(x) }),
  extractK: (rand) => extractK(rand)
});
class Point {
  static BASE;
  static ZERO;
  X;
  Y;
  Z;
  constructor(X, Y, Z) {
    this.X = FpIsValid(X);
    this.Y = FpIsValidNot0(Y);
    this.Z = FpIsValid(Z);
    Object.freeze(this);
  }
  /** Returns the shared curve metadata object by reference.
   * It is readonly only at type level, and mutating it won't retarget arithmetic,
   * which already uses module-load snapshots. */
  static CURVE() {
    return secp256k1_CURVE;
  }
  /** Create 3d xyz point from 2d xy. (0, 0) => (0, 1, 0), not (0, 0, 1) */
  static fromAffine(ap) {
    const { x, y } = ap;
    return x === 0n && y === 0n ? I : new Point(x, y, 1n);
  }
  /** Convert Uint8Array or hex string to Point. */
  static fromBytes(bytes) {
    abytes(bytes);
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    let p = void 0;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    const x = sliceBytesNumBE(tail, 0, L);
    if (length === comp && (head === 2 || head === 3)) {
      let y = lift_x(x);
      if (head === 3)
        y = M(-y);
      p = new Point(x, y, 1n);
    }
    if (length === uncomp && head === 4)
      p = new Point(x, sliceBytesNumBE(tail, L, L2), 1n);
    return p ? p.assertValidity() : err("bad point: not on curve");
  }
  static fromHex(hex) {
    return Point.fromBytes(hexToBytes(hex));
  }
  get x() {
    return this.toAffine().x;
  }
  get y() {
    return this.toAffine().y;
  }
  /** Equality check: compare points P&Q. */
  equals(other) {
    const { X: X1, Y: Y1, Z: Z1 } = this;
    const { X: X2, Y: Y2, Z: Z2 } = apoint(other);
    const X1Z2 = M(X1 * Z2);
    const X2Z1 = M(X2 * Z1);
    const Y1Z2 = M(Y1 * Z2);
    const Y2Z1 = M(Y2 * Z1);
    return X1Z2 === X2Z1 && Y1Z2 === Y2Z1;
  }
  is0() {
    return this.equals(I);
  }
  /** Flip point over y coordinate. */
  negate() {
    return new Point(this.X, M(-this.Y), this.Z);
  }
  /** Point doubling: P+P, complete formula. */
  double() {
    return this.add(this);
  }
  /**
   * Point addition: P+Q, complete, exception-free formula
   * (Renes-Costello-Batina, algo 1 of [2015/1060](https://eprint.iacr.org/2015/1060)).
   * Cost: `12M + 0S + 3*a + 3*b3 + 23add`.
   */
  // prettier-ignore
  add(other) {
    const { X: X1, Y: Y1, Z: Z1 } = this;
    const { X: X2, Y: Y2, Z: Z2 } = apoint(other);
    const a = 0n;
    const b = _b;
    let X3 = 0n, Y3 = 0n, Z3 = 0n;
    const b3 = M(b * 3n);
    let t0 = M(X1 * X2), t1 = M(Y1 * Y2), t2 = M(Z1 * Z2), t3 = M(X1 + Y1);
    let t4 = M(X2 + Y2);
    t3 = M(t3 * t4);
    t4 = M(t0 + t1);
    t3 = M(t3 - t4);
    t4 = M(X1 + Z1);
    let t5 = M(X2 + Z2);
    t4 = M(t4 * t5);
    t5 = M(t0 + t2);
    t4 = M(t4 - t5);
    t5 = M(Y1 + Z1);
    X3 = M(Y2 + Z2);
    t5 = M(t5 * X3);
    X3 = M(t1 + t2);
    t5 = M(t5 - X3);
    Z3 = M(a * t4);
    X3 = M(b3 * t2);
    Z3 = M(X3 + Z3);
    X3 = M(t1 - Z3);
    Z3 = M(t1 + Z3);
    Y3 = M(X3 * Z3);
    t1 = M(t0 + t0);
    t1 = M(t1 + t0);
    t2 = M(a * t2);
    t4 = M(b3 * t4);
    t1 = M(t1 + t2);
    t2 = M(t0 - t2);
    t2 = M(a * t2);
    t4 = M(t4 + t2);
    t0 = M(t1 * t4);
    Y3 = M(Y3 + t0);
    t0 = M(t5 * t4);
    X3 = M(t3 * X3);
    X3 = M(X3 - t0);
    t0 = M(t3 * t1);
    Z3 = M(t5 * Z3);
    Z3 = M(Z3 + t0);
    return new Point(X3, Y3, Z3);
  }
  subtract(other) {
    return this.add(apoint(other).negate());
  }
  /**
   * Point-by-scalar multiplication. Scalar must be in range 1 <= n < CURVE.n.
   * Uses {@link wNAF} for base point.
   * Uses fake point to mitigate leakage shape in JS, not as a hard constant-time guarantee.
   * @param n scalar by which point is multiplied
   * @param safe safe mode guards against timing attacks; unsafe mode is faster
   */
  multiply(n, safe = true) {
    if (!safe && n === 0n)
      return I;
    FnIsValidNot0(n);
    if (n === 1n)
      return this;
    if (this.equals(G))
      return wNAF(n).p;
    let p = I;
    let f = G;
    for (let d = this; n > 0n; d = d.double(), n >>= 1n) {
      if (n & 1n)
        p = p.add(d);
      else if (safe)
        f = f.add(d);
    }
    return p;
  }
  multiplyUnsafe(scalar) {
    return this.multiply(scalar, false);
  }
  /** Convert point to 2d xy affine point. (X, Y, Z) ∋ (x=X/Z, y=Y/Z) */
  toAffine() {
    const { X: x, Y: y, Z: z } = this;
    if (this.equals(I))
      return { x: 0n, y: 0n };
    if (z === 1n)
      return { x, y };
    const iz = invert(z, P);
    if (M(z * iz) !== 1n)
      err("inverse invalid");
    return { x: M(x * iz), y: M(y * iz) };
  }
  /** Checks if the point is valid and on-curve. */
  assertValidity() {
    const { x, y } = this.toAffine();
    FpIsValidNot0(x);
    FpIsValidNot0(y);
    return M(y * y) === koblitz(x) ? this : err("bad point: not on curve");
  }
  /** Converts point to 33/65-byte Uint8Array. */
  toBytes(isCompressed = true) {
    const { x, y } = this.assertValidity().toAffine();
    const x32b = numTo32b(x);
    if (isCompressed)
      return concatBytes(getPrefix(y), x32b);
    return concatBytes(u8of(4), x32b, numTo32b(y));
  }
  toHex(isCompressed) {
    return bytesToHex(this.toBytes(isCompressed));
  }
}
const G = new Point(Gx, Gy, 1n);
const I = new Point(0n, 1n, 0n);
Point.BASE = G;
Point.ZERO = I;
const doubleScalarMulUns = (R, u1, u2) => {
  return G.multiply(u1, false).add(R.multiply(u2, false)).assertValidity();
};
const bytesToNumBE = (b) => big("0x" + (bytesToHex(b) || "0"));
const sliceBytesNumBE = (b, from, to) => bytesToNumBE(b.subarray(from, to));
const B256 = 2n ** 256n;
const numTo32b = (num) => hexToBytes(padh(arange(num, 0n, B256), L2));
const secretKeyToScalar = (secretKey) => {
  const num = bytesToNumBE(abytes(secretKey, L, "secret key"));
  return arange(num, 1n, N, "invalid secret key: outside of range");
};
const highS = (n) => n > N >> 1n;
const getPublicKey = (privKey, isCompressed = true) => {
  return G.multiply(secretKeyToScalar(privKey)).toBytes(isCompressed);
};
const isValidSecretKey = (secretKey) => {
  try {
    return !!secretKeyToScalar(secretKey);
  } catch (error) {
    return false;
  }
};
const isValidPublicKey = (publicKey, isCompressed) => {
  const { publicKey: comp, publicKeyUncompressed } = lengths;
  try {
    const l = publicKey.length;
    if (isCompressed === true && l !== comp)
      return false;
    if (isCompressed === false && l !== publicKeyUncompressed)
      return false;
    return !!Point.fromBytes(publicKey);
  } catch (error) {
    return false;
  }
};
const assertRecoveryBit = (recovery) => [0, 1, 2, 3].includes(recovery) ? recovery : err("invalid recovery id");
const assertSigFormat = (format) => {
  if (format === SIG_DER)
    err('Signature format "der" is not supported: switch to noble-curves');
  if (format != null && format !== SIG_COMPACT && format !== SIG_RECOVERED)
    err("Signature format must be one of: compact, recovered, der");
};
const assertSigLength = (sig, format = SIG_COMPACT) => {
  assertSigFormat(format);
  const len = lengths.signature + Number(format === SIG_RECOVERED);
  if (sig.length !== len)
    err(`Signature format "${format}" expects Uint8Array with length ${len}`);
};
class Signature {
  r;
  s;
  recovery;
  constructor(r, s, recovery) {
    this.r = FnIsValidNot0(r);
    this.s = FnIsValidNot0(s);
    if (recovery != null)
      this.recovery = assertRecoveryBit(recovery);
    Object.freeze(this);
  }
  static fromBytes(b, format = SIG_COMPACT) {
    assertSigLength(b, format);
    let rec;
    if (format === SIG_RECOVERED) {
      rec = b[0];
      b = b.subarray(1);
    }
    const r = sliceBytesNumBE(b, 0, L);
    const s = sliceBytesNumBE(b, L, L2);
    return new Signature(r, s, rec);
  }
  addRecoveryBit(bit) {
    return new Signature(this.r, this.s, bit);
  }
  hasHighS() {
    return highS(this.s);
  }
  toBytes(format = SIG_COMPACT) {
    assertSigFormat(format);
    const { r, s, recovery } = this;
    const res = concatBytes(numTo32b(r), numTo32b(s));
    if (format === SIG_RECOVERED) {
      return concatBytes(u8of(assertRecoveryBit(recovery)), res);
    }
    return res;
  }
}
const bits2int = (bytes) => {
  if (bytes.length > 8192)
    err("input is too large");
  const delta = bytes.length * 8 - 256;
  const num = bytesToNumBE(bytes);
  return delta > 0 ? num >> big(delta) : num;
};
const bits2int_modN = (bytes) => modN(bits2int(abytes(bytes)));
const SIG_COMPACT = "compact";
const SIG_RECOVERED = "recovered";
const SIG_DER = "der";
const _sha = "SHA-256";
const hashes = {
  hmacSha256Async: async (key, message) => {
    const s = subtle();
    const name = "HMAC";
    const k = await s.importKey("raw", key, { name, hash: { name: _sha } }, false, ["sign"]);
    return u8n(await s.sign(name, k, message));
  },
  hmacSha256: void 0,
  sha256Async: async (msg) => u8n(await subtle().digest(_sha, msg)),
  sha256: void 0
};
const prepMsg = (msg, opts, async_) => {
  const message = abytes(msg, void 0, "message");
  if (!opts.prehash)
    return message;
  return async_ ? gha("sha256Async", message) : gh("sha256", message);
};
const NULL = /* @__PURE__ */ u8n(0);
const byte0 = /* @__PURE__ */ u8of(0);
const byte1 = /* @__PURE__ */ u8of(1);
const _maxDrbgIters = 1e3;
const _drbgErr = "drbg: tried max amount of iterations";
const hmacDrbg = (seed, pred) => {
  let v = u8n(L);
  let k = u8n(L);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
  };
  const h = (...b) => gh("hmacSha256", k, concatBytes(v, ...b));
  const reseed = (seed2 = NULL) => {
    k = h(byte0, seed2);
    v = h();
    if (seed2.length === 0)
      return;
    k = h(byte1, seed2);
    v = h();
  };
  const gen = () => {
    if (i++ >= _maxDrbgIters)
      err(_drbgErr);
    v = h();
    return v;
  };
  reset();
  reseed(seed);
  let res = void 0;
  while (!(res = pred(gen())))
    reseed();
  reset();
  return res;
};
const hmacDrbgAsync = async (seed, pred) => {
  let v = u8n(L);
  let k = u8n(L);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
  };
  const h = (...b) => gha("hmacSha256Async", k, concatBytes(v, ...b));
  const reseed = async (seed2 = NULL) => {
    k = await h(byte0, seed2);
    v = await h();
    if (seed2.length === 0)
      return;
    k = await h(byte1, seed2);
    v = await h();
  };
  const gen = async () => {
    if (i++ >= _maxDrbgIters)
      err(_drbgErr);
    v = await h();
    return v;
  };
  reset();
  await reseed(seed);
  let res = void 0;
  while (!(res = pred(await gen())))
    await reseed();
  reset();
  return res;
};
const _sign = (messageHash, secretKey, opts, hmacDrbg2) => {
  let { lowS, extraEntropy } = opts;
  const int2octets = numTo32b;
  const h1i = bits2int_modN(messageHash);
  const h1o = int2octets(h1i);
  const d = secretKeyToScalar(secretKey);
  const seedArgs = [int2octets(d), h1o];
  if (extraEntropy != null && extraEntropy !== false) {
    const e = extraEntropy === true ? randomBytes(L) : extraEntropy;
    seedArgs.push(abytes(e, void 0, "extraEntropy"));
  }
  const seed = concatBytes(...seedArgs);
  const m = h1i;
  const k2sig = (kBytes) => {
    const k = bits2int(kBytes);
    if (!(1n <= k && k < N))
      return;
    const ik = invert(k, N);
    const q = G.multiply(k).toAffine();
    const r = modN(q.x);
    if (r === 0n)
      return;
    const s = modN(ik * modN(m + r * d));
    if (s === 0n)
      return;
    let recovery = (q.x === r ? 0 : 2) | Number(q.y & 1n);
    let normS = s;
    if (lowS && highS(s)) {
      normS = modN(-s);
      recovery ^= 1;
    }
    const sig = new Signature(r, normS, recovery);
    return sig.toBytes(opts.format);
  };
  return hmacDrbg2(seed, k2sig);
};
const _verify = (sig, messageHash, publicKey, opts = {}) => {
  const { lowS, format } = opts;
  if (sig instanceof Signature)
    err("Signature must be in Uint8Array, use .toBytes()");
  assertSigLength(sig, format);
  abytes(publicKey, void 0, "publicKey");
  try {
    const { r, s } = Signature.fromBytes(sig, format);
    const h = bits2int_modN(messageHash);
    const P2 = Point.fromBytes(publicKey);
    if (lowS && highS(s))
      return false;
    const is = invert(s, N);
    const u1 = modN(h * is);
    const u2 = modN(r * is);
    const R = doubleScalarMulUns(P2, u1, u2).toAffine();
    const v = modN(R.x);
    return v === r;
  } catch (error) {
    return false;
  }
};
const setDefaults = (opts) => {
  return {
    lowS: opts.lowS ?? true,
    prehash: opts.prehash ?? true,
    format: opts.format ?? SIG_COMPACT,
    extraEntropy: opts.extraEntropy ?? false
  };
};
const sign = (message, secretKey, opts = {}) => {
  opts = setDefaults(opts);
  assertSigFormat(opts.format);
  const msg = prepMsg(message, opts, false);
  return _sign(msg, secretKey, opts, hmacDrbg);
};
const signAsync = async (message, secretKey, opts = {}) => {
  opts = setDefaults(opts);
  assertSigFormat(opts.format);
  const msg = await prepMsg(message, opts, true);
  return _sign(msg, secretKey, opts, hmacDrbgAsync);
};
const verify = (signature, message, publicKey, opts = {}) => {
  opts = setDefaults(opts);
  const msg = prepMsg(message, opts, false);
  return _verify(signature, msg, publicKey, opts);
};
const verifyAsync = async (sig, message, publicKey, opts = {}) => {
  opts = setDefaults(opts);
  const msg = await prepMsg(message, opts, true);
  return _verify(sig, msg, publicKey, opts);
};
const _recover = (signature, messageHash) => {
  const sig = Signature.fromBytes(signature, "recovered");
  const { r, s, recovery } = sig;
  assertRecoveryBit(recovery);
  const h = bits2int_modN(abytes(messageHash, void 0, "msgHash"));
  const radj = recovery === 2 || recovery === 3 ? r + N : r;
  FpIsValidNot0(radj);
  const head = getPrefix(big(recovery));
  const Rb = concatBytes(head, numTo32b(radj));
  const R = Point.fromBytes(Rb);
  const ir = invert(radj, N);
  const u1 = modN(-h * ir);
  const u2 = modN(s * ir);
  const point = doubleScalarMulUns(R, u1, u2);
  return point.toBytes();
};
const recoverPublicKey = (signature, message, opts = {}) => {
  const msg = prepMsg(message, setDefaults(opts), false);
  return _recover(signature, msg);
};
const recoverPublicKeyAsync = async (signature, message, opts = {}) => {
  const msg = await prepMsg(message, setDefaults(opts), true);
  return _recover(signature, msg);
};
const getSharedSecret = (secretKeyA, publicKeyB, isCompressed = true) => {
  return Point.fromBytes(publicKeyB).multiply(secretKeyToScalar(secretKeyA)).toBytes(isCompressed);
};
const randomSecretKey = (seed) => {
  seed = seed === void 0 ? randomBytes(lengths.seed) : seed;
  abytes(seed);
  if (seed.length < lengths.seed || seed.length > 1024)
    return err("expected 48-1024b", RangeError);
  const num = M(bytesToNumBE(seed), N - 1n);
  return numTo32b(num + 1n);
};
const createKeygen = (getPublicKey2) => (seed) => {
  const secretKey = randomSecretKey(seed);
  return {
    secretKey,
    publicKey: getPublicKey2(secretKey)
  };
};
const keygen = /* @__PURE__ */ createKeygen(getPublicKey);
const etc = /* @__PURE__ */ Object.freeze({
  hexToBytes,
  bytesToHex,
  concatBytes,
  bytesToNumberBE: bytesToNumBE,
  numberToBytesBE: numTo32b,
  mod: M,
  invert,
  // math utilities; keep public alias type aligned with runtime
  randomBytes,
  secretKeyToScalar,
  abytes
});
const utils = /* @__PURE__ */ Object.freeze({
  isValidSecretKey,
  isValidPublicKey,
  randomSecretKey
  // preserve the optional seeded call
});
const getTag = (tag) => Uint8Array.from("BIP0340/" + tag, (c) => c.charCodeAt(0));
const T_AUX = "aux";
const T_NONCE = "nonce";
const T_CHALLENGE = "challenge";
const taggedHash = (tag, ...messages) => {
  const tagH = gh("sha256", getTag(tag));
  return gh("sha256", concatBytes(tagH, tagH, ...messages));
};
const taggedHashAsync = (tag, ...messages) => gha("sha256Async", getTag(tag)).then((tagH) => gha("sha256Async", concatBytes(tagH, tagH, ...messages)));
const extpubSchnorr = (priv) => {
  const d_ = secretKeyToScalar(priv);
  const p = G.multiply(d_);
  const { x, y } = p.assertValidity().toAffine();
  const d = isEven(y) ? d_ : modN(-d_);
  const px = numTo32b(x);
  return { d, px };
};
const bytesModN = (bytes) => modN(bytesToNumBE(bytes));
const challenge = (...args) => bytesModN(taggedHash(T_CHALLENGE, ...args));
const challengeAsync = async (...args) => bytesModN(await taggedHashAsync(T_CHALLENGE, ...args));
const pubSchnorr = (secretKey) => {
  return extpubSchnorr(secretKey).px;
};
const keygenSchnorr = /* @__PURE__ */ createKeygen(pubSchnorr);
const prepSigSchnorr = (message, secretKey, auxRand) => {
  const { px, d } = extpubSchnorr(secretKey);
  return { m: abytes(message), px, d, a: abytes(auxRand, L) };
};
const extractK = (rand) => {
  const k_ = bytesModN(rand);
  if (k_ === 0n)
    err("sign failed: k is zero");
  const { px, d } = extpubSchnorr(numTo32b(k_));
  return { rx: px, k: d };
};
const createSigSchnorr = (k, px, e, d) => {
  return concatBytes(px, numTo32b(modN(k + e * d)));
};
const E_INVSIG = "invalid signature produced";
const signSchnorr = (message, secretKey, auxRand = randomBytes(L)) => {
  const { m, px, d, a } = prepSigSchnorr(message, secretKey, auxRand);
  const aux = taggedHash(T_AUX, a);
  const t = numTo32b(d ^ bytesToNumBE(aux));
  const rand = taggedHash(T_NONCE, t, px, m);
  const { rx, k } = extractK(rand);
  const e = challenge(rx, px, m);
  const sig = createSigSchnorr(k, rx, e, d);
  if (!verifySchnorr(sig, m, px))
    err(E_INVSIG);
  return sig;
};
const signSchnorrAsync = async (message, secretKey, auxRand = randomBytes(L)) => {
  const { m, px, d, a } = prepSigSchnorr(message, secretKey, auxRand);
  const aux = await taggedHashAsync(T_AUX, a);
  const t = numTo32b(d ^ bytesToNumBE(aux));
  const rand = await taggedHashAsync(T_NONCE, t, px, m);
  const { rx, k } = extractK(rand);
  const e = await challengeAsync(rx, px, m);
  const sig = createSigSchnorr(k, rx, e, d);
  if (!await verifySchnorrAsync(sig, m, px))
    err(E_INVSIG);
  return sig;
};
const callSyncAsyncFn = (res, later) => {
  return res instanceof Promise ? res.then(later) : later(res);
};
const _verifSchnorr = (signature, message, publicKey, challengeFn) => {
  const sig = abytes(signature, L2, "signature");
  const msg = abytes(message, void 0, "message");
  const pub = abytes(publicKey, L, "publicKey");
  try {
    const x = bytesToNumBE(pub);
    const y = lift_x(x);
    const P_ = new Point(x, y, 1n).assertValidity();
    const px = numTo32b(P_.toAffine().x);
    const r = sliceBytesNumBE(sig, 0, L);
    arange(r, 1n, P);
    const s = sliceBytesNumBE(sig, L, L2);
    arange(s, 1n, N);
    const i = concatBytes(numTo32b(r), px, msg);
    return callSyncAsyncFn(challengeFn(i), (e) => {
      const { x: x2, y: y2 } = doubleScalarMulUns(P_, s, modN(-e)).toAffine();
      if (!isEven(y2) || x2 !== r)
        return false;
      return true;
    });
  } catch (error) {
    return false;
  }
};
const verifySchnorr = (s, m, p) => _verifSchnorr(s, m, p, challenge);
const verifySchnorrAsync = async (s, m, p) => _verifSchnorr(s, m, p, challengeAsync);
const schnorr = /* @__PURE__ */ Object.freeze({
  keygen: keygenSchnorr,
  getPublicKey: pubSchnorr,
  sign: signSchnorr,
  verify: verifySchnorr,
  signAsync: signSchnorrAsync,
  verifyAsync: verifySchnorrAsync
});
const W = 8;
const scalarBits = 256;
const pwindows = Math.ceil(scalarBits / W) + 1;
const pwindowSize = 2 ** (W - 1);
const precompute = () => {
  const points = [];
  let p = G;
  let b = p;
  for (let w = 0; w < pwindows; w++) {
    b = p;
    points.push(b);
    for (let i = 1; i < pwindowSize; i++) {
      b = b.add(p);
      points.push(b);
    }
    p = b.double();
  }
  return points;
};
let Gpows = void 0;
const ctneg = (cnd, p) => {
  const n = p.negate();
  return cnd ? n : p;
};
const wNAF = (n) => {
  const comp = Gpows || (Gpows = precompute());
  let p = I;
  let f = G;
  const pow_2_w = 2 ** W;
  const maxNum = pow_2_w;
  const mask = big(pow_2_w - 1);
  const shiftBy = big(W);
  for (let w = 0; w < pwindows; w++) {
    let wbits = Number(n & mask);
    n >>= shiftBy;
    if (wbits > pwindowSize) {
      wbits -= maxNum;
      n += 1n;
    }
    const off = w * pwindowSize;
    const offF = off;
    const offP = off + Math.abs(wbits) - 1;
    const isEven2 = w % 2 !== 0;
    const isNeg = wbits < 0;
    if (wbits === 0) {
      f = f.add(ctneg(isEven2, comp[offF]));
    } else {
      p = p.add(ctneg(isNeg, comp[offP]));
    }
  }
  if (n !== 0n)
    err("invalid wnaf");
  return { p, f };
};
