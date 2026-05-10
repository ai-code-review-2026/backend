# Rapport PFE - Structure finale complete et contenu redige

> Version reorganisee selon l'ordre final du rapport :
>
> 1. Chapitre 1 : Contexte general / etude prealable
> 2. Chapitre 2 : Lancement et conception du projet
> 3. Release 1 : Application web et mobile
> 4. Release 2 : Intelligence artificielle, RAG, GraphRAG et analyse intelligente du code
> 5. Release 3 : Deploiement VPS, HTTPS, monitoring et CI/CD
>
> Cette version reprend les elements discutes dans la conversation et les replace dans une structure coherente. La Release 2 fusionne l'etat de l'art IA, la conception GraphRAG, la realisation, le scenario A-Z, l'evaluation, les limites et les perspectives.

---

# Introduction generale

Le developpement logiciel moderne repose sur des cycles rapides, une collaboration continue et une exigence croissante en matiere de qualite, securite et maintenabilite. Dans ce contexte, la revue de code occupe une place centrale. Elle permet de detecter les erreurs, d'assurer le respect des standards internes, de limiter les regressions et de maintenir une coherence architecturale dans le temps.

Cependant, dans de nombreuses equipes, la revue de code reste fortement dependante du Tech Lead. Celui-ci doit analyser les pull requests, comprendre les changements, verifier les conventions internes, evaluer l'impact sur le projet et formuler des retours actionnables. Cette charge devient difficile a maintenir lorsque le volume de pull requests augmente.

Le projet Devora, plateforme AI Code Review, vise a repondre a cette limite en proposant une solution de revue de code assistee par intelligence artificielle. La plateforme combine une application web et mobile, un workflow de review, une base de connaissances, des analyses statiques, des modeles de langage, un moteur GraphRAG et une infrastructure de deploiement complete.

Le rapport est organise autour de cinq grands blocs. Le premier chapitre presente le contexte general et l'etude prealable. Le deuxieme chapitre presente le lancement, les besoins, la conception globale et les technologies. La Release 1 decrit la mise en place de l'application web et mobile. La Release 2 traite toute la partie intelligence artificielle : LLM, RAG, GraphRAG, Neo4j, embeddings, prompt engineering, orchestration, evaluation et scenario complet. La Release 3 presente le deploiement sur VPS, la containerisation, le HTTPS, le monitoring et la CI/CD.

---

# Chapitre 1 : Etude prealable et contexte general

## 1.1 Introduction

Ce chapitre constitue le point de depart du rapport. Il presente le contexte global du projet, l'organisme d'accueil, les limites des pratiques actuelles de revue de code et la solution proposee. Il explique egalement le choix methodologique adopte pour conduire le projet.

L'objectif est de comprendre pourquoi une plateforme de revue de code intelligente est necessaire, quels problemes elle cherche a resoudre et comment elle s'inscrit dans un environnement professionnel de developpement logiciel.

## 1.2 Organisme d'accueil

Le projet a ete realise dans un contexte professionnel lie au developpement logiciel, a la transformation numerique et a l'accompagnement des entreprises dans leurs besoins digitaux.

L'organisme d'accueil, DnD Serv, Digital & Data Services, est une societe etablie a Bizerte en Tunisie. Elle accompagne ses clients dans leur presence digitale a travers plusieurs domaines : brand design, marketing numerique, gestion de communaute, developpement web et developpement logiciel.

Ce contexte justifie l'interet d'une solution capable d'ameliorer la qualite du code, de faciliter la collaboration entre developpeurs et Tech Leads, et de structurer les processus de revue dans des projets reels.

## 1.3 Etude et critique de l'existant

### 1.3.1 Description de l'existant

Dans la plupart des organisations, la revue de code repose sur un processus manuel centre sur le Tech Lead. Lorsqu'un developpeur termine une fonctionnalite ou une correction, il cree une pull request sur une plateforme de versioning telle que GitHub ou GitLab. Le Tech Lead examine ensuite les fichiers modifies, verifie la coherence du changement, identifie les risques potentiels et formule des commentaires.

Le processus suit generalement les etapes suivantes : soumission d'une pull request, examen manuel, formulation de remarques, correction par le developpeur, nouvelle iteration, validation finale et merge dans la branche principale.

Ce modele fonctionne correctement sur des projets de taille limitee. Cependant, il devient difficile a maintenir lorsque le nombre de repositories, de developpeurs, de branches et de pull requests augmente.

### 1.3.2 Critique de l'existant

L'analyse du fonctionnement actuel montre plusieurs limites. La premiere est le goulot d'etranglement humain : le Tech Lead devient le point de passage obligatoire pour toutes les modifications. En periode de forte activite, les pull requests s'accumulent et ralentissent le cycle de livraison.

La deuxieme limite concerne la variabilite des retours. La qualite de la revue depend de la disponibilite, de la fatigue, de l'experience et de la connaissance contextuelle du reviewer. Deux pull requests similaires peuvent donc recevoir des traitements differents.

La troisieme limite est liee aux connaissances implicites. Les regles architecturales, les conventions internes et les decisions passees sont souvent connues par le Tech Lead mais rarement formalisees dans un outil. Les outils d'analyse statique ne peuvent donc pas les appliquer automatiquement.

La quatrieme limite concerne le manque de contexte. Les analyseurs statiques detectent des problemes locaux, mais ne comprennent pas toujours les dependances entre fichiers, les relations entre fonctions, l'intention de la modification ou les regles propres a l'organisation.

### 1.3.3 Limites comparees de la revue manuelle et de l'analyse statique

La revue manuelle apporte une comprehension architecturale et une interpretation qualitative, mais elle est lente, variable et depend fortement du reviewer. L'analyse statique est rapide, objective et automatisable, mais elle reste limitee a des regles predefinies et ne comprend pas naturellement le contexte du projet.

La solution proposee cherche donc a combiner les avantages des deux approches : automatisation, rapidite, coherence, contextualisation et supervision humaine.

## 1.4 Solution proposee

Pour repondre aux limites identifiees, nous proposons la plateforme Devora, une solution AI Code Review qui s'integre au cycle de developpement existant. Elle peut etre connectee aux repositories GitHub et declenchee lors de la soumission de code, notamment a travers les pull requests.

La plateforme vise a assister le Tech Lead sans le remplacer. Elle automatise les verifications repetitives, detecte les risques, structure les resultats, fournit des suggestions et met en evidence les elements critiques. Le Tech Lead conserve la decision finale.

Le pipeline d'analyse repose sur plusieurs niveaux complementaires :

- detection des secrets et failles evidentes ;
- analyse statique avec des outils specialises ;
- classification du changement ;
- recuperation de contexte a partir du repository et de la base de connaissances ;
- analyse GraphRAG utilisant un graphe de code et des embeddings ;
- generation de findings par LLM ;
- affichage des resultats dans le dashboard et dans les vues de review.

La solution inclut egalement une extension Visual Studio Code prevue pour rapprocher l'analyse de l'environnement quotidien du developpeur. Cette extension peut declencher une analyse depuis l'editeur et afficher les resultats sans quitter le contexte de codage.

## 1.5 Apports de la solution

La plateforme apporte d'abord une reduction de la charge du Tech Lead. Les controles repetitifs sont automatises, ce qui permet au reviewer de concentrer son attention sur les decisions complexes.

Elle apporte ensuite une homogeneite des retours. Les regles internes et les templates de review peuvent etre formalises, puis appliques de facon plus constante.

Elle apporte aussi une analyse contextuelle. Au lieu de se limiter aux lignes modifiees, le systeme peut recuperer le contexte du repository, les dependances, les documents techniques et les regles de l'organisation.

Enfin, elle offre une meilleure observabilite. Les analyses, les statuts, les decisions et les historiques peuvent etre suivis dans un dashboard, ce qui facilite le pilotage de la qualite logicielle.

## 1.6 Choix methodologique

Le projet a ete conduit selon une approche agile inspiree de Scrum. Ce choix est justifie par la nature evolutive du projet. Les besoins couvrent plusieurs domaines : application web, mobile, GitHub, IA, RAG, GraphRAG, base de connaissances, dashboard, monitoring et deploiement.

Une methode sequentielle comme le cycle en V aurait ete trop rigide, car elle aurait impose une specification complete avant l'experimentation technique. Scrum permet au contraire d'avancer par increments, de valider les modules progressivement et d'adapter les choix au fur et a mesure de la realisation.

## 1.7 Cadre Scrum

Scrum repose sur un Product Backlog, des Sprint Backlogs et des cycles courts de realisation. Dans notre projet, chaque sprint livre une partie exploitable de la plateforme : authentification, gestion des repositories, analyse, review, analytics, mobile, IA, deploiement et monitoring.

Les roles Scrum sont adaptes au contexte du projet. Le Product Owner exprime et priorise les besoins. Le Scrum Master facilite le travail et leve les obstacles. L'equipe de developpement realise les fonctionnalites, les teste et les integre progressivement.

## 1.8 Formalisme adopte

Le formalisme UML a ete choisi pour representer les besoins et la conception. Les diagrammes de cas d'utilisation permettent d'identifier les interactions entre acteurs et systeme. Les diagrammes de classes representent les entites principales. Les diagrammes de sequence decrivent les interactions temporelles. Les diagrammes d'activite illustrent les workflows.

Ce formalisme facilite la comprehension du systeme et cree un lien clair entre les besoins, la conception et la realisation.

## 1.9 Product Backlog et planification des sprints

Le Product Backlog regroupe les fonctionnalites du projet sous forme de user stories. Il couvre l'authentification, la gestion des projets, l'import des repositories, le pipeline d'analyse, la base de connaissances, le GraphRAG, la revue LLM, le dashboard, le mobile, les integrations, la containerisation et le deploiement VPS.

La planification globale du projet est organisee en plusieurs sprints, regroupes dans le rapport en trois releases principales :

- Release 1 : application web et mobile ;
- Release 2 : intelligence artificielle et GraphRAG ;
- Release 3 : deploiement VPS et CI/CD.

## 1.10 Conclusion

Ce chapitre a presente le contexte du projet, les limites des methodes existantes, la solution proposee, la methodologie adoptee et la planification generale. Il etablit les fondations necessaires pour aborder la conception globale du projet.

---

# Chapitre 2 : Lancement et conception du projet

## 2.1 Introduction

Ce chapitre transforme le contexte general en specifications fonctionnelles et techniques. Il identifie les acteurs de la plateforme, detaille les besoins fonctionnels et non fonctionnels, presente l'environnement materiel, expose l'architecture logique et physique, puis recense les technologies utilisees.

L'objectif est de construire une vision claire du systeme avant de presenter les releases de realisation.

## 2.2 Identification des acteurs

### 2.2.1 Developer

Le Developer ecrit le code, cree des branches, ouvre des pull requests et consulte les retours generes par la plateforme. Il applique les corrections, repond aux commentaires et peut relancer une analyse apres modification de la PR.

### 2.2.2 Reviewer / Tech Lead

Le Reviewer ou Tech Lead supervise les decisions de review. Il consulte les findings, examine les PR complexes, valide ou invalide les remarques de l'IA, applique les decisions finales et contribue a l'amelioration continue des regles et templates.

### 2.2.3 Admin

L'Admin configure la plateforme, gere les utilisateurs, les roles, les organisations, les integrations GitHub/Jira/Slack/Teams, la base de connaissances, le monitoring, la securite et le deploiement.

## 2.3 Besoins fonctionnels

### 2.3.1 Analyse et revue automatique

Le systeme doit recevoir un diff Git via webhook ou API, parser le format unified diff, detecter les fichiers et lignes modifies, scanner les secrets, executer l'analyse statique et produire une revue intelligente structuree. Chaque finding doit etre rattache a une ligne ou a un fichier lorsque cela est possible.

Le systeme doit egalement produire un resume lisible de la pull request, classifier le changement, attribuer une severite, generer des suggestions et eviter la duplication des commentaires.

### 2.3.2 Base de connaissances et RAG

Le systeme doit permettre l'ingestion de documents techniques, de standards internes, de fichiers Markdown, de PDF, de documents projet, de code source ancien et de contenus issus d'outils comme Jira. Ces informations doivent etre decoupees, vectorisees, indexees et reutilisees lors de l'analyse.

Le retrieval doit etre limite au perimetre du projet lorsque c'est necessaire, afin d'eviter d'injecter du contexte non pertinent.

### 2.3.3 Dashboard, collaboration et notifications

La plateforme doit fournir des vues adaptees aux roles. Le Developer doit consulter ses pull requests, ses analyses et les retours. Le Tech Lead doit disposer d'une review queue, de decisions de review, de templates et d'indicateurs. L'Admin doit acceder a la configuration generale.

Le systeme doit supporter les notifications in-app, email, Slack, Teams et mobile selon les evenements critiques.

### 2.3.4 Administration et securite

Le systeme doit gerer l'authentification via Clerk, la synchronisation des roles, le RBAC, la verification des webhooks GitHub, le chiffrement des secrets, l'audit log et la journalisation des actions importantes.

## 2.4 Besoins non fonctionnels

### 2.4.1 Performance

Le pipeline doit rester compatible avec un usage professionnel. Les temps de reponse API doivent etre raisonnables et les analyses doivent etre executees en tache asynchrone pour ne pas bloquer l'interface.

### 2.4.2 Securite

Les secrets presents dans les diffs doivent etre detectes et masques avant tout traitement par LLM. Les communications publiques doivent etre securisees par HTTPS. Les roles doivent limiter les actions accessibles selon le profil utilisateur.

### 2.4.3 Maintenabilite

L'architecture doit rester modulaire, separee en couches API, Core, Data et Workers. Cette separation facilite les tests, l'evolution et la maintenance.

### 2.4.4 Scalabilite

L'utilisation de Celery, Redis, Docker, PostgreSQL et Neo4j permet de preparer la plateforme a des charges plus importantes. L'indexation incrementale et les caches reduisent les traitements inutiles.

## 2.5 Environnement materiel

Le developpement a ete realise sur une machine Windows 11 equipee d'un processeur Intel Core i7 de 11e generation, 32 GB de RAM, un SSD de 512 GB et un HDD de 1 TB. Cette configuration permet d'executer le backend, le dashboard, Docker Desktop et les services de developpement.

En production, la plateforme est prevue pour etre deployee sur un VPS OVH avec au minimum 2 vCPU, 4 GB de RAM, 50 GB de stockage SSD et une bande passante suffisante pour exposer l'application.

## 2.6 Architecture logique

L'architecture logique se compose de plusieurs couches. La couche frontend est assuree par le dashboard Next.js et l'application mobile. La couche API est assuree par FastAPI. La couche metier contient les modules d'analyse, de review, de retrieval, de generation et d'orchestration. La couche workers execute les analyses longues avec Celery. La couche donnees inclut PostgreSQL, Redis, Neo4j, MinIO et les stores de contexte.

Cette architecture separe les responsabilites et rend possible l'evolution independante des modules.

## 2.7 Architecture physique

L'architecture physique repose sur des conteneurs Docker. En production, les services sont deployes sur un VPS et organises en plusieurs couches : infrastructure, backend et frontend. Nginx expose les services via des sous-domaines HTTPS. Certbot fournit les certificats TLS. Prometheus et Grafana assurent le monitoring.

## 2.8 Diagramme de classes global

Le diagramme de classes global represente les principales entites du systeme : User, Role, Permission, Organization, Project, Repository, PullRequest, AnalysisRun, Finding, ReviewReport, ReviewDecision, KnowledgeDocument, Rule, Notification et IntegrationConfig.

Ce diagramme permet de comprendre comment les objets metier sont relies entre eux. Par exemple, une organisation contient des projets, un projet contient des repositories, un repository contient des pull requests, et une pull request peut declencher plusieurs analyses.

## 2.9 Technologies utilisees

### 2.9.1 GitHub

GitHub est la source principale des repositories, branches, commits et pull requests. Les webhooks GitHub permettent de declencher automatiquement les analyses.

### 2.9.2 Clerk

Clerk assure l'authentification, la gestion des sessions et la synchronisation des roles utilisateur entre le frontend et le backend.

### 2.9.3 FastAPI

FastAPI constitue le backend principal. Il expose les endpoints de gestion, d'analyse et d'integration.

### 2.9.4 Next.js

Next.js est utilise pour construire le dashboard web. Il fournit une interface interactive pour les developpeurs, Tech Leads et administrateurs.

### 2.9.5 Application mobile

L'application mobile complete l'experience web en permettant la consultation des PRs, notifications, resumes d'analyse et indicateurs de sante depuis un terminal mobile.

### 2.9.6 Celery et Redis

Celery execute les traitements longs en arriere-plan. Redis sert de broker de messages et de cache.

### 2.9.7 PostgreSQL

PostgreSQL persiste les donnees transactionnelles : utilisateurs, projets, analyses, findings, statuts et historiques.

### 2.9.8 Neo4j

Neo4j est utilise pour le module GraphRAG. Il stocke le graphe de code, les relations entre entites et les embeddings vectoriels.

### 2.9.9 LangGraph

LangGraph orchestre les etapes de l'analyse IA, notamment l'indexation, le parsing, le retrieval, la generation et la finalisation.

### 2.9.10 Ollama, OpenAI et Anthropic

La plateforme peut supporter plusieurs fournisseurs LLM. Ollama peut etre utilise localement, tandis qu'OpenAI ou Anthropic peuvent etre utilises selon les besoins de performance et de qualite.

### 2.9.11 Docker

Docker assure la containerisation des services et facilite le deploiement reproductible.

### 2.9.12 Prometheus et Grafana

Prometheus collecte les metriques. Grafana les visualise dans des dashboards de monitoring.

### 2.9.13 MinIO

MinIO est utilise comme stockage objet compatible S3 pour les artefacts, rapports et fichiers volumineux.

### 2.9.14 Jira, Slack, Teams et SendGrid

Ces integrations permettent de connecter la plateforme a l'ecosysteme professionnel : tickets, notifications, alertes et emails.

## 2.10 Conclusion

Ce chapitre a defini les acteurs, les besoins, l'architecture et les technologies. Il prepare la presentation des releases, qui decrivent la realisation progressive de la plateforme.

---

# Release 1 : Application web et mobile

## Introduction de la Release 1

La premiere release construit le socle fonctionnel visible de la plateforme. Elle couvre l'authentification, les roles, les organisations, les projets, les repositories, les pull requests, les analyses, le workflow de review, le pilotage, les integrations et l'experience mobile.

Cette release est organisee en trois sprints. Le premier sprint concerne l'acces et le workspace. Le deuxieme sprint porte sur les analyses IA visibles et le workflow de review. Le troisieme sprint finalise le pilotage, les integrations et l'application mobile.

## Sprint 1 : Gestion des acces, du workspace et des repositories

### Introduction du sprint

Ce sprint etablit les fondations fonctionnelles du systeme. Il couvre l'inscription, la connexion, la synchronisation des roles, la creation des organisations, la creation des projets, l'import des repositories GitHub et la consultation des fiches projet/repository.

Sans cette structure organisationnelle, les modules d'analyse ne peuvent pas fonctionner correctement, car chaque analyse doit etre rattachee a un projet, un repository, une organisation et un utilisateur.

### Specification fonctionnelle

Le systeme doit permettre l'inscription et la connexion via Clerk. Apres authentification, l'utilisateur doit etre synchronise avec le backend et redirige selon son role : Developer, Tech Lead ou Admin.

L'Admin doit pouvoir creer ou importer une organisation, detecter les collaborateurs GitHub, inviter des membres et gerer les roles. Un projet doit etre cree uniquement dans une organisation existante. Un repository doit etre importe uniquement dans un projet existant.

Le systeme doit afficher les informations de contexte : branches, equipes associees, langage principal, nombre de commits, statut, health score, description, date de derniere analyse et etat de l'auto-analyse.

### Analyse des cas d'utilisation

Le cas d'utilisation principal commence par l'ouverture de la plateforme. L'utilisateur s'authentifie via Clerk. Le backend verifie la session, synchronise le role et applique le RBAC. Ensuite, selon son profil, l'utilisateur accede a l'espace adapte.

L'Admin peut creer l'organisation, le projet et importer un repository. Le Developer ou le Tech Lead peut ensuite consulter la fiche du projet et du repository.

Les scenarios alternatifs incluent l'echec de connexion, une session expiree, un role manquant, une organisation absente, des droits GitHub insuffisants ou une tentative d'acces a une ressource interdite.

### Conception

La conception du sprint repose sur un diagramme de cas d'utilisation, un diagramme de classes, un diagramme de sequence et un diagramme d'activite.

Le diagramme de classes regroupe les entites User, Role, Permission, ClerkIdentity, Organization, Project, Repository, Branch et Team. La relation principale impose la hierarchie Organization -> Project -> Repository.

Le diagramme de sequence illustre le parcours depuis la connexion Clerk jusqu'a la creation du workspace. Le diagramme d'activite decrit le chemin fonctionnel : authentification, redirection, organisation, projet, repository et consultation.

### Realisation des interfaces

Les principales interfaces realisees sont l'ecran d'inscription et de connexion, la page de redirection selon le role, l'ecran d'erreur d'acces, le dashboard initial, la gestion des utilisateurs, l'ecran de creation/import d'organisation, la gestion des equipes, la creation de projet, l'assistant d'import GitHub et la fiche detaillee projet/repository.

Chaque interface a pour objectif de rendre le workflow lisible et securise. Le developpeur doit comprendre rapidement son contexte de travail. L'Admin doit pouvoir structurer l'espace de l'organisation sans passer par des manipulations techniques.

### Tests

Les tests attendus portent sur la connexion par role, le refus d'acces aux routes interdites, la redirection correcte, la synchronisation entre Clerk, backend et GitHub, la creation d'organisation, l'import d'organisation GitHub, la creation de projet, l'import de repository et l'affichage coherent des metadonnees.

### Conclusion du sprint

Ce sprint pose le socle operationnel de la plateforme. Il garantit que chaque acteur accede au bon espace avec le bon niveau de droit et dans un workspace coherent.

## Sprint 2 : Gestion des analyses IA et du workflow de review

### Introduction du sprint

Apres la mise en place du workspace, le deuxieme sprint couvre le coeur fonctionnel visible de la plateforme : pull requests, analyses IA, rapport intelligent, diff annote, commentaires inline et decisions de review.

### Specification fonctionnelle

Le systeme doit afficher une liste centralisee de toutes les pull requests, avec des statuts tels que Draft, Waiting, Approved, Return et Needs review. Il doit permettre d'ouvrir une PR, de lancer une analyse, de suivre son statut et de consulter le rapport.

Le rapport doit presenter un resume, un risque global, des findings principaux, des suggestions IA et un diff annote. Le Tech Lead doit disposer d'une review queue, de priorites, d'assignations et de decisions telles que approve, block, return ou assign.

### Analyse des cas d'utilisation

Le Developer consulte une PR, lance une analyse IA, lit le rapport et visualise le diff annote. Le Tech Lead traite la review, priorise les findings, ajoute des commentaires, approuve ou demande des changements.

Les scenarios alternatifs incluent une PR introuvable, une analyse en echec, un timeout du moteur IA, un rapport indisponible ou des droits insuffisants.

### Conception

Le diagramme de classes du sprint modelise les entites PullRequest, AnalysisRun, ReviewReport, Finding, AnnotatedDiff, InlineComment, AISuggestion, ReviewDecision et ReviewTemplate.

Le diagramme de sequence montre le parcours d'analyse : ouverture de la PR, lancement de l'analyse, creation d'une execution, generation des findings, structuration du rapport, consultation par le Developer et decision par le Tech Lead.

Le diagramme d'activite presente le cycle complet : consultation, filtrage, analyse, rapport, correction assistee, review et historisation.

### Realisation des interfaces

Les interfaces a realiser sont la page All PRs, les filtres d'etat, la page detail PR, le bouton de lancement d'analyse, la liste des analyses, le detail d'analyse, le statut temps reel, le rapport structure, la vue diff annote, le composant de commentaire, le panneau de suggestions IA, la review queue, le panneau de decision Tech Lead et la timeline de review.

### Tests

Les tests verifient l'affichage des PRs, le filtrage par statut, l'ouverture du detail, le lancement d'analyse, les statuts queued/running/completed/failed, la generation du rapport, l'affichage des findings, l'ajout de commentaires inline et l'application des decisions Tech Lead.

### Conclusion du sprint

Ce sprint construit le coeur fonctionnel de la plateforme. Il relie GitHub, l'analyse, le rapport, le diff annote et le workflow de decision humaine.

## Sprint 3 : Pilotage, integrations et experience mobile

### Introduction du sprint

Le troisieme sprint finalise la partie produit. Il ajoute les analytics, l'administration avancee, les integrations, la base de connaissances simplifiee, les notifications, l'application mobile et l'observabilite fonctionnelle.

### Specification fonctionnelle

Le systeme doit fournir des analytics d'equipe et personnels, des tendances d'activite, des SLA, des indicateurs de workload, des tableaux d'administration, une gestion des integrations, une Knowledge Base simplifiee, des notifications et une experience mobile.

Il doit aussi permettre la consultation de l'historique, l'export simplifie, le partage de rapport et la synchronisation entre web et mobile.

### Analyse des cas d'utilisation

L'Admin configure les integrations, les utilisateurs, les roles, les organisations et la Knowledge Base. Le Tech Lead consulte les analytics et les alertes. Le Developer consulte ses notifications et ses indicateurs depuis le web ou le mobile.

### Conception

Le diagramme de classes regroupe les entites AnalyticsDashboard, EngineeringMetric, AdminDashboard, IntegrationConfig, JiraConfig, KnowledgeBase, RAGEvaluation, NotificationPreference, NotificationEvent, MobileSession et ObservabilityMetric.

Le diagramme de sequence illustre un scenario professionnel complet : configuration Jira, activation de la Knowledge Base, consultation des analytics, reception d'alertes et synchronisation mobile.

### Realisation des interfaces

Les interfaces incluent le dashboard analytics equipe, le dashboard personnel, l'ecran SLA, leaderboard et workload, les insights engineering, l'export CSV, le dashboard admin, les integrations, Jira, Knowledge Base, evaluation RAG, observability, centre de notifications, application mobile et centre d'activite.

### Tests

Les tests portent sur l'affichage des analytics, la configuration des integrations, la reception des notifications, la consultation mobile, la synchronisation des donnees et l'acces selon les roles.

### Conclusion du sprint

Ce sprint donne de la profondeur a la plateforme. Il la rend exploitable dans un contexte professionnel avec plusieurs acteurs, plusieurs outils, plusieurs canaux et un suivi operationnel.

## Conclusion de la Release 1

La Release 1 fournit la base fonctionnelle web et mobile de Devora. Elle met en place les utilisateurs, les roles, les organisations, les projets, les repositories, les pull requests, les analyses visibles, les dashboards, les integrations et l'experience mobile. Elle prepare directement la Release 2, qui porte sur le coeur IA et GraphRAG.

---

# Release 2 : Intelligence artificielle, RAG, GraphRAG et analyse intelligente du code

## Introduction de la Release 2

La Release 2 regroupe toute la partie intelligence artificielle du projet. Elle fusionne les elements d'etat de l'art, de conception, de realisation, de demonstration et d'evaluation lies aux LLM, au RAG, au GraphRAG, aux embeddings, au chunking, a Neo4j, au prompt engineering et a l'orchestration de l'analyse intelligente.

L'objectif de cette release est d'expliquer comment la plateforme passe d'un simple workflow de review a un moteur d'analyse contextuelle capable de comprendre le diff, recuperer le bon contexte, appliquer les regles internes et produire des findings traçables.

## Positionnement de la Release 2 dans le rapport

Cette release remplace les anciens chapitres separes consacres a l'etat de l'art IA, au moteur GraphRAG et a la demonstration finale. Elle les fusionne dans un seul bloc coherent :

- fondements IA, RAG et GraphRAG ;
- conception de la base de connaissances et du graphe ;
- realisation de l'indexation, du retrieval et de la generation ;
- orchestration dans le workflow PR ;
- tests, scenario complet, limites et perspectives.

## 2.1 Fondements de la revue de code intelligente

### Analyse statique classique

L'analyse statique examine le code sans l'executer. Elle permet de detecter des problemes de style, des patterns dangereux, des erreurs syntaxiques ou des vulnerabilites connues. Dans notre plateforme, elle reste importante car elle produit des signaux objectifs et rapides.

Cependant, elle ne comprend pas naturellement le contexte du repository. Elle ne sait pas toujours pourquoi un changement est introduit, quelles dependances sont touchees ni quelles regles internes doivent etre appliquees.

### Apport des LLM

Les modeles de langage apportent une capacite de synthese, d'explication et de generation de suggestions. Ils peuvent produire des commentaires proches du langage humain, expliquer un risque et proposer une correction.

Mais un LLM utilise seul peut halluciner, inventer des fichiers, surestimer un risque ou produire un finding non justifie. C'est pourquoi il doit etre ancre dans un contexte fiable.

### Limites des approches purement LLM

Une approche purement LLM n'est pas suffisante pour une revue de code professionnelle. Elle manque de traçabilite, depend fortement du prompt et ne garantit pas la coherence avec les regles internes du projet.

La plateforme adopte donc une approche hybride : l'analyse statique produit des signaux formels, le retrieval fournit le contexte, le graphe structure les relations et le LLM genere une reponse finale encadree.

## 2.2 Modeles de langage, tokens et contexte

### Notion de token

Un token est une unite de texte traitee par un LLM. Le diff, les regles, les documents, les chunks de code et les instructions du prompt consomment tous des tokens. Cette contrainte impose une selection stricte du contexte.

### Fenetre de contexte

La fenetre de contexte represente la quantite maximale de tokens que le modele peut traiter. Dans la revue de code, cette limite est critique car un repository complet ne peut pas etre envoye au modele. Il faut donc recuperer uniquement les elements pertinents.

### Comparaison des modeles LLM dans la plateforme

La plateforme peut fonctionner avec plusieurs fournisseurs : Ollama pour un usage local, OpenAI ou Anthropic pour des modeles cloud plus performants. Le choix depend du cout, de la latence, de la qualite de generation, du respect du JSON et de la disponibilite.

Ollama est utile en developpement local et pour garder un controle sur l'environnement. OpenAI ou Anthropic peuvent etre preferes en production lorsque la qualite de raisonnement et la stabilite de sortie sont prioritaires.

### Limites des LLM

Les limites principales sont l'hallucination, le cout, la latence, la sensibilite au prompt, la variation des resultats et la difficulte a garantir un format toujours valide. Ces limites justifient l'utilisation de guardrails, de seuils de confiance, de citations et de parsing strict.

## 2.3 RAG : principes, chunking et embeddings

### Principe du RAG

Le RAG, Retrieval-Augmented Generation, consiste a recuperer du contexte depuis une base de connaissances avant de generer une reponse avec un LLM. Il permet d'ancrer la generation dans des donnees externes au modele.

Dans notre projet, le RAG est utilise pour recuperer du code, des regles, des documents techniques, des standards internes et des informations de contexte.

### Pipeline RAG classique

Le pipeline RAG suit generalement ces etapes : collecte des documents, decoupage en chunks, generation des embeddings, stockage vectoriel, recherche des chunks pertinents, assemblage du contexte et generation finale par LLM.

### Limites du RAG simple

Le RAG simple est utile mais insuffisant pour le code. Il recupere des fragments proches semantiquement, mais il ne comprend pas toujours les imports, les appels de fonctions, les dependances entre fichiers ou les relations de projet.

Cette limite est structurante dans notre projet, car le code source n'est pas une collection plate de documents : c'est un graphe de dependances.

## 2.4 Strategies de chunking

### Chunking de code source

Le code source doit etre decoupe en respectant les frontieres logiques : fonctions, classes, modules et blocs coherents. Un chunk trop grand consomme trop de tokens ; un chunk trop petit perd son sens.

Dans la plateforme, le chunking du code vise a produire des fragments exploitables par le retrieval et a conserver les metadonnees utiles : fichier, lignes, symbole, type de chunk et langage.

### Chunking AST / code-aware

Le chunking AST ou code-aware exploite la structure syntaxique du code. Il evite de couper une fonction au milieu et preserve davantage la coherence. Cette strategie est preferable a un simple decoupage par caracteres pour l'analyse de code.

### Chunking Markdown

Les fichiers Markdown sont decoupes selon les titres, sections et paragraphes. Cela permet de conserver la coherence documentaire des guides, README et standards internes.

### Chunking PDF

Les PDF doivent etre decoupes par sections ou blocs textuels apres extraction du contenu. Leur traitement demande plus de nettoyage que le Markdown, car la structure peut etre moins fiable.

### Chunking Jira

Les tickets Jira peuvent etre decoupes selon titre, description, commentaires, statut, priorite et liens avec le projet. Leur valeur vient de l'historique fonctionnel et des decisions passees.

### Chunking pages web

Les pages web techniques doivent etre nettoyees pour retirer le bruit de navigation, puis decoupees par sections significatives.

### Comparaison des strategies

Chaque type de contenu necessite une strategie adaptee. Le code demande un decoupage structurel. La documentation demande un decoupage par sections. Les tickets demandent une approche semi-structuree. Les pages web demandent un nettoyage prealable.

## 2.5 Strategies d'embedding

### Embeddings pour le code

Les embeddings de code permettent de rechercher des fragments proches d'un diff ou d'une fonction modifiee. Ils sont utiles lorsque les noms exacts ne suffisent pas ou lorsque le lien semantique est plus fort que le lien lexical.

### Embeddings pour les documents

Les documents techniques, standards et guides internes sont vectorises afin d'etre recuperes lors de l'analyse. Leur role est d'apporter des regles et explications non presentes directement dans le code.

### Embeddings pour les regles

Les regles de la base de connaissances ont une priorite particuliere. Elles doivent etre facilement recuperables, car elles servent a ancrer les findings dans des contraintes organisationnelles.

### Choix du modele d'embedding

Le choix du modele d'embedding depend de la qualite de similarite, de la dimension des vecteurs, du cout, de la vitesse et de la compatibilite avec Neo4j. Dans le projet, les embeddings sont utilises pour alimenter la recherche vectorielle native.

## 2.6 Knowledge graph et carte de connaissances

### Knowledge graph

Un knowledge graph represente des entites et leurs relations. Dans notre plateforme, il permet de structurer les informations liees au repository, aux fichiers, aux fonctions, aux chunks, aux regles, aux documents et aux analyses.

### Carte de connaissances du projet

La carte de connaissances de la plateforme relie plusieurs niveaux : Organization, Project, Repository, File, Module, Class, Function, Chunk, Rule, KnowledgeDocument, AnalysisRun et Finding.

Cette carte sert de base au GraphRAG, car elle donne au systeme une vision relationnelle du projet.

### Graphe de code

Le graphe de code represente explicitement les relations `CONTAINS`, `DEFINES`, `IMPORTS`, `CALLS`, `DEPENDS_ON` et `CHUNKED_FROM`. Ces relations permettent d'explorer l'impact d'un changement et d'enrichir le contexte fourni au LLM.

## 2.7 GraphRAG

### Definition

GraphRAG combine le RAG classique avec un graphe de connaissances. Il associe recherche vectorielle, recherche par symboles et parcours de graphe.

### Difference entre RAG et GraphRAG

Le RAG recupere des documents proches. Le GraphRAG recupere aussi les voisins structurels, les dependances et les chemins utiles. Cette difference est essentielle dans l'analyse de code, ou les relations sont aussi importantes que le contenu textuel.

### Pourquoi GraphRAG dans notre projet

Le choix du GraphRAG est motive par la nature structuree du code. Un changement dans une fonction peut impacter un autre fichier, une classe dependante ou un composant appele indirectement. Le graphe permet de capturer cette realite.

### Comparaison RAG simple vs GraphRAG

Le RAG simple est plus facile a mettre en place mais moins structure. Le GraphRAG demande une construction plus complexe, mais il offre une meilleure traçabilite, un retrieval plus riche et un meilleur support du raisonnement multi-hop.

## 2.8 Neo4j dans la Release 2

### Role de Neo4j

Neo4j est utilise comme base graphe et comme support de recherche vectorielle native. Il permet de stocker les noeuds, relations, embeddings et historiques d'analyse.

### Modele de graphe

Le modele contient les entites principales du repository et de la base de connaissances : Organization, Project, Repository, File, Module, Class, Function, Chunk, Rule, KnowledgeDocument, AnalysisRun, Finding, Comment et Suggestion.

### Relations du graphe

Les relations principales sont `CONTAINS`, `DEFINES`, `IMPORTS`, `CALLS`, `DEPENDS_ON`, `CHUNKED_FROM`, `HAS_FINDING`, `HAS_COMMENT`, `HAS_SUGGESTION`, `REFERENCES` et `HAS_HISTORY`.

### Recherche vectorielle native

Neo4j permet d'interroger les chunks, regles et documents via des index vectoriels. Cela evite de separer completement graphe et vector store.

### Mise a jour incrementale

La mise a jour incrementale permet d'eviter une reindexation complete du repository. Lorsqu'une PR modifie certains fichiers, seuls les chunks et relations concernes peuvent etre recalcules.

## 2.9 Prompt engineering et guardrails

### Role du prompt

Le prompt structure le travail du LLM. Il fixe le role du modele, les priorites, les contraintes, le format de sortie et le perimetre de raisonnement.

### Structure du prompt final

Le prompt final peut etre organise en plusieurs blocs : instruction systeme, regles KB prioritaires, contexte graphe, contexte repository, findings statiques, diff a analyser et format JSON attendu.

### Priorite du contexte

La priorite retenue est : regles KB, documents KB, graphe, repository, findings statiques. Cette hierarchie permet de donner plus de poids aux regles explicites qu'aux simples fragments contextuels.

### Chain-of-Thought et auto-critique

Ces techniques sont importantes dans l'etat de l'art, mais elles doivent etre presentees avec precision. Si elles ne sont pas pleinement implementees, elles doivent etre mentionnees comme principes de conception ou perspectives, et non comme fonctionnalites deja industrialisees.

### Guardrails anti-hallucination

Les guardrails imposent des contraintes : pas de fichiers inventes, sortie JSON uniquement, references obligatoires lorsque possible, seuils de confiance, suppression ou degradation des findings non ancrés.

## 2.10 Sprint 1 de la Release 2 : Indexation du repository et construction du graphe

### Introduction du sprint

Ce sprint construit la base technique du GraphRAG. Il transforme le repository en une representation exploitable par le moteur de retrieval.

### Besoins fonctionnels

Le systeme doit importer ou acceder au repository, identifier les fichiers source, decouper le code en chunks, generer des embeddings, creer les noeuds Neo4j et construire les relations de dependance.

### Besoins non fonctionnels

L'indexation doit etre incrementale, traçable, compatible avec des repositories volumineux et eviter les recalculs inutiles.

### Conception

L'architecture d'indexation comprend `RepoContextManager`, `CodeChunker`, `EmbeddingGenerator`, `GraphBuilder`, `GraphManager` et `Neo4jClient`.

Le flux est le suivant : repository -> scan fichiers -> chunking -> embeddings -> upsert chunks -> construction du graphe -> mise a jour des metadonnees.

### Realisation

Le service `RepoContextManager` orchestre l'indexation complete ou incrementale. Le `CodeChunker` produit les fragments de code. L'embedder calcule les vecteurs. Le `GraphBuilder` cree les noeuds de fonctions et classes, puis extrait les relations `CALLS`, `IMPORTS` et `DEPENDS_ON`. Neo4j stocke les resultats.

### Tests

Les tests portent sur l'indexation d'un nouveau repository, la mise a jour incrementale, la presence des noeuds Neo4j, la coherence des relations et la disponibilite des embeddings.

### Conclusion du sprint

Ce sprint transforme le repository en graphe de connaissances. Il constitue la base indispensable pour la recherche GraphRAG.

## 2.11 Sprint 2 de la Release 2 : Recherche hybride et generation des findings

### Introduction du sprint

Ce sprint exploite le graphe et les embeddings pour recuperer le contexte utile a partir d'un diff, puis generer des findings par LLM.

### Besoins fonctionnels

Le systeme doit analyser un diff Git, extraire les symboles, recuperer les chunks pertinents, traverser le graphe, chercher les regles KB, assembler le contexte et generer des findings avec explication, severite et suggestion.

### Besoins non fonctionnels

Les resultats doivent etre traçables, associes a un fichier et a une ligne lorsque possible, et limiter les hallucinations.

### Conception du retrieval hybride

La recuperation s'effectue en plusieurs couches :

- recherche par symboles extraits du diff ;
- recherche vectorielle sur les chunks de code ;
- expansion multi-hop dans Neo4j ;
- recherche dans les regles KB ;
- recherche dans les documents KB ;
- fusion, scoring et re-ranking.

### Assemblage du contexte

Le contexte final est assemble avec une priorite claire : KB Rules > KB Docs > Graph Context > Repository Context > Static Findings. Ce choix protege le systeme contre les interpretations non ancrees.

### Realisation

Le `HybridRetriever` et le `GraphRAGRetriever` recuperent le contexte. La recherche vectorielle interroge Neo4j. La recherche par symboles retrouve les chunks lies aux identifiants du diff. L'expansion graphe recupere les voisins. Le service de generation construit le prompt et appelle le LLM.

### Normalisation JSON

Les sorties du LLM sont parsees et normalisees. Les findings invalides, dupliques ou trop peu confiants sont ecartes ou marques comme faibles.

### Suggestions de correction

Le systeme peut proposer des suggestions de correction ou auto-fix lorsque le contexte est suffisamment precis. Ces suggestions restent soumises a validation humaine.

### Tests

Les tests couvrent un diff simple, un diff avec dependances entre fichiers, la priorite des regles KB, la generation JSON, la robustesse en cas d'indisponibilite du LLM et la coherence des references.

### Conclusion du sprint

Ce sprint apporte l'intelligence contextuelle centrale de la plateforme. Le systeme ne se contente plus de detecter des problemes ; il les explique a partir d'un contexte structure.

## 2.12 Sprint 3 de la Release 2 : Orchestration AI, historique, scenario A-Z et evaluation

### Introduction du sprint

Le troisieme sprint industrialise le moteur IA dans le workflow de la plateforme. Il relie l'analyse GraphRAG aux pull requests, aux taches asynchrones, a l'historique, au dashboard et a la boucle de feedback.

### Besoins fonctionnels

Le systeme doit declencher l'analyse depuis la plateforme ou depuis GitHub, parser le diff, scanner les secrets, lancer l'orchestrateur, sauvegarder les findings, historiser les runs, comparer les analyses et permettre la reanalyse apres mise a jour de la PR.

### Orchestration

La tache Celery `run_graphrag_analysis_pipeline` coordonne le traitement. Elle charge l'analyse, verifie son etat, parse le diff, execute le secret scan, demarre un `AnalysisRun`, appelle l'orchestrateur GraphRAG/LangGraph, persiste les findings et complete l'historique.

### LangGraph pipeline

Le pipeline LangGraph organise l'analyse en noeuds : index, parse, retrieve, generate et finalize. Cette structure rend le flux plus lisible et plus controlable.

### Historique des analyses

L'historique stocke les runs, les metriques et les findings. Il permet de detecter les nouveaux findings, les findings persistants, les corrections et les regressions.

### Boucle de feedback

Le feedback humain n'est pas obligatoirement un RLHF complet au sens entrainement de modele. Dans notre projet, il est plus exact de parler de boucle de feedback et de reanalyse. Le Tech Lead valide, corrige ou ignore certains findings. Ces retours peuvent ensuite enrichir les regles, templates ou bases de connaissances.

### Scenario complet A-Z

Le scenario complet commence par la configuration de la plateforme. L'Admin cree l'organisation, les projets, les equipes et les integrations. Le repository est connecte puis indexe. Le developpeur cree une branche, pousse des commits et ouvre une pull request. GitHub emet un webhook ou la plateforme declenche l'analyse depuis l'interface.

Le diff est parse, les secrets sont scannes et rediges, l'indexation incrementale est declenchee si necessaire, puis le retrieval GraphRAG recupere les chunks, regles, documents et voisins du graphe. Le LLM genere ensuite des findings structures. Les resultats sont sauvegardes, affiches dans le dashboard et consultes par le Tech Lead.

Apres correction, la PR est mise a jour. Une nouvelle analyse peut comparer les resultats avec le run precedent. Le Tech Lead prend alors une decision : approuver, demander des changements, assigner ou bloquer.

### Captures a integrer

Cette partie doit inclure les captures du dashboard, de la liste des PRs, du detail d'analyse, des findings, du diff annote, des templates Tech Lead, de l'historique et eventuellement de Neo4j si disponible.

Chaque capture doit etre accompagnee d'une explication : ce que l'on voit, pourquoi cette vue est utile et quel element du workflow elle valide.

### Evaluation qualitative

L'evaluation doit porter sur la qualite des findings, la traçabilite, la reduction des hallucinations, l'integration au workflow PR, la robustesse en cas d'erreur et la valeur pour le Tech Lead.

### RAGAS et metriques

RAGAS peut etre presente comme une reference d'evaluation dans l'etat de l'art ou comme perspective si l'evaluation n'est pas completement implementee. Les metriques pertinentes sont le context recall, la faithfulness et l'answer relevancy.

Si ces metriques ne sont pas calculees dans le projet, il faut les presenter comme cadre potentiel d'evaluation, pas comme resultat obtenu.

### Limites

Les limites principales sont la dependance a la qualite du graphe, les couts LLM, la latence, les erreurs possibles de parsing, les limites de la fenetre de contexte et la difficulte de prouver parfaitement l'absence d'hallucination.

### Perspectives

Les perspectives incluent l'enrichissement de la base de connaissances, l'amelioration du chunking, le support de nouveaux modeles, une evaluation RAGAS formalisee, une meilleure exploitation des retours Tech Lead et une boucle de feedback plus avancee.

### Conclusion du sprint

Ce sprint montre que l'IA n'est pas un module isole. Elle est integree au workflow produit, historisee, controlee et exploitable par les acteurs de la plateforme.

## Conclusion de la Release 2

La Release 2 apporte le coeur intelligent de Devora. Elle transforme la revue de code en un processus augmente par le contexte, les graphes, les embeddings et les LLM.

Contrairement a une analyse statique classique, le systeme ne se limite pas a detecter des erreurs locales. Il construit une representation du repository, recupere le contexte pertinent, applique les regles de la base de connaissances et genere des findings plus contextualises.

La valeur principale de cette release reside dans la combinaison entre automatisation, traçabilite, supervision humaine et integration au workflow de pull request.

---

# Release 3 : Deploiement VPS, HTTPS, monitoring et CI/CD

## Introduction de la Release 3

La Release 3 couvre la mise en production de la plateforme. Elle transforme l'application developpee localement en une solution deployee sur un VPS, exposee en HTTPS, surveillee et redployable automatiquement.

Cette release est organisee en deux sprints :

- Sprint 1 : containerisation et publication des images Docker ;
- Sprint 2 : deploiement VPS, HTTPS, monitoring et CI/CD.

## Sprint 1 : Containerisation et publication des images Docker

### Introduction du sprint

Ce sprint prepare le projet pour un deploiement reproductible. Le backend FastAPI et le frontend Next.js sont transformes en images Docker, versionnees et publiees sur Docker Hub.

### Architecture globale du deploiement

La plateforme finale repose sur un VPS Ubuntu, un domaine principal, plusieurs sous-domaines, un reseau Docker commun, trois couches de deploiement, Nginx comme reverse proxy, Certbot pour HTTPS et GitHub Actions pour la CI/CD.

### Besoins fonctionnels

Le systeme doit preparer le poste de developpement, creer l'organisation GitHub, organiser les depots backend, frontend et infra, ajouter les Dockerfiles, construire les images et les publier sur Docker Hub.

### Besoins non fonctionnels

Les images doivent etre portables, reproductibles et ne pas contenir de secrets. Le backend doit exposer une route `/healthz` pour le healthcheck et `/metrics` pour Prometheus. Le frontend doit etre compile avec les URLs publiques de production.

### Cas d'utilisation principal

Le developpeur prepare les Dockerfiles, construit les images, les tague avec `1.0.0` et `latest`, puis les publie sur Docker Hub. A la fin, les images sont disponibles et pretes a etre deployees sur le VPS.

### Conception

La conception inclut un diagramme de cas d'utilisation, un diagramme de classes, des diagrammes de sequence pour le build/push backend et frontend, ainsi qu'un diagramme d'activite du sprint.

### Realisation

La realisation inclut la verification de Git et Docker Desktop, la creation du Dockerfile backend, la creation du Dockerfile multi-stage frontend, l'organisation GitHub, le login Docker Hub, le build des images et leur publication.

### Tests

Les tests valident la construction des images, leur presence sur Docker Hub, le respect des tags et la possibilite de les recuperer depuis une autre machine.

### Conclusion du sprint

Le Sprint 1 de la Release 3 produit les artefacts necessaires au deploiement. Le backend et le frontend deviennent disponibles sous forme d'images Docker versionnees.

## Sprint 2 : Deploiement VPS, HTTPS, monitoring et CI/CD

### Introduction du sprint

Ce sprint regroupe le provisionnement du VPS, l'exposition HTTPS, le monitoring, la securite et le deploiement automatique. L'objectif est de livrer une plateforme accessible en production.

### Besoins fonctionnels

Le systeme doit preparer le VPS Ubuntu, installer Docker, Docker Compose, Nginx, Certbot et UFW, creer la structure `/opt/ai-review`, deployer l'infrastructure, deployer le backend, le worker, le frontend et YJS, configurer les DNS OVH, configurer Nginx/HTTPS, activer Prometheus/Grafana et mettre en place GitHub Actions.

### Besoins non fonctionnels

Les services doivent communiquer via le reseau Docker interne. Les donnees doivent etre persistantes via des volumes. Seuls les ports publics 22, 80 et 443 doivent rester ouverts. Les services sensibles doivent etre proteges. Le monitoring doit suivre l'etat CPU, memoire, conteneurs et API.

### Cas d'utilisation principal

L'administrateur prepare le VPS, cree les fichiers Docker Compose, lance les services, configure Nginx, active HTTPS avec Certbot, met en place Prometheus/Grafana et configure GitHub Actions.

### Conception

La conception conserve les diagrammes de cas d'utilisation, de classes, de sequence et d'activite lies au provisionnement VPS, au lancement des services, a Nginx/Certbot et a la CI/CD.

### Configuration DNS OVH

Les sous-domaines `app`, `api`, `yjs`, `pgadmin`, `qdrant`, `minio`, `storage`, `grafana` et `flower` pointent vers l'adresse IP du VPS.

### Preparation du VPS

Le VPS est prepare via SSH. Les paquets de base, Docker, Nginx, Certbot et UFW sont installes. Le firewall autorise uniquement SSH, HTTP et HTTPS.

### Structure du projet sur le VPS

La structure `/opt/ai-review` separe les dossiers `infra`, `backend` et `frontend`. Cette organisation facilite la maintenance et le redeploiement.

### Configuration Docker Compose

Trois fichiers Compose structurent le deploiement :

- infrastructure : PostgreSQL, Redis, Qdrant, Neo4j, MinIO, pgAdmin, Prometheus, Grafana, cAdvisor, node-exporter et Flower ;
- backend : API FastAPI et worker Celery ;
- frontend : dashboard Next.js et service YJS.

### Lancement des services

Les services sont lances dans l'ordre : infrastructure, backend, puis frontend. Les commandes `docker compose up -d` et `docker ps` permettent de verifier leur etat.

### Configuration Nginx

Nginx joue le role de reverse proxy. Il redirige chaque sous-domaine vers le service local correspondant. Les ports internes sont lies a `127.0.0.1` pour eviter une exposition directe.

### Certbot HTTPS

Certbot genere et installe les certificats Let's Encrypt pour les sous-domaines. Le test `certbot renew --dry-run` valide le renouvellement automatique.

### Monitoring Prometheus et Grafana

Prometheus collecte les metriques du VPS, des conteneurs Docker et de l'API. Grafana affiche les dashboards de supervision.

### CI/CD GitHub Actions

Les workflows GitHub Actions automatisent la construction des images, leur publication sur Docker Hub, la connexion SSH au VPS, le pull des nouvelles images et le redemarrage des services.

### Securite finale

Le firewall final conserve uniquement les ports 22, 80 et 443 ouverts. Les services sensibles restent proteges par Nginx, authentification, binding local ou tunnel SSH selon leur nature.

### Tests de validation finale

Les tests valident `https://app.dev-ora.tn`, `https://api.dev-ora.tn/healthz`, la configuration Nginx, les certificats Certbot, l'etat des conteneurs Docker et les dashboards de monitoring.

### Conclusion du sprint

Ce sprint transforme les images Docker en une plateforme complete en production, accessible, securisee, surveillee et automatiquement redeployable.

## Conclusion de la Release 3

La Release 3 finalise l'industrialisation du projet. Elle couvre la containerisation, le deploiement VPS, le HTTPS, le monitoring, la securite et la CI/CD. A la fin de cette release, Devora n'est plus seulement une application developpee localement : elle devient une plateforme exploitable en environnement de production.

---

# Conclusion generale du rapport

Ce projet a permis de concevoir et realiser Devora, une plateforme de revue de code intelligente integree au workflow de developpement. Le travail a commence par l'etude du contexte, l'analyse des limites de la revue de code traditionnelle et la specification des besoins.

La Release 1 a construit le socle web et mobile : authentification, workspace, repositories, pull requests, workflow de review, dashboards, integrations et experience mobile.

La Release 2 a apporte le coeur intelligent de la plateforme. Elle a introduit le RAG, le GraphRAG, Neo4j, les embeddings, le chunking, le prompt engineering, l'orchestration IA, l'historique et la reanalyse. Elle montre que l'IA devient plus fiable lorsqu'elle est ancree dans un contexte structure et traçable.

La Release 3 a permis de passer a la production avec Docker, VPS, Nginx, Certbot, Prometheus, Grafana et GitHub Actions.

L'ensemble du projet montre qu'une revue de code moderne ne doit pas opposer humain et IA. La meilleure approche consiste a automatiser les controles repetitifs, fournir un contexte riche, generer des suggestions utiles et laisser la decision finale au Tech Lead.

# Annexes recommandees

## Annexe A : Diagrammes UML du Chapitre 1 et Chapitre 2

Cette annexe peut regrouper les diagrammes globaux de cas d'utilisation, classes, sequence et activite.

## Annexe B : Interfaces de la Release 1

Cette annexe peut contenir les captures web et mobile : login, dashboard, All PRs, detail PR, analyses, review queue, analytics et mobile.

## Annexe C : Schema Neo4j et requetes Cypher

Cette annexe peut documenter les noeuds, relations, contraintes, index vectoriels et exemples de requetes.

## Annexe D : Prompt final GraphRAG

Cette annexe peut presenter une version anonymisee du prompt final utilise pour la generation des findings.

## Annexe E : Exemple de sortie JSON

Cette annexe peut montrer un exemple de finding structure avec severite, message, fichier, ligne, evidence et suggestion.

## Annexe F : Deploiement VPS

Cette annexe peut regrouper les fichiers Docker Compose, les configurations Nginx, les commandes Certbot, les workflows GitHub Actions et les captures de monitoring.
