# Plateforme AI Code Review
## Planification Releases & Sprints - Version executable refactorisee

Ce document est la source unique de planification produit pour les releases et sprints.

- Modele: `3 releases` avec un decoupage de sprints ajuste au perimetre reel
- Acteurs metier: `Developer`, `Tech Lead`, `Admin`
- `GraphRAG / IA` est traite comme capacite systeme transverse, pas comme acteur
- Stories signalees "a eliminer" retirees du backlog principal
- La Release 1 couvre toutes les surfaces visibles web et mobile

---

## 1) Taxonomie de pilotage

Chaque user story suit le format:

- `ID`
- `Epic/Module`
- `User story`
- `Valeur`
- `SP`
- `Dependances`
- `Criteres d'acceptation`

Definition of Done (DoD) globale:

1. Criteres d'acceptation testes.
2. API documentee et securisee par RBAC.
3. Logs et erreurs exploitables.
4. Tests unitaires et integration alignes au risque.
5. Demonstration fonctionnelle validee par l'acteur cible.

---

## 2) Acteurs metier et capacites systeme

### Acteurs metier

| Acteur | Responsabilites |
|---|---|
| Developer | Ouvrir et suivre ses PRs, lancer et consulter des analyses, travailler dans le workspace, utiliser l'editeur, consulter insights et rapports |
| Tech Lead | Gerer les revues, les analyses, l'historique, les equipes, les templates, les priorites, les dashboards de suivi |
| Admin | Gerer la plateforme, les utilisateurs, les roles, les organisations, les policies, les integrations, la knowledge base, l'observabilite |

### Capacites systeme transverses

- Traitement des analyses et restitution des rapports
- Enrichissement du contexte, suggestions et corrections IA
- Indexation de connaissances, evaluation RAG et comparaison de performance
- Notifications temps reel et multi-canaux
- Observabilite, deploiement et supervision

---

## 3) Backlog factorise

## 3.1 Epic AUTH - Authentification et controle d'acces

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-AUTH-01 | En tant que Developer, je veux m'inscrire et me connecter via Clerk | Onboarding rapide | 3 | - | Login et signup fonctionnels |
| US-AUTH-02 | En tant qu'utilisateur, je veux etre redirige vers mon dashboard selon mon role | UX coherente | 3 | US-AUTH-01 | Redirection role-based validee |
| US-AUTH-03 | En tant qu'Admin, je veux gerer les roles globaux | Gouvernance des acces | 5 | US-AUTH-01 | CRUD roles et visibilite des droits |
| US-AUTH-04 | En tant que plateforme, je veux synchroniser Clerk vers le backend | Coherence d'identite | 5 | US-AUTH-01 | Sync user, role et organisation sans erreur |
| US-AUTH-05 | En tant qu'Admin, je veux RBAC applique a chaque endpoint | Securite API | 8 | US-AUTH-03, US-AUTH-04 | 401 et 403 conformes sur tous les parcours critiques |

## 3.2 Epic WORKSPACE - Projets, depots, organisations, repositories

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-WS-01 | En tant que Developer, je veux importer mes depots GitHub | Mise en route projet | 5 | US-AUTH-04 | Liste des repos et import reussi |
| US-WS-02 | En tant que Developer, je veux creer un projet lie a un depot | Structuration du travail | 5 | US-WS-01 | Projet cree avec repo lie |
| US-WS-03 | En tant que Tech Lead, je veux configurer les branches cibles | Qualite ciblee | 3 | US-WS-02 | Branches configurees et persistantes |
| US-WS-04 | En tant qu'Admin, je veux gerer organisations et equipes | Multi-tenant | 8 | US-AUTH-05 | CRUD organisations, equipes et rattachements |
| US-WS-05 | En tant qu'utilisateur, je veux un workspace centralise | Navigation rapide | 8 | US-WS-02, US-WS-04 | Vue consolidee operationnelle |
| US-WS-06 | En tant qu'Admin, je veux definir les politiques de branches | Standardisation | 5 | US-WS-04 | Regles persistantes et activables |
| US-WS-07 | En tant qu'utilisateur, je veux rechercher et naviguer rapidement entre org, equipes, projets, repos et analyses | Fluidite d'usage | 5 | US-WS-05 | Recherche globale et acces contextuels disponibles |
| US-WS-08 | En tant qu'utilisateur, je veux consulter la fiche detaillee d'un projet ou repo avec branches, equipes, langage, health score, auto-analysis et activite | Pilotage contextualise | 8 | US-WS-02, US-WS-05 | Vue detaillee complete et actionnable |
| US-WS-09 | En tant qu'Admin, je veux synchroniser organisations et workspaces entre plateforme, Clerk et GitHub | Cohesion multi-systemes | 8 | US-WS-04 | Sync bidirectionnelle gouvernee et visible |

## 3.3 Epic PR - Gestion des Pull Requests

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-PR-01 | En tant que Developer, je veux une page All PRs centralisee | Priorisation | 8 | US-WS-05 | Liste paginee avec tri de base |
| US-PR-02 | En tant que Developer, je veux filtrer mes PRs par etat metier | Productivite | 5 | US-PR-01 | Filtres operationnels |
| US-PR-03 | En tant que Developer, je veux gerer les etats Draft, Return et Waiting for author | Cycle clair | 5 | US-PR-02 | Etats visibles et coherents |
| US-PR-04 | En tant que Developer, je veux voir mes rapports recents | Feedback rapide | 5 | US-REV-01 | Liste recente et acces direct |
| US-PR-05 | En tant que Developer, je veux consulter une vue detaillee de PR avec contexte complet | Comprehension rapide | 5 | US-PR-01 | Detail PR relie a analyse, review, historique et actions |
| US-PR-06 | En tant qu'utilisateur, je veux consulter l'historique des merges, les changed files, les discussions et les pull requests par repo GitHub | Lecture complete du cycle PR | 8 | US-PR-01 | Historique et detail GitHub exploitables dans la plateforme |

## 3.4 Epic ANALYSIS - Gestion visible des analyses

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-ANA-01 | En tant que Developer, je veux soumettre une PR pour analyse | Automatisation QA | 3 | US-WS-02 | Soumission cree une analyse |
| US-ANA-06 | En tant que Developer, je veux suivre l'etat de mon analyse en temps reel | Transparence | 5 | US-ANA-01 | Statuts visibles en direct |
| US-ANA-07 | En tant qu'utilisateur, je veux consulter toutes les analyses avec filtres par statut, projet, repo, equipe et date | Pilotage global des analyses | 8 | US-ANA-01 | Tableau des analyses filtrable et coherent |
| US-ANA-08 | En tant qu'utilisateur, je veux ouvrir une analyse et voir son overview, son rapport, son diff, son projet associe et ses metadonnees | Lecture complete de l'analyse | 8 | US-ANA-07 | Detail d'analyse complet et navigable |
| US-ANA-09 | En tant qu'utilisateur, je veux gerer l'auto-analysis, la suppression et les actions de suivi sur une analyse ou un projet | Gouvernance d'execution | 5 | US-ANA-08, US-WS-08 | Actions visibles et tracees sur les analyses |

## 3.5 Epic REVIEW - Rapport intelligent et workflow Tech Lead

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-REV-01 | En tant que Developer, je veux consulter un rapport structure | Decision rapide | 13 | US-ANA-01 | Rapport accessible et coherent |
| US-REV-02 | En tant que Tech Lead, je veux classer une revue | Priorisation | 5 | US-REV-01 | Classification visible et exploitable |
| US-REV-03 | En tant que Developer, je veux visualiser un diff annote dans l'editeur | Revue efficace | 13 | US-REV-01 | Diff annote consultable |
| US-REV-04 | En tant que Tech Lead, je veux gerer les revues (approuver, bloquer, assigner, deleguer) | Controle qualite | 8 | US-REV-02 | Actions persistantes et auditees |
| US-REV-05 | En tant que Tech Lead, je veux gerer l'historique des revues | Tracabilite | 5 | US-REV-04 | Historique filtrable |
| US-REV-06 | En tant que Tech Lead, je veux gerer les analyses sur l'ensemble des projets | Pilotage global | 8 | US-REV-02 | Vue globale operationnelle |
| US-REV-07 | En tant que Tech Lead, je veux configurer les parametres et templates de revue | Standardisation | 8 | US-REV-04 | Templates et parametres actifs |
| US-REV-08 | En tant que Developer, je veux lier une analyse a un ticket Jira | Suivi delivery | 5 | US-REV-01 | Lien Jira visible et tracable |
| US-REV-09 | En tant que Tech Lead, je veux une inbox de review et des files d'attention par priorite | Pilotage quotidien | 5 | US-REV-02 | Inbox et files exploitables par priorite et anciennete |
| US-REV-10 | En tant qu'utilisateur, je veux suivre les commentaires et conversations de revue | Collaboration | 5 | US-REV-03, US-REV-04 | Conversations visibles, reliees aux decisions et actions |
| US-REV-11 | En tant que Developer, je veux exporter et partager les rapports de revue | Diffusion de l'information | 5 | US-REV-01 | Export et partage disponibles sur les rapports |
| US-REV-12 | En tant qu'utilisateur, je veux consulter un centre de statut des reviews avec timeline, progression, notifications et analytics | Suivi temps reel du workflow | 8 | US-REV-04, US-REV-05 | Review status center coherent et relie aux actions |
| US-REV-13 | En tant qu'utilisateur, je veux annoter le diff ligne par ligne avec commentaire, request change, revision ou signal | Revue fine dans l'editeur | 8 | US-REV-03 | Annotations inline persistantes et exploitables |
| US-REV-14 | En tant qu'utilisateur, je veux beneficier de suggestions IA, de corrections proposees et d'actions "Fix with AI" | Acceleration de correction | 8 | US-REV-03 | Suggestions et corrections IA visibles et actionnables |
| US-REV-15 | En tant que plateforme, je veux valider ou fusionner automatiquement une PR conforme aux regles d'entreprise et aux revues requises | Automatisation du cycle de merge | 8 | US-REV-04, US-KB-03 | Validation auto et merge GitHub conditionnels et tracables |
| US-REV-16 | En tant qu'utilisateur, je veux ouvrir un mode d'echange urgent autour d'un changement critique pour clarifier une ligne ou une decision | Coordination rapide | 5 | US-REV-10, US-REV-13 | Escalade et clarification visibles dans le flux de review |

## 3.6 Epic TEAM_ANALYTICS - Equipes, affectations et analytics

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-TA-01 | En tant que Tech Lead, je veux gerer equipes et affectations | Pilotage ressource | 8 | US-WS-04 | Membres et affectations gerables |
| US-TA-02 | En tant que Developer, je veux consulter mes analytics personnels | Progression individuelle | 8 | US-REV-01 | KPIs personnels disponibles |
| US-TA-03 | En tant que Tech Lead, je veux consulter les team analytics | Pilotage equipe | 8 | US-TA-01 | Dashboard equipe fiable |
| US-TA-04 | En tant qu'utilisateur, je veux une vue analytics consolidee | Vision globale | 5 | US-TA-02, US-TA-03 | Vue consolidee coherente |
| US-TA-05 | En tant qu'utilisateur, je veux consulter l'historique d'activite par projet, equipe et utilisateur | Tracabilite et historisation | 8 | US-TA-01, US-REV-05 | Historique detaille filtrable et chronologique |
| US-TA-06 | En tant qu'utilisateur, je veux consulter des insights de performance comme PRs merged per engineer, median PR size, publish to merge time, time to first review et fast facts | Pilotage par indicateurs d'engineering | 8 | US-TA-02, US-TA-03 | Dashboard insights calcule et lisible |
| US-TA-07 | En tant qu'utilisateur, je veux filtrer les insights par repo, utilisateur et periode, inviter des teammates et exporter les donnees en CSV | Analyse et partage des donnees | 5 | US-TA-06 | Filtres, export CSV et invitation depuis les dashboards |

## 3.7 Epic NOTIF_MOBILE - Notifications et application mobile

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-NM-01 | En tant qu'utilisateur, je veux recevoir des notifications in-app en temps reel | Reactivite | 5 | US-ANA-06 | Notifications live stables |
| US-NM-02 | En tant que Developer, je veux recevoir des notifications email critiques | Reduction du risque | 3 | US-NM-01 | Emails envoyes selon regles |
| US-NM-03 | En tant que Tech Lead, je veux recevoir des notifications Slack | Reactivite TL | 3 | US-NM-01 | Notifications Slack avec contexte |
| US-NM-04 | En tant qu'utilisateur, je veux une app mobile reliee aux parcours essentiels | Continuite d'usage | 13 | US-AUTH-01, US-PR-02, US-REV-01 | Auth, PRs et resume d'analyse disponibles |
| US-NM-05 | En tant que Tech Lead, je veux les indicateurs de sante sur mobile | Operations mobiles | 8 | US-NM-01 | Health indicators visibles |
| US-NM-06 | En tant qu'utilisateur, je veux parametrer mes preferences de notification par canal | Controle de l'information | 5 | US-NM-01 | Preferences sauvegardees et appliquees |
| US-NM-07 | En tant qu'utilisateur, je veux retrouver mon centre d'activite synchronise entre web et mobile | Continuite multi-surface | 5 | US-NM-04, US-NM-06 | Activites, alertes et etats coherents entre plateformes |

## 3.8 Epic ADMIN_PLATFORM - Administration et integrations

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-ADM-01 | En tant qu'Admin, je veux gerer les comptes utilisateurs | Gouvernance | 5 | US-AUTH-05 | Gestion de comptes et audit |
| US-ADM-02 | En tant qu'Admin, je veux gerer les secrets chiffres par projet | Securite runtime | 5 | US-WS-02 | Secret CRUD securise |
| US-ADM-03 | En tant qu'Admin, je veux gerer les policies et regles de branches | Qualite controlee | 8 | US-WS-06 | Policies actives |
| US-ADM-04 | En tant qu'Admin, je veux gerer les integrations | Interoperabilite | 8 | US-ADM-01 | Panneau unifie fonctionnel |
| US-ADM-05 | En tant qu'Admin, je veux consulter la piste d'audit | Conformite | 5 | US-AUTH-05 | Audit consultable |
| US-ADM-06 | En tant qu'Admin, je veux un dashboard d'administration navigable avec knowledge base, policy and rules, users, integrations, observability et organizations | Pilotage centralise de la plateforme | 8 | US-ADM-01, US-ADM-04 | Dashboard admin complet et coherent |

## 3.9 Epic KNOWLEDGE - Base de connaissances, Graphe et evaluation RAG

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-KB-01 | En tant qu'Admin, je veux importer des documents de connaissance | Capitalisation | 5 | US-ADM-04 | Import fonctionnel |
| US-KB-02 | En tant que plateforme, je veux relier la connaissance au contexte de revue | Contexte enrichi | 8 | US-KB-01 | Connaissance exploitable dans la revue |
| US-KB-03 | En tant qu'Admin, je veux prioriser les regles d'organisation | Alignement standards | 8 | US-KB-02 | Regles applicables |
| US-KB-04 | En tant qu'Admin, je veux gerer la KB depuis le dashboard | Gouvernance contenu | 8 | US-KB-01 | CRUD et reindexation via UI |
| US-KB-05 | En tant que Tech Lead, je veux voir quelles regles ont ete appliquees | Explicabilite | 5 | US-KB-03 | Regles citees visibles |
| US-KB-06 | En tant qu'Admin, je veux un overview de knowledge base avec repos indexes, concepts top, activites recentes, graphe 3D et analytics de reseau | Vision structurelle de la connaissance | 8 | US-KB-04 | Overview KB riche et interactif |
| US-KB-07 | En tant qu'Admin, je veux ajouter des sources variees de connaissance (ancien code, Markdown, PDF, web) et exporter la base | Capitalisation multi-source | 8 | US-KB-04 | Sources heterogenes importables et exportables |
| US-KB-08 | En tant qu'utilisateur, je veux evaluer les performances du RAG avec comparaison avec/sans GraphRAG, precision, recall, F1 et export PDF | Mesure de la qualite RAG | 8 | US-KB-06 | Dashboard RAG evaluation lisible et exportable |

## 3.10 Epic EDITOR_GITHUB - Edition de code et operations GitHub

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-ED-01 | En tant qu'utilisateur, je veux ouvrir un repo GitHub dans un editeur integre avec arborescence, fichiers et dossiers | Edition centralisee | 8 | US-WS-01 | Connexion repo et affichage du tree operationnels |
| US-ED-02 | En tant qu'utilisateur, je veux creer, modifier et supprimer des fichiers et dossiers puis commiter mes changements | Travail direct depuis la plateforme | 8 | US-ED-01 | CRUD de fichiers et commit GitHub fonctionnels |
| US-ED-03 | En tant qu'utilisateur, je veux changer de branche, creer une branche, changer de repository et ouvrir une pull request | Continuite du flux Git | 8 | US-ED-01 | Branches et PRs gerables depuis l'editeur |

## 3.11 Epic OBS_JIRA - Observabilite, statut et pilotage operationnel

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-OBS-01 | En tant qu'utilisateur, je veux consulter un dashboard d'observabilite avec system status, performance, services et alertes | Supervision exploitable | 8 | US-ADM-06 | Etat systeme et alertes visibles et comprehensibles |
| US-OBS-02 | En tant qu'utilisateur, je veux voir un pilotage visuel de l'activite et de la velocite de review dans le temps | Vision operationnelle | 5 | US-OBS-01 | Trends et activite exploitables dans le dashboard |
| US-JIRA-01 | En tant qu'utilisateur, je veux connecter Jira et consulter board, issues et analytics depuis la plateforme | Continuite produit-delivery | 8 | US-ADM-04, US-REV-08 | Jira connecte et donnees consultables |

## 3.12 Epic DEVOPS - Deploiement et exploitation

| ID | User story | Valeur | SP | Dependances | Criteres d'acceptation |
|---|---|---|---:|---|---|
| US-DO-01 | En tant que Developer, je veux demarrer la plateforme localement de facon standard | Productivite dev | 8 | - | Stack locale reproductible |
| US-DO-02 | En tant qu'Admin, je veux des images Docker optimisees | Cout et performance | 8 | US-DO-01 | Build stable et documente |
| US-DO-03 | En tant qu'Admin, je veux un pipeline CI complet | Fiabilite livraison | 8 | US-DO-01 | CI verte obligatoire |
| US-DO-04 | En tant qu'Admin, je veux deployer sur VPS avec securisation | Mise en production | 8 | US-DO-02, US-DO-03 | Environnement operationnel |
| US-DO-05 | En tant que Tech Lead, je veux des dashboards d'observabilite d'exploitation | Exploitabilite | 8 | US-DO-04 | Alertes et dashboards actifs |

---

## 4) Baseline Story Points recalculee

- Total baseline de planification: **640 SP**
- Repartition cible:
  - Release 1: **516 SP**
  - Release 2: **74 SP**
  - Release 3: **50 SP**

Note:
- La Release 1 est dimensionnee comme release fonctionnelle complete des surfaces web et mobile.
- Le backlog factorise est volontairement formule sous un angle fonctionnel visible, sans redeplier les mecanismes internes du moteur d'analyse.

---

## 5) Planification des Releases et Sprints

## RELEASE 1 - Plateforme Web & Mobile Operationnelle Complete

Objectif:
- Livrer toutes les interfaces visibles web des trois roles et l'application mobile sur les parcours prioritaires.
- Couvrir toutes les gestions metier de la plateforme sans entrer dans le detail d'implementation interne du moteur d'analyse.
- Rendre operationnels tous les parcours visibles entre acteurs, systemes et interfaces.

KPI:
- 100% des espaces visibles `Developer`, `Tech Lead` et `Admin` disponibles sur le web
- 100% des parcours mobiles prioritaires disponibles sur l'application mobile
- 0 blocage majeur sur le flux `connexion -> workspace -> PR -> analyse -> review -> notification`
- 95% des ecrans critiques valides en test bout en bout

Go / No-Go:
- Tous les espaces des 3 roles sont navigables et relies aux APIs utiles
- L'application mobile permet auth, consultation, suivi et notifications
- Les fonctions visibles ne reposent pas sur des ecrans vides ou des parcours incomplets

### SPRINT 1 - Gestion de l'authentification et des acces

Duree: `3 semaines`  |  SP: `34`  |  Release: `1`

Perimetre fonctionnel inclus:
- Inscription et connexion
- Synchronisation des comptes
- Redirection par role
- RBAC global
- Gestion initiale des roles, permissions et comptes

Stories couvertes:
- US-AUTH-01
- US-AUTH-02
- US-AUTH-03
- US-AUTH-04
- US-AUTH-05
- US-ADM-01

Livrables UI/API:
- Pages d'authentification
- Routage protege par role
- Gestion des comptes, roles et permissions
- Controle d'acces sur interfaces et endpoints

DoD:
- Un utilisateur se connecte, est synchronise et arrive sur le bon espace
- Les acces interdits retournent le bon comportement

Risques:
- Decalage entre identite frontend et backend

Mitigation:
- Tests d'integration sur synchronisation et permissions

### SPRINT 2 - Gestion du workspace, des organisations et des depots

Duree: `3 semaines`  |  SP: `44`  |  Release: `1`

Perimetre fonctionnel inclus:
- Import des depots GitHub
- Creation des projets
- Configuration des branches cibles
- Gestion des organisations
- Gestion des equipes
- Vue consolidee workspace
- Synchronisation plateforme <-> Clerk <-> GitHub
- Fiches detaillees projet/repo avec health score, auto-analysis, branches, langage, equipes et activite

Stories couvertes:
- US-WS-01
- US-WS-02
- US-WS-03
- US-WS-04
- US-WS-05
- US-WS-06
- US-WS-08
- US-WS-09

Livrables UI/API:
- Liste des repos et assistant d'import
- Pages projets, repositories, organisations, equipes et workspace
- Parametrage des branches, du contexte projet et de l'auto-analysis
- Gestion organisationnelle synchronisee avec GitHub et Clerk

DoD:
- Un projet peut etre cree depuis un repo et apparaitre dans le workspace
- Les organisations, equipes et branches sont gerables via l'interface
- Les fiches detaillees projet/repo sont actionnables

Risques:
- Incoherence entre donnees GitHub, projets et membres

Mitigation:
- Contrats d'import stricts et validation des rattachements

### SPRINT 3 - Gestion des PRs et de l'espace Developer

Duree: `3 semaines`  |  SP: `42`  |  Release: `1`

Perimetre fonctionnel inclus:
- Page All PRs
- Filtres d'etat metier
- Gestion des statuts Draft, Return, Waiting for author, Waiting for reviewer, Needs your review et Approved
- Acces aux rapports recents
- Detail de PR
- Historique des merges, changed files, discussions et PRs par repo

Stories couvertes:
- US-PR-01
- US-PR-02
- US-PR-03
- US-PR-04
- US-PR-05
- US-PR-06

Livrables UI/API:
- Tableau centralise des PRs
- Filtres, badges et vues d'etat
- Liens directs vers analyses et rapports
- Detail de PR avec discussions, historique et fichiers modifies

DoD:
- Un Developer suit et filtre toutes ses PRs depuis une seule interface
- Les statuts visibles sont coherents entre liste et detail

Risques:
- Multiplication d'etats incoherents entre backend et UI

Mitigation:
- Dictionnaire de statuts unique partage entre web et mobile

### SPRINT 4 - Gestion du declenchement et du suivi des analyses

Duree: `3 semaines`  |  SP: `44`  |  Release: `1`

Perimetre fonctionnel inclus:
- Declenchement d'analyse depuis une PR, une organisation ou un repo importe
- Suivi de statut d'analyse
- Retour d'etat en temps reel
- Consultation du resume de resultat
- Acces au rapport
- Liste de toutes les analyses
- Filtres par statut, projet, repo, equipe et date
- Detail d'analyse, suppression, vue projet et vue diff

Stories couvertes:
- US-ANA-01
- US-ANA-06
- US-ANA-07
- US-ANA-08
- US-ANA-09
- US-REV-01
- US-NM-01

Livrables UI/API:
- Actions de lancement d'analyse
- Statuts temps reel
- Tableau des analyses et detail complet
- Acces rapide aux rapports, diffs et projets lies

DoD:
- Une analyse peut etre lancee et suivie jusqu'a sa fin depuis l'interface
- Les mises a jour sont visibles sans rechargement manuel
- Les filtres et actions sur les analyses sont operants

Risques:
- Instabilite du flux temps reel

Mitigation:
- Reconnexion bornee, fallback polling et journalisation claire

### SPRINT 5 - Gestion des revues et des decisions Tech Lead

Duree: `3 semaines`  |  SP: `48`  |  Release: `1`

Perimetre fonctionnel inclus:
- Compteurs de charge
- Reviews queue
- Classification des revues
- Lecture des findings et du diff annote
- Decisions de revue: approuver, bloquer, debloquer, assigner, deleguer, rejeter
- Parametrage et templates de revue
- Review status center avec timeline, progression, notifications et analytics
- Suggestions IA, "Fix with AI", validation automatique et merge conditionnel

Stories couvertes:
- US-REV-02
- US-REV-03
- US-REV-04
- US-REV-06
- US-REV-07
- US-REV-12
- US-REV-14
- US-REV-15

Livrables UI/API:
- Queue des reviews
- Espace de decision Tech Lead
- Vues detail revue, rapport, diff et statut
- Parametres et templates de revue
- Actions IA et actions de validation/merge

DoD:
- Un Tech Lead peut ouvrir, comprendre, decider et assigner une review depuis son espace
- Les decisions, suggestions IA et validations automatiques sont tracees

Risques:
- Parcours trop fragmente entre plusieurs pages

Mitigation:
- Navigation transversale directe entre queue, detail, diff et decision

### SPRINT 6 - Gestion des equipes, des affectations, de l'historique et des analytics

Duree: `3 semaines`  |  SP: `44`  |  Release: `1`

Perimetre fonctionnel inclus:
- Gestion des membres et affectations
- Historique des reviews
- Analytics personnels
- Team analytics
- Vue analytics consolidee
- Visibilite des equipes cote Developer
- Insights engineering: PRs merged per engineer, lines modified per engineer, lines of code per PR, median PR size, publish to merge time, time to first review, fast facts, user list
- Filtres utilisateurs et periodes

Stories couvertes:
- US-REV-05
- US-TA-01
- US-TA-02
- US-TA-03
- US-TA-04
- US-TA-06

Livrables UI/API:
- Interfaces de gestion d'equipe
- Historique et timeline des reviews
- Dashboards analytics Developer, Tech Lead et consolides
- Dashboard insights engineering

DoD:
- Un Tech Lead peut gerer son equipe et relire l'historique des decisions
- Les dashboards affichent des metriques exploitables et reliees au contexte reel

Risques:
- Dispersion des indicateurs sur trop d'ecrans

Mitigation:
- Consolidation des vues analytiques et filtres communs

### SPRINT 7 - Gestion de l'administration, des politiques et des integrations

Duree: `3 semaines`  |  SP: `46`  |  Release: `1`

Perimetre fonctionnel inclus:
- Gestion des secrets projet
- Gestion des policies et regles de branches
- Piste d'audit
- Gestion des integrations GitHub, Jira, Slack et CI
- Lien analyse - ticket Jira
- Dashboard d'administration navigable avec knowledge base, policy and rules, users, integrations, observability et organizations
- Gestion des invitations et membres d'organisation

Stories couvertes:
- US-ADM-02
- US-ADM-03
- US-ADM-04
- US-ADM-05
- US-ADM-06
- US-REV-08

Livrables UI/API:
- Panneau d'administration unifie
- Pages policies, audit, secrets, integrations, users et organizations
- Gestion des invitations et des rattachements d'organisation
- Integration Jira visible depuis les analyses et rapports

DoD:
- Un Admin peut gouverner la plateforme sans passer par des manipulations externes
- Les integrations sont testables et leurs statuts sont visibles

Risques:
- Complexite de configuration des connecteurs externes

Mitigation:
- Wizards, checks de sante et messages d'erreur actionnables

### SPRINT 8 - Gestion des notifications et de l'experience mobile

Duree: `3 semaines`  |  SP: `40`  |  Release: `1`

Perimetre fonctionnel inclus:
- Notifications email
- Notifications Slack
- Notifications push navigateur
- Notifications push mobile
- Authentification mobile
- All PRs mobile
- Resume d'analyse mobile
- Health indicators mobile

Stories couvertes:
- US-NM-02
- US-NM-03
- US-NM-04
- US-NM-05

Livrables UI/API:
- Centre de notifications multi-canaux
- Application mobile reliee aux APIs reelles
- Ecrans mobiles prioritaires pour Developer et Tech Lead

DoD:
- Les utilisateurs recoivent les notifications attendues sur les bons canaux
- Les parcours mobiles prioritaires fonctionnent de bout en bout

Risques:
- Decalage entre comportement mobile et web

Mitigation:
- Contrats API partages et campagne E2E multi-surfaces

### SPRINT 9 - Gestion des vues detaillees, de la navigation transversale et de la recherche

Duree: `3 semaines`  |  SP: `32`  |  Release: `1`

Perimetre fonctionnel inclus:
- Recherche globale dans le workspace
- Navigation contextuelle entre repo, projet, PR, analyse et review
- Vues detaillees de PR
- Acces croises depuis tableaux, cartes, files et rapports
- Deep links entre tableaux, dashboards, reports et editeur

Stories couvertes:
- US-WS-07
- US-PR-05

Livrables UI/API:
- Recherche transverse
- Liens contextuels et breadcrumbs
- Vue detaillee de PR reliee au contexte complet
- Navigation cross-surface plus fluide

DoD:
- Un utilisateur peut passer d'une entite metier a une autre sans rupture de navigation
- La recherche et les liens contextuels reduisent les parcours manuels

Risques:
- Multiplication des points d'entree et incoherence des chemins

Mitigation:
- Cartographie unique de navigation et composants de contexte partages

### SPRINT 10 - Gestion des files d'attention, des conversations et de la collaboration

Duree: `3 semaines`  |  SP: `36`  |  Release: `1`

Perimetre fonctionnel inclus:
- Inbox de review
- Files d'attention par priorite
- Conversations et commentaires de revue
- Coordination Developer / Tech Lead autour des retours
- Annotations inline: commentaire, request change, revision, signal
- Mode d'echange urgent autour d'un changement critique

Stories couvertes:
- US-REV-09
- US-REV-10
- US-REV-13
- US-REV-16

Livrables UI/API:
- Inbox de review
- Vues d'attention et de priorisation
- Conversations reliees aux revues et aux decisions
- Outils de commentaire ligne par ligne et d'escalade

DoD:
- Le Tech Lead peut traiter sa file du jour depuis une seule zone de travail
- Le Developer peut comprendre et suivre les retours dans un fil coherent

Risques:
- Redondance entre commentaires, etats et notifications

Mitigation:
- Modele unique d'activite et de conversation aligne sur les transitions de revue

### SPRINT 11 - Gestion de l'historisation detaillee, des exports et de la tracabilite utilisateur

Duree: `3 semaines`  |  SP: `38`  |  Release: `1`

Perimetre fonctionnel inclus:
- Historique detaille des activites
- Historique par utilisateur, equipe, projet et review
- Exports et partage des rapports
- Journal de parcours et de decisions visibles
- Export CSV des dashboards et export PDF des rapports et tableaux RAG

Stories couvertes:
- US-REV-11
- US-TA-05
- US-TA-07
- US-KB-08

Livrables UI/API:
- Timeline d'activite detaillee
- Filtres d'historique multi-dimensions
- Exports CSV et partage de rapports
- Exports PDF des ecrans analytiques pertinents

DoD:
- Les utilisateurs peuvent retracer les actions, resultats et decisions sur la plateforme
- Les rapports et dashboards peuvent etre diffuses sans perte de contexte

Risques:
- Volume important de donnees d'historique

Mitigation:
- Pagination, filtres avances et vues synthese par contexte

### SPRINT 12 - Gestion des preferences, de la personnalisation et de la continuite web-mobile

Duree: `3 semaines`  |  SP: `28`  |  Release: `1`

Perimetre fonctionnel inclus:
- Preferences de notifications par canal
- Centre d'activite synchronise
- Continuite d'experience entre web et mobile
- Reprise de contexte entre appareils
- Cohesion des etats, badges, alertes et files entre surfaces

Stories couvertes:
- US-NM-06
- US-NM-07

Livrables UI/API:
- Parametres de notifications utilisateurs
- Centre d'activite partage web et mobile
- Synchronisation des etats et alertes utiles

DoD:
- Les preferences utilisateur sont appliquees sur tous les canaux
- Un utilisateur retrouve la meme logique de suivi sur web et mobile

Risques:
- Divergence d'etat entre clients web et mobile

Mitigation:
- Source unique de verite pour activites, etats et preferences

### 5.1 Affectation detaillee des fonctionnalites existantes du systeme dans la Release 1

#### Tableau de reclassement complet des fonctionnalites

| Fonctionnalite | Acteur principal | Surface | Sprint |
|---|---|---|---|
| Inscription / connexion Clerk | Tous | Web + Mobile | Sprint 1 |
| Synchronisation comptes et roles | Admin | Backend | Sprint 1 |
| Redirection par role (RBAC) | Tous | Web + Mobile | Sprint 1 |
| Gestion utilisateurs, roles, permissions | Admin | Web admin | Sprint 1 + Sprint 7 |
| Workspace central, sync Clerk / GitHub | Admin, Developer, Tech Lead | Web | Sprint 2 |
| Creation organisation (plateforme ↔ GitHub) | Admin | Web admin | Sprint 2 + Sprint 7 |
| Gestion equipes (Dev, DevOps, etc.) | Admin, Tech Lead | Web | Sprint 2 |
| Fiches projet/repo : branches, teams, langage, health score | Developer, Tech Lead | Web | Sprint 2 + Sprint 4 |
| Auto-analyse activee/desactivee par projet | Tech Lead, Admin | Web | Sprint 2 + Sprint 4 |
| All PRs : draft, waiting, approved, return, needs review | Developer, Tech Lead | Web + Mobile | Sprint 3 + Sprint 8 |
| Historique merges, discussions, changed files, recently merged | Developer, Tech Lead | Web | Sprint 3 |
| Lancement analyse, liste, filtres, detail, suppression, rapport | Developer, Tech Lead, Admin | Web | Sprint 4 |
| Import analyse depuis GitHub orgs / repo simple | Developer, Tech Lead | Web | Sprint 4 |
| Vue diff (editeur inline) | Developer, Tech Lead | Web | Sprint 4 + Sprint 5 |
| Commentaires ligne, change request, revision, signal | Developer, Tech Lead | Web | Sprint 5 |
| Suggestions IA, Fix with AI, validation auto, merge auto conditionnel | Developer, Tech Lead | Web | Sprint 5 |
| Reviews queue, priorite, blocage, delegation, assignation | Tech Lead | Web | Sprint 5 |
| My Reviews, Review Status Center, timeline, review progress | Tech Lead | Web | Sprint 5 + Sprint 10 |
| Templates de review | Tech Lead | Web | Sprint 5 |
| Review Settings | Tech Lead, Admin | Web | Sprint 5 |
| Team analytics, my analytics, review activity trend, SLA, leaderboard | Tech Lead, Developer | Web | Sprint 6 |
| Insights engineering : PR merge per engineer, lines modified, median PR size | Developer, Tech Lead | Web | Sprint 6 + Sprint 11 |
| Fast facts, user lists, CSV, invite teammates | Developer, Tech Lead | Web | Sprint 6 + Sprint 11 |
| Dashboard admin : KB, policy, users, integrations, observability, orgs | Admin | Web admin | Sprint 7 |
| Knowledge Base : sources indexees, graphe 3D, network density, daily searches | Admin | Web admin | Sprint 7 |
| Sources KB : ancien code, Markdown, PDF, pages web, export | Admin | Web admin | Sprint 7 + Sprint 11 |
| RAG evaluation : comparaison avec/sans GraphRAG, precision, recall, F1 | Admin, Tech Lead | Web admin | Sprint 7 + Sprint 11 |
| Observability dashboard : services, alerts, CPU, memory, system health | Admin, Tech Lead | Web admin | Sprint 7 |
| Jira integration : domain, email, API token, board, issues, analytics | Admin, Tech Lead, Developer | Web | Sprint 7 |
| Editeur GitHub : tree, fichiers, dossiers, edition, commit, branch, PR | Developer, Tech Lead | Web | Sprint 9 + Sprint 10 |
| Notifications in-app, email, Slack, push web + mobile | Tous | Web + Mobile | Sprint 8 + Sprint 12 |
| Authentification mobile, All PRs mobile, resume analyse, health mobile | Developer, Tech Lead | Mobile | Sprint 8 |
| Recherche globale, navigation transversale, breadcrumbs | Tous | Web | Sprint 9 |
| Inbox review, files d'attention, conversations de revue | Tech Lead, Developer | Web | Sprint 10 |
| Historique detaille, export rapport, partage, tracabilite decisions | Tous | Web | Sprint 11 |
| Preferences notification, centre d'activite, sync web-mobile | Tous | Web + Mobile | Sprint 12 |

#### Regles de hierarchie et de dependance metier

La hierarchie fonctionnelle de la plateforme doit etre respectee dans la Release 1:

1. Une organisation est le niveau racine du workspace.
2. Une organisation peut etre creee depuis la plateforme ou reliee/importee depuis GitHub.
3. Une organisation creee sur la plateforme doit pouvoir etre reliee a GitHub et synchronisee avec Clerk.
4. Une organisation importee depuis GitHub doit permettre la detection des membres, collaborateurs et contributeurs, puis l'invitation de ces membres dans la plateforme.
5. Un projet ne peut etre cree que s'il est rattache a une organisation existante sur la plateforme ou a une organisation GitHub synchronisee.
6. Un repository ne peut etre ajoute ou importe que s'il appartient a un projet.
7. Un projet peut contenir un ou plusieurs repositories.
8. Un repository porte les branches, les PRs, les analyses, le diff, les rapports, les equipes associees, le langage, le health score et le statut d'auto-analyse.
9. Une analyse ne peut etre lancee que sur un repository connu de la plateforme, rattache a un projet et a une organisation.
10. Une review est rattachee a une analyse, elle-meme rattachee a une PR ou a un repository.

#### Reclassement fonctionnel detaille par domaine

**Sprint 1 - Gestion de l'authentification et des acces**

- Inscription / connexion Clerk pour tous les acteurs sur Web et Mobile.
- Synchronisation comptes et roles entre Clerk, backend et espace plateforme.
- Redirection par role avec RBAC pour `Developer`, `Tech Lead` et `Admin`.
- Gestion utilisateurs, roles et permissions depuis l'administration.
- Les permissions admin doivent permettre d'ajouter ou retirer des droits par role.

**Sprint 2 - Gestion du workspace, des organisations, des projets et des repositories**

- Creation d'organisation depuis la plateforme.
- Import ou liaison d'une organisation GitHub existante.
- Synchronisation organisation plateforme -> Clerk -> GitHub et GitHub -> plateforme.
- Detection automatique des membres, collaborateurs et contributeurs d'une organisation GitHub.
- Invitation des membres detectes pour rejoindre la plateforme.
- Gestion equipes: equipe de developpement, equipe DevOps et autres equipes projet.
- Creation d'un projet uniquement si une organisation existe.
- Creation ou import d'un projet depuis la plateforme ou GitHub uniquement s'il est relie a une organisation.
- Creation ou import d'un repository uniquement s'il appartient a un projet.
- Gestion des projets et repositories avec description, statut, nombre de repos, nombre de commits, branches, membres, equipes et organisation liee.
- Fiches projet/repo avec branches, equipes, langage, health score, auto-analyse activee/desactivee, derniere analyse, nombre d'analyses, nombre d'equipes et organisation GitHub associee.

**Sprint 3 - Gestion des pull requests et de l'espace Developer**

- All pull requests synchronisees avec GitHub.
- Statuts PR: `Draft`, `Waiting for author`, `Waiting for reviewer`, `Approved`, `Return`, `Needs your review`.
- Historique de merge, recently merged, discussions, changed files, description de merge, diff et historique complet par repository.
- Consultation d'une pull request d'un repo lie au compte GitHub.
- Navigation entre repo, PR, historique, discussion, diff et analyse.

**Sprint 4 - Gestion du lancement, de la liste et du detail des analyses**

- Lancement d'une nouvelle analyse depuis une PR, une organisation GitHub ou un repository simple.
- Import d'analyse depuis GitHub organizations ou depuis un repository GitHub simple.
- Liste de toutes les analyses avec filtres par statut, projet, repository, equipe, organisation et date.
- Detail d'analyse avec overview, statuts actifs, langage TypeScript ou autre langage detecte, team associee, auto-analyse activee/desactivee, health score, branches, nombre d'analyses, nombre d'equipes, derniere analyse, organisation GitHub liee et liste des equipes associees.
- Actions d'analyse: voir projet, analyser, consulter rapport, consulter diff, supprimer analyse.
- Vue diff sous forme d'editeur inline dans la plateforme.

**Sprint 5 - Gestion des revues, du diff editor, des suggestions IA et des decisions Tech Lead**

- Vue diff dans un editeur inline proche d'un editeur de code.
- Possibilite de modifier le code, ajouter du code, supprimer du code et travailler ligne par ligne.
- Commentaires ligne par ligne.
- Actions de revue inline: commentaire, change request, revision, signal, exclamation et demande de clarification.
- Possibilite d'ouvrir une discussion ou une reunion urgente autour d'une ligne ou d'un changement critique entre Tech Lead et Developer.
- Suggestions IA generees a partir de la base de connaissances, des policies et des regles internes.
- `Fix with AI` pour proposer une correction directe.
- Acceptation des changements suggeres lorsque la correction est valide.
- Validation automatique si l'analyse respecte les regles internes de l'entreprise.
- Merge automatique conditionnel vers GitHub si la PR respecte les regles, les policies et les conditions de review.
- Reviews queue avec priorites, blocage, delegation, assignation et refus.
- My Reviews pour le Tech Lead avec review, projet, statut, priorite, lignes et commentaires.
- Review Status Center avec dashboard, timeline, review progress, notifications, analytics, statut projet/fonctionnalite et progression.
- Templates de review.
- Review Settings pour modifier les parametres de review, seuils, rigueur, assignation et comportements autorises.

**Sprint 6 - Gestion des analytics, insights et performances equipe**

- Team analytics.
- My analytics.
- Review activity trend.
- Review decisions.
- Review time trend.
- SLA compliance trend.
- Daily performance stats.
- Reviews completed, average review time, average comments per review, approvals, warnings, blocks, findings identified.
- Leaderboard equipe.
- Performance individuelle.
- Workload.
- Insights engineering: PR merged per engineer, lines modified per engineer, lines of code per PR, median PR size, publish to merge time, time to first review.
- Fast facts.
- User lists.
- Filtrage par utilisateur, repo et periode.
- Invite teammates depuis les dashboards.
- Export CSV.

**Sprint 7 - Gestion de l'administration, Knowledge Base, policies, integrations, observability et Jira**

- Dashboard admin avec sections navigables: Knowledge Base, Policy and Rules, Users, Integrations, Observability, Organizations.
- Gestion utilisateurs: total utilisateurs, admins, Tech Leads, Developers, changement de role et modification des permissions.
- Organization management: creation, edition, suppression, invitation, membres, roles, liaison GitHub, liaison Clerk.
- Knowledge Base avec sources indexees, fichiers indexes, mise a jour et reindexation.
- Knowledge Base overview: repos indexes, top concepts, recent activities.
- Graphe 3D de la knowledge base avec types de nodes: document, concept, code, policy, tag et autres noeuds.
- Analytics knowledge base: network density, average connections, daily search, growth rate.
- Document type distribution.
- Concepts de connexion pertinents.
- Knowledge base activity, network analysis et recent knowledge-based activities.
- Ajout de source Knowledge Base: ancien code, Markdown, PDF, pages web, autres sources.
- Export Knowledge Base.
- RAG evaluation: comparaison avec/sans GraphRAG, precision, recall, F1, findings, insights, performance et export PDF.
- Policies and rules.
- Integrations: GitHub, Jira, Slack, CI tokens.
- Jira integration avec Jira domain, email, API token, Kanban board, issues et analytics.
- Observability dashboard avec active views, review velocity over time, system status, API server, database, Redis cache, background jobs, CPU, memory, disk, network, services, alerts, healthy/warning.

**Sprint 8 - Gestion des notifications et de l'experience mobile**

- Notifications in-app.
- Notifications email.
- Notifications Slack.
- Notifications Microsoft Teams.
- Notifications push web.
- Notifications push mobile.
- Authentification mobile.
- All PRs mobile.
- Resume d'analyse mobile.
- Health mobile pour Tech Lead.
- Consultation mobile des statuts et actions prioritaires.

**Sprint 9 - Gestion de la recherche globale, navigation transverse et editeur GitHub**

- Recherche globale.
- Navigation transverse.
- Breadcrumbs.
- Open Editor depuis la plateforme.
- Editeur GitHub avec lien repo GitHub.
- Arborescence tree des dossiers, sous-dossiers et fichiers.
- Creation d'un fichier.
- Creation d'un dossier.
- Suppression de fichier ou dossier.
- Edition de fichier.
- Commit automatique sur GitHub.
- Changement de branche.
- Creation de branche.
- Changement de repository.
- Creation de pull request depuis l'editeur.

**Sprint 10 - Gestion de l'inbox review, files d'attention et conversations**

- Inbox review.
- Files d'attention.
- Conversations de revue.
- Coordination Developer / Tech Lead.
- Clarification des retours.
- Commentaires persistants lies a une ligne, une PR, une analyse ou une review.
- Dossiers de review en attente, critiques ou necessitant action.

**Sprint 11 - Gestion de l'historisation detaillee, exports, rapports et tracabilite**

- Historique detaille.
- Historique par projet, repo, PR, analyse, review, utilisateur, equipe et organisation.
- Export rapport.
- Partage rapport.
- Tracabilite decisions.
- Export CSV des insights.
- Export PDF des dashboards analytiques, RAG evaluation et rapports.
- Audit fonctionnel des actions importantes.

**Sprint 12 - Gestion des preferences, centre d'activite et synchronisation web-mobile**

- Preferences notifications.
- Preferences par canal: in-app, email, Slack, Microsoft Teams, push web, push mobile.
- Centre d'activite.
- Synchronisation web-mobile.
- Continuite des statuts, notifications, actions et historiques entre Web et Mobile.
- Reprise du contexte sur mobile apres action web et inversement.

---

## RELEASE 2 - Optimisation de la pertinence et du contexte de revue

Objectif:
- Renforcer la qualite intrinseque des revues et la pertinence du contexte sans redessiner les parcours visibles de la Release 1.

KPI:
- Hausse mesurable de la pertinence des findings
- Reduction du bruit de revue
- Tracabilite claire des regles et connaissances mobilisees

Go / No-Go:
- La base de connaissance est exploitable en profondeur
- Le contexte de revue est enrichi de maniere fiable

### SPRINT 13 - Gestion de la base de connaissances et des regles

Duree: `3 semaines`  |  SP: `36`  |  Release: `2`

Perimetre fonctionnel inclus:
- Import des documents KB
- Administration de la KB
- Regles et standards exploitables dans les revues
- Visibilite des regles appliquees

Stories couvertes:
- US-KB-01
- US-KB-02
- US-KB-03
- US-KB-04
- US-KB-05

### SPRINT 14 - Gestion de l'intelligence de contexte et de la qualite des revues

Duree: `3 semaines`  |  SP: `38`  |  Release: `2`

Perimetre fonctionnel inclus:
- Amelioration de la qualite de contexte
- Fiabilisation des resultats
- Suggestions exploitables et preuves visibles

Stories couvertes:
- Capacites systeme d'enrichissement de contexte et de fiabilisation de revue

---

## RELEASE 3 - Industrialisation technique et exploitation continue

Objectif:
- Stabiliser les fondations d'exploitation, de deploiement et de supervision de la plateforme.

KPI:
- Deploiement reproductible
- CI fiable
- Observabilite operationnelle active

Go / No-Go:
- Pipeline de livraison automatise
- Supervision et alerting actifs

### SPRINT 15 - Gestion de l'exploitation locale et de la chaine de livraison

Duree: `3 semaines`  |  SP: `24`  |  Release: `3`

Perimetre fonctionnel inclus:
- Demarrage local standard
- Images Docker
- Pipeline CI

Stories couvertes:
- US-DO-01
- US-DO-02
- US-DO-03

### SPRINT 16 - Gestion du deploiement et de l'observabilite

Duree: `3 semaines`  |  SP: `26`  |  Release: `3`

Perimetre fonctionnel inclus:
- Deploiement VPS
- Dashboards Grafana
- Alertes Prometheus

Stories couvertes:
- US-DO-04
- US-DO-05

---

## 6) Matrice de tracabilite (Domaine -> Sprint -> Release -> KPI)

| Domaine | Sprint | Release | KPI principal |
|---|---|---|---|
| Authentification et acces | R1-S1 | R1 | Acces securise et redirection correcte |
| Workspace, organisations, projets et repositories | R1-S2 | R1 | Mise en route projet rapide et contexte unifie |
| PRs, statuts et historique GitHub | R1-S3 | R1 | Productivite Developer sur la gestion des PRs |
| Analyses, rapports et filtres | R1-S4 | R1 | Declenchement et suivi d'analyse sans friction |
| Reviews, IA et decisions Tech Lead | R1-S5 | R1 | Decisions de revue fluides et tracables |
| Equipes, analytics et insights | R1-S6 | R1 | Pilotage d'equipe et visibilite de performance |
| Administration, policies, integrations, KB visible, observability et Jira | R1-S7 | R1 | Gouvernance operationnelle et interoperabilite |
| Notifications et mobile | R1-S8 | R1 | Continuite multi-canaux et multi-surfaces |
| Navigation transverse et edition contextuelle | R1-S9 | R1 | Acces rapide a toutes les entites utiles |
| Collaboration et files d'attention | R1-S10 | R1 | Traitement quotidien plus fluide des revues et retours |
| Historisation, exports et tracabilite | R1-S11 | R1 | Diffusion des resultats et memoire fonctionnelle |
| Preferences et continuite web-mobile | R1-S12 | R1 | Experience synchronisee sur toutes les surfaces |
| Base de connaissance en profondeur | R2-S13 | R2 | Alignement des revues sur les standards |
| Intelligence de contexte | R2-S14 | R2 | Pertinence et fiabilite des revues ameliorees |
| Exploitation et CI | R3-S15 | R3 | Livraison reproductible |
| Deploiement et observabilite d'exploitation | R3-S16 | R3 | Supervision et exploitation continue |

---

## 7) Hors perimetre immediat

- Refonte esthetique non reliee aux parcours metier critiques
- Extensions IA exploratoires sans impact direct sur le cycle de review
- Fonctionnalites experimentales non necessaires au run operationnel web et mobile

---

## 8) Dette technique planifiee

1. Standardiser tous les clients API sur des helpers de configuration backend communs.
2. Durcir les tests contractuels WebSocket et notifications.
3. Reduire la duplication des composants analytics entre vues role-based.
4. Unifier l'observabilite fonctionnelle et l'observabilite infra.
5. Stabiliser la chaine de build et release mobile.
6. Unifier les statuts metier entre GitHub, analyses, reviews et notifications.

---

## 9) Plan de validation du document

1. Verifier qu'aucune section ne traite `GraphRAG / IA` comme acteur metier.
2. Verifier que les stories signalees a eliminer sont absentes.
3. Verifier que la Release 1 couvre toutes les surfaces visibles web et mobile, avec un enchainement de scenario complet.
4. Verifier que les 12 sprints de la Release 1 commencent par `Gestion de`.
5. Verifier qu'aucun sprint de la Release 1 ne detaille l'implementation interne du moteur d'analyse.
6. Verifier que chaque bloc de sprint contient au minimum: nom, duree, SP, perimetre, livrables, DoD, risques, mitigation.
7. Verifier que la section `5.1 Affectation detaillee des fonctionnalites existantes du systeme dans la Release 1` couvre les modules reellement presents dans le code.
8. Verifier la repartition cible:
   - R1 = 516
   - R2 = 74
   - R3 = 50
   - Total = 640
