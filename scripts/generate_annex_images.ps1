Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root "figures\annexes"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-Font([float]$Size, [string]$Style = "Regular") {
    return [System.Drawing.Font]::new("Arial", $Size, [System.Drawing.FontStyle]::$Style)
}

function New-Brush([string]$Hex) {
    return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Hex))
}

function New-Pen([string]$Hex, [float]$Width = 2) {
    return [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($Hex), $Width)
}

function New-RoundRectPath([float]$X, [float]$Y, [float]$W, [float]$H, [float]$R) {
    $Path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $D = $R * 2
    $Path.AddArc($X, $Y, $D, $D, 180, 90)
    $Path.AddArc($X + $W - $D, $Y, $D, $D, 270, 90)
    $Path.AddArc($X + $W - $D, $Y + $H - $D, $D, $D, 0, 90)
    $Path.AddArc($X, $Y + $H - $D, $D, $D, 90, 90)
    $Path.CloseFigure()
    return $Path
}

function Add-RoundRect($G, [float]$X, [float]$Y, [float]$W, [float]$H, [float]$R, [string]$Fill, [string]$Stroke, [float]$SW = 2) {
    $Path = New-RoundRectPath $X $Y $W $H $R
    $G.FillPath((New-Brush $Fill), $Path)
    $G.DrawPath((New-Pen $Stroke $SW), $Path)
}

function Add-Text($G, [string]$Text, [float]$X, [float]$Y, [float]$Size, [string]$Color = "#0f172a", [string]$Style = "Regular") {
    $G.DrawString($Text, (New-Font $Size $Style), (New-Brush $Color), $X, $Y)
}

function Add-CenteredText($G, [string]$Text, [float]$X, [float]$Y, [float]$W, [float]$H, [float]$Size, [string]$Color = "#0f172a", [string]$Style = "Regular") {
    $Fmt = [System.Drawing.StringFormat]::new()
    $Fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $Fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $Rect = [System.Drawing.RectangleF]::new($X, $Y, $W, $H)
    $G.DrawString($Text, (New-Font $Size $Style), (New-Brush $Color), $Rect, $Fmt)
}

function Add-Box($G, [float]$X, [float]$Y, [float]$W, [float]$H, [string]$Title, [string]$Sub, [string]$Stroke = "#2563eb", [string]$Fill = "#ffffff") {
    Add-RoundRect $G $X $Y $W $H 16 $Fill $Stroke 2
    Add-Text $G $Title ($X + 24) ($Y + 16) 21 "#111827" "Bold"
    if ($Sub) {
        $Normalized = $Sub.Replace("\n", "`n")
        $Lines = $Normalized -split "`n"
        $LineY = $Y + 48
        foreach ($Line in $Lines) {
            Add-Text $G $Line ($X + 24) $LineY 15 "#475569"
            $LineY += 22
        }
    }
}

function Add-Arrow($G, [float]$X1, [float]$Y1, [float]$X2, [float]$Y2, [string]$Color = "#334155", [switch]$Dashed) {
    $Pen = New-Pen $Color 3
    if ($Dashed) { $Pen.DashPattern = @(8, 8) }
    $Cap = [System.Drawing.Drawing2D.AdjustableArrowCap]::new(6, 8)
    $Pen.CustomEndCap = $Cap
    $G.DrawLine($Pen, $X1, $Y1, $X2, $Y2)
}

function Add-Header($G, [string]$Title, [string]$SubTitle) {
    Add-Text $G $Title 70 42 38 "#0f172a" "Bold"
    Add-Text $G $SubTitle 72 92 20 "#475569"
    $G.DrawLine((New-Pen "#cbd5e1" 2), 70, 128, 1730, 128)
}

function New-Canvas([string]$FileName, [scriptblock]$Draw) {
    $W = 1800
    $H = 1120
    $Bmp = [System.Drawing.Bitmap]::new($W, $H)
    $G = [System.Drawing.Graphics]::FromImage($Bmp)
    $G.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $G.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $G.Clear([System.Drawing.ColorTranslator]::FromHtml("#f8fafc"))
    & $Draw $G
    $Path = Join-Path $OutDir $FileName
    $Bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $SvgName = [System.IO.Path]::ChangeExtension($FileName, ".svg")
    $SvgPath = Join-Path $OutDir $SvgName
    $SvgContent = @"
<svg xmlns="http://www.w3.org/2000/svg" width="$W" height="$H" viewBox="0 0 $W $H">
  <image href="$FileName" x="0" y="0" width="$W" height="$H"/>
</svg>
"@
    Set-Content -Path $SvgPath -Value $SvgContent -Encoding UTF8
    $G.Dispose()
    $Bmp.Dispose()
}

function Add-Table($G, [float]$X, [float]$Y, [float[]]$Widths, [string[]]$Headers, [object[]]$Rows, [float]$RowH = 48) {
    $TotalW = ($Widths | Measure-Object -Sum).Sum
    Add-RoundRect $G $X $Y $TotalW ($RowH * ($Rows.Count + 1)) 12 "#ffffff" "#cbd5e1" 2
    $G.FillRectangle((New-Brush "#e2e8f0"), $X, $Y, $TotalW, $RowH)
    $Cx = $X
    for ($i = 0; $i -lt $Headers.Count; $i++) {
        Add-Text $G $Headers[$i] ($Cx + 14) ($Y + 14) 16 "#0f172a" "Bold"
        $Cx += $Widths[$i]
        if ($i -lt $Headers.Count - 1) { $G.DrawLine((New-Pen "#cbd5e1" 1), $Cx, $Y, $Cx, $Y + ($RowH * ($Rows.Count + 1))) }
    }
    $Cy = $Y + $RowH
    foreach ($Row in $Rows) {
        $G.DrawLine((New-Pen "#e2e8f0" 1), $X, $Cy, $X + $TotalW, $Cy)
        $Cx = $X
        for ($i = 0; $i -lt $Row.Count; $i++) {
            Add-Text $G ([string]$Row[$i]) ($Cx + 14) ($Cy + 14) 15 "#334155"
            $Cx += $Widths[$i]
        }
        $Cy += $RowH
    }
}

New-Canvas "annexe-a-uml-globaux.png" {
    param($G)
    Add-Header $G "Annexe A - Diagrammes UML globaux" "Vue synthetique des cas d'utilisation, classes, sequence et activite de la plateforme"
    Add-Box $G 90 180 350 180 "Cas d'utilisation" "Developer\nTech Lead\nAdmin\nGraphRAG System" "#0284c7" "#e0f2fe"
    Add-Box $G 520 180 520 180 "Classes metier principales" "User, Role, Organization, Project\nRepository, PullRequest, AnalysisRun\nFinding, ReviewDecision, KnowledgeDocument" "#16a34a" "#ecfdf5"
    Add-Box $G 1120 180 540 180 "Sequence globale" "PR ouverte -> Webhook -> API\nCelery -> GraphRAG -> Findings\nDashboard -> Decision Tech Lead" "#d97706" "#fef3c7"
    Add-Arrow $G 440 270 520 270
    Add-Arrow $G 1040 270 1120 270
    Add-Box $G 90 470 420 220 "Acteurs" "Developer : code, PR, corrections\nTech Lead : review, decision\nAdmin : configuration, integrations" "#4f46e5" "#eef2ff"
    Add-Box $G 590 470 420 220 "Systeme Devora" "Auth Clerk + RBAC\nWorkspace + Repositories\nReview Workflow + GraphRAG" "#be185d" "#fce7f3"
    Add-Box $G 1090 470 570 220 "Systemes externes" "GitHub : PRs, webhooks, branches\nJira / Slack / Teams : integrations\nLLM Providers : generation" "#475569" "#f1f5f9"
    Add-Arrow $G 510 580 590 580
    Add-Arrow $G 1010 580 1090 580
    Add-Table $G 120 790 @(320, 520, 760) @("Vue UML", "Objectif", "Fichiers / Figures a integrer") @(
        @("Use case", "Identifier les interactions acteur-systeme", "diagrammeGlobale.png, USE1/USE2/USE3"),
        @("Classes", "Structurer les entites metier", "diagramme_de_classe_globale1.png"),
        @("Sequence", "Montrer l'ordre des traitements", "SEQ1, SEQ2, SEQ3"),
        @("Activite", "Decrire le workflow global", "ACT1, ACT2, ACT3")
    ) 54
}

New-Canvas "annexe-b-captures-release1.png" {
    param($G)
    Add-Header $G "Annexe B - Captures de la Release 1" "Application web et mobile : acces, workspace, pull requests, reviews, analytics et mobile"
    $Cards = @(
        @("Authentification", "Login / inscription via Clerk", "#0ea5e9"),
        @("Dashboard par role", "Developer, Tech Lead, Admin", "#22c55e"),
        @("Workspace", "Organisations, projets, repositories", "#f59e0b"),
        @("All PRs", "Liste et filtres de pull requests", "#6366f1"),
        @("Analyse", "Rapport, findings, diff annote", "#ec4899"),
        @("Mobile", "Notifications, resumes, health", "#334155")
    )
    $X = 90; $Y = 180
    for ($i = 0; $i -lt $Cards.Count; $i++) {
        $C = $Cards[$i]
        Add-RoundRect $G $X $Y 500 230 20 "#ffffff" $C[2] 3
        $G.FillRectangle((New-Brush $C[2]), $X, $Y, 500, 54)
        Add-Text $G $C[0] ($X + 24) ($Y + 14) 19 "#ffffff" "Bold"
        Add-RoundRect $G ($X + 26) ($Y + 78) 448 92 12 "#f8fafc" "#cbd5e1" 2
        Add-Text $G "Capture a inserer" ($X + 165) ($Y + 108) 18 "#64748b" "Bold"
        Add-Text $G $C[1] ($X + 26) ($Y + 188) 16 "#475569"
        $X += 580
        if (($i + 1) % 3 -eq 0) { $X = 90; $Y += 310 }
    }
    Add-Table $G 100 840 @(420, 480, 700) @("Capture", "Chemin suggere", "Role dans le rapport") @(
        @("Login", "figures/auth.png", "Montrer l'acces securise"),
        @("Repository import", "figures/import_github_repository_light.png", "Montrer le rattachement GitHub"),
        @("Detail PR", "figures/release1/pr-detail.png", "Montrer le workflow review"),
        @("Mobile", "figures/release1/mobile-summary.png", "Montrer la continuite web-mobile")
    ) 54
}

New-Canvas "annexe-c-neo4j-cypher.png" {
    param($G)
    Add-Header $G "Annexe C - Schema Neo4j et requetes Cypher" "Graphe de code, base de connaissances, vector search et historique d'analyse"
    Add-Box $G 90 190 250 80 "Organization" "Perimetre client" "#0284c7" "#e0f2fe"
    Add-Box $G 430 190 250 80 "Project" "Produit / equipe" "#0284c7" "#e0f2fe"
    Add-Box $G 770 190 250 80 "Repository" "Depot analyse" "#0284c7" "#e0f2fe"
    Add-Box $G 1110 190 250 80 "File" "Fichier source" "#16a34a" "#ecfdf5"
    Add-Box $G 1450 190 250 80 "Chunk" "Embedding + contenu" "#16a34a" "#ecfdf5"
    Add-Arrow $G 340 230 430 230
    Add-Arrow $G 680 230 770 230
    Add-Arrow $G 1020 230 1110 230
    Add-Arrow $G 1360 230 1450 230
    Add-Text $G "CONTAINS" 355 202 14 "#475569"
    Add-Text $G "CONTAINS" 695 202 14 "#475569"
    Add-Text $G "CONTAINS" 1035 202 14 "#475569"
    Add-Text $G "CONTAINS" 1375 202 14 "#475569"
    Add-Box $G 430 410 250 80 "Rule" "Regle Tech Lead" "#d97706" "#fef3c7"
    Add-Box $G 770 410 250 80 "KnowledgeDocument" "Standards, docs" "#d97706" "#fef3c7"
    Add-Box $G 1110 410 250 80 "AnalysisRun" "Execution" "#be185d" "#fce7f3"
    Add-Box $G 1450 410 250 80 "Finding" "Resultat IA" "#be185d" "#fce7f3"
    Add-Arrow $G 1235 270 1235 410
    Add-Arrow $G 1360 450 1450 450
    Add-Arrow $G 1575 270 1575 410
    Add-Text $G "REFERENCES / BASED_ON" 1260 350 14 "#475569"
    Add-Text $G "HAS_FINDING" 1378 422 14 "#475569"
    Add-Text $G "Graph context" 1595 340 14 "#475569"
    Add-Box $G 90 610 760 360 "Exemple Cypher - vector search" "CALL db.index.vector.queryNodes('chunk_embedding_idx', 8, `$query_vector)\nYIELD node AS c, score\nWHERE c.repo_id = `$repo_id AND score >= 0.65\nRETURN c.path, c.content, c.symbol_name, score\nORDER BY score DESC" "#334155" "#ffffff"
    Add-Box $G 930 610 760 360 "Exemple Cypher - voisinage graphe" "MATCH (f:File {repo_id: `$repo_id, path: `$path})\nCALL apoc.path.subgraphNodes(f, {\n  relationshipFilter: 'IMPORTS>|<IMPORTS',\n  maxLevel: 2,\n  limit: 32\n}) YIELD node\nRETURN node.path AS neighbor_path" "#334155" "#ffffff"
}

New-Canvas "annexe-d-prompt-final-graphrag.png" {
    param($G)
    Add-Header $G "Annexe D - Prompt final GraphRAG" "Structure hierarchique du prompt utilise pour generer des findings traçables"
    $Blocks = @(
        @("1. Systeme", "Role : strict code reviewer\nJSON only\nPas de fichiers inventes", "#0ea5e9"),
        @("2. Regles KB", "Regles Tech Lead\nSeverite\nExemples violation/fix", "#d97706"),
        @("3. Documents KB", "Standards internes\nDocumentation technique\nGuidelines projet", "#f59e0b"),
        @("4. Contexte graphe", "Imports\nDependances\nVoisinage multi-hop", "#16a34a"),
        @("5. Contexte repository", "Chunks pertinents\nFichiers / lignes\nSymboles", "#4f46e5"),
        @("6. Diff + sortie", "Diff de PR\nSchema JSON\nReferences obligatoires", "#be185d")
    )
    $X = 90; $Y = 180
    foreach ($B in $Blocks) {
        Add-Box $G $X $Y 500 150 $B[0] $B[1] $B[2] "#ffffff"
        $X += 590
        if ($X -gt 1300) { $X = 90; $Y += 220 }
    }
    Add-Arrow $G 340 330 340 400
    Add-Arrow $G 930 330 930 400
    Add-Arrow $G 1520 330 1520 400
    Add-Table $G 135 690 @(360, 540, 650) @("Contrainte", "Objectif", "Impact") @(
        @("KB prioritaire", "Appliquer les regles internes avant le contexte repo", "Findings plus alignes metier"),
        @("Sortie JSON", "Faciliter parsing et persistence", "Integration dashboard fiable"),
        @("References", "Limiter les hallucinations", "Traçabilite fichier/regle/document"),
        @("Seuil confiance", "Filtrer les findings faibles", "Moins de bruit pour le Tech Lead")
    ) 58
}

New-Canvas "annexe-e-json-findings.png" {
    param($G)
    Add-Header $G "Annexe E - Exemple de sortie JSON des findings" "Contrat de sortie normalise pour sauvegarde, dashboard et commentaires inline"
    Add-Box $G 90 180 760 760 "JSON normalise" "{\n  `"summary`": `"La PR modifie le module d'analyse.`",\n  `"findings`": [\n    {\n      `"severity`": `"WARN`",\n      `"category`": `"quality`",\n      `"message`": `"La logique de validation est dupliquee.`",\n      `"suggestion`": `"Extraire une fonction commune.`",\n      `"confidence`": 0.82,\n      `"file_path`": `"apps/backend/app/core/review.py`",\n      `"line_start`": 42,\n      `"line_end`": 48,\n      `"references`": [\n        `"apps/backend/app/core/review.py:42`",\n        `"kb/rules/clean-code-001`"\n      ],\n      `"auto_fix`": null,\n      `"rule_ref`": `"clean-code-001`"\n    }\n  ]\n}" "#334155" "#ffffff"
    Add-Box $G 930 180 760 170 "Champs obligatoires" "severity, category, message, confidence\nfile_path, line_start, line_end\nreferences, suggestion, rule_ref" "#0284c7" "#e0f2fe"
    Add-Box $G 930 400 760 170 "Usage backend" "Parsing strict\nDeduplication\nSauvegarde PostgreSQL\nHistorique Neo4j" "#16a34a" "#ecfdf5"
    Add-Box $G 930 620 760 170 "Usage dashboard" "Affichage rapport\nDiff annote\nCommentaire inline\nDecision Tech Lead" "#d97706" "#fef3c7"
    Add-Box $G 930 840 760 100 "Guardrails" "Les findings sans reference ou avec confiance faible sont filtres ou degrades." "#be185d" "#fce7f3"
}

New-Canvas "annexe-f-devops-configs.png" {
    param($G)
    Add-Header $G "Annexe F - Docker Compose, Nginx, Certbot et GitHub Actions" "Artefacts de deploiement utilises pour industrialiser la plateforme"
    Add-Box $G 90 180 360 150 "Docker Compose infra" "PostgreSQL\nRedis\nNeo4j\nMinIO\nPrometheus / Grafana" "#334155" "#f1f5f9"
    Add-Box $G 540 180 360 150 "Docker Compose backend" "FastAPI API\nCelery Worker\nEnv vars\nHealthcheck" "#0284c7" "#e0f2fe"
    Add-Box $G 990 180 360 150 "Docker Compose frontend" "Next.js Dashboard\nYJS WebSocket\nPublic URLs" "#16a34a" "#ecfdf5"
    Add-Box $G 1440 180 260 150 "Docker Hub" "Images\nlatest\nsha tags" "#d97706" "#fef3c7"
    Add-Arrow $G 450 255 540 255
    Add-Arrow $G 900 255 990 255
    Add-Arrow $G 1350 255 1440 255
    Add-Box $G 160 470 420 180 "Nginx Reverse Proxy" "app.dev-ora.tn -> 127.0.0.1:3001\napi.dev-ora.tn -> 127.0.0.1:8000\ngrafana.dev-ora.tn -> Grafana" "#4f46e5" "#eef2ff"
    Add-Box $G 690 470 420 180 "Certbot HTTPS" "Let's Encrypt\nRedirect HTTP -> HTTPS\nRenew dry-run" "#be185d" "#fce7f3"
    Add-Box $G 1220 470 420 180 "GitHub Actions" "Checkout\nDocker build/push\nSSH VPS\nPull + restart" "#0ea5e9" "#e0f2fe"
    Add-Arrow $G 580 560 690 560
    Add-Arrow $G 1110 560 1220 560
    Add-Table $G 125 770 @(330, 440, 780) @("Artefact", "Chemin / service", "Role") @(
        @("docker-compose.yml", "/opt/ai-review/infra", "Demarrer les services d'infrastructure"),
        @("Nginx site", "/etc/nginx/sites-available", "Router les sous-domaines"),
        @("Certbot", "certbot --nginx", "Generer TLS"),
        @("GitHub Actions", ".github/workflows", "Automatiser build, push et deploy")
    ) 58
}

New-Canvas "annexe-g-vps-monitoring-https.png" {
    param($G)
    Add-Header $G "Annexe G - Captures VPS, monitoring et HTTPS" "Validation production : VPS, services Docker, HTTPS, Prometheus, Grafana et firewall"
    Add-Box $G 90 180 350 170 "VPS OVH" "Ubuntu 25.04\nIP 135.125.100.150\nSSH securise" "#334155" "#f1f5f9"
    Add-Box $G 520 180 350 170 "DNS OVH" "app.dev-ora.tn\napi.dev-ora.tn\ngrafana.dev-ora.tn" "#0284c7" "#e0f2fe"
    Add-Box $G 950 180 350 170 "HTTPS" "Nginx\nCertbot\nLet's Encrypt" "#16a34a" "#ecfdf5"
    Add-Box $G 1380 180 350 170 "Firewall" "22/tcp\n80/tcp\n443/tcp" "#d97706" "#fef3c7"
    Add-Arrow $G 440 265 520 265
    Add-Arrow $G 870 265 950 265
    Add-Arrow $G 1300 265 1380 265
    Add-Box $G 110 470 480 220 "Prometheus" "up == 1\nnode-exporter\ncadvisor\nai-review-api /metrics" "#be185d" "#fce7f3"
    Add-Box $G 660 470 480 220 "Grafana VPS" "CPU\nMemory\nDisk\nNetwork" "#4f46e5" "#eef2ff"
    Add-Box $G 1210 470 480 220 "Grafana Docker" "Containers\nRestart policy\nResource usage\nService health" "#0ea5e9" "#e0f2fe"
    Add-Table $G 130 800 @(360, 460, 720) @("Capture", "Chemin", "Validation") @(
        @("Dashboard HTTPS", "images/s3-dashboard-https.png", "Frontend accessible en production"),
        @("API healthz", "images/s3-api-healthz-https.png", "Backend repond en HTTPS"),
        @("Prometheus up", "images/s3-prometheus-up.png", "Metriques disponibles"),
        @("UFW final", "images/s3-ufw-final.png", "Ports publics limites")
    ) 58
}

New-Canvas "annexe-h-extraits-code.png" {
    param($G)
    Add-Header $G "Annexe H - Extraits de code importants" "Composants backend structurants de l'analyse intelligente et de l'orchestration"
    Add-Box $G 90 180 360 170 "RepoContextManager" "Indexation full/incrementale\nChunking\nEmbeddings\nNeo4j graph" "#0284c7" "#e0f2fe"
    Add-Box $G 520 180 360 170 "GraphRAG Retriever" "Symbol search\nVector search\nGraph expand\nKB priority" "#16a34a" "#ecfdf5"
    Add-Box $G 950 180 360 170 "GenerationService" "Prompt final\nLLM call\nJSON parsing\nFindings" "#d97706" "#fef3c7"
    Add-Box $G 1380 180 360 170 "Celery Task" "run_graphrag_pipeline\nStatus\nPersistence\nHistory" "#be185d" "#fce7f3"
    Add-Arrow $G 450 265 520 265
    Add-Arrow $G 880 265 950 265
    Add-Arrow $G 1310 265 1380 265
    Add-Box $G 120 470 700 310 "Extrait logique - orchestration" "1. Charger analyse\n2. Parser diff\n3. Secret scan + redaction\n4. Demarrer AnalysisRun\n5. Lancer orchestrateur GraphRAG\n6. Sauvegarder findings\n7. Comparer avec run precedent" "#334155" "#ffffff"
    Add-Box $G 960 470 700 310 "Extrait logique - retrieval" "1. Embed query/diff\n2. Vector search chunks\n3. Recherche par symboles\n4. Expansion Neo4j multi-hop\n5. Recherche KB rules/docs\n6. Fusion et contexte final" "#334155" "#ffffff"
    Add-Table $G 120 860 @(520, 700, 380) @("Fichier", "Role", "Annexe") @(
        @("repo_context_manager.py", "Indexation repository et contexte", "H.1"),
        @("retriever.py / hybrid_retriever.py", "Retrieval GraphRAG", "H.2"),
        @("generation_service.py / llm_service.py", "Prompt et generation LLM", "H.3"),
        @("analyze_graphrag.py", "Pipeline Celery production", "H.4")
    ) 54
}

Write-Host "Generated annex images in $OutDir"
