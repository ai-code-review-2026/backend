"use client"

import { useEffect, useRef, useState } from "react"
import Editor, { OnMount } from "@monaco-editor/react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Save,
  RotateCcw,
  Download,
  FileCode,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type * as Monaco from "monaco-editor"

export type Finding = {
  id: string
  line_start: number | null
  line_end: number | null
  severity: "BLOCKER" | "WARN" | "INFO"
  message: string
  rule_id: string
  category?: string
}

type CodeEditorPanelProps = {
  filePath: string
  initialContent: string
  language?: string
  findings?: Finding[]
  onSave?: (content: string) => Promise<void>
  onContentChange?: (content: string) => void
  readOnly?: boolean
  height?: string
}

export function CodeEditorPanel({
  filePath,
  initialContent,
  language = "typescript",
  findings = [],
  onSave,
  onContentChange,
  readOnly = false,
  height = "600px",
}: CodeEditorPanelProps) {
  const [content, setContent] = useState(initialContent)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showFindings, setShowFindings] = useState(true)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const decorationsRef = useRef<string[]>([])

  // Détecter le langage depuis l'extension du fichier
  const detectedLanguage = language || detectLanguage(filePath)

  // Handler pour le montage de l'éditeur
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Appliquer les décorations (highlights) pour les findings
    applyFindingsDecorations()

    // Focus sur la première finding
    if (findings.length > 0 && findings[0].line_start) {
      editor.revealLineInCenter(findings[0].line_start)
      editor.setPosition({ lineNumber: findings[0].line_start, column: 1 })
    }
  }

  // Appliquer les décorations (highlights) pour les findings
  const applyFindingsDecorations = () => {
    if (!editorRef.current || !monacoRef.current || !showFindings) {
      return
    }

    const editor = editorRef.current
    const monaco = monacoRef.current

    const decorations: Monaco.editor.IModelDeltaDecoration[] = findings
      .filter((f) => f.line_start !== null)
      .map((finding) => {
        const severityClass = getSeverityClass(finding.severity)
        const severityColor = getSeverityColor(finding.severity)

        return {
          range: new monaco.Range(
            finding.line_start!,
            1,
            finding.line_end || finding.line_start!,
            1000
          ),
          options: {
            isWholeLine: true,
            className: `editor-line-${severityClass}`,
            glyphMarginClassName: `editor-glyph-${severityClass}`,
            overviewRuler: {
              color: severityColor,
              position: monaco.editor.OverviewRulerLane.Right,
            },
            minimap: {
              color: severityColor,
              position: monaco.editor.MinimapPosition.Inline,
            },
            hoverMessage: {
              value: `**${finding.rule_id}** (${finding.severity})\n\n${finding.message}`,
            },
          },
        }
      })

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations)
  }

  // Retirer les décorations
  const clearDecorations = () => {
    if (editorRef.current) {
      decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, [])
    }
  }

  // Toggle affichage des findings
  const toggleFindings = () => {
    setShowFindings(!showFindings)
    if (showFindings) {
      clearDecorations()
    } else {
      applyFindingsDecorations()
    }
  }

  // Réappliquer les décorations quand les findings changent
  useEffect(() => {
    if (showFindings) {
      applyFindingsDecorations()
    }
  }, [findings, showFindings])

  // Handler pour le changement de contenu
  const handleContentChange = (value: string | undefined) => {
    if (value === undefined) return

    setContent(value)
    setHasChanges(value !== initialContent)

    if (onContentChange) {
      onContentChange(value)
    }
  }

  // Sauvegarder les changements
  const handleSave = async () => {
    if (!onSave || !hasChanges) return

    setIsSaving(true)
    try {
      await onSave(content)
      setHasChanges(false)
    } catch (error) {
      console.error("Erreur lors de la sauvegarde:", error)
    } finally {
      setIsSaving(false)
    }
  }

  // Réinitialiser les changements
  const handleReset = () => {
    setContent(initialContent)
    setHasChanges(false)
    if (editorRef.current) {
      editorRef.current.setValue(initialContent)
    }
  }

  // Télécharger le fichier
  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filePath.split("/").pop() || "file.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  // Aller à une finding spécifique
  const goToFinding = (finding: Finding) => {
    if (!editorRef.current || !finding.line_start) return

    editorRef.current.revealLineInCenter(finding.line_start)
    editorRef.current.setPosition({ lineNumber: finding.line_start, column: 1 })
    editorRef.current.focus()
  }

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{filePath}</span>
          {hasChanges && (
            <Badge variant="secondary" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Modifié
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFindings}
            className="gap-2"
            title={showFindings ? "Masquer les findings" : "Afficher les findings"}
          >
            {showFindings ? (
              <>
                <EyeOff className="h-4 w-4" />
                Masquer findings
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Afficher findings
              </>
            )}
          </Button>

          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Réinitialiser
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Télécharger
          </Button>

          {onSave && !readOnly && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sauvegarde...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Sauvegarder
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Findings sidebar */}
      {findings.length > 0 && showFindings && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border">
          <AlertCircle className="h-4 w-4 text-orange-500" />
          <span className="text-sm text-muted-foreground">
            {findings.length} finding{findings.length > 1 ? "s" : ""} détecté{findings.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Editor + Findings panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Monaco Editor */}
        <div className="flex-1 relative">
          <Editor
            height={height}
            language={detectedLanguage}
            value={content}
            onChange={handleContentChange}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              readOnly,
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: "on",
              rulers: [80, 120],
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
              bracketPairColorization: { enabled: true },
              suggest: {
                enabled: true,
              },
              quickSuggestions: {
                other: true,
                comments: true,
                strings: true,
              },
            }}
          />

          {/* Inject custom CSS for decorations */}
          <style jsx global>{`
            .editor-line-BLOCKER {
              background-color: rgba(239, 68, 68, 0.1);
            }
            .editor-line-WARN {
              background-color: rgba(245, 158, 11, 0.1);
            }
            .editor-line-INFO {
              background-color: rgba(59, 130, 246, 0.1);
            }
            .editor-glyph-BLOCKER {
              background-color: rgb(239, 68, 68);
              width: 4px !important;
              margin-left: 3px;
            }
            .editor-glyph-WARN {
              background-color: rgb(245, 158, 11);
              width: 4px !important;
              margin-left: 3px;
            }
            .editor-glyph-INFO {
              background-color: rgb(59, 130, 246);
              width: 4px !important;
              margin-left: 3px;
            }
          `}</style>
        </div>

        {/* Findings Panel (sidebar) */}
        {findings.length > 0 && showFindings && (
          <div className="w-80 border-l border-border bg-muted/20">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                {findings.map((finding, idx) => (
                  <div
                    key={finding.id || idx}
                    className="p-3 rounded-lg border border-border bg-background hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => goToFinding(finding)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge
                        variant={
                          finding.severity === "BLOCKER"
                            ? "destructive"
                            : finding.severity === "WARN"
                            ? "default"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {finding.severity}
                      </Badge>
                      {finding.line_start && (
                        <span className="text-xs text-muted-foreground">
                          Line {finding.line_start}
                          {finding.line_end && finding.line_end !== finding.line_start
                            ? `-${finding.line_end}`
                            : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-medium text-foreground mb-1">{finding.rule_id}</p>
                    <p className="text-xs text-muted-foreground">{finding.message}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-t border-border">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{detectedLanguage.toUpperCase()}</span>
          <span>UTF-8</span>
          <span>{content.split("\n").length} lignes</span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges ? (
            <div className="flex items-center gap-2 text-xs text-orange-500">
              <AlertCircle className="h-3 w-3" />
              Modifications non sauvegardées
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-green-500">
              <CheckCircle2 className="h-3 w-3" />
              Sauvegardé
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper: Détecter le langage depuis l'extension du fichier
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase()

  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
  }

  return languageMap[ext || ""] || "plaintext"
}

// Helper: Get severity class
function getSeverityClass(severity: "BLOCKER" | "WARN" | "INFO"): string {
  return severity
}

// Helper: Get severity color
function getSeverityColor(severity: "BLOCKER" | "WARN" | "INFO"): string {
  switch (severity) {
    case "BLOCKER":
      return "rgb(239, 68, 68)"
    case "WARN":
      return "rgb(245, 158, 11)"
    case "INFO":
      return "rgb(59, 130, 246)"
    default:
      return "rgb(156, 163, 175)"
  }
}
