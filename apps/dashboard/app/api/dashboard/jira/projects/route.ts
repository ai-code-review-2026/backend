import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const DEFAULT_TIMEOUT = parseInt(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS || "15000");

export async function GET() {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${BACKEND_URL}/v1/jira/projects`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Jira projects GET failed: ${response.status} ${errorText}`);
        return NextResponse.json(
          { error: `Backend error: ${response.status}` }, 
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json(data);

    } catch (error: any) {
      clearTimeout(timeout);
      
      if (error.name === 'AbortError') {
        console.error("Jira projects GET timeout");
        return NextResponse.json({ error: "Request timeout" }, { status: 408 });
      }
      
      console.error("Jira projects GET error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

  } catch (error) {
    console.error("Jira projects GET auth error:", error);
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
}