import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const TIMEOUT_MS = Number(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS) || 15000;

export async function GET(req: NextRequest) {
  try {
    // Authenticate
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Forward query params to backend
    const { searchParams } = new URL(req.url);
    const queryString = searchParams.toString();

    // Forward to backend (endpoint would fetch from analysis results)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/v1/agents/findings${queryString ? `?${queryString}` : ""}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Return empty findings for now (endpoint not implemented yet)
        return NextResponse.json({ findings: [] });
      }

      const data = await response.json();
      return NextResponse.json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        return NextResponse.json(
          { error: "Request timeout" },
          { status: 504 }
        );
      }
      // Return empty findings if backend endpoint doesn't exist yet
      return NextResponse.json({ findings: [] });
    }
  } catch (error) {
    console.error("Failed to fetch agent findings:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
