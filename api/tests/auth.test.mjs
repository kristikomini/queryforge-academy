/* ---------------------------------------------------------------------------
   auth.test.mjs — the assertions from the blueprint's §5.6, plus the ones that
   only exist because they caught something.

   These are not happy-path tests. Every one of them asserts a property that is
   easy to break, invisible when broken, and expensive later.
--------------------------------------------------------------------------- */

import { assert, withServer, frozenClock } from "./harness.mjs";
import { signJwt, verifyJwt, normaliseRecoveryCode, newRecoveryCode } from "../src/auth.mjs";

export const tests = {

  /* ================================================== the enumeration oracle */

  "a wrong password and an unknown account produce the SAME message": () =>
    withServer(async (api) => {
      await api.user("mario", "correct-horse-battery");

      const wrongPassword = await api.post("/api/auth/login",
        { username: "mario", password: "not-the-password" });
      const unknownAccount = await api.post("/api/auth/login",
        { username: "nobody", password: "not-the-password" });

      assert.equal(wrongPassword.status, 401);
      assert.equal(unknownAccount.status, 401);
      assert.equal(wrongPassword.body.detail, unknownAccount.body.detail,
        "the two failures must be indistinguishable, or the login form is an account-enumeration oracle");
      assert.equal(wrongPassword.body.title, unknownAccount.body.title);
    }),

  "registering a taken username is a 409, not a 500": () =>
    withServer(async (api) => {
      await api.user("mario");
      const again = await api.post("/api/auth/register",
        { username: "mario", password: "correct-horse-battery" });
      assert.equal(again.status, 409);
    }),

  "usernames are normalised before storage, so MARIO and mario collide": () =>
    withServer(async (api) => {
      await api.user("mario");
      const upper = await api.post("/api/auth/register",
        { username: "  MARIO  ", password: "correct-horse-battery" });
      assert.equal(upper.status, 409,
        "normalising on read instead of write means the unique index is on the wrong thing");
    }),

  /* ======================================================= tokens and JWTs */

  "a forged token signature is rejected": () =>
    withServer(async (api) => {
      const s = await api.user();
      const [h, c] = s.accessToken.split(".");
      const forged = `${h}.${c}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
      const r = await api.get("/api/auth/me", { token: forged });
      assert.equal(r.status, 401);
    }),

  "a token signed with a different key is rejected": () => {
    const good = signJwt({ sub: "u1" }, "the-real-secret-000000000000000000000000");
    assert.ok(verifyJwt(good, "the-real-secret-000000000000000000000000"));
    assert.equal(verifyJwt(good, "a-different-secret-00000000000000000000"), null);
  },

  "the alg header cannot be used to choose the algorithm (alg=none)": () => {
    const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ sub: "u1", exp: 9e12 })}.`;
    assert.equal(verifyJwt(none, "any-secret-000000000000000000000000000"), null,
      "the classic JWT vulnerability: the algorithm must be decided by our code, not by the token");
  },

  "an expired access token is rejected": () =>
    withServer(async (api) => {
      const s = await api.user();
      const ok = await api.get("/api/auth/me", { token: s.accessToken });
      assert.equal(ok.status, 200);

      api.clock.advance(api.cfg.accessTokenSeconds + 1);
      const expired = await api.get("/api/auth/me", { token: s.accessToken });
      assert.equal(expired.status, 401);
    }, { clock: frozenClock() }),

  /* ============================================= refresh rotation and replay */

  "a refresh token rotates, and the old one stops working": () =>
    withServer(async (api) => {
      const s = await api.user();
      const first = await api.post("/api/auth/refresh", { refreshToken: s.refreshToken });
      assert.equal(first.status, 200);
      assert.notEqual(first.body.refreshToken, s.refreshToken, "the token must rotate");

      const replay = await api.post("/api/auth/refresh", { refreshToken: s.refreshToken });
      assert.equal(replay.status, 401);
    }),

  "REPLAYING a used refresh token revokes the WHOLE family": () =>
    withServer(async (api) => {
      const s = await api.user();
      const rotated = await api.post("/api/auth/refresh", { refreshToken: s.refreshToken });
      assert.equal(rotated.status, 200);

      /* The attacker replays the stolen original… */
      const replay = await api.post("/api/auth/refresh", { refreshToken: s.refreshToken });
      assert.equal(replay.status, 401);

      /* …and the legitimate client's CURRENT token is now dead too. The server
         cannot tell a thief from a client that lost a response, so it assumes
         the worse case. */
      const legit = await api.post("/api/auth/refresh", { refreshToken: rotated.body.refreshToken });
      assert.equal(legit.status, 401,
        "a detected replay must end every session for that user, not only the replayed one");
    }),

  "an expired refresh token is rejected": () =>
    withServer(async (api) => {
      const s = await api.user();
      api.clock.advance(api.cfg.refreshTokenSeconds + 60);
      const r = await api.post("/api/auth/refresh", { refreshToken: s.refreshToken });
      assert.equal(r.status, 401);
    }, { clock: frozenClock() }),

  /* ==================================================== lockout and limiting */

  "eight failures lock the account, and it is a 423": () =>
    withServer(async (api) => {
      await api.user("mario", "correct-horse-battery");
      for (let i = 0; i < api.cfg.lockoutThreshold; i++)
        await api.post("/api/auth/login", { username: "mario", password: "wrong" });

      /* Even the CORRECT password is refused while locked. */
      const locked = await api.post("/api/auth/login",
        { username: "mario", password: "correct-horse-battery" });
      assert.equal(locked.status, 423);

      api.clock.advance(api.cfg.lockoutSeconds + 1);
      const after = await api.post("/api/auth/login",
        { username: "mario", password: "correct-horse-battery" });
      assert.equal(after.status, 200, "the lock must expire on its own");
    }, { clock: frozenClock(), env: { QF_AUTH_RPM: "10000" } }),

  "the rate limiter throttles repeated sign-ins": () =>
    withServer(async (api) => {
      let throttled = 0;
      for (let i = 0; i < 15; i++) {
        const r = await api.post("/api/auth/login", { username: "nobody", password: "x" });
        if (r.status === 429) throttled++;
      }
      assert.ok(throttled > 0, "more than 10 auth requests in a minute must be throttled");
    }, { env: { QF_AUTH_RPM: "10" } }),

  "the rate limiter leaves /api/health alone": () =>
    withServer(async (api) => {
      for (let i = 0; i < 30; i++) {
        const r = await api.get("/api/health");
        assert.equal(r.status, 200,
          "a liveness probe that can be rate-limited reports an outage it caused");
      }
    }, { env: { QF_AUTH_RPM: "2" } }),

  /* ======================================================== recovery codes */

  "a recovery code resets the password and issues a fresh one": () =>
    withServer(async (api) => {
      const s = await api.user("mario", "correct-horse-battery");
      assert.match(s.recoveryCode, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/,
        "20 characters of Crockford base32, grouped in fives");

      const ticket = await api.post("/api/auth/forgot-password",
        { username: "mario", recoveryCode: s.recoveryCode });
      assert.equal(ticket.status, 200);

      const reset = await api.post("/api/auth/reset-password",
        { resetToken: ticket.body.resetToken, newPassword: "a-brand-new-password" });
      assert.equal(reset.status, 200);
      assert.ok(reset.body.recoveryCode, "a completed reset must issue a FRESH code");
      assert.notEqual(reset.body.recoveryCode, s.recoveryCode);

      const old = await api.post("/api/auth/login",
        { username: "mario", password: "correct-horse-battery" });
      assert.equal(old.status, 401, "the old password must stop working");

      const now = await api.post("/api/auth/login",
        { username: "mario", password: "a-brand-new-password" });
      assert.equal(now.status, 200);
    }, { env: { QF_AUTH_RPM: "10000" } }),

  "a reset ticket is single use": () =>
    withServer(async (api) => {
      const s = await api.user("mario");
      const ticket = await api.post("/api/auth/forgot-password",
        { username: "mario", recoveryCode: s.recoveryCode });

      const first = await api.post("/api/auth/reset-password",
        { resetToken: ticket.body.resetToken, newPassword: "first-new-password" });
      assert.equal(first.status, 200);

      const second = await api.post("/api/auth/reset-password",
        { resetToken: ticket.body.resetToken, newPassword: "second-new-password" });
      assert.equal(second.status, 401, "spending a ticket twice must fail");
    }, { env: { QF_AUTH_RPM: "10000" } }),

  "a used recovery code no longer works": () =>
    withServer(async (api) => {
      const s = await api.user("mario");
      const ticket = await api.post("/api/auth/forgot-password",
        { username: "mario", recoveryCode: s.recoveryCode });
      await api.post("/api/auth/reset-password",
        { resetToken: ticket.body.resetToken, newPassword: "first-new-password" });

      const again = await api.post("/api/auth/forgot-password",
        { username: "mario", recoveryCode: s.recoveryCode });
      assert.equal(again.status, 401);
    }, { env: { QF_AUTH_RPM: "10000" } }),

  "recovery code normalisation is forgiving about case, dashes, I/L and O": () => {
    const canonical = normaliseRecoveryCode("A1B2C-D3E4F-G5H6J-K7L8M");
    assert.equal(normaliseRecoveryCode("a1b2c d3e4f g5h6j k7l8m"), canonical);
    assert.equal(normaliseRecoveryCode("A1B2CD3E4FG5H6JK7L8M"), canonical);
    /* I and L read as 1, O reads as 0 — a person is typing this from paper. */
    assert.equal(normaliseRecoveryCode("AIB2C-D3E4F-G5H6J-K7L8M"), canonical);
    assert.equal(normaliseRecoveryCode("A1B2C-D3E4F-G5H6J-K7L8M").length, 20);
  },

  "a generated recovery code never contains I, L, O or U": () => {
    for (let i = 0; i < 200; i++) {
      const c = newRecoveryCode().replace(/-/g, "");
      assert.notOk(/[ILOU]/.test(c), `ambiguous character in ${c}`);
      assert.equal(c.length, 20);
    }
  },

  "a wrong recovery code and an unknown username fail identically": () =>
    withServer(async (api) => {
      await api.user("mario");
      const wrongCode = await api.post("/api/auth/forgot-password",
        { username: "mario", recoveryCode: "AAAAA-AAAAA-AAAAA-AAAAA" });
      const unknownUser = await api.post("/api/auth/forgot-password",
        { username: "nobody", recoveryCode: "AAAAA-AAAAA-AAAAA-AAAAA" });
      assert.equal(wrongCode.status, unknownUser.status);
      assert.equal(wrongCode.body.detail, unknownUser.body.detail);
    }, { env: { QF_AUTH_RPM: "10000" } }),

  /* =================================================== passwords and policy */

  "a password shorter than the minimum is refused": () =>
    withServer(async (api) => {
      const r = await api.post("/api/auth/register", { username: "mario", password: "short" });
      assert.equal(r.status, 400);
    }),

  "an invalid username shape is refused with a useful message": () =>
    withServer(async (api) => {
      const r = await api.post("/api/auth/register",
        { username: "ma rio!", password: "correct-horse-battery" });
      assert.equal(r.status, 400);
      assert.match(r.body.detail, /3.32|username/i);
    }),
};
