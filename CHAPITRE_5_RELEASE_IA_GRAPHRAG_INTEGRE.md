# Chapitre 5 : Release 2 - Analyse intelligente du code avec GraphRAG

Ce chapitre regroupe toute la release IA de la plateforme **AI Code Review / Devora**. Contrairement a une organisation classique qui separe l'etat de l'art, la conception, la realisation et l'evaluation dans des chapitres differents, ce chapitre adopte une logique de release. Les notions theoriques sont donc integrees directement dans les sprints ou elles sont necessaires.

L'objectif est de construire un chapitre coherent et progressif : chaque sprint introduit les concepts utiles, precise les besoins, presente les cas d'utilisation, decrit la conception, expose la realisation, puis valide le resultat par des tests et des captures.

## 5.1 Introduction de la release

La deuxieme release du projet porte sur l'analyse intelligente du code avec GraphRAG. Elle represente le coeur IA de la plateforme, car elle transforme une simple revue automatisee en une revue contextuelle capable de prendre en compte le repository, les dependances, les regles internes, les documents techniques, les historiques d'analyse et les retours du Tech Lead.

La plateforme ne se limite pas a executer des outils d'analyse statique. Elle construit d'abord une representation exploitable du projet, sous forme de chunks, d'embeddings et de graphe Neo4j. Ensuite, elle combine plusieurs strategies de recuperation de contexte : recherche par symboles, recherche vectorielle, parcours de graphe, consultation de la base de connaissance et priorisation des regles metier. Enfin, elle utilise un LLM pour generer des findings structures, tracables et associes a des fichiers et lignes precises.

Cette release integre egalement le workflow Git et GitHub, car l'analyse intelligente ne peut pas etre separee du cycle reel de developpement : commits, branches, pull requests, webhooks, CI/CD, controle d'operation, feedback du Tech Lead et reanalyse apres correction.

### 5.1.1 Objectifs de la release

Les objectifs principaux de cette release sont :

- integrer le workflow GitHub et le cycle de vie des pull requests ;
- declencher automatiquement une analyse a partir d'un evenement GitHub ;
- indexer un repository sous forme de chunks, embeddings et graphe de code ;
- exploiter Neo4j pour representer les relations entre fichiers, classes, fonctions et chunks ;
- combiner RAG, GraphRAG, analyse statique et regles internes ;
- generer des findings contextualises par LLM ;
- reduire les hallucinations par grounding, citations et contraintes JSON ;
- historiser les analyses et permettre la reanalyse apres correction ;
- fournir au Tech Lead une aide a la decision exploitable dans le dashboard.

### 5.1.2 Organisation de la release

| Sprint | Titre | Anciennes parties integrees |
|---|---|---|
| Sprint 1 | Integration GitHub, workflow Git et controle d'operation | Git, GitHub, PR, webhooks, payload PR, CI/CD, workflow de review |
| Sprint 2 | Indexation des connaissances, chunking, embeddings et graphe Neo4j | RAG, chunking, embeddings, knowledge graph, graphe de code, Neo4j, Cypher, MERGE |
| Sprint 3 | Recherche hybride GraphRAG, LLM et generation des findings | Analyse statique, LLM, tokens, RAG vs GraphRAG, retrieval hybride, prompt engineering |
| Sprint 4 | Orchestration, historique, templates Tech Lead et feedback loop | Celery, Redis, AnalysisRun, templates, feedback, reanalyse, historique |
| Sprint 5 | Demonstration, evaluation qualitative, captures et perspectives | Scenario A-Z, captures, evaluation, limites, perspectives |

### 5.1.3 Schema global de la release

```text
Repository GitHub
   |
Pull Request / Diff
   |
Webhook GitHub
   |
FastAPI
   |
Celery Worker + Redis
   |
Parsing du diff + Secret Scan + Static Analysis
   |
Indexation incrementale du repository
   |
Chunks + Embeddings + Graphe Neo4j
   |
Recherche hybride : symboles + vecteurs + graphe + KB
   |
Prompt structure + LLM
   |
Findings JSON + Suggestions + Commentaires
   |
PostgreSQL + Historique Neo4j + Dashboard + Templates Tech Lead
   |
Feedback + Reanalyse
```

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/schema-global-release-graphrag.png}
    \caption{Schema global de la release Analyse intelligente du code avec GraphRAG.}
    \label{fig:release2-schema-global}
\end{figure}
```

---

## 5.2 Sprint 1 - Integration GitHub, workflow Git et controle d'operation

### 5.2.1 Introduction du sprint

Ce sprint met en place le lien entre le cycle de developpement GitHub et la plateforme AI Code Review. Avant de lancer une analyse intelligente, le systeme doit comprendre d'ou vient le changement, quelle branche est concernee, quelle pull request a ete ouverte, quels commits ont ete ajoutes et quel diff doit etre analyse.

Ce sprint integre donc les notions de Git, GitHub, branches, commits, pull requests, webhooks, GitHub Actions et feedback automatise. Ces notions ne sont pas presentees comme un etat de l'art isole ; elles servent directement a expliquer le fonctionnement de la plateforme dans un contexte collaboratif reel.

### 5.2.2 Rappel theorique integre au sprint

#### 5.2.2.1 Git et gestion collaborative du code source

Git est un systeme de gestion de versions distribue. Il permet a plusieurs developpeurs de travailler sur le meme code source tout en conservant l'historique complet des modifications. Chaque modification est enregistree sous forme de commit, ce qui permet de retracer l'evolution du projet et d'identifier l'origine d'un changement.

Dans notre plateforme, Git est essentiel parce que l'analyse intelligente s'appuie sur le diff entre deux versions du code. Le systeme ne relit pas toujours tout le repository : il cible d'abord les lignes modifiees, les fichiers impactes, les commits associes et la pull request concernee.

| Concept Git | Role general | Role dans la plateforme |
|---|---|---|
| Repository | Depot contenant le code source et son historique | Source principale a analyser |
| Commit | Snapshot d'une modification | Unite de tracabilite du changement |
| Branch | Ligne de developpement parallele | Permet de separer feature, bugfix et main |
| Merge | Integration d'une branche dans une autre | Marque la validation finale d'une PR |
| Diff | Difference entre deux versions | Entree principale du pipeline d'analyse |

#### 5.2.2.2 Operations Git utilisees dans le cycle projet

Les operations Git les plus importantes pour le projet sont `init`, `clone`, `fetch`, `pull`, `push`, `merge` et `rebase`. Elles permettent respectivement d'initialiser un depot, recuperer un repository distant, synchroniser les branches, envoyer les changements et integrer les modifications.

| Operation | Description | Lien avec AI Code Review |
|---|---|---|
| `git clone` | Recupere un repository GitHub localement | Utilise pendant l'onboarding du repository |
| `git fetch` | Met a jour les references distantes sans fusion | Sert a detecter les branches et commits recents |
| `git pull` | Recupere et fusionne les modifications distantes | Maintient le repository local a jour |
| `git push` | Envoie les commits vers GitHub | Peut declencher une PR ou une mise a jour de PR |
| `git merge` | Fusionne une branche dans une autre | Correspond a la validation finale |
| `git rebase` | Rejoue des commits sur une nouvelle base | Permet de garder un historique lineaire |

#### 5.2.2.3 Branches locales, branches distantes et workflows collaboratifs

Une branche locale existe dans l'environnement du developpeur, tandis qu'une branche distante est publiee sur GitHub. Dans un projet collaboratif, les developpeurs creent souvent une branche par fonctionnalite ou correction, puis ouvrent une pull request pour demander la validation.

Deux workflows sont frequemment utilises : GitFlow et GitHub Flow.

| Critere | GitFlow | GitHub Flow |
|---|---|---|
| Branches principales | `main`, `develop`, `feature`, `release`, `hotfix` | `main` + branches courtes |
| Complexite | Plus elevee | Plus simple |
| Adaptation CI/CD | Bonne mais plus lourde | Tres adaptee aux deploiements frequents |
| Usage recommande | Releases planifiees | Applications web et SaaS |
| Choix pour la plateforme | Reference theorique | Workflow le plus adapte au projet |

Dans notre projet, GitHub Flow est plus adapte, car la plateforme analyse principalement les pull requests ouvertes depuis des branches de fonctionnalite vers une branche principale. Ce modele facilite l'integration continue et l'automatisation des controles.

#### 5.2.2.4 Pull request, merge request et revue collaborative

Une pull request est une demande d'integration d'une branche dans une autre. Elle permet de discuter les changements, lancer des controles automatiques, recevoir des commentaires et valider ou refuser l'integration.

Dans AI Code Review, la pull request devient le point d'entree principal de l'analyse intelligente. Elle contient le diff, les fichiers modifies, les commits, l'auteur, la branche source, la branche cible et les metadonnees necessaires au declenchement du pipeline.

#### 5.2.2.5 GitHub, webhooks et payload de pull request

GitHub expose des webhooks qui permettent d'envoyer automatiquement un evenement vers une URL externe lorsqu'une action se produit. Dans notre cas, l'ouverture ou la mise a jour d'une pull request declenche un appel vers le backend FastAPI.

| Champ du payload PR | Description | Utilisation dans la plateforme |
|---|---|---|
| `action` | Type d'evenement : opened, synchronize, reopened, closed | Determine si une analyse doit etre lancee |
| `pull_request.id` | Identifiant GitHub de la PR | Lie l'analyse a la PR |
| `pull_request.head.ref` | Branche source | Identifie la branche du developpeur |
| `pull_request.base.ref` | Branche cible | Identifie la branche de validation |
| `repository.full_name` | Nom complet du repository | Retrouve le repository dans la plateforme |
| `sender.login` | Auteur de l'evenement | Trace l'utilisateur declencheur |

#### 5.2.2.6 GitHub Actions et integration continue

GitHub Actions permet d'executer des workflows CI a chaque push ou pull request. Ces controles peuvent inclure les tests unitaires, le linting, le build Docker, l'analyse statique ou l'appel a une API externe.

Dans la plateforme, GitHub Actions joue un role complementaire : elle valide le code par des controles classiques, tandis que GraphRAG produit une analyse contextuelle. La combinaison des deux renforce la qualite du processus de review.

### 5.2.3 Specification des besoins

#### 5.2.3.1 Besoins fonctionnels

| ID | Besoin fonctionnel |
|---|---|
| BF-S1-01 | Lier un repository GitHub a un projet de la plateforme |
| BF-S1-02 | Recuperer les branches locales et distantes du repository |
| BF-S1-03 | Detecter les commits et les diffs associes a une pull request |
| BF-S1-04 | Recevoir les evenements webhook GitHub |
| BF-S1-05 | Verifier la signature du webhook |
| BF-S1-06 | Parser le payload d'une pull request |
| BF-S1-07 | Declencher une analyse a l'ouverture ou la mise a jour d'une PR |
| BF-S1-08 | Associer chaque analyse a une PR, un repository et un projet |
| BF-S1-09 | Integrer les controles GitHub Actions au cycle de validation |
| BF-S1-10 | Publier ou afficher le feedback automatise dans le dashboard |

#### 5.2.3.2 Besoins non fonctionnels

| ID | Besoin non fonctionnel |
|---|---|
| BNF-S1-01 | Le traitement du webhook doit etre rapide afin d'eviter les timeouts GitHub |
| BNF-S1-02 | La signature HMAC doit proteger l'endpoint webhook |
| BNF-S1-03 | Les evenements doivent etre idempotents pour eviter les analyses dupliquees |
| BNF-S1-04 | Les informations Git doivent etre tracables dans l'historique |
| BNF-S1-05 | Le systeme doit supporter plusieurs repositories et organisations |

### 5.2.4 Description textuelle des cas d'utilisation

| Element | Contenu |
|---|---|
| Titre | Declenchement d'une analyse a partir d'une pull request GitHub |
| Acteur principal | Developpeur |
| Resume | Le developpeur pousse ses commits, ouvre une pull request et la plateforme declenche automatiquement une analyse intelligente. |
| Preconditions | Le repository est lie a un projet, le webhook est configure et le developpeur dispose des droits necessaires. |
| Scenario nominal | 1. Le developpeur cree une branche. 2. Il pousse ses commits. 3. Il ouvre une pull request. 4. GitHub envoie un webhook. 5. FastAPI verifie la signature. 6. Le payload est parse. 7. Une analyse est creee. 8. Le pipeline asynchrone est declenche. |
| Post-conditions | Une execution d'analyse est enregistree et associee a la pull request. |

| Element | Contenu |
|---|---|
| Titre | Synchronisation apres mise a jour d'une pull request |
| Acteur principal | Developpeur |
| Resume | Lorsqu'un developpeur ajoute de nouveaux commits a une PR, la plateforme declenche une reanalyse. |
| Preconditions | Une premiere analyse existe deja pour la PR. |
| Scenario nominal | 1. Le developpeur corrige le code. 2. Il pousse de nouveaux commits. 3. GitHub envoie un evenement `synchronize`. 4. La plateforme detecte une nouvelle version du diff. 5. Une nouvelle analyse est lancee. |
| Post-conditions | L'historique contient une nouvelle analyse liee a la meme PR. |

### 5.2.5 Conception

#### 5.2.5.1 Diagramme de cas d'utilisation

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.9\textwidth]{figures/release2/sprint1-usecase-github-pr.png}
    \caption{Diagramme de cas d'utilisation - Integration GitHub et pull request.}
    \label{fig:sprint1-usecase-github-pr}
\end{figure}
```

#### 5.2.5.2 Diagramme de classes

Le diagramme de classes du sprint doit contenir les entites suivantes : `Repository`, `Branch`, `Commit`, `PullRequest`, `WebhookEvent`, `AnalysisRun`, `GitHubActionCheck` et `User`.

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.9\textwidth]{figures/release2/sprint1-classes-github-pr.png}
    \caption{Diagramme de classes - Repository, branches, pull requests et analyses.}
    \label{fig:sprint1-classes-github-pr}
\end{figure}
```

#### 5.2.5.3 Diagrammes de sequence

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint1-sequence-pr-webhook.png}
    \caption{Diagramme de sequence - Pull Request vers webhook puis creation d'analyse.}
    \label{fig:sprint1-sequence-pr-webhook}
\end{figure}
```

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint1-sequence-ci-feedback.png}
    \caption{Diagramme de sequence - GitHub Actions et feedback automatise.}
    \label{fig:sprint1-sequence-ci-feedback}
\end{figure}
```

#### 5.2.5.4 Diagramme d'activite

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.8\textwidth]{figures/release2/sprint1-activity-pr-lifecycle.png}
    \caption{Diagramme d'activite - Cycle de vie d'une pull request analysee.}
    \label{fig:sprint1-activity-pr-lifecycle}
\end{figure}
```

#### 5.2.5.5 Workflow global

```text
Developer
   |
git checkout -b feature/x
   |
git commit + git push
   |
GitHub Pull Request
   |
GitHub Actions checks
   |
Webhook PR event
   |
FastAPI webhook endpoint
   |
AnalysisRun CREATED
   |
Celery queue
```

### 5.2.6 Realisation

La realisation de ce sprint consiste a connecter les donnees GitHub au backend. Le systeme doit etre capable d'identifier le repository, la pull request, les branches et le diff a analyser. Les evenements GitHub sont transformes en objets internes exploitables par le pipeline.

| Element realise | Description |
|---|---|
| Liaison repository-projet | Association d'un repository GitHub a un projet de la plateforme |
| Reception webhook | Endpoint FastAPI recevant les evenements GitHub |
| Verification securite | Verification de la signature du webhook |
| Parsing payload | Extraction de l'action, PR, branche source, branche cible et repository |
| Creation AnalysisRun | Enregistrement de l'analyse en base |
| Declenchement asynchrone | Envoi de la tache vers Celery |

#### Fichiers importants

| Fichier | Role |
|---|---|
| `apps/backend/app/core/analysis/orchestrator.py` | Orchestration globale de l'analyse |
| `apps/backend/app/workers/tasks/analyze_graphrag.py` | Tache Celery de lancement GraphRAG |
| `apps/backend/analysis/langGraph/pipeline.py` | Pipeline LangGraph / GraphRAG |
| `apps/dashboard/app/dashboard/...` | Affichage des PRs et analyses dans le dashboard |

#### Captures recommandees

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint1-github-pr-opened.png}
    \caption{Pull request ouverte dans GitHub.}
    \label{fig:sprint1-github-pr-opened}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint1-webhook-config.png}
    \caption{Configuration du webhook GitHub vers la plateforme.}
    \label{fig:sprint1-webhook-config}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint1-github-actions-checks.png}
    \caption{Execution des controles GitHub Actions sur une pull request.}
    \label{fig:sprint1-github-actions-checks}
\end{figure}
```

### 5.2.7 Tests et validation

| Scenario de test | Resultat attendu | Resultat obtenu |
|---|---|---|
| Ouverture d'une PR | Un webhook est recu et une analyse est creee | A renseigner avec capture |
| Mise a jour d'une PR | Une reanalyse est declenchee | A renseigner avec capture |
| Signature webhook invalide | La requete est rejetee | A renseigner |
| Repository inconnu | Aucun pipeline n'est lance | A renseigner |
| GitHub Actions reussi | Le feedback CI est visible | A renseigner |

### 5.2.8 Conclusion du sprint

Ce sprint relie la plateforme au workflow reel de developpement. Git, GitHub, les branches, les pull requests, les webhooks et GitHub Actions ne sont pas de simples notions theoriques : ils structurent le point d'entree de l'analyse intelligente. A la fin du sprint, la plateforme est capable de transformer un evenement GitHub en une execution d'analyse tracable.

---

## 5.3 Sprint 2 - Indexation des connaissances, chunking, embeddings et graphe Neo4j

### 5.3.1 Introduction du sprint

Ce sprint construit la memoire technique de la plateforme. Pour qu'un LLM puisse produire des retours utiles, il doit recevoir un contexte fiable et structure. Le repository est donc indexe sous forme de fragments de code, d'embeddings et de graphe Neo4j.

Ce sprint integre les notions de RAG, chunking, embeddings, knowledge graph, graphe de code, Neo4j, Cypher, recherche vectorielle native et mise a jour incrementale.

### 5.3.2 Rappel theorique integre au sprint

#### 5.3.2.1 Principe du RAG

Le Retrieval-Augmented Generation consiste a enrichir la generation d'un LLM par un contexte recupere depuis une base documentaire ou technique. Au lieu de demander au modele de repondre uniquement a partir de ses connaissances internes, le systeme recupere des documents, chunks ou fragments pertinents, puis les injecte dans le prompt.

Dans notre projet, le RAG sert a fournir au LLM le contexte du repository, les regles internes, les documents techniques et les fragments de code proches du diff analyse.

#### 5.3.2.2 Chunking des connaissances

Le chunking est l'operation qui consiste a decouper un document ou un code source en fragments exploitables. Un bon chunk doit etre assez petit pour entrer dans la fenetre de contexte du LLM, mais assez riche pour conserver une signification technique.

| Type de contenu | Strategie de chunking | Justification |
|---|---|---|
| Code source | Chunking par fonction, classe ou module | Conserve la logique executable |
| AST / code-aware | Decoupage selon la structure syntaxique | Evite de couper une fonction au milieu |
| Markdown | Decoupage par titres et sections | Respecte la structure documentaire |
| PDF | Decoupage par pages, paragraphes et blocs semantiques | Adapte aux documents longs |
| Tickets Jira | Decoupage par ticket, description, commentaires et statut | Preserve le contexte metier |
| Pages web techniques | Decoupage par sections HTML et titres | Garde la structure du contenu |

#### 5.3.2.3 Embeddings et representation vectorielle

Un embedding est une representation numerique d'un texte, d'un morceau de code ou d'un document. Les embeddings permettent de comparer des contenus par similarite semantique. Deux fragments proches dans l'espace vectoriel ont une signification proche.

Dans notre plateforme, les embeddings sont utilises pour retrouver des chunks de code, des documents techniques ou des regles proches du diff analyse.

| Contenu | Embedding attendu | Usage |
|---|---|---|
| Code source | Embedding oriente code | Retrouver du code similaire ou connexe |
| Documentation | Embedding texte technique | Retrouver les standards et explications |
| Regles Tech Lead | Embedding court et precis | Prioriser les contraintes organisationnelles |
| Tickets Jira | Embedding metier | Relier code et contexte fonctionnel |

#### 5.3.2.4 Knowledge graph et graphe de code

Un knowledge graph represente les connaissances sous forme de noeuds et relations. Dans le cas du code, les noeuds peuvent representer une organisation, un projet, un repository, un fichier, une classe, une fonction ou un chunk. Les relations permettent de modeliser la structure du systeme.

Dans notre projet, le graphe de code permet de relier les fragments de code a leur contexte structurel. Cette representation permet ensuite de retrouver les fonctions appelees, les fichiers dependants ou les classes impactees par un changement.

#### 5.3.2.5 Neo4j, Cypher et MERGE

Neo4j est une base de donnees graphe fondee sur le modele property graph. Les donnees y sont representees par des noeuds, des relations et des proprietes. Le langage Cypher permet d'interroger ces graphes avec des patterns explicites.

La commande `MERGE` est importante pour notre projet, car elle permet une indexation incrementale : si un noeud existe deja, il est mis a jour ; sinon il est cree. Cela evite de reconstruire tout le graphe a chaque analyse.

```cypher
MERGE (c:Chunk {hash: $hash})
ON CREATE SET c.content = $content,
              c.embedding = $embedding,
              c.file_path = $file_path
ON MATCH SET c.content = $content,
             c.embedding = $embedding,
             c.updated_at = datetime()
```

### 5.3.3 Specification des besoins

#### 5.3.3.1 Besoins fonctionnels

| ID | Besoin fonctionnel |
|---|---|
| BF-S2-01 | Importer ou acceder a un repository GitHub |
| BF-S2-02 | Identifier les fichiers source et documents utiles |
| BF-S2-03 | Decouper le code en chunks exploitables |
| BF-S2-04 | Appliquer une strategie de chunking adaptee au type de contenu |
| BF-S2-05 | Generer des embeddings pour les chunks |
| BF-S2-06 | Construire un graphe Neo4j du repository |
| BF-S2-07 | Creer les noeuds Organization, Project, Repository, File, Module, Class, Function et Chunk |
| BF-S2-08 | Creer les relations CONTAINS, DEFINES, IMPORTS, CALLS, DEPENDS_ON et CHUNKED_FROM |
| BF-S2-09 | Stocker les embeddings dans Neo4j lorsque disponible |
| BF-S2-10 | Mettre a jour le graphe de maniere incrementale |

#### 5.3.3.2 Besoins non fonctionnels

| ID | Besoin non fonctionnel |
|---|---|
| BNF-S2-01 | L'indexation doit eviter la reconstruction complete du graphe |
| BNF-S2-02 | Les chunks doivent rester tracables jusqu'au fichier source |
| BNF-S2-03 | Les embeddings doivent etre associes a leurs metadonnees |
| BNF-S2-04 | Le systeme doit supporter des repositories de taille importante |
| BNF-S2-05 | Le modele de graphe doit rester extensible |

### 5.3.4 Description textuelle des cas d'utilisation

| Element | Contenu |
|---|---|
| Titre | Indexation d'un repository dans Neo4j |
| Acteur principal | Systeme GraphRAG |
| Resume | Le systeme parcourt un repository, extrait les fichiers utiles, cree des chunks, genere des embeddings et construit le graphe de code. |
| Preconditions | Le repository est accessible et associe a un projet. Neo4j est disponible. |
| Scenario nominal | 1. Le systeme charge le repository. 2. Les fichiers sont filtres. 3. Le code est decoupe en chunks. 4. Les embeddings sont generes. 5. Les noeuds Neo4j sont crees. 6. Les relations sont ajoutees. |
| Post-conditions | Le repository dispose d'un graphe de code exploitable pour GraphRAG. |

| Element | Contenu |
|---|---|
| Titre | Mise a jour incrementale apres modification du code |
| Acteur principal | Systeme GraphRAG |
| Resume | Le systeme detecte les fichiers modifies et met a jour uniquement les noeuds et chunks impactes. |
| Preconditions | Une premiere indexation existe deja. |
| Scenario nominal | 1. Le diff indique les fichiers modifies. 2. Les anciens hashes sont compares. 3. Les chunks modifies sont recalcules. 4. Neo4j est mis a jour avec MERGE. |
| Post-conditions | Le graphe reste synchronise avec le repository sans reindexation complete. |

### 5.3.5 Conception

#### 5.3.5.1 Architecture de l'indexation GraphRAG

```text
Repository
   |
RepoContextManager
   |
File filtering
   |
CodeChunker
   |
Embeddings
   |
GraphBuilder
   |
Neo4j
```

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint2-architecture-indexation-graphrag.png}
    \caption{Architecture de l'indexation GraphRAG du repository.}
    \label{fig:sprint2-architecture-indexation}
\end{figure}
```

#### 5.3.5.2 Diagrammes UML

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.9\textwidth]{figures/release2/sprint2-usecase-indexer-repository.png}
    \caption{Diagramme de cas d'utilisation - Indexer un repository.}
    \label{fig:sprint2-usecase-indexer}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint2-classes-graphe-code.png}
    \caption{Diagramme de classes - Modele de graphe de code.}
    \label{fig:sprint2-classes-graphe-code}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint2-sequence-repo-chunk-neo4j.png}
    \caption{Diagramme de sequence - Repository, chunking, embeddings et Neo4j.}
    \label{fig:sprint2-sequence-repo-chunk-neo4j}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.85\textwidth]{figures/release2/sprint2-activity-indexation.png}
    \caption{Diagramme d'activite - Indexation complete et incrementale.}
    \label{fig:sprint2-activity-indexation}
\end{figure}
```

#### 5.3.5.3 Modele Neo4j

| Noeud | Description |
|---|---|
| Organization | Organisation proprietaire du projet |
| Project | Projet fonctionnel dans la plateforme |
| Repository | Depot GitHub analyse |
| File | Fichier source ou documentaire |
| Module | Unite logique de code |
| Class | Classe definie dans le code |
| Function | Fonction ou methode |
| Chunk | Fragment textuel ou code source indexe |
| Rule | Regle technique ou metier |
| KnowledgeDocument | Document de base de connaissance |
| AnalysisRun | Execution d'analyse |

| Relation | Description |
|---|---|
| CONTAINS | Relation de contenance hierarchique |
| DEFINES | Un fichier definit une classe ou fonction |
| IMPORTS | Un fichier importe un autre module |
| CALLS | Une fonction appelle une autre fonction |
| DEPENDS_ON | Dependence structurelle ou technique |
| CHUNKED_FROM | Un chunk provient d'un fichier |
| HAS_RULE | Lien entre projet/repository et regle applicable |
| HAS_HISTORY | Lien vers les analyses precedentes |
| VIOLATES | Lien entre finding/chunk et regle violee |

### 5.3.6 Realisation

La realisation repose sur plusieurs services backend. Le `RepoContextManager` prepare le contexte du repository. Le `CodeChunker` decoupe les fichiers en fragments exploitables. Le generateur d'embeddings transforme les chunks en representations vectorielles. Le `GraphBuilder` construit les noeuds et relations Neo4j.

| Service | Role |
|---|---|
| RepoContextManager | Charge le repository et organise le contexte d'analyse |
| CodeChunker | Decoupe le code et les documents en chunks |
| Embedding service | Genere les vecteurs de similarite |
| GraphBuilder | Cree les noeuds et relations Neo4j |
| Neo4j client | Execute les requetes Cypher et MERGE |

#### Fichiers importants

| Fichier | Role |
|---|---|
| `apps/backend/app/core/analysis/context/repo_context_manager.py` | Gestion du contexte repository |
| `apps/backend/app/core/analysis/graph/builder.py` | Construction du graphe |
| `apps/backend/app/core/analysis/graph/schema.py` | Schema des noeuds et relations |
| `apps/backend/app/integrations/graph_database/neo4j_client.py` | Connexion et requetes Neo4j |

#### Captures et figures recommandees

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint2-neo4j-browser-nodes.png}
    \caption{Visualisation des noeuds du repository dans Neo4j Browser.}
    \label{fig:sprint2-neo4j-nodes}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint2-neo4j-relations.png}
    \caption{Relations Neo4j entre fichiers, fonctions et chunks.}
    \label{fig:sprint2-neo4j-relations}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint2-cypher-merge.png}
    \caption{Requete Cypher MERGE utilisee pour l'indexation incrementale.}
    \label{fig:sprint2-cypher-merge}
\end{figure}
```

### 5.3.7 Tests et validation

| Scenario de test | Resultat attendu | Resultat obtenu |
|---|---|---|
| Indexation d'un nouveau repository | Creation des noeuds Repository, File et Chunk | A renseigner |
| Detection de fonctions | Creation des noeuds Function | A renseigner |
| Detection de relations | Creation des relations CONTAINS, DEFINES et CHUNKED_FROM | A renseigner |
| Mise a jour incrementale | Seuls les chunks modifies sont recalcules | A renseigner |
| Verification Neo4j | Les noeuds sont visibles dans Neo4j Browser | A renseigner |

### 5.3.8 Conclusion du sprint

Ce sprint construit la base contextuelle de GraphRAG. Les notions de RAG, chunking, embeddings, graphes de connaissances et Neo4j sont appliquees directement a la plateforme. A la fin du sprint, le repository n'est plus seulement un ensemble de fichiers : il devient une carte de connaissances structurante, interrogeable et exploitable par le pipeline d'analyse intelligente.

---

## 5.4 Sprint 3 - Recherche hybride GraphRAG, LLM et generation des findings

### 5.4.1 Introduction du sprint

Ce sprint implemente le coeur intelligent de la release. Une fois le repository indexe, le systeme doit exploiter ce contexte pour analyser un diff, recuperer les informations utiles et generer des findings exploitables.

Ce sprint integre les notions d'analyse statique, LLM, tokens, fenetre de contexte, hallucinations, RAG simple, GraphRAG, retrieval hybride, prompt engineering, grounding, citations et guardrails anti-hallucination.

### 5.4.2 Rappel theorique integre au sprint

#### 5.4.2.1 Analyse statique classique

L'analyse statique detecte des problemes sans executer le programme. Elle repose sur des regles syntaxiques, des patterns de securite ou des conventions de style. Des outils comme Ruff, ESLint, Semgrep ou SQLFluff permettent de detecter des erreurs frequentes rapidement.

Sa limite principale est le manque de contexte. Elle peut signaler une erreur locale, mais elle ne comprend pas toujours l'intention du changement, l'architecture du projet ou les regles metier du Tech Lead.

#### 5.4.2.2 Apport et limites des LLM

Les LLM permettent de produire des explications, des suggestions et des commentaires plus proches d'une revue humaine. Ils peuvent resumer une PR, expliquer un risque et proposer une correction.

Cependant, une approche purement LLM presente plusieurs limites : hallucinations, cout, latence, dependance a la fenetre de contexte et manque d'ancrage dans des preuves verifiables. C'est pour cette raison que la plateforme combine LLM et GraphRAG.

| Limite LLM | Risque | Reponse dans la plateforme |
|---|---|---|
| Hallucination | Finding invente ou non verifiable | Citation de noeud Neo4j ou regle KB |
| Fenetre de contexte limitee | Oubli de dependances importantes | Retrieval cible avant generation |
| Cout tokens | Analyse couteuse | Selection et compression du contexte |
| Latence | Attente utilisateur | Execution asynchrone Celery |
| Sortie non structuree | Resultat difficile a exploiter | JSON strict et validation |

#### 5.4.2.3 Tokens et fenetre de contexte

Un token est une unite de texte manipulee par le LLM. La fenetre de contexte represente le nombre maximal de tokens que le modele peut traiter dans une requete. Dans une analyse de code, cette limite est critique, car un repository peut contenir beaucoup plus de contenu que ce que le modele peut lire en une seule fois.

La plateforme resout ce probleme en recuperant uniquement les chunks, regles et relations utiles au diff analyse.

#### 5.4.2.4 RAG simple vs GraphRAG

Le RAG simple repose principalement sur la similarite vectorielle. Il recupere les chunks les plus proches d'une requete, mais il ne comprend pas naturellement les relations structurelles du code.

GraphRAG ajoute une dimension structurelle : il combine la recherche vectorielle avec les relations de graphe, les symboles, les dependances et les regles de la base de connaissance.

| Aspect | RAG simple | GraphRAG |
|---|---|---|
| Retrieval | Vecteurs principalement | Vecteurs + symboles + graphe + KB |
| Structure du code | Faible | Forte |
| Multi-hop | Non naturel | Traversal Neo4j |
| Regles internes | Injectees manuellement | Liees au graphe et priorisees |
| Tracabilite | Limitee | Node ID, Rule ID, citations |
| Risque d'hallucination | Plus eleve | Reduit par grounding |

#### 5.4.2.5 Prompt engineering et guardrails

Le prompt engineering structure la maniere dont le LLM recoit les instructions. Dans la plateforme, le prompt final est organise en blocs : role systeme, regles KB, contexte graphe, diff, findings statiques, contraintes JSON et regles de validation.

Les guardrails imposent que chaque finding soit rattache a une preuve : fichier, ligne, chunk, node_id Neo4j ou rule_id KB. Les findings sans preuve sont rejetes ou classes en faible confiance.

### 5.4.3 Specification des besoins

#### 5.4.3.1 Besoins fonctionnels

| ID | Besoin fonctionnel |
|---|---|
| BF-S3-01 | Analyser un diff Git |
| BF-S3-02 | Extraire les symboles depuis les fichiers modifies |
| BF-S3-03 | Executer l'analyse statique sur les lignes modifiees |
| BF-S3-04 | Recuperer le contexte utile du repository |
| BF-S3-05 | Combiner recherche vectorielle, symbolique et graphe |
| BF-S3-06 | Consulter les regles de la base de connaissance |
| BF-S3-07 | Prioriser les regles KB sur le contexte general |
| BF-S3-08 | Generer des findings par LLM |
| BF-S3-09 | Normaliser les resultats en JSON |
| BF-S3-10 | Generer des suggestions de correction |

#### 5.4.3.2 Besoins non fonctionnels

| ID | Besoin non fonctionnel |
|---|---|
| BNF-S3-01 | Reduire les hallucinations du LLM |
| BNF-S3-02 | Fournir des resultats tracables |
| BNF-S3-03 | Associer chaque finding a un fichier et une ligne |
| BNF-S3-04 | Controler la taille du prompt et la consommation de tokens |
| BNF-S3-05 | Maintenir une sortie JSON valide et exploitable |

### 5.4.4 Description textuelle des cas d'utilisation

| Element | Contenu |
|---|---|
| Titre | Generation d'une revue intelligente GraphRAG |
| Acteur principal | Systeme GraphRAG |
| Resume | Le systeme analyse un diff, recupere le contexte pertinent, assemble un prompt et genere des findings JSON. |
| Preconditions | Le repository est indexe et le diff est disponible. |
| Scenario nominal | 1. Le diff est parse. 2. Les symboles sont extraits. 3. La recherche hybride recupere le contexte. 4. Les regles KB sont ajoutees. 5. Le prompt est construit. 6. Le LLM genere les findings. 7. Le JSON est valide. |
| Post-conditions | Les findings sont prets a etre sauvegardes et affiches dans le dashboard. |

| Element | Contenu |
|---|---|
| Titre | Application des guardrails anti-hallucination |
| Acteur principal | Systeme GraphRAG |
| Resume | Le systeme verifie que chaque finding possede une preuve exploitable. |
| Preconditions | Le LLM a retourne une sortie structuree. |
| Scenario nominal | 1. La sortie JSON est parse. 2. Chaque finding est verifie. 3. Les citations sont controlees. 4. Les findings non prouves sont rejetes ou abaisses en confiance. |
| Post-conditions | Seuls les findings exploitables sont conserves. |

### 5.4.5 Conception

#### 5.4.5.1 Architecture GraphRAG du pipeline d'analyse

```text
Diff Git
   |
Symbol extraction
   |
Hybrid Retriever
   |---- Vector search
   |---- Symbol search
   |---- Graph expansion
   |---- KB rules
   |---- KB documents
   |
Context ranking
   |
Prompt builder
   |
LLM
   |
JSON findings
   |
Validation + guardrails
```

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint3-architecture-graphrag-retrieval.png}
    \caption{Architecture GraphRAG du pipeline de recherche hybride et generation.}
    \label{fig:sprint3-architecture-graphrag}
\end{figure}
```

#### 5.4.5.2 Diagrammes UML

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.9\textwidth]{figures/release2/sprint3-usecase-generation-findings.png}
    \caption{Diagramme de cas d'utilisation - Recherche hybride et generation des findings.}
    \label{fig:sprint3-usecase-generation}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint3-classes-retrieval-generation.png}
    \caption{Diagramme de classes - Retriever, contexte, prompt et findings.}
    \label{fig:sprint3-classes-retrieval-generation}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint3-sequence-diff-retrieval-llm.png}
    \caption{Diagramme de sequence - Diff, retrieval, LLM et findings.}
    \label{fig:sprint3-sequence-diff-retrieval-llm}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.85\textwidth]{figures/release2/sprint3-activity-generation.png}
    \caption{Diagramme d'activite - Generation et validation des findings.}
    \label{fig:sprint3-activity-generation}
\end{figure}
```

#### 5.4.5.3 Comparaison des modeles LLM dans la plateforme

| Modele | Type | Points forts | Limites | Usage dans la plateforme |
|---|---|---|---|---|
| GPT | Proprietaire | Bonne qualite, bon raisonnement, sortie structuree | Cout et dependance API | Production ou analyses critiques |
| Mistral | Ouvert / API selon fournisseur | Bon compromis performance-cout | Peut necessiter adaptation prompt | Alternative economique |
| Mixtral | Ouvert | Bonnes performances sur contexte long | Ressources plus elevees | Analyse avancee locale ou serveur |
| Llama | Ouvert | Maitrise locale possible | Qualite variable selon taille | Tests, local, confidentialite |
| Ollama local | Execution locale | Donnees gardees en local | Latence et ressources machine | Mode developpement ou prive |

### 5.4.6 Realisation

La realisation s'appuie sur un retriever hybride et un service de generation. Le retriever extrait les symboles depuis le diff, interroge Neo4j, recupere les chunks vectoriels, ajoute les regles KB et assemble le contexte final. Le service de generation construit ensuite un prompt structure et appelle le LLM.

| Service | Role |
|---|---|
| HybridRetriever / GraphRAGRetriever | Recupere et fusionne les contextes |
| Symbol extractor | Identifie les fonctions, classes et fichiers modifies |
| Neo4j retriever | Effectue la recherche vectorielle et les expansions de graphe |
| GenerationService | Construit le prompt et genere les findings |
| LLM service | Interface avec le modele de langage |
| JSON normalizer | Valide et normalise la sortie |

#### Fichiers importants

| Fichier | Role |
|---|---|
| `apps/backend/app/core/analysis/retrieval/hybrid_retriever.py` | Recherche hybride dans le contexte du projet |
| `apps/backend/analysis/langGraph/raggraph/retriever.py` | Retriever GraphRAG / LangGraph |
| `apps/backend/app/core/analysis/generation/generation_service.py` | Generation des resultats |
| `apps/backend/analysis/langGraph/raggraph/llm_service.py` | Appels au LLM |

#### Structure du prompt final

```text
Bloc 1 - Systeme
   Role du modele, sortie JSON obligatoire, interdiction d'inventer.

Bloc 2 - Regles KB
   Regles Tech Lead et politiques internes prioritaires.

Bloc 3 - Contexte graphe
   Noeuds, relations, fonctions dependantes, chunks cites.

Bloc 4 - Diff a analyser
   Fichiers, hunks et lignes modifiees.

Bloc 5 - Findings statiques
   Resultats Ruff, ESLint, Semgrep, SQLFluff.

Bloc 6 - Contraintes de sortie
   Schema JSON, severite, evidence_ref, rule_ref, suggestion.

Bloc 7 - Auto-verification
   Garder uniquement les findings justifies par le contexte.
```

#### Captures recommandees

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint3-retrieval-context.png}
    \caption{Contexte recupere par le retriever hybride GraphRAG.}
    \label{fig:sprint3-retrieval-context}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint3-json-findings.png}
    \caption{Exemple de sortie JSON des findings generes par LLM.}
    \label{fig:sprint3-json-findings}
\end{figure}
```

### 5.4.7 Tests et validation

| Scenario de test | Resultat attendu | Resultat obtenu |
|---|---|---|
| Diff simple | Finding associe au bon fichier et a la bonne ligne | A renseigner |
| Diff avec dependances | Recuperation du voisinage graphe | A renseigner |
| Regle KB prioritaire | La regle apparait dans le contexte final | A renseigner |
| Sortie LLM invalide | Rejet ou normalisation de la sortie | A renseigner |
| LLM indisponible | Echec controle et statut FAILED | A renseigner |
| Prompt trop long | Reduction ou selection du contexte | A renseigner |

### 5.4.8 Conclusion du sprint

Ce sprint transforme l'indexation du repository en analyse intelligente. Le systeme ne se contente pas de chercher des chunks similaires : il combine analyse statique, recherche vectorielle, relations Neo4j, regles KB et generation LLM. Le resultat est une revue plus contextuelle, plus tracable et moins exposee aux hallucinations.

---

## 5.5 Sprint 4 - Orchestration, historique, templates Tech Lead et feedback loop

### 5.5.1 Introduction du sprint

Ce sprint relie le moteur GraphRAG au fonctionnement global de la plateforme. Il gere l'execution asynchrone, le cycle de vie des analyses, la sauvegarde des resultats, l'historique, les templates Tech Lead, les decisions de review et la reanalyse apres correction.

Il integre aussi la boucle de feedback : les retours du developpeur et du Tech Lead permettent d'ameliorer progressivement les regles, les prompts, les templates et la qualite des analyses futures.

### 5.5.2 Rappel theorique integre au sprint

#### 5.5.2.1 Orchestration asynchrone

Une analyse GraphRAG peut prendre du temps : parsing du diff, analyse statique, recherche de contexte, appel LLM, validation JSON et sauvegarde. Pour eviter de bloquer l'API, la plateforme utilise une execution asynchrone avec Celery et Redis.

FastAPI recoit la demande, cree un `AnalysisRun`, puis envoie une tache a Celery. Redis joue le role de broker. Le worker execute l'analyse en arriere-plan et met a jour le statut.

#### 5.5.2.2 Cycle de vie d'une analyse

```text
RECEIVED -> QUEUED -> RUNNING -> COMPLETED
                         |
                         -> FAILED
```

Ce cycle permet au dashboard d'afficher l'etat de l'analyse en temps reel ou par polling.

#### 5.5.2.3 Templates Tech Lead

Les templates Tech Lead representent les regles, attentes ou standards internes definis par un responsable technique. Ils ne remplacent pas GraphRAG : ils l'orientent. GraphRAG recupere le contexte, tandis que les templates donnent la priorite aux regles de l'organisation.

#### 5.5.2.4 Feedback loop et reanalyse

La boucle de feedback permet de capitaliser sur les decisions humaines. Lorsqu'un Tech Lead valide, rejette ou corrige un finding, cette information peut etre reutilisee pour ameliorer les prompts, les regles, les exemples ou les priorites de retrieval. Cette logique se rapproche d'une boucle RLHF au niveau applicatif, meme si elle ne reentraine pas necessairement le modele LLM.

### 5.5.3 Specification des besoins

#### 5.5.3.1 Besoins fonctionnels

| ID | Besoin fonctionnel |
|---|---|
| BF-S4-01 | Declencher l'analyse depuis la plateforme ou un webhook |
| BF-S4-02 | Executer le pipeline en tache Celery |
| BF-S4-03 | Suivre les statuts QUEUED, RUNNING, COMPLETED et FAILED |
| BF-S4-04 | Sauvegarder les findings et commentaires |
| BF-S4-05 | Afficher les resultats dans le dashboard |
| BF-S4-06 | Permettre au Tech Lead de definir des templates |
| BF-S4-07 | Relier les templates au pipeline GraphRAG |
| BF-S4-08 | Historiser les analyses par PR et repository |
| BF-S4-09 | Comparer plusieurs runs d'analyse |
| BF-S4-10 | Lancer une reanalyse apres mise a jour de la PR |

#### 5.5.3.2 Besoins non fonctionnels

| ID | Besoin non fonctionnel |
|---|---|
| BNF-S4-01 | L'execution doit etre asynchrone |
| BNF-S4-02 | Les resultats doivent etre persistants |
| BNF-S4-03 | Les erreurs partielles doivent etre journalisees |
| BNF-S4-04 | Le dashboard doit afficher un statut fiable |
| BNF-S4-05 | Les decisions humaines doivent rester tracables |

### 5.5.4 Description textuelle des cas d'utilisation

| Element | Contenu |
|---|---|
| Titre | Execution asynchrone du pipeline GraphRAG |
| Acteur principal | Systeme |
| Resume | La plateforme lance une analyse GraphRAG en arriere-plan et met a jour son statut. |
| Preconditions | Une PR ou une demande d'analyse existe. Redis et Celery sont disponibles. |
| Scenario nominal | 1. FastAPI cree l'analyse. 2. La tache Celery est ajoutee a la queue. 3. Le worker execute le pipeline. 4. Les resultats sont sauvegardes. 5. Le statut passe a COMPLETED. |
| Post-conditions | Les findings sont visibles dans le dashboard. |

| Element | Contenu |
|---|---|
| Titre | Application d'un template Tech Lead |
| Acteur principal | Tech Lead |
| Resume | Le Tech Lead configure une regle ou un template qui influence l'analyse GraphRAG. |
| Preconditions | Le Tech Lead est authentifie et dispose des droits. |
| Scenario nominal | 1. Le Tech Lead cree un template. 2. La regle est sauvegardee. 3. Le pipeline la recupere pendant l'analyse. 4. Les findings tiennent compte de cette regle. |
| Post-conditions | La review respecte les standards internes du projet. |

### 5.5.5 Conception

#### 5.5.5.1 Architecture d'orchestration

```text
FastAPI
   |
AnalysisRun created
   |
Redis queue
   |
Celery worker
   |
GraphRAG orchestrator
   |
Static analysis + Secret scan + Retrieval + LLM
   |
PostgreSQL findings
   |
Neo4j history
   |
Dashboard
```

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint4-architecture-orchestration.png}
    \caption{Architecture d'orchestration asynchrone du pipeline GraphRAG.}
    \label{fig:sprint4-architecture-orchestration}
\end{figure}
```

#### 5.5.5.2 Diagrammes UML

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.9\textwidth]{figures/release2/sprint4-usecase-orchestration-template.png}
    \caption{Diagramme de cas d'utilisation - Orchestration, historique et templates Tech Lead.}
    \label{fig:sprint4-usecase-orchestration}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint4-classes-analysisrun-history.png}
    \caption{Diagramme de classes - AnalysisRun, findings, historique et templates.}
    \label{fig:sprint4-classes-analysisrun}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint4-sequence-pr-celery-result.png}
    \caption{Diagramme de sequence - Pull Request, FastAPI, Celery, GraphRAG et resultat.}
    \label{fig:sprint4-sequence-pr-celery}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.85\textwidth]{figures/release2/sprint4-activity-feedback-reanalysis.png}
    \caption{Diagramme d'activite - Feedback, correction et reanalyse.}
    \label{fig:sprint4-activity-feedback}
\end{figure}
```

### 5.5.6 Realisation

La tache `run_graphrag_analysis_pipeline` constitue le point d'entree asynchrone. Elle parse le diff, masque les secrets, execute l'analyse statique, appelle l'orchestrateur GraphRAG, fusionne les resultats et sauvegarde les findings.

| Etape | Description |
|---|---|
| Reception | Creation ou recuperation de l'AnalysisRun |
| Parsing | Extraction des fichiers, hunks et lignes modifiees |
| Secret scan | Detection et masquage des secrets avant LLM |
| Static analysis | Execution des outils classiques |
| GraphRAG | Recherche hybride et generation LLM |
| Fusion | Fusion secret scan + static analysis + GraphRAG |
| Persistence | Sauvegarde PostgreSQL et historique Neo4j |
| Dashboard | Affichage des resultats |

#### Fichiers importants

| Fichier | Role |
|---|---|
| `apps/backend/app/workers/tasks/analyze_graphrag.py` | Tache Celery principale |
| `apps/backend/app/core/analysis/orchestrator.py` | Orchestrateur d'analyse |
| `apps/backend/analysis/langGraph/pipeline.py` | Pipeline LangGraph |
| `apps/backend/app/core/analysis/history/history_service.py` | Historique et comparaison inter-runs |
| `apps/dashboard/app/dashboard/lead/templates/page.tsx` | Interface templates Tech Lead |

#### Captures recommandees

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint4-celery-worker-running.png}
    \caption{Worker Celery executant une analyse GraphRAG.}
    \label{fig:sprint4-celery-worker}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint4-analysis-history.png}
    \caption{Historique des analyses associees a une pull request.}
    \label{fig:sprint4-analysis-history}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint4-techlead-templates.png}
    \caption{Interface de configuration des templates Tech Lead.}
    \label{fig:sprint4-techlead-templates}
\end{figure}
```

### 5.5.7 Tests et validation

| Scenario de test | Resultat attendu | Resultat obtenu |
|---|---|---|
| Declenchement d'une analyse | Tache Celery creee | A renseigner |
| Worker actif | Statut RUNNING puis COMPLETED | A renseigner |
| Erreur LLM | Statut FAILED et log d'erreur | A renseigner |
| Sauvegarde des findings | Findings visibles dans le dashboard | A renseigner |
| Template applique | Finding influence par la regle Tech Lead | A renseigner |
| Reanalyse | Nouveau run ajoute a l'historique | A renseigner |

### 5.5.8 Conclusion du sprint

Ce sprint rend le moteur GraphRAG exploitable dans une plateforme reelle. Il gere l'asynchronisme, la persistance, l'historique, les templates et la reanalyse. Le systeme devient capable de suivre une PR dans le temps et d'integrer les retours humains dans une boucle d'amelioration continue.

---

## 5.6 Sprint 5 - Demonstration, evaluation qualitative, captures et perspectives

### 5.6.1 Introduction du sprint

Ce sprint regroupe la demonstration finale et l'evaluation de la release IA. Il ne s'agit pas d'une partie separee : elle valide les sprints precedents a travers un scenario complet allant de l'ouverture d'une pull request jusqu'a la decision du Tech Lead.

### 5.6.2 Rappel theorique integre au sprint

#### 5.6.2.1 Evaluation qualitative d'une revue IA

L'evaluation d'une revue IA ne doit pas se limiter au nombre de findings. Un bon finding doit etre pertinent, actionnable, associe au bon fichier, rattache a une preuve et comprehensible par un developpeur.

| Critere | Description |
|---|---|
| Pertinence | Le finding correspond a un vrai probleme |
| Tracabilite | Le finding cite un fichier, une ligne, un chunk ou une regle |
| Actionnabilite | La suggestion permet de corriger le probleme |
| Non-redondance | Les findings repetes sont evites |
| Robustesse | Le systeme gere les erreurs LLM ou retrieval |

#### 5.6.2.2 Limites liees aux LLM et au cout

Les LLM restent limites par le cout, la latence, la fenetre de contexte et la qualite du prompt. La plateforme reduit ces limites par la selection du contexte, l'execution asynchrone, les guardrails et la priorisation des regles.

### 5.6.3 Specification des besoins

#### 5.6.3.1 Besoins fonctionnels

| ID | Besoin fonctionnel |
|---|---|
| BF-S5-01 | Presenter un scenario complet A-Z |
| BF-S5-02 | Montrer l'onboarding du repository |
| BF-S5-03 | Montrer le declenchement par pull request |
| BF-S5-04 | Afficher les findings dans le dashboard |
| BF-S5-05 | Montrer le role du Tech Lead |
| BF-S5-06 | Montrer la reanalyse apres correction |
| BF-S5-07 | Commenter les captures d'ecran |
| BF-S5-08 | Evaluer qualitativement les resultats |

#### 5.6.3.2 Besoins non fonctionnels

| ID | Besoin non fonctionnel |
|---|---|
| BNF-S5-01 | Les captures doivent etre lisibles |
| BNF-S5-02 | Les resultats doivent etre associes a un scenario coherent |
| BNF-S5-03 | L'evaluation doit distinguer forces, limites et perspectives |

### 5.6.4 Description textuelle des cas d'utilisation

| Element | Contenu |
|---|---|
| Titre | Scenario complet de revue intelligente |
| Acteur principal | Developpeur et Tech Lead |
| Resume | Le developpeur ouvre une PR, la plateforme analyse le code, le Tech Lead consulte les findings et prend une decision. |
| Preconditions | Repository onboarde, webhook actif, dashboard disponible, worker actif. |
| Scenario nominal | 1. Le repository est onboarde. 2. Le developpeur ouvre une PR. 3. Le webhook declenche l'analyse. 4. GraphRAG genere les findings. 5. Le dashboard affiche les resultats. 6. Le Tech Lead decide. 7. Le developpeur corrige. 8. La PR est reanalysee. |
| Post-conditions | La PR dispose d'une decision tracable et d'un historique d'analyse. |

### 5.6.5 Conception

#### 5.6.5.1 Scenario A-Z

```text
Etape 0 - Configuration de la plateforme
Etape 1 - Onboarding du repository
Etape 2 - Ouverture de la pull request
Etape 3 - Reception du webhook
Etape 4 - Parsing, secret scan et static analysis
Etape 5 - Retrieval GraphRAG
Etape 6 - Generation LLM
Etape 7 - Affichage dashboard
Etape 8 - Decision Tech Lead
Etape 9 - Correction developpeur
Etape 10 - Reanalyse et comparaison
```

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint5-scenario-az.png}
    \caption{Scenario complet de l'ouverture de la PR a la decision du Tech Lead.}
    \label{fig:sprint5-scenario-az}
\end{figure}
```

### 5.6.6 Realisation

La demonstration doit etre construite a partir d'un cas concret. Il est recommande de choisir une pull request simple mais suffisamment representative : modification d'une fonction, impact sur une dependance, declenchement d'une regle Tech Lead et generation d'une suggestion.

#### Captures d'ecran commentees

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint5-capture-integration-github.png}
    \caption{Integration GitHub du repository dans la plateforme.}
    \label{fig:sprint5-integration-github}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint5-capture-dashboard.png}
    \caption{Dashboard de suivi des analyses intelligentes.}
    \label{fig:sprint5-dashboard}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint5-capture-findings.png}
    \caption{Findings GraphRAG associes aux fichiers et lignes modifies.}
    \label{fig:sprint5-findings}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint5-capture-templates.png}
    \caption{Templates Tech Lead appliques a l'analyse.}
    \label{fig:sprint5-templates}
\end{figure}

\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/sprint5-capture-historique.png}
    \caption{Historique des analyses et comparaison inter-runs.}
    \label{fig:sprint5-historique}
\end{figure}
```

### 5.6.7 Tests et validation

| Axe d'evaluation | Question de validation | Resultat attendu |
|---|---|---|
| Qualite des findings | Les problemes signales sont-ils pertinents ? | Findings utiles et non generiques |
| Tracabilite | Chaque finding est-il rattache a une preuve ? | Fichier, ligne, node_id ou rule_id |
| Reduction des hallucinations | Le systeme evite-t-il les affirmations non fondees ? | Findings non prouves rejetes |
| Integration workflow | Le developpeur peut-il agir depuis la PR ou le dashboard ? | Feedback exploitable |
| Role Tech Lead | Le Tech Lead peut-il valider, bloquer ou ajuster ? | Decision historisee |
| Reanalyse | Le systeme detecte-t-il les corrections ? | Nouveau run comparable |

### 5.6.8 Analyse critique

#### Forces de la solution

La solution combine plusieurs niveaux d'analyse : statique, vectorielle, structurelle, documentaire et generative. Cette combinaison permet d'obtenir une revue plus riche qu'un simple linter ou qu'un LLM utilise seul.

#### Limites techniques

Les limites principales concernent la qualite du graphe, la couverture des langages, le cout des appels LLM, la latence de generation et la necessite de maintenir une base de connaissance propre.

#### Difficultes rencontrees

Les difficultes les plus importantes concernent l'alignement entre le diff Git, les chunks, les lignes modifiees, les noeuds Neo4j et les citations finales. La coherence de bout en bout est indispensable pour produire des findings fiables.

### 5.6.9 Perspectives

| Perspective | Description |
|---|---|
| Enrichissement de la KB | Ajouter plus de documents, standards, exemples et regles |
| Chunking avance | Adapter davantage le decoupage selon chaque langage |
| Embeddings specialises | Utiliser des embeddings optimises pour le code |
| Nouveaux LLM | Comparer plus finement les modeles ouverts et proprietaires |
| Evaluation automatique | Ajouter des metriques de precision, recall et feedback humain |
| Feedback loop avancee | Exploiter les validations Tech Lead pour ameliorer les prompts et regles |

### 5.6.10 Conclusion du sprint

Ce sprint valide la release par un scenario complet et observable. Il montre que le moteur GraphRAG n'est pas seulement un composant technique, mais un outil integre au workflow de revue. La demonstration met en evidence la valeur principale de la plateforme : produire des retours contextualises, tracables et exploitables par les developpeurs et le Tech Lead.

---

## 5.7 Schema resume de la release

```latex
\begin{figure}[H]
    \centering
    \includegraphics[width=0.95\textwidth]{figures/release2/schema-resume-release2.png}
    \caption{Schema resume de la release 2 : GitHub, GraphRAG, LLM, dashboard et feedback.}
    \label{fig:release2-schema-resume}
\end{figure}
```

```text
GitHub Pull Request
   |
Webhook + CI checks
   |
FastAPI
   |
Celery + Redis
   |
Diff parsing + Secret scan + Static analysis
   |
Repo indexing + Neo4j graph
   |
Hybrid retrieval
   |
Prompt engineering
   |
LLM generation
   |
JSON findings
   |
Dashboard + Tech Lead templates
   |
Feedback + Reanalysis
```

## 5.8 Apports de la release

| Apport | Description |
|---|---|
| Analyse contextuelle | Le systeme tient compte du repository, du graphe, des regles et du diff |
| Tracabilite | Les findings sont relies a des fichiers, lignes, chunks ou regles |
| Reduction des hallucinations | Les guardrails imposent des preuves |
| Automatisation | Le pipeline est declenche depuis GitHub et execute par Celery |
| Aide a la decision | Le Tech Lead recoit des resultats structures et exploitables |
| Historique | Les analyses sont conservees et comparables |
| Feedback | Les corrections et decisions alimentent l'amelioration continue |

## 5.9 Limites actuelles

| Limite | Impact |
|---|---|
| Qualite du graphe | Un graphe incomplet limite le raisonnement multi-hop |
| Fenetre de contexte LLM | Le contexte doit etre selectionne avec precision |
| Cout et latence | Les appels LLM doivent etre controles |
| Couverture des langages | Certains langages necessitent un chunking specifique |
| Evaluation qualitative | Les metriques automatiques restent a renforcer |
| Dependances externes | GitHub, Neo4j, Redis et LLM doivent rester disponibles |

## 5.10 Perspectives d'amelioration

Les ameliorations futures concernent l'enrichissement de la base de connaissance, l'ajout de strategies de chunking plus specialisees, l'utilisation de modeles d'embedding orientes code, l'elargissement des fournisseurs LLM, l'ajout d'une evaluation quantitative plus fine et l'exploitation plus avancee du feedback humain.

Une perspective importante consiste a rapprocher la boucle de feedback d'une logique RLHF applicative : les decisions du Tech Lead, les corrections acceptees et les findings rejetes peuvent devenir des signaux pour ajuster les prompts, renforcer les regles et ameliorer la priorisation du contexte.

## 5.11 Conclusion de la release

Cette release a ajoute a la plateforme AI Code Review un moteur d'analyse intelligente base sur GraphRAG. Le systeme ne se limite plus a appliquer des regles statiques ou a interroger un LLM de maniere isolee. Il construit une representation contextuelle du repository, combine chunks, embeddings, graphe Neo4j, regles Tech Lead, analyse statique et generation LLM.

L'integration directe avec GitHub permet d'ancrer l'analyse dans le cycle reel de developpement : commits, branches, pull requests, webhooks, CI/CD, feedback et reanalyse. La plateforme devient ainsi un outil d'assistance au Tech Lead, capable de produire des findings contextualises, tracables et actionnables.

En integrant l'ancien etat de l'art directement dans les sprints, ce chapitre montre non seulement les concepts utilises, mais aussi leur role concret dans la conception et la realisation de la release.
