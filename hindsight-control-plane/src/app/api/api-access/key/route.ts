import { NextRequest, NextResponse } from "next/server";
import { API_ACCESS_HEADERS, requireApiAccessSession } from "@/lib/api-access";
import { localizeApiErrorPayload } from "@/lib/i18n/api-errors";

export async function POST(request: NextRequest) {
  const denied = await requireApiAccessSession(request);
  if (denied) return denied;
  const apiKey = process.env.HINDSIGHT_CP_DATAPLANE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      localizeApiErrorPayload(request, {
        error: "Dataplane API key is not configured",
        errorKey: "api.errors.auth.dataplaneKeyNotConfigured",
      }),
      { status: 503, headers: API_ACCESS_HEADERS }
    );
  }
  return NextResponse.json({ apiKey }, { headers: API_ACCESS_HEADERS });
}
