/**
 * PDF Report Generator
 * Uses jsPDF to generate downloadable analysis reports.
 * jsPDF@4.x ships ESM so we do a dynamic import at call-time to keep the
 * bundle lean and avoid SSR issues.
 */

export interface PdfReportSummary {
  id: string
  repo: string
  prLabel: string
  commitSha: string | null
  author: string
  status: string
  createdAt: string
  durationLabel: string
  blockerCount: number
  warnCount: number
  infoCount: number
  score?: number
}

export interface PdfFinding {
  severity: "BLOCKER" | "WARN" | "INFO"
  category: string
  message: string
  filePath: string
  lineStart?: number | null
  lineEnd?: number | null
  suggestion?: string | null
}

export interface PdfReportData extends PdfReportSummary {
  summary?: {
    totalFindings: number
    blocker: number
    warn: number
    info: number
    securityScore: number
    codeQuality: number
  }
  findings?: PdfFinding[]
  files?: Array<{
    path: string
    changeType: string
    additions: number
    deletions: number
    findingsCount: number
  }>
}

// ─── Color palette ─────────────────────────────────────────────────────────────

const COLORS = {
  primary:   [99,  102, 241] as [number, number, number],   // indigo-500
  emerald:   [16,  185, 129] as [number, number, number],
  amber:     [245, 158,  11] as [number, number, number],
  red:       [239,  68,  68] as [number, number, number],
  blue:      [59,  130, 246] as [number, number, number],
  zinc900:   [24,   24,  27] as [number, number, number],
  zinc800:   [39,   39,  42] as [number, number, number],
  zinc700:   [63,   63,  70] as [number, number, number],
  zinc400:   [161, 161, 170] as [number, number, number],
  zinc200:   [228, 228, 231] as [number, number, number],
  white:     [255, 255, 255] as [number, number, number],
}

function severityColor(severity: string): [number, number, number] {
  if (severity === "BLOCKER") return COLORS.red
  if (severity === "WARN")    return COLORS.amber
  return COLORS.blue
}

function scoreColor(score: number): [number, number, number] {
  if (score >= 80) return COLORS.emerald
  if (score >= 60) return COLORS.amber
  return COLORS.red
}

// ─── Core generator ────────────────────────────────────────────────────────────

export async function generateAnalysisPdf(data: PdfReportData): Promise<void> {
  // Dynamic import so Next.js server builds are unaffected
  const { jsPDF } = await import("jspdf")

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const W = doc.internal.pageSize.getWidth()   // 210
  const H = doc.internal.pageSize.getHeight()  // 297
  const margin = 16
  const contentW = W - margin * 2
  let y = margin

  // ─── Helper functions ────────────────────────────────────────────────────────

  const newPageIfNeeded = (needed = 12) => {
    if (y + needed > H - margin) {
      doc.addPage()
      y = margin
    }
  }

  const setColor = (rgb: [number, number, number]) => {
    doc.setTextColor(rgb[0], rgb[1], rgb[2])
  }

  const setFillColor = (rgb: [number, number, number]) => {
    doc.setFillColor(rgb[0], rgb[1], rgb[2])
  }

  const setDrawColor = (rgb: [number, number, number]) => {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2])
  }

  const text = (
    str: string,
    x: number,
    options?: { size?: number; bold?: boolean; color?: [number, number, number]; align?: "left" | "center" | "right" }
  ) => {
    doc.setFontSize(options?.size ?? 10)
    doc.setFont("helvetica", options?.bold ? "bold" : "normal")
    if (options?.color) setColor(options.color)
    else setColor(COLORS.zinc200)
    doc.text(str, x, y, { align: options?.align ?? "left" })
  }

  // ─── Header / Cover ──────────────────────────────────────────────────────────

  // Dark background header band
  setFillColor(COLORS.zinc900)
  doc.rect(0, 0, W, 52, "F")

  // Accent bar
  setFillColor(COLORS.primary)
  doc.rect(0, 0, 4, 52, "F")

  y = 16
  text("CODE REVIEW REPORT", margin + 6, { size: 18, bold: true, color: COLORS.white })
  y += 8
  text(data.repo, margin + 6, { size: 12, color: COLORS.zinc400 })
  y += 7
  text(
    `${data.prLabel}  ·  ${data.commitSha?.slice(0, 10) ?? "N/A"}  ·  ${new Date(data.createdAt).toLocaleString("fr-FR")}`,
    margin + 6,
    { size: 8, color: COLORS.zinc400 }
  )

  // Status pill (top-right)
  const statusStr = data.status.toUpperCase()
  const statusCol: [number, number, number] =
    statusStr === "COMPLETED" ? COLORS.emerald :
    statusStr === "FAILED"    ? COLORS.red      : COLORS.amber
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  setColor(statusCol)
  doc.text(statusStr, W - margin, 20, { align: "right" })

  y = 60

  // ─── Score + Meta row ────────────────────────────────────────────────────────

  const score = data.score ?? Math.max(0, 100 - (data.blockerCount * 10 + data.warnCount * 3 + data.infoCount))
  const scCol = scoreColor(score)

  // Score circle (drawn manually)
  const cx = margin + 14
  const cy = y + 14
  doc.setLineWidth(1.5)
  setDrawColor(COLORS.zinc800)
  doc.circle(cx, cy, 12, "S")
  setDrawColor(scCol)
  doc.setLineWidth(2)
  // Approximate arc via multiple small lines (jsPDF doesn't have native arc segment)
  const pct = score / 100
  const segments = 60
  const startAngle = -Math.PI / 2
  const endAngle = startAngle + 2 * Math.PI * pct
  for (let i = 0; i < segments * pct; i++) {
    const a1 = startAngle + (2 * Math.PI * pct * i) / (segments * pct)
    const a2 = startAngle + (2 * Math.PI * pct * (i + 1)) / (segments * pct)
    doc.line(
      cx + 12 * Math.cos(a1), cy + 12 * Math.sin(a1),
      cx + 12 * Math.cos(a2), cy + 12 * Math.sin(a2)
    )
  }
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  setColor(scCol)
  doc.text(String(score), cx, cy + 1.5, { align: "center" })
  doc.setFontSize(6)
  doc.setFont("helvetica", "normal")
  setColor(COLORS.zinc400)
  doc.text("SCORE", cx, cy + 6, { align: "center" })

  // Meta info block beside score
  const metaX = margin + 32
  const lineH = 6
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  setColor(COLORS.zinc200)
  doc.text("Author", metaX, y + 4)
  doc.text("Duration", metaX + 50, y + 4)
  doc.setFont("helvetica", "normal")
  setColor(COLORS.zinc400)
  doc.text(data.author, metaX, y + 4 + lineH)
  doc.text(data.durationLabel || "N/A", metaX + 50, y + 4 + lineH)

  y += 34

  // ─── Divider ─────────────────────────────────────────────────────────────────

  setDrawColor(COLORS.zinc800)
  doc.setLineWidth(0.3)
  doc.line(margin, y, W - margin, y)
  y += 8

  // ─── Finding Summary Cards ────────────────────────────────────────────────────

  text("FINDINGS SUMMARY", margin, { size: 9, bold: true, color: COLORS.zinc400 })
  y += 7

  const cardW = (contentW - 6) / 3
  const cards = [
    { label: "BLOCKER", count: data.blockerCount, color: COLORS.red },
    { label: "WARNING", count: data.warnCount,    color: COLORS.amber },
    { label: "INFO",    count: data.infoCount,    color: COLORS.blue },
  ]

  cards.forEach((card, i) => {
    const cx2 = margin + i * (cardW + 3)
    setFillColor(COLORS.zinc800)
    doc.roundedRect(cx2, y, cardW, 18, 2, 2, "F")
    // Accent top bar
    setFillColor(card.color)
    doc.roundedRect(cx2, y, cardW, 2, 1, 1, "F")
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    setColor(card.color)
    doc.text(String(card.count), cx2 + cardW / 2, y + 11, { align: "center" })
    doc.setFontSize(7)
    doc.setFont("helvetica", "bold")
    setColor(COLORS.zinc400)
    doc.text(card.label, cx2 + cardW / 2, y + 16, { align: "center" })
  })
  y += 26

  // ─── Findings detail ─────────────────────────────────────────────────────────

  if (data.findings && data.findings.length > 0) {
    newPageIfNeeded(20)
    setDrawColor(COLORS.zinc800)
    doc.line(margin, y, W - margin, y)
    y += 8

    text("FINDINGS", margin, { size: 9, bold: true, color: COLORS.zinc400 })
    y += 7

    data.findings.forEach((finding, idx) => {
      newPageIfNeeded(24)

      const sCol = severityColor(finding.severity)
      // Row bg
      setFillColor(COLORS.zinc800)
      doc.roundedRect(margin, y, contentW, 18, 1.5, 1.5, "F")
      // Severity accent
      setFillColor(sCol)
      doc.roundedRect(margin, y, 3, 18, 1, 1, "F")

      doc.setFontSize(7)
      doc.setFont("helvetica", "bold")
      setColor(sCol)
      doc.text(finding.severity, margin + 6, y + 5)

      doc.setFontSize(7)
      doc.setFont("helvetica", "normal")
      setColor(COLORS.zinc400)
      doc.text(finding.category.toUpperCase(), margin + 28, y + 5)

      // Message (truncate)
      const maxMsgW = contentW - 60
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      setColor(COLORS.zinc200)
      const msgLines = doc.splitTextToSize(finding.message, maxMsgW)
      doc.text(msgLines[0] as string, margin + 6, y + 11)

      // File path
      doc.setFontSize(7)
      setColor(COLORS.zinc400)
      const lineStr = finding.lineStart ? `:${finding.lineStart}` : ""
      doc.text(`${finding.filePath}${lineStr}`, margin + 6, y + 16)

      y += 21

      // Suggestion (if exists)
      if (finding.suggestion) {
        newPageIfNeeded(16)
        setFillColor([16, 185, 129, 0.05] as unknown as [number, number, number])
        setFillColor(COLORS.zinc900)
        doc.roundedRect(margin + 4, y, contentW - 4, 14, 1, 1, "F")
        setDrawColor(COLORS.emerald)
        doc.setLineWidth(0.5)
        doc.line(margin + 4, y, margin + 4, y + 14)
        doc.setFontSize(7)
        doc.setFont("helvetica", "bold")
        setColor(COLORS.emerald)
        doc.text("Suggestion:", margin + 8, y + 5)
        doc.setFont("helvetica", "normal")
        setColor(COLORS.zinc400)
        const suggLines = doc.splitTextToSize(finding.suggestion, contentW - 20)
        doc.text((suggLines[0] as string), margin + 8, y + 11)
        y += 18
      }

      if (idx < data.findings!.length - 1) y += 2
    })
  }

  // ─── Changed files ────────────────────────────────────────────────────────────

  if (data.files && data.files.length > 0) {
    newPageIfNeeded(20)
    setDrawColor(COLORS.zinc800)
    doc.line(margin, y, W - margin, y)
    y += 8

    text("CHANGED FILES", margin, { size: 9, bold: true, color: COLORS.zinc400 })
    y += 7

    data.files.forEach((file) => {
      newPageIfNeeded(10)
      const changeCol: [number, number, number] =
        file.changeType === "added"   ? COLORS.emerald :
        file.changeType === "deleted" ? COLORS.red      : COLORS.amber

      setFillColor(COLORS.zinc800)
      doc.roundedRect(margin, y, contentW, 10, 1, 1, "F")
      setFillColor(changeCol)
      doc.roundedRect(margin, y, 3, 10, 1, 1, "F")

      const typeLabel = file.changeType === "added" ? "A" : file.changeType === "deleted" ? "D" : "M"
      doc.setFontSize(7)
      doc.setFont("helvetica", "bold")
      setColor(changeCol)
      doc.text(typeLabel, margin + 6, y + 7)

      doc.setFontSize(7)
      doc.setFont("helvetica", "normal")
      setColor(COLORS.zinc200)
      const maxPathW = contentW - 60
      const pathLine = doc.splitTextToSize(file.path, maxPathW)[0] as string
      doc.text(pathLine, margin + 14, y + 7)

      // +/- counts
      doc.setFont("helvetica", "bold")
      setColor(COLORS.emerald)
      doc.text(`+${file.additions}`, W - margin - 24, y + 7, { align: "right" })
      setColor(COLORS.red)
      doc.text(`-${file.deletions}`, W - margin, y + 7, { align: "right" })

      y += 13
    })
  }

  // ─── Footer on every page ────────────────────────────────────────────────────

  const totalPages = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    setFillColor(COLORS.zinc900)
    doc.rect(0, H - 10, W, 10, "F")
    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    setColor(COLORS.zinc700)
    doc.text("AI Code Review Platform", margin, H - 4)
    doc.text(`Page ${i} / ${totalPages}`, W - margin, H - 4, { align: "right" })
    doc.text(data.repo, W / 2, H - 4, { align: "center" })
  }

  // ─── Save ─────────────────────────────────────────────────────────────────────

  const filename = `report-${data.repo.replace(/[^a-z0-9]/gi, "-")}-${data.id.slice(0, 8)}.pdf`
  doc.save(filename)
}

/** Quick export for list items (summary-only PDF) */
export async function generateSummaryPdf(reports: PdfReportSummary[]): Promise<void> {
  const { jsPDF } = await import("jspdf")

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const margin = 16
  let y = margin

  // Cover header
  doc.setFillColor(...COLORS.zinc900)
  doc.rect(0, 0, W, 40, "F")
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, 4, 40, "F")

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.white)
  doc.text("ANALYSES REPORT", margin + 6, 18)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...COLORS.zinc400)
  doc.text(`Generated on ${new Date().toLocaleString("fr-FR")}  ·  ${reports.length} analyses`, margin + 6, 28)

  y = 50

  // Table header
  const cols = [
    { label: "REPOSITORY",  x: margin,         w: 56 },
    { label: "PR / COMMIT", x: margin + 58,    w: 34 },
    { label: "STATUS",      x: margin + 94,    w: 26 },
    { label: "FINDINGS",    x: margin + 122,   w: 30 },
    { label: "SCORE",       x: margin + 154,   w: 22 },
    { label: "DATE",        x: margin + 78 + 100, w: 24 },
  ]

  doc.setFillColor(...COLORS.zinc800)
  doc.rect(margin, y, W - margin * 2, 8, "F")
  doc.setFontSize(7)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...COLORS.zinc400)
  cols.forEach((col) => doc.text(col.label, col.x + 2, y + 5.5))
  y += 10

  reports.forEach((r, idx) => {
    if (y + 12 > H - 14) {
      doc.addPage()
      y = margin
    }

    // Alternating row bg
    if (idx % 2 === 0) {
      doc.setFillColor(...COLORS.zinc900)
      doc.rect(margin, y - 1, W - margin * 2, 10, "F")
    }

    const statusCol: [number, number, number] =
      r.status.toUpperCase() === "COMPLETED" ? COLORS.emerald :
      r.status.toUpperCase() === "FAILED"    ? COLORS.red      : COLORS.amber
    const score = r.score ?? Math.max(0, 100 - (r.blockerCount * 10 + r.warnCount * 3 + r.infoCount))

    doc.setFontSize(8)
    doc.setFont("helvetica", "normal")

    doc.setTextColor(...COLORS.zinc200)
    doc.text(r.repo.length > 26 ? r.repo.slice(0, 24) + "…" : r.repo, cols[0].x + 2, y + 6)

    doc.setTextColor(...COLORS.zinc400)
    doc.text(r.prLabel.length > 16 ? r.prLabel.slice(0, 14) + "…" : r.prLabel, cols[1].x + 2, y + 6)

    doc.setTextColor(...statusCol)
    doc.text(r.status.toUpperCase().slice(0, 10), cols[2].x + 2, y + 6)

    doc.setTextColor(...COLORS.red)
    doc.text(`${r.blockerCount}`, cols[3].x + 2, y + 6)
    doc.setTextColor(...COLORS.amber)
    doc.text(`${r.warnCount}`, cols[3].x + 12, y + 6)
    doc.setTextColor(...COLORS.blue)
    doc.text(`${r.infoCount}`, cols[3].x + 22, y + 6)

    doc.setTextColor(...scoreColor(score))
    doc.text(String(score), cols[4].x + 2, y + 6)

    doc.setTextColor(...COLORS.zinc400)
    doc.text(new Date(r.createdAt).toLocaleDateString("fr-FR"), cols[5].x + 2, y + 6)

    y += 10
  })

  // Footer
  const totalPages = (doc.internal as unknown as { getNumberOfPages(): number }).getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFillColor(...COLORS.zinc900)
    doc.rect(0, H - 10, W, 10, "F")
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.zinc700)
    doc.text("AI Code Review Platform", margin, H - 4)
    doc.text(`Page ${i} / ${totalPages}`, W - margin, H - 4, { align: "right" })
  }

  doc.save(`analyses-report-${Date.now()}.pdf`)
}
