import { NextRequest, NextResponse } from "next/server";
import { localizeApiErrorPayload } from "@/lib/i18n/api-errors";
import { createHash, timingSafeEqual } from "node:crypto";
import { getControlPlaneAuth } from "@/lib/auth/config";

import {
  ACCESS_KEY_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const auth = getControlPlaneAuth();

  if (auth.mode === "disabled" || auth.mode === "misconfigured") {
    return NextResponse.json(
      localizeApiErrorPayload(request, {
        error: "Control plane login is not configured",
        errorKey: "api.errors.auth.loginNotConfigured",
      }),
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
  } catch {
    return NextResponse.json(
      localizeApiErrorPayload(request, {
        error: "Invalid request body",
        errorKey: "api.errors.auth.invalidRequestBody",
      }),
      { status: 400, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const fields = body as Record<string, unknown>;
  let isValid = false;
  if (auth.mode === "credentials") {
    // Evaluate both comparisons and return one error to avoid revealing whether
    // an account exists. Hash first to compare fixed-size buffers.
    const usernameMatches = constantTimeCompare(
      typeof fields.username === "string" ? fields.username.trim() : "",
      auth.username
    );
    const passwordMatches = constantTimeCompare(
      typeof fields.password === "string" ? fields.password : "",
      auth.password
    );
    isValid = usernameMatches && passwordMatches;
  } else {
    isValid = constantTimeCompare(typeof fields.key === "string" ? fields.key : "", auth.accessKey);
  }

  if (!isValid) {
    return NextResponse.json(
      localizeApiErrorPayload(request, {
        error: auth.mode === "credentials" ? "Invalid username or password" : "Invalid access key",
        errorKey:
          auth.mode === "credentials"
            ? "api.errors.auth.invalidCredentials"
            : "api.errors.auth.invalidAccessKey",
      }),
      { status: 401, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "private, no-store" } }
  );

  response.cookies.set({
    name: ACCESS_KEY_COOKIE,
    value: await createSessionToken(auth.sessionSecret),
    ...sessionCookieOptions(request),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeCompare(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest()
  );
}
