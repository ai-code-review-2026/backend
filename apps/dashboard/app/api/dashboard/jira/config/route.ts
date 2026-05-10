import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const DEFAULT_TIMEOUT = parseInt(process.env.DASHBOARD_BACKEND_FETCH_TIMEOUT_MS || "15000");
const WRITE_TIMEOUT = parseInt(process.env.DASHBOARD_BACKEND_WRITE_TIMEOUT_MS || "30000");

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
      const response = await fetch(`${BACKEND_URL}/v1/jira/config`, {
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
        console.error(`Jira config GET failed: ${response.status} ${errorText}`);
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
        console.error("Jira config GET timeout");
        return NextResponse.json({ error: "Request timeout" }, { status: 408 });
      }
      
      console.error("Jira config GET error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

  } catch (error) {
    console.error("Jira config GET auth error:", error);
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { getToken } = await auth();
    const token = await getToken();
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WRITE_TIMEOUT);

    try {
      const response = await fetch(`${BACKEND_URL}/v1/jira/config`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Jira config POST failed: ${response.status} ${errorText}`);
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
        console.error("Jira config POST timeout");
        return NextResponse.json({ error: "Request timeout" }, { status: 408 });
      }
      
      console.error("Jira config POST error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

  } catch (error) {
    console.error("Jira config POST auth error:", error);
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
}