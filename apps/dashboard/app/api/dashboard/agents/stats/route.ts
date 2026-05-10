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

    // Forward to backend (endpoint would aggregate stats from analysis results)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/v1/agents/stats`,
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
        // Return mock stats for now (endpoint not implemented yet)
        return NextResponse.json({
          stats: [
            {
              agent_id: "security",
              agent_name: "Security Agent",
              total_findings: 0,
              critical_findings: 0,
              high_findings: 0,
              medium_findings: 0,
              low_findings: 0,
              avg_confidence: 0,
            },
            {
              agent_id: "performance",
              agent_name: "Performance Agent",
              total_findings: 0,
              critical_findings: 0,
              high_findings: 0,
              medium_findings: 0,
              low_findings: 0,
              avg_confidence: 0,
            },
            {
              agent_id: "cleancode",
              agent_name: "CleanCode Agent",
              total_findings: 0,
              critical_findings: 0,
              high_findings: 0,
              medium_findings: 0,
              low_findings: 0,
              avg_confidence: 0,
            },
            {
              agent_id: "architecture",
              agent_name: "Architecture Agent",
              total_findings: 0,
              critical_findings: 0,
              high_findings: 0,
              medium_findings: 0,
              low_findings: 0,
              avg_confidence: 0,
            },
            {
              agent_id: "devops",
              agent_name: "DevOps Agent",
              total_findings: 0,
              critical_findings: 0,
              high_findings: 0,
              medium_findings: 0,
              low_findings: 0,
              avg_confidence: 0,
            },
            {
              agent_id: "testing",
              agent_name: "Testing Agent",
              total_findings: 0,
              critical_findings: 0,
              high_findings: 0,
              medium_findings: 0,
              low_findings: 0,
              avg_confidence: 0,
            },
          ],
        });
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
      // Return mock stats if backend endpoint doesn't exist yet
      return NextResponse.json({ stats: [] });
    }
  } catch (error) {
    console.error("Failed to fetch agent stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
