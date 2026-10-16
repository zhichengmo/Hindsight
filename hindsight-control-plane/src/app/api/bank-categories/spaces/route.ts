import { NextResponse } from "next/server";
import { DATAPLANE_URL, getDataplaneHeaders } from "@/lib/hindsight-client";

export async function GET() {
  try {
    const response = await fetch(`${DATAPLANE_URL}/v1/bank-categories/spaces`, {
      headers: getDataplaneHeaders(),
      cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { code: 500, message: error?.message || "Failed to fetch business spaces" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(`${DATAPLANE_URL}/v1/bank-categories/spaces`, {
      method: "POST",
      headers: {
        ...getDataplaneHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    return NextResponse.json(
      { code: 500, message: error?.message || "Failed to save business space" },
      { status: 500 }
    );
  }
}
