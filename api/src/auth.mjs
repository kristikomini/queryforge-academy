/* ---------------------------------------------------------------------------
   auth.mjs — passwords, tokens, recovery codes, JWT.

   Zero dependencies. The JWT is about forty hand-written lines because HS256 is
   genuinely that small, and a reader can verify it — which fits this repository
   better than a library nobody opens.

   The six decisions this file implements are written up in api/README.md.
--------------------------------------------------------------------------- */

import {
  randomBytes, randomUUID, createHash, createHmac,
  scryptSync, timingSafeEqual,
} from "node:crypto";

/* ======================================================== UUID v7 ========= */

/*  Time-ordered, so inserts stay at the end of the primary-key index instead of
    scattering across it. A random v4 as a key means every insert lands on a
    random page: the write working set becomes the whole table and pages split
    constantly. See site/chapters/03-data-types.html.                        */
export function uuidv7(now = Date.now()) {
  const b = randomBytes(16);
  b.writeUIntBE(now, 0, 6);                       // 48-bit millisecond timestamp
  b[6] = (b[6] & 0x0f) | 0x70;                    // version 7
  b[8] = (b[8] & 0x3f) | 0x80;                    // variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ====================================================== passwords ========= */

/*  scrypt: memory-hard, in the standard library, and the parameters live INSIDE
    the hash string. That is the same decision as storing an iteration count per
    user, better expressed — raising the cost later does not invalidate existing
    accounts, because an old hash still verifies against its own parameters and
    is silently re-hashed on the next successful sign-in.

    A plain fast hash is the trap: strong AND fast, and fast is the wrong
    property when the attacker has a GPU and your password is human-chosen.   */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export function hashPassword(password, params = SCRYPT) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, params.keylen, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, hashB64] = String(stored).split("$");
    if (alg !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password, salt, expected.length,
      { N: Number(N), r: Number(r), p: Number(p) });
    /* Constant-time. A byte-by-byte early return leaks how much of the hash
       matched, which over enough attempts is enough. */
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function needsRehash(stored, params = SCRYPT) {
  const [alg, N, r, p] = String(stored).split("$");
  return alg !== "scrypt" || Number(N) < params.N || Number(r) < params.r || Number(p) < params.p;
}

/*  A WRONG PASSWORD AND AN UNKNOWN ACCOUNT MUST BE INDISTINGUISHABLE.
    Same message, same status — and on the unknown-account path the server burns
    equivalent work, so the TIMING does not leak either. The login form must not
    be an account-enumeration oracle.

    This constant is a real hash of a value nobody knows, computed once at
    module load, so the work burned is genuinely the same work.               */
const DUMMY_HASH = hashPassword(randomBytes(32).toString("hex"));
export function burnEquivalentWork(password) {
  verifyPassword(password, DUMMY_HASH);
}

/* ================================================== recovery codes ======== */

/*  Crockford base32: 20 characters, ~100 bits, grouped in fives with dashes.
    No I, L, O or U — so it can be read aloud and written down without the
    classic confusions, and U is excluded so the alphabet cannot spell
    unfortunate words.

    NOTE THE ASYMMETRY WITH THE PASSWORD, AND KEEP IT: this is stored as a plain
    SHA-256, not a slow hash. The secret is 100 bits of CSPRNG output, so a fast
    hash costs an attacker nothing to begin with — scrypt's slowness only ever
    buys anything against a low-entropy, human-chosen secret.                 */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newRecoveryCode() {
  const bytes = randomBytes(20);
  let s = "";
  for (let i = 0; i < 20; i++) s += B32[bytes[i] % 32];
  return s.match(/.{1,5}/g).join("-");
}

/*  Normalisation is deliberately FORGIVING, because this is typed by a person
    who is already having a bad day: case-insensitive, dashes and spaces
    stripped, and the visually ambiguous characters folded to what they look
    like — I and L to 1, O to 0.                                             */
export function normaliseRecoveryCode(code) {
  return String(code || "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

export const sha256 = (s) => createHash("sha256").update(s).digest("base64");

export function hashRecoveryCode(code) {
  return sha256(normaliseRecoveryCode(code));
}

/* ========================================================== tokens ======== */

/*  32 random bytes, base64url. Only the SHA-256 is ever stored: a refresh token
    is a bearer credential, so a stolen database dump must not hand over working
    sessions.                                                                */
export function newOpaqueToken() {
  return randomBytes(32).toString("base64url");
}
export const hashToken = (t) => sha256(t);

/* ============================================================= JWT ======== */

/*  HS256, hand-written. It is forty lines, a reader can verify it, and it fits
    this repository better than a dependency nobody opens.

    Access tokens are SHORT-LIVED (15 minutes) because a JWT cannot be revoked:
    once signed it is valid until it expires, whatever happens to the account.
    That is the whole reason the long-lived credential is a stateful, revocable
    refresh token in a table rather than a longer JWT.                        */

const b64u = (buf) => Buffer.from(buf).toString("base64url");

export function signJwt(payload, secret, { expiresInSeconds = 900, now = Date.now() } = {}) {
  const iat = Math.floor(now / 1000);
  const body = { ...payload, iat, exp: iat + expiresInSeconds };
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = b64u(JSON.stringify(body));
  const data = `${head}.${claims}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyJwt(token, secret, { now = Date.now() } = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [head, claims, sig] = parts;

  /*  Verify the SIGNATURE before parsing the claims, and compare in constant
      time. And note what is NOT done: the `alg` header is never consulted to
      choose an algorithm. That is the classic JWT vulnerability — an attacker
      sets alg to "none" or swaps HS256 for RS256 and the library obliges. The
      algorithm here is decided by this code, not by the token.              */
  const expected = createHmac("sha256", secret).update(`${head}.${claims}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let body;
  try { body = JSON.parse(Buffer.from(claims, "base64url").toString("utf8")); }
  catch { return null; }

  if (typeof body.exp !== "number" || body.exp * 1000 <= now) return null;
  return body;
}

export { randomUUID };
