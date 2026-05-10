# Plateforme AI Code Review
## Planification simplifiee en 3 sprints pour rapport PFE

Ce document propose une version reduite et soutenable de la planification. L'objectif est de conserver une plateforme credible, fonctionnelle et representative d'une solution complete d'AI Code Review, tout en respectant une structure de rapport PFE limitee a trois sprints.

La planification complete reste disponible dans `RELEASE_SPRINT_PLAN_REFACTORED.md`. Cette version condensee regroupe les fonctionnalites par valeur metier et elimine les elements secondaires ou trop fins pour un rapport academique.

---

## 1) Logique de reduction

### Fonctionnalites essentielles conservees

La plateforme doit conserver les composantes suivantes:

- Authentification, roles et permissions.
- Workspace avec organisations, projets, repositories et equipes.
- Integration GitHub pour importer repositories, PRs et contexte projet.
- Lancement et suivi des analyses.
- Rapport d'analyse et diff annote.
- Workflow de review Tech Lead.
- Suggestions IA et aide a la correction.
- Knowledge Base minimale pour les regles internes.
- Analytics essentiels.
- Notifications importantes.
- Application mobile minimale.
- Administration, integrations et observability de base.

### Fonctionnalites secondaires regroupees ou reportees

Les fonctionnalites suivantes sont conservees comme extensions ou simplifiees dans le rapport:

- Graphe 3D complet de la Knowledge Base.
- Evaluation RAG detaillee avec toutes les metriques avancees.
- Exports multiples CSV/PDF sur tous les dashboards.
- Automatisation complete de merge auto.
- Editeur GitHub complet avec toutes les operations fichiers/dossiers.
- Observability detaillee CPU, memory, disk, network, services et alertes avancees.
- Personnalisation fine des preferences multi-canaux.

Ces fonctionnalites peuvent etre mentionnees comme perspectives, mais ne doivent pas diluer les trois sprints principaux.

---

## 2) Vue globale des 3 sprints

| Sprint | Nom | Objectif principal | Acteurs couverts |
|---|---|---|---|
| Sprint 1 | Gestion des acces, du workspace et des repositories | Construire le socle de la plateforme: auth, roles, organisations, projets, repositories et equipes | Admin, Developer, Tech Lead |
| Sprint 2 | Gestion des analyses IA et du workflow de review | Permettre l'analyse de code, la consultation du rapport, le diff annote et les decisions de review | Developer, Tech Lead |
| Sprint 3 | Gestion du pilotage, des integrations et de l'experience mobile | Finaliser la solution avec analytics, notifications, mobile, administration avancee, integrations et observability | Admin, Developer, Tech Lead |

---

## 3) Sprint 1 - Gestion des acces, du workspace et des repositories

### Objectif

Mettre en place les fondations fonctionnelles de la plateforme. Ce sprint permet aux utilisateurs d'acceder au systeme, d'etre rediriges selon leur role, puis de travailler dans un workspace structure autour des organisations, projets, repositories et equipes.

### Fonctionnalites conservees

#### Authentification et controle d'acces

- Inscription et connexion via Clerk.
- Synchronisation comptes et roles entre Clerk et backend.
- Redirection selon le role: `Developer`, `Tech Lead`, `Admin`.
- Application du RBAC sur les interfaces et endpoints.
- Gestion initiale des utilisateurs, roles et permissions.

#### Workspace et organisation

- Creation d'organisation dans la plateforme.
- Liaison ou import d'une organisation GitHub.
- Synchronisation entre plateforme, Clerk et GitHub.
- Detection des membres, collaborateurs et contributeurs GitHub.
- Invitation des membres detectes dans la plateforme.

#### Projets et repositories

- Hierarchie obligatoire: `organisation -> projet -> repository`.
- Creation d'un projet uniquement s'il est rattache a une organisation.
- Import d'un repository uniquement s'il appartient a un projet.
- Association d'un repo GitHub a un projet.
- Consultation des fiches projet/repo.

#### Details projet/repository

- Branches.
- Equipes associees.
- Langage principal.
- Nombre de commits.
- Nombre de repositories.
- Description et statut.
- Health score.
- Auto-analyse activee/desactivee.
- Derniere analyse.

### Fonctionnalites volontairement simplifiees

- Creation automatique complete d'une organisation GitHub depuis la plateforme.
- Gestion avancee des policies par branche.
- Edition avancee des permissions par action fine.

### Resultat attendu

A la fin du sprint, un utilisateur peut se connecter, acceder au bon espace, creer ou importer une organisation, creer un projet, rattacher un repository GitHub et consulter le contexte de travail.

### Justification

Ce sprint est indispensable car toutes les autres fonctionnalites dependent du contexte organisationnel. Sans organisation, projet et repository, il n'existe pas de base exploitable pour analyser du code ou gerer des reviews.

---

## 4) Sprint 2 - Gestion des analyses IA et du workflow de review

### Objectif

Construire le coeur fonctionnel de la plateforme AI Code Review. Ce sprint couvre le cycle complet allant d'une Pull Request a une analyse, puis a une review exploitable par le Tech Lead.

### Fonctionnalites conservees

#### Pull Requests

- Consultation de toutes les PRs.
- Statuts principaux: `Draft`, `Waiting`, `Approved`, `Return`, `Needs review`.
- Historique des merges.
- Discussions.
- Changed files.
- Recently merged.
- Synchronisation avec GitHub.

#### Lancement et suivi des analyses

- Lancement d'une analyse depuis une PR.
- Import d'analyse depuis une organisation GitHub ou un repository simple.
- Liste des analyses.
- Filtres par statut, projet, repo, equipe et date.
- Detail d'analyse.
- Suppression d'analyse.
- Consultation du rapport.
- Suivi de statut en temps reel.

#### Rapport et diff

- Vue d'ensemble de l'analyse.
- Resume du risque.
- Findings principaux.
- Rapport structure.
- Diff annote.
- Vue diff dans un editeur inline.

#### Review Tech Lead

- Reviews queue.
- Priorites.
- Assignation.
- Blocage.
- Delegation.
- Decision de review.
- My Reviews.
- Review Status Center.
- Timeline.
- Review progress.

#### Collaboration dans la review

- Commentaires ligne par ligne.
- Change request.
- Revision.
- Signal.
- Conversations de review.
- Clarification entre Developer et Tech Lead.

#### Suggestions IA et Knowledge Base minimale

- Suggestions IA basees sur les regles internes.
- `Fix with AI`.
- Proposition de correction.
- Acceptation d'une suggestion.
- Knowledge Base minimale pour stocker les regles, standards et bonnes pratiques.

### Fonctionnalites volontairement simplifiees

- Merge automatique complet vers `main`.
- Editeur GitHub complet avec creation/suppression de fichiers et dossiers.
- Evaluation RAG avancee.
- Graphe 3D complet.
- Auto-fix multi-fichiers avance.

### Resultat attendu

A la fin du sprint, un Developer peut soumettre ou consulter une PR, lancer une analyse, lire un rapport et recevoir des retours. Un Tech Lead peut traiter les reviews, commenter, demander des changements, bloquer, assigner ou approuver.

### Justification

Ce sprint porte la valeur principale du projet. Il demontre que la plateforme n'est pas seulement un dashboard GitHub, mais une solution d'analyse et de review assistee par IA.

---

## 5) Sprint 3 - Gestion du pilotage, des integrations et de l'experience mobile

### Objectif

Finaliser la plateforme en ajoutant les fonctions de pilotage, les integrations, les notifications et l'experience mobile. Ce sprint transforme le coeur fonctionnel en solution exploitable dans un contexte d'equipe.

### Fonctionnalites conservees

#### Analytics et insights

- Team analytics.
- My analytics.
- Review activity trend.
- SLA.
- Leaderboard.
- Workload.
- Insights engineering:
  - PR merged per engineer.
  - Lines modified.
  - Median PR size.
  - Time to first review.
  - Publish to merge time.
- Fast facts.
- User lists.
- Export CSV simplifie.

#### Administration

- Dashboard admin.
- Gestion utilisateurs.
- Gestion roles et permissions.
- Gestion organisations.
- Gestion integrations.
- Policy and rules.
- Audit fonctionnel.

#### Knowledge Base et RAG simplifie

- Ajout de sources:
  - ancien code.
  - Markdown.
  - PDF.
  - pages web.
- Sources indexees.
- Reindexation.
- Consultation des activites recentes.
- Evaluation RAG simplifiee:
  - comparaison avec/sans GraphRAG.
  - precision.
  - recall.
  - F1.

#### Integrations

- GitHub.
- Jira:
  - domain.
  - email.
  - API token.
  - board.
  - issues.
  - analytics.
- Slack.
- Microsoft Teams.

#### Observability

- Dashboard observability.
- Services.
- Alerts.
- System health.
- CPU.
- Memory.
- Etat API, database, Redis et jobs en arriere-plan.

#### Notifications

- Notifications in-app.
- Notifications email.
- Notifications Slack.
- Notifications Microsoft Teams.
- Push web.
- Push mobile.

#### Mobile

- Authentification mobile.
- All PRs mobile.
- Resume d'analyse mobile.
- Health mobile.
- Notifications mobile.

#### Historisation et exports

- Historique detaille.
- Tracabilite des decisions.
- Export rapport.
- Partage rapport.
- Centre d'activite.
- Synchronisation web-mobile.

### Fonctionnalites volontairement simplifiees

- Personnalisation fine de toutes les preferences.
- Export PDF de tous les dashboards.
- Observability avancee type SRE.
- Editeur GitHub complet.
- Automatisation CI/CD complete.

### Resultat attendu

A la fin du sprint, la plateforme est utilisable par une equipe: elle dispose d'analytics, de notifications, d'integrations, d'une administration exploitable, d'une base de connaissances et d'une version mobile representative.

### Justification

Ce sprint donne de la profondeur a la solution. Il prouve que la plateforme peut etre utilisee dans un environnement reel avec plusieurs acteurs, plusieurs outils et un suivi operationnel.

---

## 6) Synthese des fonctionnalites eliminees ou reportees

| Fonctionnalite | Decision | Justification |
|---|---|---|
| Graphe 3D complet et fortement interactif | Reportee | Interessant visuellement mais secondaire pour prouver la valeur AI Code Review |
| Editeur GitHub complet type IDE | Simplifie | La review et le diff annote sont prioritaires; l'edition complete peut etre une perspective |
| Merge automatique complet | Simplifie | Fonction sensible; a presenter comme validation conditionnelle ou perspective |
| Exports PDF sur tous les dashboards | Simplifie | Garder export rapport et CSV suffit pour le PFE |
| Observability avancee SRE | Simplifie | Un dashboard health/services suffit pour representer l'exploitation |
| Preferences multi-canaux tres fines | Simplifie | Garder notifications principales et centre d'activite |
| Evaluation RAG tres avancee | Simplifiee | Garder precision, recall, F1 et comparaison avec/sans GraphRAG |

---

## 7) Vision finale conservee

Avec ces trois sprints, la plateforme reste complete et credible:

1. **Sprint 1** construit le socle: acces, roles, organisations, projets et repositories.
2. **Sprint 2** porte le coeur du projet: analyse IA, rapport, diff annote et review Tech Lead.
3. **Sprint 3** finalise l'usage professionnel: analytics, admin, integrations, notifications, mobile et observability.

Cette reduction conserve la valeur principale du systeme sans disperser le rapport dans trop de details secondaires.

