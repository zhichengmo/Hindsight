import { NextRequest, NextResponse } from "next/server";
import { getControlPlaneAuth } from "@/lib/auth/config";
import { ACCESS_KEY_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { localizeApiErrorPayload } from "@/lib/i18n/api-errors";

export const API_ACCESS_HEADERS = {
  "Cache-Control": "private, no-store",
  Pragma: "no-cache",
  Vary: "Cookie",
};

export interface ApiAccessMetadata {
  apiBaseUrl: string | null;
  docsUrl: string | null;
  apiUrlStatus: "configured" | "missing" | "invalid";
  apiKeyConfigured: boolean;
}

export async function requireApiAccessSession(request: NextRequest): Promise<NextResponse | null> {
  const auth = getControlPlaneAuth();
  // Guard each handler independently: disabled or legacy console auth must
  // never expose the dataplane credential by skipping middleware validation.
  if (auth.mode !== "credentials") {
    return NextResponse.json(
      localizeApiErrorPayload(request, {
        error: "Account login is required to access API credentials",
        errorKey: "api.errors.auth.accountLoginRequired",
      }),
      { status: 503, headers: API_ACCESS_HEADERS }
    );
  }
  if (
    !(await verifySessionToken(request.cookies.get(ACCESS_KEY_COOKIE)?.value, auth.sessionSecret))
  ) {
    return NextResponse.json(
      localizeApiErrorPayload(request, {
        error: "Unauthorized",
        errorKey: "api.errors.auth.unauthorized",
      }),
      { status: 401, headers: { ...API_ACCESS_HEADERS, "X-Hindsight-Session-Required": "1" } }
    );
  }
  return null;
}

export function getApiAccessMetadata(): ApiAccessMetadata {
  const metadata: ApiAccessMetadata = {
    apiBaseUrl: null,
    docsUrl: null,
    apiUrlStatus: "missing",
    apiKeyConfigured: !!process.env.HINDSIGHT_CP_DATAPLANE_API_KEY,
  };
  const configured = process.env.HINDSIGHT_CP_PUBLIC_API_URL?.trim();
  if (!configured) return metadata;
  try {
    const url = new URL(configured);
    // Reject URLs carrying credentials/tokens. Never fall back to the private
    // proxy URL: that address may only be reachable inside a container.
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("Invalid public API URL");
    }
    metadata.apiBaseUrl = url.toString().replace(/\/+$/, "");
    metadata.docsUrl = `${metadata.apiBaseUrl}/docs`;
    metadata.apiUrlStatus = "configured";
  } catch {
    metadata.apiUrlStatus = "invalid";
  }
  return metadata;
}
