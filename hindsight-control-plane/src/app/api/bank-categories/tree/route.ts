import { NextResponse } from "next/server";
import { DATAPLANE_URL, getDataplaneHeaders } from "@/lib/hindsight-client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = new URL("/v1/bank-categories/tree", DATAPLANE_URL);
  searchParams.forEach((val, key) => {
    targetUrl.searchParams.set(key, val);
  });

  try {
    const res = await fetch(targetUrl.toString(), {
      headers: getDataplaneHeaders(),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { code: 500, message: err?.message || "Failed to fetch category tree" },
      { status: 500 }
    );
  }
}
