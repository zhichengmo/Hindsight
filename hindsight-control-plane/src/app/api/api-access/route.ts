import { NextRequest, NextResponse } from "next/server";
import {
  API_ACCESS_HEADERS,
  getApiAccessMetadata,
  requireApiAccessSession,
} from "@/lib/api-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireApiAccessSession(request);
  if (denied) return denied;
  return NextResponse.json(getApiAccessMetadata(), { headers: API_ACCESS_HEADERS });
}
