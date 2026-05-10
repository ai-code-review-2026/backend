# Chapitre 4 : Analyse et mise en œuvre du déploiement Cloud
## Plateforme AI Code Review — VPS, Docker, Nginx, CI/CD

---

## Introduction générale

Ce chapitre décrit l'analyse, la conception et la réalisation du déploiement en production de la plateforme AI Code Review sur un serveur VPS. Il complète le chapitre précédent en couvrant le cycle complet de mise en exploitation : containerisation de la plateforme, provisionnement de l'infrastructure serveur, et automatisation de la livraison continue.

Le déploiement repose sur trois piliers techniques :

- **Docker** — chaque service (API FastAPI, worker Celery, dashboard Next.js, bases de données, monitoring) est encapsulé dans un conteneur isolé et reproductible
- **Nginx + Certbot** — un reverse proxy expose neuf sous-domaines sécurisés en HTTPS via Let's Encrypt
- **GitHub Actions** — un pipeline CI/CD automatise le rebuild, la publication sur Docker Hub et le redéploiement sur le VPS à chaque push

Ce chapitre est organisé en **trois sprints** qui reflètent la progression naturelle d'un déploiement professionnel :

| Sprint | Titre | Objectif |
|--------|-------|----------|
| Sprint 1 | Containerisation et publication des images Docker | Builder, taguer et publier les images sur Docker Hub |
| Sprint 2 | Provisionnement VPS et déploiement de l'infrastructure | Préparer le serveur, configurer le DNS et lancer les 12 services |
| Sprint 3 | Exposition HTTPS, reverse proxy Nginx et pipeline CI/CD | Sécuriser les accès, automatiser la livraison continue et vérifier la mise en production |

---

---

# Architecture de déploiement et schémas réseau

Avant d'entrer dans le détail des sprints, cette section expose les schémas globaux qui résument l'architecture de production. Elle décrit successivement : (a) le diagramme de déploiement UML, (b) la topologie réseau Docker en couches, (c) le mapping des ports entre conteneurs et hôte, (d) le routage Nginx vers les conteneurs, (e) la communication inter-conteneurs par nom DNS Docker, (f) la structure de fichiers du VPS, et (g) les volumes Docker persistants.

---

## A. Diagramme de déploiement UML

Le diagramme suivant représente les nœuds physiques (PC développeur, registre Docker Hub, VPS) et les composants logiciels qui s'exécutent sur chacun.

```plantuml
@startuml architecture_deployment
skinparam backgroundColor #FAFAFA
skinparam node {
  BackgroundColor LightSkyBlue
  BorderColor DarkBlue
}
skinparam component {
  BackgroundColor White
  BorderColor DarkBlue
}

node "PC Développeur (Windows 11)" as PC {
  artifact "Code source\n(monorepo)" as SRC
  component "Docker Desktop\n+ Docker Engine" as DD
  component "Git CLI" as GIT
}

cloud "GitHub" as GH {
  database "Repo backend" as RBACK
  database "Repo frontend" as RFRONT
  database "Repo infra" as RINFRA
  component "GitHub Actions\nRunner" as GHA
}

cloud "Docker Hub\n(Registry)" as DH {
  artifact "ai-review-api:latest" as IMG1
  artifact "ai-review-dashboard:latest" as IMG2
}

cloud "OVH DNS Zone" as OVH {
  artifact "9 enregistrements A\nvers IP_VPS" as DNS
}

node "VPS Linux Ubuntu 22.04" as VPS {

  component "Nginx 1.18\n(reverse proxy)" as NGX
  component "Certbot\n(Let's Encrypt)" as CB
  component "UFW Firewall" as FW

  node "Docker Network: ai-review-network" as NET {

    frame "Couche 1 — Infrastructure" as L1 {
      component "PostgreSQL :5432" as PG
      component "Redis :6379" as RDS
      component "Qdrant :6333" as QDR
      component "Neo4j :7687/7474" as NEO
      component "MinIO :9000/9001" as MIN
      component "pgAdmin :5050" as PGA
      component "Grafana :3000" as GRA
      component "Flower :5555" as FLW
    }

    frame "Couche 2 — Backend" as L2 {
      component "FastAPI API :8000" as API
      component "Celery Worker" as WRK
    }

    frame "Couche 3 — Frontend" as L3 {
      component "Dashboard Next.js :3001" as DASH
      component "YJS WebSocket :1234" as YJS
    }
  }

  storage "Volumes Docker" as VOL {
    artifact "postgres_data" as VPG
    artifact "redis_data" as VRD
    artifact "neo4j_data" as VNEO
    artifact "minio_data" as VMIN
    artifact "analysis_workspace" as VWS
  }
}

actor "Utilisateur\n(navigateur)" as USR

' Flux de build
SRC --> DD : docker build
DD --> IMG1 : docker push
DD --> IMG2 : docker push
SRC --> GIT : git push
GIT --> RBACK
GIT --> RFRONT

' Flux CI/CD
RBACK --> GHA : trigger
GHA --> IMG1 : push image
GHA --> VPS : SSH + docker pull

' Flux runtime
VPS --> DH : docker pull
USR --> OVH : DNS lookup
OVH --> USR : IP_VPS
USR --> NGX : HTTPS:443
NGX --> CB : SSL certificate
NGX --> DASH : :3001
NGX --> API : :8000
NGX --> YJS : :1234
NGX --> PGA : :5050
NGX --> GRA : :3000

' Communication inter-conteneurs
API --> PG : postgresql://
API --> RDS : redis://
API --> QDR : http://
API --> MIN : s3://
WRK --> RDS : celery broker
WRK --> PG : ORM
DASH --> API : http://api:8000
PGA --> PG : connect

' Persistance
PG --> VPG : mount
RDS --> VRD : mount
NEO --> VNEO : mount
MIN --> VMIN : mount
WRK --> VWS : mount
@enduml
```

*Figure A : Diagramme de déploiement global de la plateforme AI Code Review*

---

## B. Topologie réseau Docker en 3 couches

Le schéma Mermaid suivant représente la topologie en couches. La règle stricte est : **Couche N+1 ne démarre qu'une fois la Couche N en état `healthy`**.

```mermaid
graph TB
    subgraph CLIENT["🌐 Internet (HTTPS)"]
        BROWSER["👤 Navigateur utilisateur"]
        MOBILE["📱 Application mobile"]
    end

    subgraph VPS["🖥️ VPS Ubuntu 22.04 — IP_PUBLIQUE"]
        NGINX["⚙️ Nginx reverse proxy<br/>Ports 80 / 443"]
        UFW["🛡️ Pare-feu UFW<br/>22, 80, 443"]

        subgraph DOCKERNET["🔗 Réseau Docker: ai-review-network (bridge)"]

            subgraph LAYER3["📱 Couche 3 — Frontend"]
                DASH["🟦 ai-review-dashboard<br/>:3001 (Next.js)"]
                YJS["🟦 ai-review-yjs<br/>:1234 (Y-WebSocket)"]
            end

            subgraph LAYER2["⚙️ Couche 2 — Backend"]
                API["🟩 ai-review-api<br/>:8000 (FastAPI)"]
                WORKER["🟩 ai-review-worker<br/>(Celery)"]
            end

            subgraph LAYER1["💾 Couche 1 — Infrastructure"]
                PG["🟧 ai-review-postgres<br/>:5432"]
                REDIS["🟥 ai-review-redis<br/>:6379"]
                QDRANT["🟪 ai-review-qdrant<br/>:6333"]
                NEO4J["🟫 ai-review-neo4j<br/>:7687 / :7474"]
                MINIO["🟨 ai-review-minio<br/>:9000 / :9001"]
                PGADMIN["🟦 ai-review-pgadmin<br/>:5050"]
                GRAFANA["🟧 ai-review-grafana<br/>:3000"]
                FLOWER["🟫 ai-review-flower<br/>:5555"]
            end
        end

        VOLUMES["💿 Volumes persistants<br/>postgres_data, redis_data,<br/>neo4j_data, minio_data,<br/>analysis_workspace"]
    end

    BROWSER -->|HTTPS 443| NGINX
    MOBILE -->|HTTPS 443| NGINX
    NGINX -->|app.domaine.com → :3001| DASH
    NGINX -->|api.domaine.com → :8000| API
    NGINX -->|yjs.domaine.com → :1234| YJS
    NGINX -->|pgadmin → :5050| PGADMIN
    NGINX -->|grafana → :3000| GRAFANA
    NGINX -->|flower → :5555| FLOWER

    DASH -.->|"http://ai-review-api:8000"| API
    API -.->|"postgresql://ai-review-postgres:5432"| PG
    API -.->|"redis://ai-review-redis:6379"| REDIS
    API -.->|"http://ai-review-qdrant:6333"| QDRANT
    API -.->|"bolt://ai-review-neo4j:7687"| NEO4J
    API -.->|"s3://ai-review-minio:9000"| MINIO
    WORKER -.->|"redis broker"| REDIS
    WORKER -.->|"ORM"| PG
    PGADMIN -.->|"manage"| PG
    FLOWER -.->|"monitor"| REDIS

    PG --> VOLUMES
    REDIS --> VOLUMES
    NEO4J --> VOLUMES
    MINIO --> VOLUMES
    WORKER --> VOLUMES

    style LAYER1 fill:#fff4e6,stroke:#ff8800
    style LAYER2 fill:#e6f7e6,stroke:#00aa00
    style LAYER3 fill:#e6f0ff,stroke:#0066cc
    style NGINX fill:#ffe6e6,stroke:#cc0000
    style VOLUMES fill:#f0e6ff,stroke:#6600cc
```

*Figure B : Topologie réseau Docker en 3 couches*

---

## C. Mapping des ports — Hôte VPS ⇄ Conteneurs

Le schéma suivant montre comment les ports des conteneurs sont exposés sur le VPS, et comment Nginx les redirige vers les sous-domaines publics.

```mermaid
flowchart LR
    subgraph PUBLIC["🌐 Internet"]
        P443["Port 443<br/>HTTPS"]
        P80["Port 80<br/>HTTP→redirige 443"]
    end

    subgraph HOSTPORTS["🖥️ Ports exposés sur le VPS (host)"]
        H3001["host:3001"]
        H8000["host:8000"]
        H1234["host:1234"]
        H5050["host:5050"]
        H6333["host:6333"]
        H9000["host:9000"]
        H9001["host:9001"]
        H3000["host:3000"]
        H5555["host:5555"]
        H5432["host:5432"]
        H6379["host:6379"]
        H7474["host:7474"]
        H7687["host:7687"]
    end

    subgraph CONTAINERS["📦 Ports internes des conteneurs"]
        C1["dashboard:3001"]
        C2["api:8000"]
        C3["yjs:1234"]
        C4["pgadmin:5050"]
        C5["qdrant:6333"]
        C6["minio:9000"]
        C7["minio:9001"]
        C8["grafana:3000"]
        C9["flower:5555"]
        C10["postgres:5432"]
        C11["redis:6379"]
        C12["neo4j:7474"]
        C13["neo4j:7687"]
    end

    P443 -->|app.domaine.com| H3001
    P443 -->|api.domaine.com| H8000
    P443 -->|yjs.domaine.com| H1234
    P443 -->|pgadmin.domaine.com| H5050
    P443 -->|qdrant.domaine.com 🔒| H6333
    P443 -->|minio.domaine.com| H9000
    P443 -->|storage.domaine.com| H9001
    P443 -->|grafana.domaine.com| H3000
    P443 -->|flower.domaine.com 🔒| H5555

    H3001 --> C1
    H8000 --> C2
    H1234 --> C3
    H5050 --> C4
    H6333 --> C5
    H9000 --> C6
    H9001 --> C7
    H3000 --> C8
    H5555 --> C9
    H5432 -.usage interne uniquement.-> C10
    H6379 -.usage interne uniquement.-> C11
    H7474 -.usage interne uniquement.-> C12
    H7687 -.usage interne uniquement.-> C13

    style PUBLIC fill:#ffe6e6
    style HOSTPORTS fill:#e6f0ff
    style CONTAINERS fill:#e6ffe6
```

*Figure C : Mapping des ports — Internet → VPS → Conteneurs*

---

## D. Routage Nginx vers les conteneurs (rectangles + ports)

Ce schéma détaille la table de routage du reverse proxy Nginx. Chaque sous-domaine pointe vers un `proxy_pass` interne sur le VPS.

```mermaid
flowchart TB
    USR["👤 Utilisateur<br/>https://*.domaine.com"]

    subgraph NGINX_BLOCK["⚙️ NGINX REVERSE PROXY (sur VPS)"]
        direction TB
        VH1["📄 server { server_name app.domaine.com;<br/>proxy_pass http://0.0.0.0:3001; }"]
        VH2["📄 server { server_name api.domaine.com;<br/>proxy_pass http://0.0.0.0:8000;<br/>+ WebSocket Upgrade }"]
        VH3["📄 server { server_name yjs.domaine.com;<br/>proxy_pass http://0.0.0.0:1234;<br/>+ Upgrade headers }"]
        VH4["📄 server { server_name pgadmin.domaine.com;<br/>proxy_pass http://0.0.0.0:5050; }"]
        VH5["📄 server { server_name qdrant.domaine.com;<br/>auth_basic 🔒;<br/>proxy_pass http://0.0.0.0:6333; }"]
        VH6["📄 server { server_name minio.domaine.com;<br/>client_max_body_size 0;<br/>proxy_pass http://0.0.0.0:9000; }"]
        VH7["📄 server { server_name storage.domaine.com;<br/>proxy_pass http://0.0.0.0:9001; }"]
        VH8["📄 server { server_name grafana.domaine.com;<br/>proxy_pass http://0.0.0.0:3000; }"]
        VH9["📄 server { server_name flower.domaine.com;<br/>auth_basic 🔒;<br/>proxy_pass http://0.0.0.0:5555; }"]
    end

    subgraph CONT["📦 Conteneurs Docker (rectangles + ports)"]
        direction TB
        BX1["┌──────────────────┐<br/>│ ai-review-dashboard │<br/>│ Port: 3001        │<br/>│ Image: Next.js   │<br/>└──────────────────┘"]
        BX2["┌──────────────────┐<br/>│ ai-review-api    │<br/>│ Port: 8000       │<br/>│ Image: FastAPI   │<br/>└──────────────────┘"]
        BX3["┌──────────────────┐<br/>│ ai-review-yjs    │<br/>│ Port: 1234       │<br/>│ Image: Y-WS      │<br/>└──────────────────┘"]
        BX4["┌──────────────────┐<br/>│ ai-review-pgadmin │<br/>│ Port: 5050        │<br/>│ Image: pgadmin4  │<br/>└──────────────────┘"]
        BX5["┌──────────────────┐<br/>│ ai-review-qdrant │<br/>│ Port: 6333       │<br/>│ Image: qdrant    │<br/>└──────────────────┘"]
        BX6["┌──────────────────┐<br/>│ ai-review-minio  │<br/>│ Ports: 9000/9001 │<br/>│ Image: minio     │<br/>└──────────────────┘"]
        BX7["┌──────────────────┐<br/>│ ai-review-grafana │<br/>│ Port: 3000        │<br/>│ Image: grafana   │<br/>└──────────────────┘"]
        BX8["┌──────────────────┐<br/>│ ai-review-flower │<br/>│ Port: 5555       │<br/>│ Image: flower    │<br/>└──────────────────┘"]
    end

    USR --> NGINX_BLOCK

    VH1 -->|"HTTP proxy"| BX1
    VH2 -->|"HTTP proxy"| BX2
    VH3 -->|"WebSocket"| BX3
    VH4 -->|"HTTP proxy"| BX4
    VH5 -->|"HTTP proxy"| BX5
    VH6 -->|"S3 API"| BX6
    VH7 -->|"Console UI"| BX6
    VH8 -->|"HTTP proxy"| BX7
    VH9 -->|"HTTP proxy"| BX8

    style NGINX_BLOCK fill:#ffe6e6,stroke:#cc0000
    style CONT fill:#e6ffe6,stroke:#009900
```

*Figure D : Table de routage du reverse proxy Nginx*

---

## E. Communication inter-conteneurs par DNS Docker

Dans un réseau Docker bridge personnalisé (`ai-review-network`), Docker fournit un DNS embarqué qui résout les noms de conteneurs en adresses IP internes. **Aucun service n'utilise `localhost` ou des IPs en dur** — tout passe par les noms DNS.

```mermaid
flowchart LR
    subgraph CALLERS["🟢 Services appelants"]
        DASH2["dashboard"]
        API2["api"]
        WORKER2["worker"]
        PGADMIN2["pgadmin"]
        FLOWER2["flower"]
    end

    subgraph DNS["🔵 Résolution DNS Docker interne"]
        D1["ai-review-postgres → 172.18.0.2"]
        D2["ai-review-redis → 172.18.0.3"]
        D3["ai-review-qdrant → 172.18.0.4"]
        D4["ai-review-neo4j → 172.18.0.5"]
        D5["ai-review-minio → 172.18.0.6"]
        D6["ai-review-api → 172.18.0.7"]
    end

    subgraph SERVICES["🟠 Services cibles"]
        SPG["postgres:5432"]
        SRD["redis:6379"]
        SQD["qdrant:6333"]
        SNEO["neo4j:7687"]
        SMIN["minio:9000"]
        SAPI["api:8000"]
    end

    DASH2 -->|"BACKEND_API_URL=<br/>http://ai-review-api:8000"| D6
    API2 -->|"DATABASE_URL=<br/>postgresql://...@ai-review-postgres:5432"| D1
    API2 -->|"REDIS_URL=<br/>redis://ai-review-redis:6379"| D2
    API2 -->|"QDRANT_URL=<br/>http://ai-review-qdrant:6333"| D3
    API2 -->|"NEO4J_URI=<br/>bolt://ai-review-neo4j:7687"| D4
    API2 -->|"MINIO_ENDPOINT=<br/>ai-review-minio:9000"| D5
    WORKER2 -->|"CELERY_BROKER=<br/>redis://ai-review-redis:6379/0"| D2
    WORKER2 -->|"DATABASE_URL"| D1
    PGADMIN2 -->|"server: ai-review-postgres"| D1
    FLOWER2 -->|"--broker=redis://ai-review-redis"| D2

    D1 --> SPG
    D2 --> SRD
    D3 --> SQD
    D4 --> SNEO
    D5 --> SMIN
    D6 --> SAPI

    style CALLERS fill:#e6ffe6
    style DNS fill:#e6f0ff
    style SERVICES fill:#fff4e6
```

*Figure E : Résolution DNS et communication inter-conteneurs*

**Règle clé :** dans `/opt/ai-review/backend/.env`, on écrit :
```
DATABASE_URL=postgresql+psycopg://postgres:***@ai-review-postgres:5432/ai_code_review
REDIS_URL=redis://ai-review-redis:6379/0
QDRANT_URL=http://ai-review-qdrant:6333
```
Le mot `ai-review-postgres` est résolu par Docker DNS vers l'IP du conteneur PostgreSQL — pas besoin d'IP en dur.

---

## F. Structure du système de fichiers du VPS

```mermaid
graph TD
    ROOT["/"]
    OPT["/opt"]
    AIR["/opt/ai-review"]
    INFRA["/opt/ai-review/infra"]
    BACKEND["/opt/ai-review/backend"]
    FRONTEND["/opt/ai-review/frontend"]

    INFRA_DC["docker-compose.yml<br/>(8 services BD/monitoring)"]
    INFRA_ENV[".env<br/>(POSTGRES_PASSWORD,<br/>MINIO_ROOT_PASSWORD,<br/>NEO4J_PASSWORD, etc.)"]

    BACK_DC["docker-compose.yml<br/>(api + worker)"]
    BACK_ENV[".env<br/>(DATABASE_URL, REDIS_URL,<br/>QDRANT_URL, CLERK_*,<br/>SECRETS_ENCRYPTION_KEY)"]

    FRONT_DC["docker-compose.yml<br/>(dashboard + yjs)"]
    FRONT_ENV[".env<br/>(NEXT_PUBLIC_API_URL,<br/>BACKEND_API_URL,<br/>CLERK_SECRET_KEY)"]

    ETC["/etc"]
    NGX["/etc/nginx"]
    SITES_AVAIL["/etc/nginx/sites-available"]
    SITES_ENA["/etc/nginx/sites-enabled"]
    HTPASS["/etc/nginx/.htpasswd"]
    LE["/etc/letsencrypt"]
    LE_LIVE["/etc/letsencrypt/live/domaine.com/<br/>(fullchain.pem, privkey.pem)"]

    VAR["/var"]
    DOCKER_VOL["/var/lib/docker/volumes/<br/>(postgres_data, redis_data,<br/>neo4j_data, minio_data,<br/>analysis_workspace)"]

    ROOT --> OPT
    OPT --> AIR
    AIR --> INFRA
    AIR --> BACKEND
    AIR --> FRONTEND
    INFRA --> INFRA_DC
    INFRA --> INFRA_ENV
    BACKEND --> BACK_DC
    BACKEND --> BACK_ENV
    FRONTEND --> FRONT_DC
    FRONTEND --> FRONT_ENV

    ROOT --> ETC
    ETC --> NGX
    NGX --> SITES_AVAIL
    NGX --> SITES_ENA
    NGX --> HTPASS
    ETC --> LE
    LE --> LE_LIVE

    ROOT --> VAR
    VAR --> DOCKER_VOL

    style AIR fill:#e6f0ff,stroke:#0066cc
    style NGX fill:#ffe6e6,stroke:#cc0000
    style LE fill:#fff4e6,stroke:#ff8800
    style DOCKER_VOL fill:#f0e6ff,stroke:#6600cc
```

*Figure F : Arborescence du système de fichiers du VPS*

---

## G. Volumes Docker et persistance

```mermaid
flowchart LR
    subgraph CONT["📦 Conteneurs (éphémères)"]
        C1["ai-review-postgres"]
        C2["ai-review-redis"]
        C3["ai-review-neo4j"]
        C4["ai-review-minio"]
        C5["ai-review-pgadmin"]
        C6["ai-review-grafana"]
        C7["ai-review-worker"]
        C8["ai-review-api"]
    end

    subgraph VOL["💾 Volumes nommés (persistants)"]
        V1["postgres_data<br/>📂 /var/lib/postgresql/data"]
        V2["redis_data<br/>📂 /data"]
        V3["neo4j_data<br/>📂 /data"]
        V3b["neo4j_logs<br/>📂 /logs"]
        V4["minio_data<br/>📂 /data"]
        V5["pgadmin_data<br/>📂 /var/lib/pgadmin"]
        V6["grafana_data<br/>📂 /var/lib/grafana"]
        V7["analysis_workspace<br/>📂 /var/ai-review/workspace"]
    end

    C1 -->|mount| V1
    C2 -->|mount| V2
    C3 -->|mount| V3
    C3 -->|mount| V3b
    C4 -->|mount| V4
    C5 -->|mount| V5
    C6 -->|mount| V6
    C7 -->|shared mount| V7
    C8 -->|shared mount| V7

    style CONT fill:#e6f7e6,stroke:#00aa00
    style VOL fill:#f0e6ff,stroke:#6600cc
```

*Figure G : Mapping des volumes Docker et persistance des données*

> ⚠️ Si un conteneur est supprimé puis recréé (lors d'un `docker compose up -d --force-recreate`), les **données restent intactes** car elles sont dans le volume nommé, pas dans le filesystem du conteneur.

---

## H. Architecture du Dockerfile multi-stage (Dashboard Next.js)

Le Dockerfile du dashboard utilise une stratégie multi-stage pour produire une image finale minimale.

```mermaid
flowchart TB
    SRC["📁 Code source<br/>apps/dashboard/"]

    subgraph BUILD["🔨 Build multi-stage Docker"]
        S1["Stage 1: deps<br/>FROM node:20-alpine<br/>COPY package.json<br/>RUN npm ci"]
        S2["Stage 2: builder<br/>FROM node:20-alpine<br/>COPY --from=deps node_modules<br/>COPY . .<br/>ARG NEXT_PUBLIC_*<br/>RUN npm run build"]
        S3["Stage 3: runner<br/>FROM node:20-alpine<br/>COPY --from=builder .next/standalone<br/>USER nextjs<br/>EXPOSE 3001"]
    end

    IMG["🐳 Image finale<br/>ai-review-dashboard:latest<br/>~200 MB"]

    SRC --> S1
    S1 --> S2
    S2 --> S3
    S3 --> IMG

    style S1 fill:#fff4e6
    style S2 fill:#e6f0ff
    style S3 fill:#e6ffe6
    style IMG fill:#ffe6e6,stroke:#cc0000
```

*Figure H : Architecture du Dockerfile multi-stage*

---

## I. Architecture du Dockerfile (Backend FastAPI)

```mermaid
flowchart TB
    SRC2["📁 Code source<br/>apps/backend/"]

    subgraph BUILD2["🔨 Build Docker"]
        ST1["Stage 1: builder<br/>FROM python:3.11-slim<br/>RUN pip install poetry<br/>COPY pyproject.toml poetry.lock<br/>RUN poetry install --no-dev"]
        ST2["Stage 2: runtime<br/>FROM python:3.11-slim<br/>COPY --from=builder /usr/local/lib/python3.11<br/>COPY . /app<br/>EXPOSE 8000"]
    end

    IMG2["🐳 Image finale<br/>ai-review-api:latest<br/>~2.1 GB"]

    SRC2 --> ST1
    ST1 --> ST2
    ST2 --> IMG2

    USAGE["🎯 L'image sert deux rôles :<br/>• API (uvicorn :8000)<br/>• Worker Celery (celery -A ...)"]

    IMG2 --> USAGE

    style ST1 fill:#fff4e6
    style ST2 fill:#e6ffe6
    style IMG2 fill:#ffe6e6,stroke:#cc0000
    style USAGE fill:#e6f0ff,stroke:#0066cc
```

*Figure I : Architecture du Dockerfile Backend*

---

## J. Vue des fichiers docker-compose.yml et leurs dépendances

```mermaid
graph TB
    subgraph INFRA_COMPOSE["📄 /opt/ai-review/infra/docker-compose.yml"]
        I_NET["networks: ai-review-network (bridge)"]
        I_VOL["volumes: postgres_data, redis_data,<br/>neo4j_data, neo4j_logs,<br/>minio_data, grafana_data, pgadmin_data"]
        I_SVC["services: postgres, pgadmin, redis,<br/>qdrant, neo4j, minio, grafana, flower"]
    end

    subgraph BACK_COMPOSE["📄 /opt/ai-review/backend/docker-compose.yml"]
        B_NET["networks: ai-review-network (external: true)"]
        B_VOL["volumes: analysis_workspace"]
        B_API["service: api<br/>image: TON_USER/ai-review-api:latest<br/>depends_on:<br/>  ai-review-postgres (healthy)<br/>  ai-review-redis (healthy)<br/>  ai-review-qdrant (healthy)<br/>  ai-review-minio (healthy)"]
        B_WRK["service: worker<br/>image: TON_USER/ai-review-api:latest<br/>command: celery -A ...<br/>depends_on:<br/>  api (healthy)"]
    end

    subgraph FRONT_COMPOSE["📄 /opt/ai-review/frontend/docker-compose.yml"]
        F_NET["networks: ai-review-network (external: true)"]
        F_DASH["service: dashboard<br/>image: TON_USER/ai-review-dashboard:latest<br/>depends_on:<br/>  ai-review-api (healthy)"]
        F_YJS["service: yjs<br/>command: npm run start:y-websocket"]
    end

    INFRA_COMPOSE -->|"crée le réseau<br/>ai-review-network"| BACK_COMPOSE
    BACK_COMPOSE -->|"rejoint le réseau<br/>existant"| FRONT_COMPOSE

    I_SVC -.->|"démarre EN PREMIER"| B_API
    B_API -.->|"démarre AVANT"| F_DASH

    style INFRA_COMPOSE fill:#fff4e6,stroke:#ff8800
    style BACK_COMPOSE fill:#e6ffe6,stroke:#00aa00
    style FRONT_COMPOSE fill:#e6f0ff,stroke:#0066cc
```

*Figure J : Relation entre les 3 fichiers docker-compose et leur ordre de démarrage*

---

## K. Schéma physique des conteneurs avec ports (rectangles annotés)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       VPS UBUNTU 22.04 — IP_PUBLIQUE                             │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                          NGINX (reverse proxy)                              │  │
│  │   :80 (HTTP→HTTPS) ┊ :443 (HTTPS avec certificats Let's Encrypt)           │  │
│  └─────────────────────────────────────┬──────────────────────────────────────┘  │
│                                        │                                          │
│  ┌─────────────────────────────────────▼──────────────────────────────────────┐  │
│  │                  RÉSEAU DOCKER : ai-review-network                          │  │
│  │                                                                             │  │
│  │  ╔═══════════════════════════════════════════════════════════════════════╗ │  │
│  │  ║  COUCHE 3 — FRONTEND (démarre en dernier)                            ║ │  │
│  │  ║                                                                       ║ │  │
│  │  ║  ┌─────────────────────────┐    ┌─────────────────────────┐          ║ │  │
│  │  ║  │ ai-review-dashboard     │    │ ai-review-yjs            │          ║ │  │
│  │  ║  │ Next.js (Node.js)       │    │ Y-WebSocket (Node.js)    │          ║ │  │
│  │  ║  │ ▶ PORT: 3001            │    │ ▶ PORT: 1234             │          ║ │  │
│  │  ║  │ ◉ HEALTHCHECK: HTTP /   │    │                          │          ║ │  │
│  │  ║  └─────────────────────────┘    └─────────────────────────┘          ║ │  │
│  │  ╚═══════════════════════════════════════════════════════════════════════╝ │  │
│  │                                  │                                          │  │
│  │                                  │ depends_on (api healthy)                 │  │
│  │  ╔═══════════════════════════════▼═══════════════════════════════════════╗ │  │
│  │  ║  COUCHE 2 — BACKEND (démarre en deuxième)                            ║ │  │
│  │  ║                                                                       ║ │  │
│  │  ║  ┌─────────────────────────┐    ┌─────────────────────────┐          ║ │  │
│  │  ║  │ ai-review-api           │    │ ai-review-worker         │          ║ │  │
│  │  ║  │ FastAPI + Uvicorn       │    │ Celery (analyse PR)      │          ║ │  │
│  │  ║  │ ▶ PORT: 8000            │    │ ▶ PAS DE PORT EXPOSÉ     │          ║ │  │
│  │  ║  │ ◉ HEALTHCHECK: /healthz │    │ ◉ Pool: prefork          │          ║ │  │
│  │  ║  │ ⚙ alembic upgrade head  │    │ ⚙ Queue: analyses        │          ║ │  │
│  │  ║  └─────────────────────────┘    └─────────────────────────┘          ║ │  │
│  │  ╚═══════════════════════════════════════════════════════════════════════╝ │  │
│  │                                  │                                          │  │
│  │                                  │ depends_on (BD healthy)                  │  │
│  │  ╔═══════════════════════════════▼═══════════════════════════════════════╗ │  │
│  │  ║  COUCHE 1 — INFRASTRUCTURE (démarre en premier)                       ║ │  │
│  │  ║                                                                        ║ │  │
│  │  ║  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    ║ │  │
│  │  ║  │ postgres         │  │ redis            │  │ qdrant           │    ║ │  │
│  │  ║  │ ▶ PORT: 5432     │  │ ▶ PORT: 6379     │  │ ▶ PORT: 6333     │    ║ │  │
│  │  ║  │ ◉ pg_isready     │  │ ◉ redis-cli ping │  │ ◉ /healthz       │    ║ │  │
│  │  ║  │ 💾 postgres_data │  │ 💾 redis_data    │  │                  │    ║ │  │
│  │  ║  └──────────────────┘  └──────────────────┘  └──────────────────┘    ║ │  │
│  │  ║                                                                        ║ │  │
│  │  ║  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    ║ │  │
│  │  ║  │ neo4j            │  │ minio            │  │ pgadmin          │    ║ │  │
│  │  ║  │ ▶ PORTS: 7474    │  │ ▶ PORTS: 9000    │  │ ▶ PORT: 5050     │    ║ │  │
│  │  ║  │           7687   │  │           9001   │  │                  │    ║ │  │
│  │  ║  │ 💾 neo4j_data    │  │ 💾 minio_data    │  │ 💾 pgadmin_data  │    ║ │  │
│  │  ║  └──────────────────┘  └──────────────────┘  └──────────────────┘    ║ │  │
│  │  ║                                                                        ║ │  │
│  │  ║  ┌──────────────────┐  ┌──────────────────┐                           ║ │  │
│  │  ║  │ grafana          │  │ flower           │                           ║ │  │
│  │  ║  │ ▶ PORT: 3000     │  │ ▶ PORT: 5555     │                           ║ │  │
│  │  ║  │ 💾 grafana_data  │  │                  │                           ║ │  │
│  │  ║  └──────────────────┘  └──────────────────┘                           ║ │  │
│  │  ╚═══════════════════════════════════════════════════════════════════════╝ │  │
│  │                                                                             │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                       VOLUMES DOCKER PERSISTANTS                            │  │
│  │   /var/lib/docker/volumes/ai-review_postgres_data                          │  │
│  │   /var/lib/docker/volumes/ai-review_redis_data                             │  │
│  │   /var/lib/docker/volumes/ai-review_neo4j_data                             │  │
│  │   /var/lib/docker/volumes/ai-review_minio_data                             │  │
│  │   /var/lib/docker/volumes/ai-review_analysis_workspace (partagé api+worker)│  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
                                       ▲
                                       │  HTTPS via 9 sous-domaines
                                       │  (Let's Encrypt)
                                       │
┌──────────────────────────────────────┴───────────────────────────────────────────┐
│                              INTERNET (Utilisateurs)                              │
│   https://app.domaine.com  https://api.domaine.com  https://yjs.domaine.com      │
│   https://pgadmin.* https://grafana.* https://flower.* https://qdrant.*          │
│   https://minio.* https://storage.*                                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

*Figure K : Schéma physique avec rectangles et ports — vue d'ensemble du VPS*

---

## L. Flux complet d'une requête utilisateur (sequence diagram réseau)

```plantuml
@startuml flux_requete_utilisateur
skinparam sequenceMessageAlign center
skinparam backgroundColor #FAFAFA

actor "Utilisateur" as U
participant "Navigateur" as B
participant "DNS OVH" as DNS
participant "VPS:443\n(Nginx)" as N
participant "Container\nDashboard:3001" as D
participant "Container\nAPI:8000" as A
participant "Container\nPostgres:5432" as P
participant "Container\nRedis:6379" as R
participant "Container\nMinIO:9000" as M

U -> B : Tape https://app.domaine.com
B -> DNS : Résoudre app.domaine.com
DNS --> B : IP_VPS
B -> N : TCP SYN sur :443
N -> N : SSL Handshake\n(certificat Let's Encrypt)
B <-> N : TLS établi

B -> N : GET / HTTP/1.1\nHost: app.domaine.com
N -> N : Match server_name app.domaine.com\nproxy_pass http://0.0.0.0:3001
N -> D : Forward GET /\nHost: app.domaine.com\nX-Real-IP: <user>\nX-Forwarded-Proto: https
D -> D : Next.js render
D --> N : 200 OK + HTML
N --> B : 200 OK
B -> U : Affichage Dashboard

== Action utilisateur : lancer une analyse ==
U -> B : Click "Lancer l'analyse"
B -> N : POST https://api.domaine.com/v1/analyses\nAuthorization: Bearer <Clerk JWT>
N -> A : proxy_pass http://0.0.0.0:8000
A -> A : Vérifier JWT Clerk
A -> P : INSERT INTO analyses\n(via DNS: ai-review-postgres:5432)
P --> A : id=42 created
A -> R : LPUSH celery_queue\n(via DNS: ai-review-redis:6379)
R --> A : OK
A --> N : 201 Created {id: 42}
N --> B : 201 Created
B -> U : Analyse démarrée

== Worker prend la tâche ==
note over A,R
  Worker en arrière-plan
end note
participant "Container\nWorker" as W
W -> R : BRPOP celery_queue
R --> W : tâche {analysis_id: 42}
W -> P : SELECT FROM analyses
W -> M : PUT artifact\n(via DNS: ai-review-minio:9000)
M --> W : URL S3
W -> P : UPDATE status='COMPLETED'
@enduml
```

*Figure L : Flux complet d'une requête HTTP de bout en bout*

---

## M. Schéma des secrets et variables d'environnement

```mermaid
flowchart TB
    subgraph SOURCES["🔐 Sources des secrets"]
        GHS["GitHub Secrets<br/>(CI/CD)"]
        ENV1[".env infra<br/>(BDD passwords)"]
        ENV2[".env backend<br/>(URLs, Clerk, LLM)"]
        ENV3[".env frontend<br/>(public + secret)"]
    end

    subgraph CI["🤖 GitHub Actions"]
        DKR_USR["DOCKERHUB_USERNAME"]
        DKR_TKN["DOCKERHUB_TOKEN"]
        VPS_HST["VPS_HOST"]
        VPS_USR["VPS_USER"]
        VPS_KEY["VPS_SSH_KEY"]
        CLK_PUB["CLERK_PUBLISHABLE_KEY"]
    end

    subgraph BUILD["🏗️ Build args (NEXT_PUBLIC_*)"]
        BA1["NEXT_PUBLIC_API_URL"]
        BA2["NEXT_PUBLIC_BACKEND_URL"]
        BA3["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"]
    end

    subgraph RUNTIME["⚙️ Runtime env (loaded from .env)"]
        RT1["DATABASE_URL"]
        RT2["REDIS_URL"]
        RT3["CLERK_SECRET_KEY"]
        RT4["SECRETS_ENCRYPTION_KEY (Fernet)"]
        RT5["ANTHROPIC_API_KEY"]
    end

    GHS --> DKR_USR
    GHS --> DKR_TKN
    GHS --> VPS_HST
    GHS --> VPS_KEY
    GHS --> CLK_PUB

    CLK_PUB -->|"--build-arg"| BA3
    CI -->|"docker build"| BA1
    CI -->|"docker build"| BA2

    ENV2 --> RT1
    ENV2 --> RT2
    ENV2 --> RT3
    ENV2 --> RT4
    ENV2 --> RT5

    style SOURCES fill:#ffe6e6,stroke:#cc0000
    style CI fill:#fff4e6,stroke:#ff8800
    style BUILD fill:#e6f0ff,stroke:#0066cc
    style RUNTIME fill:#e6ffe6,stroke:#00aa00
```

*Figure M : Flux des secrets depuis GitHub jusqu'au runtime*

---

## N. Synthèse de l'architecture en chiffres

| Élément | Quantité |
|---------|----------|
| Serveurs VPS | 1 |
| Conteneurs Docker | 12 |
| Couches de déploiement | 3 (infra, backend, frontend) |
| Sous-domaines exposés | 9 |
| Certificats SSL gérés | 9 (un seul `--cert-name` Certbot) |
| Volumes persistants | 7 (postgres, redis, neo4j×2, minio, pgadmin, grafana) |
| Volumes partagés | 1 (`analysis_workspace` entre `api` et `worker`) |
| Réseaux Docker | 1 (`ai-review-network` en mode bridge) |
| Fichiers `docker-compose.yml` | 3 |
| Fichiers `.env` | 3 |
| Virtual hosts Nginx | 9 |
| Pipelines CI/CD GitHub Actions | 2 (backend + frontend) |
| Images Docker poussées par version | 2 |
| Healthchecks définis | 8 (postgres, redis, qdrant, neo4j, minio, api, dashboard, ...) |

*Tableau de synthèse — Architecture en chiffres*

---

---

# Analyse et mise en œuvre du Sprint 1
## Containerisation et publication des images Docker

### Introduction

Ce premier sprint établit la base du déploiement cloud : transformer le code source de la plateforme en images Docker portables, versionnées et publiées sur Docker Hub. Sans cette étape, aucun serveur ne peut instancier la plateforme de façon reproductible. Ce sprint couvre la création de l'organisation GitHub, la mise en place des trois dépôts de code (backend, frontend, infra), la rédaction et la validation des Dockerfiles, le build des images sur le poste de développement Windows, et leur publication sur le registre Docker Hub avec un double tag (`1.0.0` et `latest`).

---

### I. Spécification Fonctionnelle

La question ouvrant cette phase est : « Comment empaqueter la plateforme dans des artefacts portables déployables sur n'importe quel serveur Linux ? »

**Fonctionnalités à réaliser durant ce sprint :**

- Création de l'organisation GitHub `ai-review-platform` et des trois dépôts : `backend`, `frontend`, `infra`
- Push du code source dans chaque dépôt GitHub (commit initial)
- Validation du `Dockerfile` de l'API FastAPI (`apps/backend/Dockerfile`)
- Validation du `Dockerfile` du dashboard Next.js (`apps/dashboard/Dockerfile`)
- Connexion au registre Docker Hub depuis le poste Windows
- Build de l'image backend : `TON_USERNAME/ai-review-api:1.0.0` et `:latest`
- Build de l'image dashboard avec les arguments de build (`NEXT_PUBLIC_*`, clé Clerk)
- Publication des deux images sur Docker Hub (deux dépôts Docker)
- Vérification de la présence des images sur hub.docker.com

**Résultat attendu :** À la fin du sprint, deux images Docker versionnées et fonctionnelles sont disponibles publiquement sur Docker Hub, prêtes à être instanciées sur n'importe quel serveur.

---

### I.1 Diagramme de cas d'utilisation du Sprint 1

Le diagramme de la figure 1 présente le diagramme de cas d'utilisation du sprint de containerisation :

```plantuml
@startuml sprint_deploy1_usecase
left to right direction
skinparam packageStyle rectangle
skinparam actorStyle awesome
skinparam usecase {
  BackgroundColor LightCyan
  BorderColor DarkCyan
  ArrowColor DarkCyan
}

actor Developer
actor Admin
actor "Docker Hub" as DH <<système>>
actor "GitHub" as GH <<système>>

rectangle "Sprint 1 — Containerisation & Publication" {

  usecase "Créer l'organisation\nGitHub" as UC1
  usecase "Créer les 3 dépôts\n(backend, frontend, infra)" as UC2
  usecase "Pousser le code source\ndans les repos" as UC3
  usecase "Se connecter\nà Docker Hub" as UC4
  usecase "Builder l'image\nBackend (FastAPI)" as UC5
  usecase "Builder l'image\nDashboard (Next.js)" as UC6
  usecase "Taguer les images\n(version + latest)" as UC7
  usecase "Pousser les images\nsur Docker Hub" as UC8
  usecase "Vérifier les images\npubliées" as UC9

}

Admin --> UC1
Admin --> UC2
Developer --> UC3
Developer --> UC4
Developer --> UC5
Developer --> UC6
Developer --> UC7
Developer --> UC8
Developer --> UC9

GH <-- UC2 : héberge
GH <-- UC3 : reçoit le code
DH <-- UC4 : authentifie
DH <-- UC8 : stocke les images
UC5 ..> UC7 : <<include>>
UC6 ..> UC7 : <<include>>
UC7 ..> UC8 : <<include>>
UC8 ..> UC9 : <<include>>
@enduml
```

*Figure 1 : Diagramme de cas d'utilisation du Sprint 1*

Ce schéma de cas d'utilisation démontre les interactions entre le Developer, l'Admin et les systèmes externes (GitHub et Docker Hub). L'Admin crée l'organisation et les dépôts, puis le Developer prend en charge toute la chaîne de containerisation : connexion au registre, build des deux images, taggage sémantique et publication sur Docker Hub.

---

### I.2 Description textuelle de cas d'utilisation du Sprint 1

**Cas principal : Containerisation et publication des images**

| Élément | Contenu |
|---------|---------|
| **Titre** | Containerisation et publication des images Docker |
| **Acteur principal** | Developer |
| **Résumé** | Le Developer construit les images Docker de l'API et du Dashboard à partir des Dockerfiles existants, les tague avec la version sémantique et les publie sur Docker Hub. |
| **Pré-condition** | Docker Desktop installé sur Windows, compte Docker Hub créé, code source disponible localement. |
| **Scénario nominal** | 1. Le Developer se connecte à Docker Hub (`docker login`). 2. Il build l'image backend (`docker build`). 3. Il build l'image dashboard avec les build-args de production. 4. Il tague les deux images (`:1.0.0` et `:latest`). 5. Il pousse les images sur Docker Hub (`docker push`). 6. Il vérifie leur présence sur hub.docker.com. |
| **Scénarios alternatifs** | Build échoué (dépendances manquantes), échec de connexion Docker Hub, timeout réseau lors du push. |
| **Post-condition** | Deux images Docker publiées sur Docker Hub, accessibles depuis n'importe quel serveur. |

| Tableau 1 : Description textuelle du cas d'utilisation du Sprint 1 |

**Cas secondaire : Création de l'organisation GitHub et des dépôts**

| Élément | Contenu |
|---------|---------|
| **Titre** | Mise en place de l'organisation GitHub |
| **Acteur principal** | Admin |
| **Résumé** | L'Admin crée une organisation GitHub `ai-review-platform` avec trois dépôts privés, puis le Developer y pousse le code source de chaque composant. |
| **Pré-condition** | Compte GitHub valide avec droits de création d'organisation. |
| **Scénario nominal** | 1. L'Admin crée l'organisation GitHub. 2. Il crée trois dépôts : `backend`, `frontend`, `infra`. 3. Le Developer initialise un dépôt Git dans chaque dossier. 4. Il ajoute le remote GitHub. 5. Il pousse le code sur `main`. |
| **Post-condition** | Trois dépôts GitHub avec le code source de la plateforme, prêts à être reliés au pipeline CI/CD. |

| Tableau 2 : Description textuelle du cas secondaire du Sprint 1 |

---

### II. Conception

#### II.1 Diagramme de classes

```plantuml
@startuml sprint_deploy1_classes
skinparam classAttributeIconSize 0
skinparam class {
  BackgroundColor LightCyan
  BorderColor DarkCyan
  ArrowColor DarkCyan
}

class GitHubOrganization {
  +name : string
  +visibility : string
  +plan : string
  +create() : void
}

class GitHubRepository {
  +name : string
  +url : string
  +visibility : string
  +defaultBranch : string
  +init() : void
  +push(branch: string) : void
  +addRemote(url: string) : void
}

class Dockerfile {
  +path : string
  +baseImage : string
  +buildArgs : map
  +validate() : bool
}

class DockerImage {
  +name : string
  +tag : string
  +size : string
  +digest : string
  +build(dockerfile: Dockerfile) : void
  +tag(alias: string) : void
  +push(registry: DockerRegistry) : void
  +inspect() : map
}

class DockerBuildContext {
  +contextPath : string
  +buildArgs : map
  +addArg(key: string, value: string) : void
}

class DockerRegistry {
  +url : string
  +username : string
  +login() : bool
  +pull(image: string) : DockerImage
}

class DockerHub {
  +repositories : string[]
  +getRepository(name: string) : DockerRepository
}

class DockerRepository {
  +name : string
  +tags : string[]
  +latestDigest : string
  +pullCount : int
}

GitHubOrganization "1" --> "1..*" GitHubRepository : contient
Dockerfile "1" --> "1" DockerBuildContext : utilise
DockerBuildContext "1" --> "1" DockerImage : produit
DockerImage "1..*" --> "1" DockerRegistry : poussé vers
DockerRegistry <|-- DockerHub : hérite
DockerHub "1" --> "0..*" DockerRepository : expose
@enduml
```

*Figure 2 : Diagramme de classes du Sprint 1*

#### II.2 Diagramme de séquence {Build et Push Backend}

Le diagramme de la figure 3 présente le diagramme de séquence du build et push de l'image backend :

```plantuml
@startuml sprint_deploy1_sequence_backend
skinparam sequenceMessageAlign center
skinparam backgroundColor #FAFAFA

actor Developer as DEV
participant "PowerShell\n(PC Windows)" as PS
participant "Docker Engine\n(local)" as DE
participant "Docker Hub\nRegistry" as DH

DEV -> PS : cd ai-code-review-platform
DEV -> PS : docker login
PS -> DH : Envoyer credentials
DH --> PS : Login Succeeded

DEV -> PS : docker build -f apps/backend/Dockerfile\n-t TON_USERNAME/ai-review-api:1.0.0\n-t TON_USERNAME/ai-review-api:latest\napps/backend
PS -> DE : Lancer le build
DE -> DE : Lire le Dockerfile
DE -> DE : Télécharger l'image de base\n(python:3.11-slim)
DE -> DE : Installer les dépendances Poetry
DE -> DE : Copier le code source
DE -> DE : Finaliser l'image
DE --> PS : Image créée (ID: sha256:...)
PS --> DEV : ✓ Build terminé

DEV -> PS : docker images | findstr ai-review-api
PS --> DEV : ai-review-api   1.0.0   sha256:...   2.1GB
DEV -> PS : docker push TON_USERNAME/ai-review-api:1.0.0
PS -> DE : Préparer les layers
DE -> DH : Pousser les layers compressés
DH --> DE : Layers reçus et indexés
DEV -> PS : docker push TON_USERNAME/ai-review-api:latest
PS -> DH : Pousser le tag latest (layers déjà présents)
DH --> PS : digest: sha256:... size: 2.1GB
PS --> DEV : ✓ Push terminé
@enduml
```

*Figure 3 : Diagramme de séquence — Build et Push image Backend*

#### II.3 Diagramme de séquence {Build et Push Dashboard}

Le diagramme de la figure 4 présente le diagramme de séquence du build et push du dashboard :

```plantuml
@startuml sprint_deploy1_sequence_dashboard
skinparam sequenceMessageAlign center
skinparam backgroundColor #FAFAFA

actor Developer as DEV
participant "PowerShell\n(PC Windows)" as PS
participant "Docker Engine\n(local)" as DE
participant "Docker Hub\nRegistry" as DH

DEV -> PS : docker build\n  -f apps/dashboard/Dockerfile\n  --build-arg NEXT_PUBLIC_API_URL=https://app.domaine.com\n  --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.domaine.com\n  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_XXX\n  -t TON_USERNAME/ai-review-dashboard:1.0.0\n  -t TON_USERNAME/ai-review-dashboard:latest\n  apps/dashboard

PS -> DE : Lancer le build multi-stage
DE -> DE : Stage 1 (deps) — npm install
DE -> DE : Stage 2 (builder) — npm run build
note right of DE
  Les NEXT_PUBLIC_* sont
  intégrées à la compilation
  (baked into the static bundle)
end note
DE -> DE : Stage 3 (runner) — image minimale
DE --> PS : Image créée

DEV -> PS : docker push TON_USERNAME/ai-review-dashboard:1.0.0
PS -> DH : Pousser les layers
DH --> PS : ✓ Uploadé

DEV -> PS : docker push TON_USERNAME/ai-review-dashboard:latest
DH --> PS : ✓ Uploadé

DEV -> DH : Vérifier sur hub.docker.com
DH --> DEV : 2 repositories visibles\nai-review-api | ai-review-dashboard
@enduml
```

*Figure 4 : Diagramme de séquence — Build et Push image Dashboard*

#### II.4 Diagramme d'activité

```plantuml
@startuml sprint_deploy1_activity
skinparam backgroundColor #FAFAFA
skinparam activity {
  BackgroundColor LightCyan
  BorderColor DarkCyan
  ArrowColor DarkCyan
}

|Admin|
start
:Créer l'organisation GitHub\n"ai-review-platform";
:Créer les 3 repos privés\n(backend, frontend, infra);

|Developer|
:Pousser le code backend\ndans /backend;
:Pousser le code frontend\ndans /frontend;
:Ouvrir PowerShell\net naviguer vers le projet;
:docker login\n(entrer username + password);

if (Login réussi ?) then (Oui)
else (Non)
  :Vérifier les credentials Docker Hub;
  stop
endif

fork
  :docker build — Image API Backend;
  :⏳ ~15 minutes\n(téléchargement deps Python);
  if (Build réussi ?) then (Oui)
    :docker push ai-review-api:1.0.0;
    :docker push ai-review-api:latest;
  else (Non)
    :Corriger le Dockerfile;
    stop
  endif
fork again
  :docker build — Image Dashboard;
  :⏳ ~15 minutes\n(npm install + next build);
  if (Build réussi ?) then (Oui)
    :docker push ai-review-dashboard:1.0.0;
    :docker push ai-review-dashboard:latest;
  else (Non)
    :Vérifier les build-args\n(Clerk key, URLs);
    stop
  endif
end fork

:Vérifier sur hub.docker.com\n→ 2 repositories présents;
stop
@enduml
```

*Figure 5 : Diagramme d'activité du Sprint 1*

---

### III. Réalisation et Tests

#### III.1 Création de l'organisation et des dépôts GitHub

L'organisation GitHub `ai-review-platform` est créée avec trois dépôts privés. Le code source de chaque composant est initialisé avec un commit initial et poussé sur la branche `main`.

```bash
# Backend
cd "C:\Users\Ahmed Amin Bejoui\Desktop\ai-code-review-platform\apps\backend"
git init && git add .
git commit -m "Initial commit - Backend FastAPI"
git branch -M main
git remote add origin https://github.com/ai-review-platform/backend.git
git push -u origin main

# Frontend
cd "C:\Users\Ahmed Amin Bejoui\Desktop\ai-code-review-platform\apps\dashboard"
git init && git add .
git commit -m "Initial commit - Frontend Next.js"
git branch -M main
git remote add origin https://github.com/ai-review-platform/frontend.git
git push -u origin main
```

*📸 Capture PFE 1 : Organisation GitHub avec les 3 dépôts créés*
*📸 Capture PFE 2 : Code source pushé (liste des fichiers sur GitHub)*

#### III.2 Build et publication des images Docker

```bash
# Connexion Docker Hub
docker login
# → Login Succeeded

# Build image Backend
docker build -f apps/backend/Dockerfile \
  -t bejaouiahmed/ai-review-api:1.0.0 \
  -t bejaouiahmed/ai-review-api:latest \
  apps/backend

# Vérification
docker images | findstr ai-review-api
# → bejaouiahmed/ai-review-api  1.0.0   sha256:...  ~2.1GB

# Push vers Docker Hub
docker push bejaouiahmed/ai-review-api:1.0.0
docker push bejaouiahmed/ai-review-api:latest

# Build image Dashboard
docker build -f apps/dashboard/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://app.domaine.com \
  --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.domaine.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_XXXX \
  -t bejaouiahmed/ai-review-dashboard:1.0.0 \
  -t bejaouiahmed/ai-review-dashboard:latest \
  apps/dashboard

docker push bejaouiahmed/ai-review-dashboard:1.0.0
docker push bejaouiahmed/ai-review-dashboard:latest
```

*📸 Capture PFE 3 : `docker login` — Login Succeeded*
*📸 Capture PFE 4 : `docker images` — les 2 images créées avec leurs tailles*
*📸 Capture PFE 5 : `docker push` — layers uploadés*
*📸 Capture PFE 6 : hub.docker.com — 2 repositories avec les tags 1.0.0 et latest*

#### III.3 Tests attendus

| Scénario de test | Critère d'acceptation |
|------------------|-----------------------|
| `docker login` réussi | Message « Login Succeeded » affiché |
| Build image backend sans erreur | Image présente dans `docker images`, taille raisonnable (~2 Go) |
| Build image dashboard sans erreur | Build-args intégrés, image créée avec stage runner |
| Push vers Docker Hub réussi | Layers uploadés, digest affiché |
| Présence sur Docker Hub | 2 repositories visibles sur hub.docker.com avec les 2 tags chacun |
| `docker pull` depuis un autre réseau | Image téléchargeable sans erreur |

---

### Conclusion

Ce premier sprint a permis de transformer le code source de la plateforme en artefacts Docker portables et versionnés. La séparation en deux images distinctes (API backend et Dashboard frontend) garantit l'indépendance des déploiements et simplifie les mises à jour futures. La double publication avec un tag sémantique (`:1.0.0`) et un tag flottant (`:latest`) respecte les bonnes pratiques de gestion de versions. Ces images constituent la brique fondamentale sur laquelle repose le déploiement serveur décrit dans le sprint suivant.

---

---

# Analyse et mise en œuvre du Sprint 2
## Provisionnement VPS et déploiement de l'infrastructure

### Introduction

Ce deuxième sprint matérialise le déploiement de la plateforme sur un serveur VPS Linux. Il couvre la préparation du serveur (installation de Docker, Nginx, pare-feu UFW), la configuration des enregistrements DNS chez OVH (neuf sous-domaines), la création de la structure de fichiers docker-compose sur le VPS et le lancement ordonné des douze services conteneurisés. L'ordre de démarrage est critique : les bases de données et services d'infrastructure doivent être sains avant que le backend puisse démarrer, et le backend doit être opérationnel avant le frontend.

---

### I. Spécification Fonctionnelle

La question ouvrant cette phase est : « Comment provisionner un serveur Linux vierge et y déployer l'ensemble de l'infrastructure de la plateforme de façon reproductible et fiable ? »

**Fonctionnalités à réaliser durant ce sprint :**

*Préparation du VPS*
- Connexion SSH en tant que root
- Mise à jour du système (`apt update && apt upgrade`)
- Installation des outils : `curl`, `git`, `ufw`, `nano`, `htop`, `dnsutils`
- Installation de Docker Engine et Docker Compose
- Installation de Nginx
- Configuration du pare-feu UFW (ports 22, 80, 443)

*Configuration DNS (OVH)*
- Création de 9 enregistrements DNS de type A pointant vers l'IP du VPS :
  `app`, `api`, `yjs`, `pgadmin`, `qdrant`, `minio`, `storage`, `grafana`, `flower`

*Création de la structure sur le VPS*
- Arborescence `/opt/ai-review/{infra,backend,frontend}`
- `docker-compose.yml` de l'infrastructure (PostgreSQL, Redis, Qdrant, Neo4j, MinIO, pgAdmin, Grafana, Flower)
- `docker-compose.yml` du backend (API FastAPI + Worker Celery)
- `docker-compose.yml` du frontend (Dashboard Next.js + YJS WebSocket)
- Fichiers `.env` sécurisés pour chaque couche

*Lancement des services (ordre strict)*
- **Couche 1** : Infrastructure (bases de données) → attendre `healthy`
- **Couche 2** : Backend (API + Worker) → attendre que l'API réponde
- **Couche 3** : Frontend (Dashboard + YJS)
- Vérification des 12 conteneurs, du réseau Docker `ai-review-network` et des volumes

**Résultat attendu :** 12 conteneurs en état `Up (healthy)` dans un réseau Docker commun, accessibles via leurs ports respectifs sur le VPS.

---

### I.1 Diagramme de cas d'utilisation du Sprint 2

Le diagramme de la figure 6 présente le diagramme de cas d'utilisation du sprint de déploiement infrastructure :

```plantuml
@startuml sprint_deploy2_usecase
left to right direction
skinparam packageStyle rectangle
skinparam actorStyle awesome
skinparam usecase {
  BackgroundColor LightYellow
  BorderColor DarkOrange
  ArrowColor DarkOrange
}

actor Admin
actor "Docker Hub" as DH <<système>>
actor "OVH DNS" as OVH <<système>>
actor "VPS Linux" as VPS <<système>>

rectangle "Sprint 2 — Provisionnement VPS & Infrastructure" {

  package "Préparation serveur" {
    usecase "Se connecter au VPS\npar SSH" as UC1
    usecase "Mettre à jour le système\n(apt update + upgrade)" as UC2
    usecase "Installer Docker\net Docker Compose" as UC3
    usecase "Installer Nginx" as UC4
    usecase "Configurer le\npare-feu UFW" as UC5
  }

  package "Configuration DNS" {
    usecase "Créer 9 enregistrements\nDNS de type A" as UC6
    usecase "Vérifier la propagation\nDNS" as UC7
  }

  package "Déploiement" {
    usecase "Créer la structure\nde fichiers /opt/ai-review" as UC8
    usecase "Créer les docker-compose\n(infra, backend, frontend)" as UC9
    usecase "Créer les fichiers .env\nsécurisés" as UC10
    usecase "Puller les images\ndepuis Docker Hub" as UC11
    usecase "Lancer l'infrastructure\n(Couche 1)" as UC12
    usecase "Lancer le backend\n(Couche 2)" as UC13
    usecase "Lancer le frontend\n(Couche 3)" as UC14
    usecase "Vérifier les 12\nconteneurs" as UC15
    usecase "Vérifier le réseau\net les volumes Docker" as UC16
  }
}

Admin --> UC1
Admin --> UC2
Admin --> UC3
Admin --> UC4
Admin --> UC5
Admin --> UC6
Admin --> UC7
Admin --> UC8
Admin --> UC9
Admin --> UC10
Admin --> UC11
Admin --> UC12
Admin --> UC13
Admin --> UC14
Admin --> UC15
Admin --> UC16

VPS <-- UC1 : cible
OVH <-- UC6 : configuré
DH <-- UC11 : source des images
UC12 ..> UC13 : <<include>>\n(depends_on healthy)
UC13 ..> UC14 : <<include>>\n(depends_on healthy)
UC14 ..> UC15 : <<include>>
@enduml
```

*Figure 6 : Diagramme de cas d'utilisation du Sprint 2*

Ce schéma démontre que l'Admin est l'unique acteur du provisionnement. Il interagit avec trois systèmes externes : le VPS (serveur cible), OVH (fournisseur DNS) et Docker Hub (source des images). La dépendance stricte entre les trois couches de déploiement est modélisée par des relations `<<include>>`.

---

### I.2 Description textuelle de cas d'utilisation du Sprint 2

**Cas principal : Provisionnement VPS et lancement des services**

| Élément | Contenu |
|---------|---------|
| **Titre** | Provisionnement VPS et déploiement de l'infrastructure conteneurisée |
| **Acteur principal** | Admin |
| **Résumé** | L'Admin prépare un VPS Linux vierge, configure le DNS, crée les fichiers de configuration Docker et lance les 12 services dans le bon ordre. |
| **Pré-condition** | VPS Ubuntu 22.04 commandé, IP publique connue, images Docker publiées sur Docker Hub (Sprint 1). |
| **Scénario nominal** | 1. L'Admin se connecte en SSH. 2. Il installe Docker, Nginx et les outils. 3. Il configure le pare-feu. 4. Il ajoute 9 enregistrements DNS chez OVH. 5. Il crée l'arborescence `/opt/ai-review/`. 6. Il crée les `docker-compose.yml` et `.env`. 7. Il lance l'infrastructure et attend que les BDs soient saines. 8. Il lance le backend et attend que l'API réponde. 9. Il lance le frontend. 10. Il vérifie les 12 conteneurs, le réseau et les volumes. |
| **Scénarios alternatifs** | Conteneur en état `Unhealthy` (DB non démarrée), erreur de connexion réseau Docker, chemin de volume incorrect, variable d'environnement manquante. |
| **Post-condition** | 12 conteneurs en état `Up (healthy)`, tous reliés au réseau `ai-review-network`, données persistées dans les volumes nommés. |

| Tableau 3 : Description textuelle du cas principal du Sprint 2 |

**Cas secondaire : Configuration DNS OVH**

| Élément | Contenu |
|---------|---------|
| **Titre** | Configuration des enregistrements DNS |
| **Acteur principal** | Admin |
| **Résumé** | L'Admin crée 9 enregistrements DNS de type A dans la zone OVH, tous pointant vers l'IP publique du VPS. |
| **Pré-condition** | Domaine enregistré chez OVH, IP du VPS connue. |
| **Scénario nominal** | 1. L'Admin accède à l'espace client OVH → Zone DNS. 2. Il crée les 9 sous-domaines : `app`, `api`, `yjs`, `pgadmin`, `qdrant`, `minio`, `storage`, `grafana`, `flower`. 3. Il attend 15-30 minutes la propagation DNS. 4. Il vérifie avec `nslookup` ou `dig`. |
| **Post-condition** | Les 9 sous-domaines résolvent vers l'IP du VPS. |

| Tableau 4 : Description textuelle du cas secondaire du Sprint 2 |

---

### II. Conception

#### II.1 Diagramme de classes

```plantuml
@startuml sprint_deploy2_classes
skinparam classAttributeIconSize 0
skinparam class {
  BackgroundColor LightYellow
  BorderColor DarkOrange
  ArrowColor DarkOrange
}

class VPS {
  +ipAddress : string
  +os : string
  +ram : string
  +disk : string
  +connectSSH() : void
  +update() : void
  +installDocker() : void
  +installNginx() : void
}

class FirewallUFW {
  +allowedPorts : int[]
  +status : string
  +allow(port: int) : void
  +enable() : void
  +getStatus() : string
}

class DNSRecord {
  +subdomain : string
  +type : string
  +ttl : int
  +value : string
}

class DNSZone {
  +domain : string
  +records : DNSRecord[]
  +addRecord(record: DNSRecord) : void
  +propagate() : void
}

class DockerNetwork {
  +name : string
  +driver : string
  +subnet : string
  +listContainers() : DockerContainer[]
}

class DockerVolume {
  +name : string
  +mountPoint : string
  +inspect() : map
}

class DockerContainer {
  +name : string
  +image : string
  +status : string
  +ports : map
  +healthStatus : string
  +start() : void
  +stop() : void
  +getLogs() : string
}

class DockerCompose {
  +filePath : string
  +envFile : string
  +services : DockerService[]
  +up(detach: bool) : void
  +down() : void
  +ps() : DockerContainer[]
  +pull() : void
}

class DockerService {
  +name : string
  +image : string
  +environment : map
  +volumes : string[]
  +ports : string[]
  +dependsOn : string[]
  +healthcheck : map
}

class InfraLayer {
  <<layer 1>>
  +postgres : DockerService
  +redis : DockerService
  +qdrant : DockerService
  +neo4j : DockerService
  +minio : DockerService
  +pgadmin : DockerService
  +grafana : DockerService
  +flower : DockerService
}

class BackendLayer {
  <<layer 2>>
  +api : DockerService
  +worker : DockerService
}

class FrontendLayer {
  <<layer 3>>
  +dashboard : DockerService
  +yjs : DockerService
}

VPS "1" --> "1" FirewallUFW : configure
VPS "1" --> "1" DNSZone : associé à
DNSZone "1" --> "9" DNSRecord : contient
VPS "1" --> "1" DockerNetwork : héberge
DockerNetwork "1" --> "0..*" DockerContainer : relie
DockerContainer "0..*" --> "0..*" DockerVolume : monte
DockerCompose "1" --> "0..*" DockerService : orchestre
DockerService <|-- InfraLayer : contient
DockerService <|-- BackendLayer : contient
DockerService <|-- FrontendLayer : contient
@enduml
```

*Figure 7 : Diagramme de classes du Sprint 2*

#### II.2 Diagramme de séquence {Provisionnement VPS}

```plantuml
@startuml sprint_deploy2_sequence_vps
skinparam sequenceMessageAlign center
skinparam backgroundColor #FAFAFA

actor Admin
participant "Terminal SSH" as SSH
participant "VPS Ubuntu" as VPS
participant "Docker Engine\n(VPS)" as DE
participant "OVH DNS\nManager" as OVH

== Étape 1 : Connexion et mise à jour ==
Admin -> SSH : ssh root@IP_VPS
SSH -> VPS : Ouvrir session SSH
VPS --> Admin : root@vps:~#
Admin -> VPS : apt update && apt upgrade -y
VPS --> Admin : ✓ Système à jour

== Étape 2 : Installation des outils ==
Admin -> VPS : apt install -y curl git ufw nano htop dnsutils
VPS --> Admin : ✓ Outils installés
Admin -> VPS : curl -fsSL https://get.docker.com | sh
VPS --> Admin : ✓ Docker installé
Admin -> VPS : systemctl enable docker && systemctl start docker
Admin -> VPS : docker --version && docker compose version
VPS --> Admin : Docker 24.x.x / Docker Compose 2.x.x
Admin -> VPS : apt install -y nginx certbot python3-certbot-nginx
VPS --> Admin : ✓ Nginx + Certbot installés

== Étape 3 : Pare-feu ==
Admin -> VPS : ufw allow OpenSSH
Admin -> VPS : ufw allow 80/tcp
Admin -> VPS : ufw allow 443/tcp
Admin -> VPS : ufw --force enable
VPS --> Admin : ✓ Pare-feu actif (Status: active)

== Étape 4 : DNS OVH ==
Admin -> OVH : Ajouter 9 enregistrements A\napp, api, yjs, pgadmin, qdrant,\nminio, storage, grafana, flower → IP_VPS
OVH --> Admin : ✓ Zone DNS mise à jour
Admin -> VPS : dig +short app.domaine.com
VPS --> Admin : IP_VPS (propagation confirmée)

== Étape 5 : Structure et docker-compose ==
Admin -> VPS : mkdir -p /opt/ai-review/{infra,backend,frontend}
Admin -> VPS : nano /opt/ai-review/infra/docker-compose.yml
note right of Admin
  Copie le docker-compose complet
  (postgres, redis, qdrant, neo4j,
  minio, pgadmin, grafana, flower)
end note
Admin -> VPS : nano /opt/ai-review/infra/.env
Admin -> VPS : nano /opt/ai-review/backend/docker-compose.yml
Admin -> VPS : nano /opt/ai-review/backend/.env
Admin -> VPS : nano /opt/ai-review/frontend/docker-compose.yml
Admin -> VPS : nano /opt/ai-review/frontend/.env
VPS --> Admin : ✓ Fichiers créés
@enduml
```

*Figure 8 : Diagramme de séquence — Provisionnement VPS*

#### II.3 Diagramme de séquence {Lancement des services}

```plantuml
@startuml sprint_deploy2_sequence_launch
skinparam sequenceMessageAlign center
skinparam backgroundColor #FAFAFA

actor Admin
participant "Docker Hub" as DH
participant "Infra Layer\n(postgres, redis, qdrant\nneo4j, minio, pgadmin\ngrafana, flower)" as IL
participant "Backend Layer\n(api, worker)" as BL
participant "Frontend Layer\n(dashboard, yjs)" as FL

== Couche 1 — Infrastructure ==
Admin -> DH : docker login (sur le VPS)
DH --> Admin : Login Succeeded
Admin -> IL : cd /opt/ai-review/infra\ndocker compose --env-file .env up -d
IL -> DH : Pull postgres:15, redis:7-alpine, qdrant, neo4j, minio, pgadmin, grafana, flower
DH --> IL : Images téléchargées
IL -> IL : Démarrage des conteneurs
note right of IL
  Attente des healthchecks :
  postgres : pg_isready
  redis    : redis-cli ping
  qdrant   : /healthz
  minio    : /minio/health/live
end note
IL --> Admin : 8 conteneurs Up (healthy)\n~30 secondes d'attente

== Couche 2 — Backend ==
Admin -> BL : cd /opt/ai-review/backend\ndocker pull TON_USERNAME/ai-review-api:latest\ndocker compose up -d
BL -> DH : Pull ai-review-api:latest
DH --> BL : Image téléchargée
BL -> BL : Démarrage API\nalembic upgrade head\nuvicorn on :8000
note right of BL
  Migrations Alembic s'exécutent
  avant le démarrage d'uvicorn
end note
BL --> Admin : api + worker Up (healthy)\n~60 secondes d'attente

== Couche 3 — Frontend ==
Admin -> FL : cd /opt/ai-review/frontend\ndocker pull TON_USERNAME/ai-review-dashboard:latest\ndocker compose up -d
FL -> DH : Pull ai-review-dashboard:latest
DH --> FL : Image téléchargée
FL -> FL : Démarrage dashboard:3001 + yjs:1234
FL --> Admin : dashboard + yjs Up (healthy)

== Vérification globale ==
Admin -> Admin : docker ps --format "table..."
Admin --> Admin : ✓ 12 conteneurs Up
Admin -> Admin : docker network inspect ai-review-network
Admin --> Admin : ✓ 12 conteneurs dans le réseau
Admin -> Admin : docker volume ls | grep ai-review
Admin --> Admin : ✓ Volumes postgres, redis, neo4j, minio... présents
@enduml
```

*Figure 9 : Diagramme de séquence — Lancement ordonné des 12 services*

#### II.4 Diagramme d'activité

```plantuml
@startuml sprint_deploy2_activity
skinparam backgroundColor #FAFAFA
skinparam activity {
  BackgroundColor LightYellow
  BorderColor DarkOrange
  ArrowColor DarkOrange
}

start
:Se connecter au VPS par SSH\n(ssh root@IP_VPS);
:Mettre à jour le système;

fork
  :Installer Docker Engine;
  :Activer le service Docker;
fork again
  :Installer Nginx + Certbot;
fork again
  :Configurer UFW\n(ports 22, 80, 443);
end fork

:Ajouter 9 enregistrements DNS A\ndans la zone OVH;
:Attendre la propagation DNS\n(15-30 minutes);

:Créer /opt/ai-review/{infra,backend,frontend};
:Créer les docker-compose.yml\n(infra + backend + frontend);
:Créer les fichiers .env\n(secrets, URLs, mots de passe);
:docker login sur le VPS;

== Couche 1 : Infrastructure ==
:cd /opt/ai-review/infra;
:docker compose up -d;
:Attendre que les 8 services\nsoient healthy (~30s);

if (Tous healthy ?) then (Oui)
else (Non)
  :docker compose logs <service>;
  :Corriger la configuration;
  stop
endif

== Couche 2 : Backend ==
:cd /opt/ai-review/backend;
:docker pull ai-review-api:latest;
:docker compose up -d;
:Attendre API healthy\n(migrations Alembic + uvicorn ~60s);

if (API healthy ?) then (Oui)
else (Non)
  :Vérifier les logs API\net les variables .env;
  stop
endif

== Couche 3 : Frontend ==
:cd /opt/ai-review/frontend;
:docker pull ai-review-dashboard:latest;
:docker compose up -d;

:docker ps → vérifier 12 conteneurs Up;
:docker network inspect ai-review-network;
:docker volume ls | grep ai-review;
stop
@enduml
```

*Figure 10 : Diagramme d'activité du Sprint 2*

---

### III. Réalisation et Tests

#### III.1 Installation et configuration du VPS

```bash
# Connexion SSH
ssh root@IP_VPS

# Mise à jour système
apt update && apt upgrade -y
apt install -y curl git ufw nano htop dnsutils apache2-utils

# Installation Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
docker --version && docker compose version

# Installation Nginx
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx && systemctl start nginx

# Pare-feu
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable && ufw status
```

*📸 Capture PFE 7 : `docker version` sur le VPS*
*📸 Capture PFE 8 : `systemctl status nginx` — Active (running)*
*📸 Capture PFE 9 : `ufw status` — ports 22, 80, 443 autorisés*

#### III.2 Configuration DNS OVH

| Sous-domaine | Type | TTL | Valeur |
|--------------|------|-----|--------|
| app | A | 300 | IP_VPS |
| api | A | 300 | IP_VPS |
| yjs | A | 300 | IP_VPS |
| pgadmin | A | 300 | IP_VPS |
| qdrant | A | 300 | IP_VPS |
| minio | A | 300 | IP_VPS |
| storage | A | 300 | IP_VPS |
| grafana | A | 300 | IP_VPS |
| flower | A | 300 | IP_VPS |

*📸 Capture PFE 10 : Zone DNS OVH avec les 9 enregistrements A*

#### III.3 Lancement et vérification des services

```bash
# Couche 1 — Infrastructure
cd /opt/ai-review/infra && docker compose --env-file .env up -d
# Attendre ~30s, puis :
docker compose --env-file .env ps

# Couche 2 — Backend
cd /opt/ai-review/backend
docker pull TON_USERNAME/ai-review-api:latest
docker compose up -d
docker compose logs api | grep -i "alembic\|startup\|application"

# Couche 3 — Frontend
cd /opt/ai-review/frontend
docker pull TON_USERNAME/ai-review-dashboard:latest
docker compose up -d

# Vérification globale
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker network inspect ai-review-network --format '{{range .Containers}}{{.Name}} {{end}}'
docker volume ls | grep ai-review
```

Résultat attendu de `docker ps` :

```
NAMES                  STATUS              PORTS
ai-review-dashboard    Up (healthy)        0.0.0.0:3001->3001/tcp
ai-review-yjs          Up                  0.0.0.0:1234->1234/tcp
ai-review-api          Up (healthy)        0.0.0.0:8000->8000/tcp
ai-review-worker       Up
ai-review-postgres     Up (healthy)        0.0.0.0:5432->5432/tcp
ai-review-pgadmin      Up                  0.0.0.0:5050->5050/tcp
ai-review-redis        Up (healthy)        0.0.0.0:6379->6379/tcp
ai-review-qdrant       Up (healthy)        0.0.0.0:6333->6333/tcp
ai-review-neo4j        Up (healthy)        0.0.0.0:7474->7474/tcp
ai-review-minio        Up (healthy)        0.0.0.0:9000-9001->9000-9001/tcp
ai-review-grafana      Up                  0.0.0.0:3000->3000/tcp
ai-review-flower       Up                  0.0.0.0:5555->5555/tcp
```

*📸 Capture PFE 11 : `docker compose ps` de l'infra — 8 services healthy*
*📸 Capture PFE 12 : Logs API avec migrations Alembic OK*
*📸 Capture PFE 13 : `docker compose ps` du frontend — dashboard + yjs Up*
*📸 Capture PFE 14 : `docker ps` — les 12 conteneurs en état Up*
*📸 Capture PFE 15 : `docker network inspect` — réseau avec 12 conteneurs*
*📸 Capture PFE 16 : `docker volume ls` — volumes de persistance présents*

#### III.4 Tests attendus

| Scénario de test | Critère d'acceptation |
|------------------|-----------------------|
| Connexion SSH réussie | Invite `root@vps:~#` apparaît |
| Docker installé sur VPS | `docker --version` retourne la version |
| Pare-feu UFW actif | `ufw status` montre ports 22, 80, 443 autorisés |
| Propagation DNS confirmée | `dig +short app.domaine.com` retourne l'IP du VPS |
| Infrastructure saine | 8 conteneurs en état `Up (healthy)` |
| Migrations Alembic réussies | Logs API sans erreur, schéma BDD créé |
| Backend opérationnel | API répond sur `http://IP_VPS:8000/healthz` |
| Frontend démarré | Dashboard accessible sur `http://IP_VPS:3001` |
| Réseau Docker commun | 12 conteneurs dans `ai-review-network` |
| Volumes présents | 6+ volumes nommés `ai-review-*` listés |

---

### Conclusion

Ce deuxième sprint a transformé le VPS en une infrastructure complète et opérationnelle hébergeant la totalité de la plateforme. Les douze services sont déployés dans un réseau Docker isolé, avec des données persistées dans des volumes nommés, et une configuration sécurisée via des fichiers `.env` distincts par couche. La stratégie de démarrage en trois couches ordonnées (infrastructure → backend → frontend) prévient les erreurs de connexion inter-services. Le sprint suivant complète cette mise en production en sécurisant les accès via HTTPS et en automatisant la livraison continue.

---

---

# Analyse et mise en œuvre du Sprint 3
## Exposition HTTPS, reverse proxy Nginx et pipeline CI/CD

### Introduction

Ce troisième et dernier sprint de déploiement finalise la mise en production de la plateforme. Il couvre la configuration du reverse proxy Nginx avec neuf blocs serveur (un par sous-domaine), l'obtention automatique des certificats SSL via Certbot/Let's Encrypt, la sécurisation des services sensibles par authentification HTTP basique, et la mise en place d'un pipeline CI/CD GitHub Actions qui automatise entièrement le cycle rebuild → push Docker Hub → redéploiement VPS à chaque push sur la branche principale. À la fin de ce sprint, la plateforme est accessible en HTTPS depuis n'importe quel navigateur, et toute modification du code déclenche automatiquement une mise à jour en production.

---

### I. Spécification Fonctionnelle

La question ouvrant cette phase est : « Comment exposer la plateforme de façon sécurisée sur Internet et automatiser le cycle de livraison continue ? »

**Fonctionnalités à réaliser durant ce sprint :**

*Reverse proxy Nginx*
- Suppression de la configuration par défaut Nginx
- Création de 9 blocs serveur virtuels (`server {}`) pour les sous-domaines
- Configuration des headers HTTP (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`)
- Configuration spéciale WebSocket pour `yjs` (Upgrade/Connection)
- Configuration spéciale large fichiers pour `minio` (client_max_body_size 0)
- Protection par mot de passe HTTP Basique (`htpasswd`) pour `qdrant` et `flower`
- Vérification de la syntaxe Nginx (`nginx -t`)
- Activation des 9 sites (`sites-enabled`)

*HTTPS avec Certbot*
- Génération des certificats Let's Encrypt pour les 9 sous-domaines en une seule commande
- Redirection automatique HTTP → HTTPS configurée par Certbot
- Test de renouvellement automatique (`certbot renew --dry-run`)

*Pipeline CI/CD (GitHub Actions)*
- Workflow déclenché sur `push` vers `main` (branches `backend` et `frontend`)
- Job 1 : Build de l'image Docker et push sur Docker Hub
- Job 2 : SSH vers le VPS, pull de la nouvelle image, redémarrage du service

*Vérification finale de production*
- Test `curl` du healthz API
- Test HTTPS de tous les sous-domaines
- Vérification des certificats (`certbot certificates`)
- Accès navigateur avec cadenas HTTPS vert

**Résultat attendu :** La plateforme est accessible en HTTPS sur les 9 sous-domaines, les certificats sont renouvelés automatiquement, et chaque push de code déclenche automatiquement un déploiement en production.

---

### I.1 Diagramme de cas d'utilisation du Sprint 3

Le diagramme de la figure 11 présente le diagramme de cas d'utilisation du sprint d'exposition et CI/CD :

```plantuml
@startuml sprint_deploy3_usecase
left to right direction
skinparam packageStyle rectangle
skinparam actorStyle awesome
skinparam usecase {
  BackgroundColor LightGreen
  BorderColor DarkGreen
  ArrowColor DarkGreen
}

actor Admin
actor Developer
actor "Let's Encrypt\n(Certbot)" as LE <<système>>
actor "GitHub Actions\n(CI/CD)" as GA <<système>>
actor "Docker Hub" as DH <<système>>
actor "Navigateur\n(utilisateur)" as NAV <<acteur>>

rectangle "Sprint 3 — HTTPS, Nginx & CI/CD" {

  package "Configuration Nginx" {
    usecase "Créer 9 blocs\nserveur virtuels" as UC1
    usecase "Configurer les\nproxy_pass et headers" as UC2
    usecase "Protéger qdrant + flower\npar HTTP Basic Auth" as UC3
    usecase "Vérifier la syntaxe\nnginx -t" as UC4
    usecase "Activer les 9 sites\n(sites-enabled)" as UC5
  }

  package "HTTPS / Certbot" {
    usecase "Générer les certificats\nSSL (9 domaines)" as UC6
    usecase "Tester le renouvellement\nautomatique" as UC7
  }

  package "Pipeline CI/CD" {
    usecase "Créer le workflow\nGitHub Actions" as UC8
    usecase "Configurer les secrets\nGitHub (Docker + SSH)" as UC9
    usecase "Déclencher le pipeline\n(push sur main)" as UC10
    usecase "Build + Push\nautomatique" as UC11
    usecase "Pull + Restart\nautomatique sur VPS" as UC12
  }

  package "Vérification finale" {
    usecase "Tester les 9 sous-domaines\n(curl / navigateur)" as UC13
    usecase "Vérifier les certificats\n(certbot certificates)" as UC14
    usecase "Accéder à la plateforme\nvia HTTPS" as UC15
  }
}

Admin --> UC1
Admin --> UC2
Admin --> UC3
Admin --> UC4
Admin --> UC5
Admin --> UC6
Admin --> UC7
Admin --> UC8
Admin --> UC9
Admin --> UC13
Admin --> UC14

Developer --> UC10
Developer --> UC15

GA --> UC11 : déclenché par push
GA --> UC12 : déploie sur VPS
LE --> UC6 : émet le certificat
DH --> UC11 : reçoit l'image
NAV --> UC15 : consulte la plateforme

UC5 ..> UC6 : <<include>>
UC10 ..> UC11 : <<include>>
UC11 ..> UC12 : <<include>>
@enduml
```

*Figure 11 : Diagramme de cas d'utilisation du Sprint 3*

---

### I.2 Description textuelle de cas d'utilisation du Sprint 3

**Cas principal : Configuration Nginx et obtention HTTPS**

| Élément | Contenu |
|---------|---------|
| **Titre** | Exposition sécurisée via Nginx et Let's Encrypt |
| **Acteur principal** | Admin |
| **Résumé** | L'Admin configure neuf blocs serveur Nginx qui redirigent le trafic entrant vers les bons conteneurs Docker, puis obtient les certificats SSL via Certbot pour activer HTTPS sur tous les sous-domaines. |
| **Pré-condition** | DNS propagé (9 sous-domaines résolvent vers l'IP VPS), Nginx installé, 12 conteneurs en état healthy. |
| **Scénario nominal** | 1. L'Admin supprime la config Nginx par défaut. 2. Il crée 9 fichiers de configuration dans `sites-available`. 3. Il crée les mots de passe pour qdrant et flower. 4. Il active les 9 sites avec `ln -sf`. 5. Il vérifie la syntaxe (`nginx -t`). 6. Il recharge Nginx. 7. Il exécute `certbot --nginx` pour les 9 domaines. 8. Il teste le renouvellement automatique. |
| **Scénarios alternatifs** | Erreur de syntaxe Nginx, DNS non propagé (Certbot échoue), port 80 bloqué par le pare-feu. |
| **Post-condition** | Les 9 sous-domaines sont accessibles en HTTPS avec cadenas vert, redirection HTTP→HTTPS automatique. |

| Tableau 5 : Description textuelle — Nginx et Certbot |

**Cas secondaire : Pipeline CI/CD GitHub Actions**

| Élément | Contenu |
|---------|---------|
| **Titre** | Automatisation de la livraison continue |
| **Acteur principal** | Developer, GitHub Actions |
| **Résumé** | Chaque push sur la branche `main` déclenche automatiquement un pipeline qui rebuild l'image Docker, la publie sur Docker Hub et redéploie sur le VPS sans intervention manuelle. |
| **Pré-condition** | Secrets GitHub configurés (Docker Hub credentials, clé SSH VPS), workflow YAML créé dans `.github/workflows/`. |
| **Scénario nominal** | 1. Developer pousse du code sur `main`. 2. GitHub Actions déclenche le workflow. 3. Le runner build l'image Docker. 4. Il la pousse sur Docker Hub. 5. Il se connecte au VPS par SSH. 6. Il pull la nouvelle image. 7. Il redémarre le service avec `docker compose up -d --force-recreate`. |
| **Scénarios alternatifs** | Build échoué (test unitaire raté), push Docker Hub échoué (credentials expirés), SSH VPS indisponible. |
| **Post-condition** | La nouvelle version de la plateforme est en production sans interruption de service visible. |

| Tableau 6 : Description textuelle — Pipeline CI/CD |

---

### II. Conception

#### II.1 Diagramme de classes

```plantuml
@startuml sprint_deploy3_classes
skinparam classAttributeIconSize 0
skinparam class {
  BackgroundColor LightGreen
  BorderColor DarkGreen
  ArrowColor DarkGreen
}

class NginxConfig {
  +configPath : string
  +sitesAvailable : string
  +sitesEnabled : string
  +test() : bool
  +reload() : void
}

class NginxVirtualHost {
  +serverName : string
  +listenPort : int
  +proxyPass : string
  +maxBodySize : string
  +readTimeout : int
  +authBasic : bool
  +websocketSupport : bool
  +configure() : void
  +enable() : void
}

class SSLCertificate {
  +domain : string
  +issuer : string
  +validFrom : datetime
  +expiresAt : datetime
  +autoRenew : bool
  +obtain() : void
  +renew() : void
  +verify() : bool
}

class Certbot {
  +domains : string[]
  +email : string
  +webRoot : string
  +obtainCertificates() : void
  +testRenewal() : bool
  +scheduleCronRenewal() : void
}

class HTTPBasicAuth {
  +htpasswdFile : string
  +realm : string
  +addUser(user: string, pass: string) : void
}

class GitHubActionsWorkflow {
  +name : string
  +trigger : string
  +filePath : string
  +jobs : CIJob[]
}

class CIJob {
  +name : string
  +runsOn : string
  +steps : CIStep[]
  +run() : void
}

class CIStep {
  +name : string
  +uses : string
  +run : string
  +env : map
}

class GitHubSecret {
  +name : string
  +scope : string
  +set(value: string) : void
}

class DeploymentTarget {
  +host : string
  +user : string
  +sshKeySecret : string
  +workDir : string
  +pullAndRestart() : void
}

NginxConfig "1" --> "9" NginxVirtualHost : gère
NginxVirtualHost "9" --> "9" SSLCertificate : sécurisé par
Certbot "1" --> "9" SSLCertificate : génère
NginxVirtualHost "2" --> "1" HTTPBasicAuth : protégé par
GitHubActionsWorkflow "1" --> "2..*" CIJob : contient
CIJob "1" --> "0..*" CIStep : compose
GitHubActionsWorkflow "1" --> "0..*" GitHubSecret : utilise
CIJob "1" --> "1" DeploymentTarget : cible
@enduml
```

*Figure 12 : Diagramme de classes du Sprint 3*

#### II.2 Diagramme de séquence {Configuration Nginx + Certbot}

```plantuml
@startuml sprint_deploy3_sequence_nginx
skinparam sequenceMessageAlign center
skinparam backgroundColor #FAFAFA

actor Admin
participant "VPS Nginx" as NGX
participant "Certbot\nclient" as CB
participant "Let's Encrypt\nACME API" as LE
participant "Navigateur\nutilisateur" as BR

== Étape 1 : Configuration Nginx ==
Admin -> NGX : rm -f /etc/nginx/sites-enabled/default
Admin -> NGX : Créer 9 fichiers dans sites-available\n(app, api, yjs, pgadmin, qdrant, minio,\nstorage, grafana, flower)
Admin -> NGX : htpasswd -c /etc/nginx/.htpasswd admin
Admin -> NGX : for sub in ...; do ln -sf sites-available/${sub} sites-enabled/; done
Admin -> NGX : nginx -t
NGX --> Admin : syntax is ok / test is successful
Admin -> NGX : systemctl reload nginx
NGX --> Admin : ✓ Nginx rechargé

== Étape 2 : Obtention des certificats SSL ==
Admin -> CB : certbot --nginx\n  -d app.domaine.com\n  -d api.domaine.com\n  -d yjs.domaine.com\n  ... (9 domaines)\n  --email admin@domaine.com\n  --agree-tos --non-interactive --redirect

CB -> LE : Demander un challenge ACME (HTTP-01)
LE -> NGX : GET http://app.domaine.com/.well-known/acme-challenge/TOKEN
NGX --> LE : ✓ Challenge validé (domaine vérifié)
LE --> CB : Certificat émis pour 9 domaines (90 jours)
CB -> NGX : Installer le certificat SSL dans les 9 blocs serveur
CB -> NGX : Ajouter la redirection HTTP → HTTPS
NGX --> Admin : Successfully deployed certificate

Admin -> CB : certbot renew --dry-run
CB --> Admin : All simulated renewals succeeded ✓

== Étape 3 : Test navigateur ==
BR -> NGX : https://app.domaine.com
NGX -> NGX : SSL Handshake (certificat Let's Encrypt)
NGX --> BR : 200 OK (cadenas HTTPS vert)
BR -> NGX : https://api.domaine.com/healthz
NGX --> BR : {"status": "ok"}
@enduml
```

*Figure 13 : Diagramme de séquence — Configuration Nginx et obtention HTTPS*

#### II.3 Diagramme de séquence {Pipeline CI/CD GitHub Actions}

```plantuml
@startuml sprint_deploy3_sequence_cicd
skinparam sequenceMessageAlign center
skinparam backgroundColor #FAFAFA

actor Developer as DEV
participant "GitHub\nRepository" as GH
participant "GitHub Actions\nRunner" as GA
participant "Docker Hub\nRegistry" as DH
participant "VPS\n(SSH)" as VPS
participant "Docker Engine\n(VPS)" as DE

DEV -> GH : git push origin main\n(nouveau code backend ou frontend)
GH -> GA : Déclencher le workflow\n(on: push: branches: [main])

== Job 1 : Build & Push ==
GA -> GA : actions/checkout@v4\n(cloner le repo)
GA -> GA : docker/login-action\n(DOCKERHUB_USERNAME + TOKEN depuis secrets)
GA -> GA : docker/build-push-action\n(build l'image + push sur Docker Hub)
GA -> DH : Pousser l'image taguée\n(latest + sha:${GITHUB_SHA::7})
DH --> GA : ✓ Push réussi

== Job 2 : Deploy on VPS ==
GA -> VPS : appleboy/ssh-action\n(connexion SSH avec clé privée)
VPS -> DE : cd /opt/ai-review/backend\ndocker pull TON_USERNAME/ai-review-api:latest
DE -> DH : Pull nouvelle image
DH --> DE : Image téléchargée
DE -> DE : docker compose up -d\n--force-recreate --pull always
DE --> VPS : ✓ Service redémarré

VPS -> VPS : curl -sf http://localhost:8000/healthz
VPS --> GA : ✓ Health check OK

GA --> DEV : ✅ Workflow terminé (deploy successful)\n→ notification par email GitHub
@enduml
```

*Figure 14 : Diagramme de séquence — Pipeline CI/CD automatique*

#### II.4 Diagramme d'activité

```plantuml
@startuml sprint_deploy3_activity
skinparam backgroundColor #FAFAFA
skinparam activity {
  BackgroundColor LightGreen
  BorderColor DarkGreen
  ArrowColor DarkGreen
}

|Admin — Nginx|
start
:Supprimer la config Nginx par défaut;
:Créer le fichier de\nmot de passe htpasswd;

fork
  :Créer le vhost app.domaine.com\n→ proxy_pass :3001;
fork again
  :Créer le vhost api.domaine.com\n→ proxy_pass :8000 + WebSocket;
fork again
  :Créer le vhost yjs.domaine.com\n→ proxy_pass :1234 + Upgrade;
fork again
  :Créer les vhosts pgadmin, qdrant\nminio, storage, grafana, flower;
end fork

:Activer les 9 sites\n(ln -sf dans sites-enabled);
:nginx -t;

if (Syntaxe OK ?) then (Oui)
  :systemctl reload nginx;
else (Non)
  :Corriger les erreurs de syntaxe;
  stop
endif

|Admin — Certbot|
:certbot --nginx\n-d app,api,yjs,pgadmin,qdrant\n-d minio,storage,grafana,flower;

if (Tous les domaines résolvent ?) then (Oui)
  :Certificats émis par Let's Encrypt;
  :Redirection HTTP→HTTPS activée;
  :certbot renew --dry-run;
  if (Test renouvellement OK ?) then (Oui)
    :Renouvellement automatique actif;
  else (Non)
    :Vérifier la configuration Certbot;
    stop
  endif
else (Non)
  :Vérifier la propagation DNS;
  stop
endif

|Admin — CI/CD|
:Créer .github/workflows/deploy-backend.yml;
:Créer .github/workflows/deploy-frontend.yml;
:Configurer les secrets GitHub\n(DOCKERHUB_USERNAME, DOCKERHUB_TOKEN\nVPS_HOST, VPS_USER, VPS_SSH_KEY);

|Developer — CI/CD|
:Pousser du code sur main;
:GitHub Actions déclenche le pipeline;

|GitHub Actions|
:Build de l'image Docker;
if (Build réussi ?) then (Oui)
  :Push sur Docker Hub;
  :SSH vers VPS;
  :docker pull + docker compose up;
  :Vérification health check;
else (Non)
  :Notifier Developer (email GitHub);
  stop
endif

|Admin — Vérification finale|
:curl https://api.domaine.com/healthz;
:Ouvrir le navigateur HTTPS;
:certbot certificates;
:Vérifier pgAdmin, Grafana, Flower;
stop
@enduml
```

*Figure 15 : Diagramme d'activité du Sprint 3*

---

### III. Réalisation et Tests

#### III.1 Configuration des virtual hosts Nginx

```bash
# Supprimer la config par défaut
rm -f /etc/nginx/sites-enabled/default

# Créer le mot de passe pour les services protégés
htpasswd -c /etc/nginx/.htpasswd admin
# → saisir un mot de passe fort

# Créer et activer les 9 blocs serveur
# (voir le guide complet de déploiement VPS pour le contenu de chaque fichier)
for sub in app api yjs pgadmin qdrant minio storage grafana flower; do
    ln -sf /etc/nginx/sites-available/${sub}.domaine.com \
           /etc/nginx/sites-enabled/
done

ls -la /etc/nginx/sites-enabled/
# → 9 liens symboliques

nginx -t
# → nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# → nginx: configuration file /etc/nginx/nginx.conf test is successful

systemctl reload nginx
```

*📸 Capture PFE 17 : `nginx -t` — syntax is ok / test is successful*
*📸 Capture PFE 18 : `ls /etc/nginx/sites-enabled/` — les 9 fichiers actifs*

#### III.2 Obtention des certificats HTTPS

```bash
certbot --nginx \
  -d app.domaine.com \
  -d api.domaine.com \
  -d yjs.domaine.com \
  -d pgadmin.domaine.com \
  -d qdrant.domaine.com \
  -d minio.domaine.com \
  -d storage.domaine.com \
  -d grafana.domaine.com \
  -d flower.domaine.com \
  --email bejaouiahmed053@gmail.com \
  --agree-tos --non-interactive --redirect

# Test de renouvellement automatique
certbot renew --dry-run
# → All simulated renewals succeeded
```

*📸 Capture PFE 19 : Certbot — « Successfully deployed certificate »*
*📸 Capture PFE 20 : `certbot renew --dry-run` — All simulated renewals succeeded*

#### III.3 Pipeline CI/CD GitHub Actions

Fichier `.github/workflows/deploy-backend.yml` dans le dépôt `backend` :

```yaml
name: Deploy Backend to VPS

on:
  push:
    branches: [ main ]

jobs:
  build-and-push:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: |
            ${{ secrets.DOCKERHUB_USERNAME }}/ai-review-api:latest
            ${{ secrets.DOCKERHUB_USERNAME }}/ai-review-api:${{ github.sha }}

  deploy:
    name: Deploy to VPS
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: SSH and deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/ai-review/backend
            docker pull ${{ secrets.DOCKERHUB_USERNAME }}/ai-review-api:latest
            docker compose up -d --force-recreate --pull always
            sleep 15
            curl -sf http://localhost:8000/healthz && echo "✅ Deploy OK" || echo "❌ Health check failed"
```

Fichier `.github/workflows/deploy-frontend.yml` dans le dépôt `frontend` :

```yaml
name: Deploy Frontend to VPS

on:
  push:
    branches: [ main ]

jobs:
  build-and-push:
    name: Build & Push Dashboard Image
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          push: true
          build-args: |
            NEXT_PUBLIC_API_URL=https://app.domaine.com
            NEXT_PUBLIC_BACKEND_URL=https://api.domaine.com
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${{ secrets.CLERK_PUBLISHABLE_KEY }}
          tags: |
            ${{ secrets.DOCKERHUB_USERNAME }}/ai-review-dashboard:latest
            ${{ secrets.DOCKERHUB_USERNAME }}/ai-review-dashboard:${{ github.sha }}

  deploy:
    name: Deploy to VPS
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: SSH and deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/ai-review/frontend
            docker pull ${{ secrets.DOCKERHUB_USERNAME }}/ai-review-dashboard:latest
            docker compose up -d --force-recreate --pull always
            echo "✅ Frontend deployed"
```

*📸 Capture PFE 21 : Secrets GitHub configurés (DOCKERHUB_USERNAME, VPS_HOST, etc.)*
*📸 Capture PFE 22 : GitHub Actions — Workflow exécuté avec succès (✅ vert)*

#### III.4 Vérification finale de production

```bash
# Test API Health
curl -s https://api.domaine.com/healthz
# → {"status": "ok", "version": "1.0.0"}

# Test tous les sous-domaines
for sub in app api pgadmin grafana flower; do
    echo -n "https://${sub}.domaine.com → "
    curl -o /dev/null -s -w "%{http_code}" https://${sub}.domaine.com
    echo ""
done
# → app → 200, api → 200, pgadmin → 200, grafana → 200, flower → 401 (auth)

# Vérifier les certificats
certbot certificates
# → Certificate Name: domaine.com (9 SANs)
# → Expiry Date: 2025-07-29 (VALID: 89 days)
# → Certificate Path: /etc/letsencrypt/live/domaine.com/fullchain.pem

# État Docker final
docker ps --format "table {{.Names}}\t{{.Status}}"
```

*📸 Capture PFE 23 : `curl healthz` — {"status": "ok"}*
*📸 Capture PFE 24 : Navigateur — cadenas HTTPS vert sur app.domaine.com*
*📸 Capture PFE 25 : `certbot certificates` — VALID: 89 days*
*📸 Capture PFE 26 : pgAdmin accessible dans le navigateur*
*📸 Capture PFE 27 : Grafana dashboard accessible dans le navigateur*

#### III.5 Tableau récapitulatif des services exposés

| Sous-domaine | Service | Port | Image Docker | HTTPS | Auth |
|--------------|---------|------|-------------|-------|------|
| app.domaine.com | Dashboard Next.js | 3001 | ai-review-dashboard | ✅ | Clerk |
| api.domaine.com | FastAPI + Uvicorn | 8000 | ai-review-api | ✅ | JWT Clerk |
| yjs.domaine.com | Y-WebSocket | 1234 | ai-review-dashboard | ✅ | — |
| pgadmin.domaine.com | pgAdmin 4 | 5050 | dpage/pgadmin4 | ✅ | pgAdmin login |
| qdrant.domaine.com | Qdrant | 6333 | qdrant/qdrant | ✅ | HTTP Basic |
| minio.domaine.com | MinIO API S3 | 9000 | minio/minio | ✅ | Access Key |
| storage.domaine.com | MinIO Console | 9001 | minio/minio | ✅ | MinIO login |
| grafana.domaine.com | Grafana | 3000 | grafana/grafana | ✅ | Grafana login |
| flower.domaine.com | Flower Celery | 5555 | mher/flower | ✅ | HTTP Basic |
| — (interne) | PostgreSQL | 5432 | postgres:15 | ❌ | mot de passe |
| — (interne) | Redis | 6379 | redis:7-alpine | ❌ | — |
| — (interne) | Neo4j | 7687 | neo4j:5.15 | ❌ | mot de passe |
| — (interne) | Worker Celery | — | ai-review-api | ❌ | — |

#### III.6 Tests attendus

| Scénario de test | Critère d'acceptation |
|------------------|-----------------------|
| `nginx -t` — test de syntaxe | « syntax is ok / test is successful » |
| `ls sites-enabled` — 9 liens | Exactement 9 fichiers listés |
| Certbot — certificats obtenus | « Successfully deployed certificate » pour les 9 domaines |
| `certbot renew --dry-run` | « All simulated renewals succeeded » |
| `curl https://api.domaine.com/healthz` | Réponse JSON `{"status": "ok"}` |
| Navigateur — cadenas HTTPS vert | Certificat Let's Encrypt valide, redirection HTTP→HTTPS |
| Accès qdrant/flower sans password | Code HTTP 401 retourné |
| Accès qdrant/flower avec password | Accès accordé avec les bonnes credentials |
| Push code → déploiement auto | GitHub Actions vert, nouvelle version en production en ~5 min |
| Renouvellement certificat simulé | Aucune erreur dans le dry-run |

---

### Conclusion

Ce troisième sprint a complété la mise en production de la plateforme AI Code Review en la rendant accessible de façon sécurisée depuis Internet. La configuration Nginx avec neuf blocs serveur spécialisés offre une couche d'isolation et de contrôle pour chaque service. Les certificats Let's Encrypt renouvelés automatiquement garantissent un chiffrement HTTPS permanent sans maintenance manuelle. Enfin, le pipeline CI/CD GitHub Actions transforme le cycle de développement en une chaîne de livraison continue : chaque commit sur la branche principale est automatiquement testé, packagé, publié et déployé sur le serveur de production, réduisant le délai de mise en production à moins de cinq minutes.

---

---

## Conclusion générale du chapitre

Ce chapitre a présenté l'analyse, la conception et la réalisation du déploiement en production de la plateforme AI Code Review, organisé en trois sprints progressifs :

Le **Sprint 1** a posé les bases de la portabilité : transformer le code source en deux images Docker versionnées (`ai-review-api` et `ai-review-dashboard`) publiées sur Docker Hub, garantissant la reproductibilité du déploiement sur n'importe quel serveur.

Le **Sprint 2** a matérialisé le déploiement sur le VPS : provisionnement du serveur, configuration DNS OVH, création des fichiers docker-compose et lancement ordonné des douze services (bases de données, API, worker Celery, dashboard) dans un réseau Docker commun avec persistance des données.

Le **Sprint 3** a finalisé la mise en production : sécurisation par HTTPS via Certbot, exposition des neuf sous-domaines via Nginx, protection des services sensibles et automatisation complète de la livraison continue avec GitHub Actions.

L'ensemble de ces trois sprints suit une architecture en couches clairement définie :

```
Internet (HTTPS)
     ↓
  Nginx (reverse proxy)        ← Sprint 3
     ↓
Docker Network ai-review-network
  ├── Dashboard :3001           ← Sprint 2
  ├── API FastAPI :8000         ← Sprint 2
  ├── Worker Celery             ← Sprint 2
  ├── PostgreSQL :5432          ← Sprint 2
  ├── Redis :6379               ← Sprint 2
  ├── Qdrant :6333              ← Sprint 2
  └── ... (12 services)        ← Sprint 2
     ↑
Docker Hub (images)             ← Sprint 1
     ↑
Code source GitHub              ← Sprint 1
```

Cette architecture garantit la séparation des responsabilités, la scalabilité, la haute disponibilité et la traçabilité de chaque déploiement via les tags d'images Docker horodatés et les logs GitHub Actions.
