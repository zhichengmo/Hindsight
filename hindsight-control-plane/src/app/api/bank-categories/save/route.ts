import { NextResponse } from "next/server";
import { DATAPLANE_URL, getDataplaneHeaders } from "@/lib/hindsight-client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${DATAPLANE_URL}/v1/bank-categories/save`, {
      method: "POST",
      headers: {
        ...getDataplaneHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { code: 500, message: err?.message || "Failed to save classification" },
      { status: 500 }
    );
  }
}
