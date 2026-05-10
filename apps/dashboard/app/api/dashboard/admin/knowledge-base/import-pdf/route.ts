import { NextResponse } from "next/server"
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { promisify } from "node:util"

import { requireBackendAuth } from "@/lib/backend-admin"

export const runtime = "nodejs"

const BACKEND_API_BASE_URL =
  process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const execFileAsync = promisify(execFile)

type BackendErrorPayload = {
  error?: unknown
  detail?: unknown
  message?: unknown
}

type BackendIngestResponse = BackendErrorPayload & {
  doc_id?: string
  title?: string
  chunks?: number
  source_type?: string
}

type PdfScriptSuccess = {
  ok: true
  text: string
}

type PdfScriptFailure = {
  ok: false
  error: string
}

type PdfScriptResponse = PdfScriptSuccess | PdfScriptFailure

type UploadedPdfFile = File

function extractErrorText(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = extractErrorText(item)
      if (candidate) {
        return candidate
      }
    }
    return null
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return (
      extractErrorText(record.error) ??
      extractErrorText(record.detail) ??
      extractErrorText(record.message) ??
      null
    )
  }
  return null
}

function errorMessage(error: unknown, fallback: string): string {
  return extractErrorText(error) ?? fallback
}

async function parseBackendError(response: Response): Promise<string> {
  const rawBody = await response.text()
  if (!rawBody) {
    return "KB ingestion failed."
  }
  try {
    const parsed = JSON.parse(rawBody) as BackendErrorPayload
    return extractErrorText(parsed.error) ?? extractErrorText(parsed.detail) ?? extractErrorText(parsed.message) ?? rawBody
  } catch {
    return rawBody
  }
}

function isUploadedPdfFile(value: FormDataEntryValue): value is UploadedPdfFile {
  return typeof File !== "undefined" && value instanceof File
}

function resolvePdfExtractorScript(): string {
  const scriptCandidates = [
    join(process.cwd(), "apps", "dashboard", "scripts", "extract-pdf-text.cjs"),
    join(process.cwd(), "scripts", "extract-pdf-text.cjs"),
    join(process.cwd(), "tools", "frontend", "extract-pdf-text.cjs"),
  ]
  const scriptPath = scriptCandidates.find((candidate) => existsSync(candidate))
  if (!scriptPath) {
    throw new Error("PDF extractor script is missing.")
  }
  return scriptPath
}

function parsePdfScriptOutput(stdout: string, stderr: string): PdfScriptResponse {
  const raw = stdout.trim() || stderr.trim()
  if (!raw) {
    return { ok: false, error: "PDF extractor returned no output." }
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.ok === true) {
      return { ok: true, text: typeof parsed.text === "string" ? parsed.text : "" }
    }
    return {
      ok: false,
      error: extractErrorText(parsed.error) ?? "PDF extractor returned an invalid error payload.",
    }
  } catch {
    return { ok: false, error: raw }
  }
}

async function extractPdfText(file: File): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "ai-code-review-pdf-"))
  const tempFilePath = join(tempDir, basename(file.name || "upload.pdf"))

  try {
    await writeFile(tempFilePath, Buffer.from(await file.arrayBuffer()))

    const { stdout, stderr } = await execFileAsync(process.execPath, [resolvePdfExtractorScript(), tempFilePath], {
      maxBuffer: 32 * 1024 * 1024,
    })
    const payload = parsePdfScriptOutput(stdout, stderr)
    if (!payload.ok) {
      throw new Error(payload.error)
    }
    return payload.text.trim()
  } catch (error) {
    const execError = error as {
      stdout?: string | Buffer
      stderr?: string | Buffer
      message?: string
    }
    const payload = parsePdfScriptOutput(String(execError.stdout ?? ""), String(execError.stderr ?? ""))
    if (!payload.ok) {
      throw new Error(payload.error)
    }
    throw new Error(errorMessage(execError.message, "PDF extractor failed."))
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export async function POST(request: Request) {
  try {
    const authContext = await requireBackendAuth()
    if (!authContext.ok) {
      return authContext.response
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: "Invalid multipart payload" }, { status: 400 })
    }

    const repoId = String(formData.get("repoId") ?? "").trim()
    const pathOrUrl = String(formData.get("pathOrUrl") ?? "").trim()
    const notes = String(formData.get("notes") ?? "").trim()
    const files = formData
      .getAll("files")
      .filter(isUploadedPdfFile)

    if (!repoId) {
      return NextResponse.json({ error: "repoId is required" }, { status: 400 })
    }
    if (files.length === 0) {
      return NextResponse.json({ error: "At least one PDF file is required" }, { status: 400 })
    }

    const importedItems: Array<{ docId: string; title: string; chunks: number }> = []

    for (const file of files) {
      const normalizedName = file.name.trim()
      if (!normalizedName.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json({ error: `Unsupported file type for '${normalizedName}'. PDF only.` }, { status: 400 })
      }

      let extractedText = ""
      try {
        extractedText = await extractPdfText(file)
      } catch (error) {
        console.error("PDF import parsing failed", { fileName: normalizedName, error })
        return NextResponse.json(
          { error: `PDF parsing failed for '${normalizedName}': ${errorMessage(error, "Unknown parser error")}` },
          { status: 400 },
        )
      }
      if (!extractedText) {
        return NextResponse.json({ error: `No readable text extracted from '${normalizedName}'.` }, { status: 400 })
      }

      const ingestPayload = {
        repo_id: repoId,
        title: normalizedName,
        source_type: "pdf",
        path_or_url: pathOrUrl || normalizedName,
        content: notes ? `${notes}\n\n${extractedText}` : extractedText,
        tags: ["pdf", "dashboard_upload"],
        doc_version: 1,
      }

      let backendResponse: Response
      try {
        backendResponse = await fetch(`${BACKEND_API_BASE_URL}/v1/kb/ingest`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authContext.token}`,
            "X-User-Id": authContext.userId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(ingestPayload),
          cache: "no-store",
        })
      } catch (error) {
        console.error("PDF import backend request failed", { repoId, fileName: normalizedName, error })
        return NextResponse.json(
          { error: `KB backend request failed: ${errorMessage(error, "Backend unavailable")}` },
          { status: 502 },
        )
      }

      if (!backendResponse.ok) {
        return NextResponse.json({ error: await parseBackendError(backendResponse) }, { status: backendResponse.status })
      }

      const payload = (await backendResponse.json()) as BackendIngestResponse
      importedItems.push({
        docId: String(payload.doc_id ?? ""),
        title: String(payload.title ?? normalizedName),
        chunks: Number(payload.chunks ?? 0) || 0,
      })
    }

    return NextResponse.json(
      {
        repoId,
        importedCount: importedItems.length,
        items: importedItems,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("Unhandled PDF import route failure", {
      error: errorMessage(error, "Unknown server error"),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { error: `Unhandled PDF import error: ${errorMessage(error, "Unknown server error")}` },
      { status: 500 },
    )
  }
}
