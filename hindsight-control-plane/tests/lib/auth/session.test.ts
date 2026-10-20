import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getControlPlaneAuth } from "@/lib/auth/config";
import { GET as accessMetadata } from "@/app/api/api-access/route";
import { POST as revealKey } from "@/app/api/api-access/key/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";

import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isSecureRequest,
  verifySessionToken,
} from "@/lib/auth/session";

const ACCESS_KEY = "super-secret-access-key";

describe("account login and API credential boundary", () => {
  const username = "test-admin";
  const password = "test-password";
  const serviceKey = "test-service-api-key";
  beforeEach(() => {
    vi.stubEnv("HINDSIGHT_CP_USERNAME", username);
    vi.stubEnv("HINDSIGHT_CP_PASSWORD", password);
    vi.stubEnv("HINDSIGHT_CP_ACCESS_KEY", "legacy-test-key");
    vi.stubEnv("HINDSIGHT_CP_DATAPLANE_API_KEY", serviceKey);
    vi.stubEnv("HINDSIGHT_CP_PUBLIC_API_URL", "https://memory.example/api");
  });
  afterEach(() => vi.unstubAllEnvs());

  async function sessionRequest() {
    const response = await login(new NextRequest("http://localhost/api/auth/login", {
      method: "POST", body: JSON.stringify({ username, password }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    return new NextRequest("http://localhost/api/api-access/key", {
      method: "POST", headers: { Cookie: response.headers.get("set-cookie")!.split(";")[0] },
    });
  }

  it("keeps metadata secret-free and requires an explicit authenticated key request", async () => {
    expect((await revealKey(new NextRequest("http://localhost/api/api-access/key"))).status).toBe(401);
    const request = await sessionRequest();
    const metadata = await accessMetadata(request);
    expect(await metadata.json()).toEqual({ apiBaseUrl: "https://memory.example/api", docsUrl: "https://memory.example/api/docs", apiUrlStatus: "configured", apiKeyConfigured: true });
    const response = await revealKey(request);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ apiKey: serviceKey });
    const signedOut = await logout(request);
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    const denied = await revealKey(new NextRequest(request.url));
    expect(denied.status).toBe(401);
  });

  it.each(["HINDSIGHT_CP_USERNAME", "HINDSIGHT_CP_PASSWORD"])("invalidates sessions after rotating %s", async (key) => {
    const request = await sessionRequest();
    vi.stubEnv(key, "rotated-value");
    expect((await revealKey(request)).status).toBe(401);
  });

  it.each(["disabled", "legacy", "partial"])("refuses key disclosure with %s auth configuration", async (mode) => {
    const request = await sessionRequest();
    vi.stubEnv("HINDSIGHT_CP_USERNAME", undefined);
    vi.stubEnv("HINDSIGHT_CP_PASSWORD", mode === "partial" ? password : undefined);
    vi.stubEnv("HINDSIGHT_CP_ACCESS_KEY", mode === "legacy" ? "legacy-test-key" : undefined);
    expect(getControlPlaneAuth().mode).toBe(mode === "disabled" ? "disabled" : mode === "legacy" ? "access-key" : "misconfigured");
    expect((await revealKey(request)).status).toBe(503);
  });

  it("rejects incorrect credentials and legacy keys in account mode", async () => {
    for (const body of [{ username, password: "wrong" }, { key: "legacy-test-key" }]) {
      expect((await login(new NextRequest("http://localhost/api/auth/login", { method: "POST", body: JSON.stringify(body) }))).status).toBe(401);
    }
  });

  it.each([undefined, "http://name:password@example.com", "https://example.com?key=secret", "https://example.com#secret"])("never substitutes the internal proxy for public URL %j", async (url) => {
    vi.stubEnv("HINDSIGHT_CP_PUBLIC_API_URL", url);
    vi.stubEnv("HINDSIGHT_CP_DATAPLANE_API_URL", "http://internal-api:8888");
    const response = await accessMetadata(await sessionRequest());
    const data = await response.json();
    expect(data.apiBaseUrl).toBeNull();
    expect(data.docsUrl).toBeNull();
    expect(data.apiUrlStatus).toBe(url === undefined ? "missing" : "invalid");
  });
});

function fakeRequest({
  protocol = "http:",
  forwardedProto,
}: {
  protocol?: "http:" | "https:";
  forwardedProto?: string;
} = {}): NextRequest {
  const headers = new Headers();
  if (forwardedProto !== undefined) {
    headers.set("x-forwarded-proto", forwardedProto);
  }
  return {
    headers,
    nextUrl: { protocol },
  } as unknown as NextRequest;
}

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips: a freshly issued token verifies", async () => {
    const token = await createSessionToken(ACCESS_KEY);
    expect(await verifySessionToken(token, ACCESS_KEY)).toBe(true);
  });

  it("emits the documented `<issuedAt>.<sig>` shape", async () => {
    const token = await createSessionToken(ACCESS_KEY);
    const [issuedAt, sig, ...rest] = token.split(".");
    expect(rest).toHaveLength(0);
    expect(Number.isInteger(Number(issuedAt))).toBe(true);
    expect(sig.length).toBeGreaterThan(0);
  });

  it("rejects when the signature is tampered", async () => {
    const token = await createSessionToken(ACCESS_KEY);
    const [issuedAt] = token.split(".");
    const forged = `${issuedAt}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(await verifySessionToken(forged, ACCESS_KEY)).toBe(false);
  });

  it("rejects when the payload is swapped (signature no longer matches)", async () => {
    const token = await createSessionToken(ACCESS_KEY);
    const [, sig] = token.split(".");
    const futureTime = (Math.floor(Date.now() / 1000) - 10).toString();
    const forged = `${futureTime}.${sig}`;
    expect(await verifySessionToken(forged, ACCESS_KEY)).toBe(false);
  });

  it("rejects the bare-string cookie value that the old impl accepted", async () => {
    expect(await verifySessionToken("authenticated", ACCESS_KEY)).toBe(false);
  });

  it.each(["", undefined, ".", "abc", "abc.", ".abc", "notanumber.sig"])(
    "rejects malformed token: %j",
    async (bad) => {
      expect(await verifySessionToken(bad, ACCESS_KEY)).toBe(false);
    }
  );

  it("rejects when the access key has rotated since the token was issued", async () => {
    const token = await createSessionToken(ACCESS_KEY);
    expect(await verifySessionToken(token, "different-access-key")).toBe(false);
  });

  describe("expiry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("accepts a token issued just inside the max-age window", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const token = await createSessionToken(ACCESS_KEY);
      vi.setSystemTime(new Date(Date.now() + (SESSION_MAX_AGE_SECONDS - 5) * 1000));
      expect(await verifySessionToken(token, ACCESS_KEY)).toBe(true);
    });

    it("rejects a token issued past the max-age window", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const token = await createSessionToken(ACCESS_KEY);
      vi.setSystemTime(new Date(Date.now() + (SESSION_MAX_AGE_SECONDS + 5) * 1000));
      expect(await verifySessionToken(token, ACCESS_KEY)).toBe(false);
    });

    it("rejects a token whose issuedAt is implausibly in the future", async () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const farFuture = Math.floor(Date.now() / 1000) + 3600;
      // Forge a properly-signed token with a future iat to isolate the iat
      // check (a tampered iat alone would also fail the signature check).
      const { hmacSha256 } = await loadHmacHelper();
      const futureSig = await hmacSha256(ACCESS_KEY, farFuture.toString());
      expect(await verifySessionToken(`${farFuture}.${futureSig}`, ACCESS_KEY)).toBe(false);
    });
  });
});

describe("isSecureRequest", () => {
  it("returns true when X-Forwarded-Proto is https", () => {
    expect(isSecureRequest(fakeRequest({ forwardedProto: "https" }))).toBe(true);
  });

  it("returns false when X-Forwarded-Proto is http (even on a production build)", () => {
    expect(isSecureRequest(fakeRequest({ forwardedProto: "http" }))).toBe(false);
  });

  it("uses the first value when X-Forwarded-Proto is a comma list", () => {
    expect(isSecureRequest(fakeRequest({ forwardedProto: "https, http" }))).toBe(true);
    expect(isSecureRequest(fakeRequest({ forwardedProto: "http, https" }))).toBe(false);
  });

  it("falls back to the request URL protocol when no forwarded header is set", () => {
    expect(isSecureRequest(fakeRequest({ protocol: "https:" }))).toBe(true);
    expect(isSecureRequest(fakeRequest({ protocol: "http:" }))).toBe(false);
  });

  it("is case-insensitive on the forwarded value", () => {
    expect(isSecureRequest(fakeRequest({ forwardedProto: "HTTPS" }))).toBe(true);
  });
});

// Inlined HMAC helper for the future-iat test — re-derives a signature without
// reaching into private module internals.
async function loadHmacHelper() {
  async function hmacSha256(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
    let binary = "";
    for (const byte of sig) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  return { hmacSha256 };
}
