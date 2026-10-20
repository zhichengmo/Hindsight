import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { localizeApiErrorPayload } from "@/lib/i18n/api-errors";
import createIntlMiddleware from "next-intl/middleware";

import { ACCESS_KEY_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { getControlPlaneAuth } from "@/lib/auth/config";
import { withBasePath } from "@/lib/base-path";
import { routing } from "@/i18n/routing";

// Routes that don't require authentication
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/api/version",
]);

const intlMiddleware = createIntlMiddleware(routing);

// Exempt actual asset locations, not arbitrary file extensions: a bank ID may
// legitimately end in .json/.js, including in an explicitly localized URL.
function isPublicAsset(path: string): boolean {
  return (
    ["/logo.png", "/favicon.png", "/favicon.ico", "/_next/image", "/_next/webpack-hmr"].includes(
      path
    ) ||
    ["/_next/static/", "/img/", "/fonts/", "/static/"].some((prefix) => path.startsWith(prefix))
  );
}

export async function middleware(request: NextRequest) {
  const auth = getControlPlaneAuth();
  // NextURL already strips next.config.basePath. Stripping again confuses
  // deployments such as basePath=/api with the application's own /api routes.
  const appPathname = request.nextUrl.pathname;
  if (isPublicAsset(appPathname)) return NextResponse.next();
  const localePrefix = appPathname.split("/")[1];
  const pagePathname = routing.locales.some((locale) => locale === localePrefix)
    ? appPathname.slice(localePrefix.length + 1) || "/"
    : appPathname;

  // API routes are not locale-prefixed — handle auth directly without i18n routing.
  if (appPathname.startsWith("/api/")) {
    const response = NextResponse.next();
    if (appPathname === "/api/api-access" || appPathname.startsWith("/api/api-access/")) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    const isPublic = PUBLIC_PATHS.has(appPathname);
    if (auth.mode === "disabled" || isPublic) return response;

    const sessionCookie = request.cookies.get(ACCESS_KEY_COOKIE)?.value;
    const isAuthenticated =
      "sessionSecret" in auth && (await verifySessionToken(sessionCookie, auth.sessionSecret));

    if (!isAuthenticated) {
      return NextResponse.json(
        localizeApiErrorPayload(request, {
          error: "Unauthorized",
          errorKey: "api.errors.auth.unauthorized",
        }),
        {
          status: 401,
          headers: { "Cache-Control": "private, no-store", "X-Hindsight-Session-Required": "1" },
        }
      );
    }

    return response;
  }

  // Page routes: enforce auth first, then delegate to the i18n middleware for
  // locale negotiation and rewriting. With localePrefix "never" the locale is
  // never in the path, so appPathname is already the canonical route.
  if (auth.mode !== "disabled") {
    const isPublic = PUBLIC_PATHS.has(pagePathname);

    if (!isPublic) {
      const sessionCookie = request.cookies.get(ACCESS_KEY_COOKIE)?.value;
      const isAuthenticated =
        "sessionSecret" in auth && (await verifySessionToken(sessionCookie, auth.sessionSecret));

      if (!isAuthenticated) {
        // Next.js middleware redirects do not automatically inherit next.config basePath.
        // Prefix the target explicitly, but keep returnTo as the app-relative path so
        // client-side router.push() does not double-prefix after login.
        const loginUrl = new URL(withBasePath("/login"), request.url);
        loginUrl.searchParams.set("returnTo", `${pagePathname}${request.nextUrl.search}`);
        const response = NextResponse.redirect(loginUrl);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
    }
  }

  const response = intlMiddleware(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Protect dynamic paths regardless of suffix; exempt real assets above.
  matcher: "/:path*",
};
