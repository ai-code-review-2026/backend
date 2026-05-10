# Rapport PFE complet - Brouillon redige

> Ce document constitue un brouillon complet et structurant du rapport PFE. Il contient les sections, les sous-sections et un contenu redige sous chaque titre. Il doit ensuite etre adapte avec les captures d'ecran, les diagrammes UML, les schemas d'architecture, les references bibliographiques et les resultats reels du projet.

---

# Remerciements

Je tiens a adresser mes sincères remerciements a toutes les personnes qui ont contribue, de pres ou de loin, a la realisation de ce projet de fin d'etudes. Mes premiers remerciements vont a mon encadrant pedagogique pour son accompagnement, ses remarques constructives et ses orientations tout au long du projet. Je remercie egalement mon encadrant professionnel pour sa disponibilite, ses conseils techniques et la confiance qu'il m'a accordee.

Je remercie aussi l'ensemble des membres de l'entreprise d'accueil pour l'environnement de travail stimulant, l'aide apportee pendant les phases d'analyse, de conception et de realisation, ainsi que pour les echanges qui ont permis d'ameliorer la qualite du produit final. Enfin, j'exprime ma gratitude envers ma famille et mes proches pour leur soutien moral et leur encouragement constant durant toute la periode de preparation de ce projet.

# Dedicaces

Je dedie ce travail a ma famille, pour son soutien permanent, sa patience et ses sacrifices. Je le dedie egalement a tous ceux qui m'ont encourage a poursuivre mes objectifs avec serieux et perseverance.

# Resume

Ce projet de fin d'etudes porte sur la conception et la realisation d'une plateforme intelligente de revue de code assistee par intelligence artificielle. L'objectif principal est d'ameliorer la qualite de la revue de code en combinant des approches classiques d'analyse statique avec une analyse contextuelle basee sur GraphRAG, les graphes de connaissances et les modeles de langage.

La solution proposee s'integre au cycle de developpement logiciel a travers GitHub, les pull requests, les webhooks et les pipelines d'automatisation. Le systeme recupere les changements du code, les analyse, construit une representation structurelle du repository dans Neo4j, enrichit le contexte par des embeddings et genere ensuite des findings contextualises grace a un pipeline GraphRAG. Les resultats sont sauvegardes, historises et exposes dans un dashboard destine au developpeur et au Tech Lead.

Ce travail couvre l'etude de l'existant, l'analyse des besoins, la conception globale de la plateforme, l'implementation de la release principale "Analyse intelligente du code avec GraphRAG", ainsi que la demonstration du scenario complet depuis l'ouverture d'une pull request jusqu'a la prise de decision du Tech Lead.

# Abstract

This final-year project focuses on the design and implementation of an intelligent AI-assisted code review platform. The main objective is to improve code review quality by combining traditional static analysis with contextual analysis based on GraphRAG, knowledge graphs, and large language models.

The proposed solution is integrated into the software development lifecycle through GitHub, pull requests, webhooks, and automation pipelines. The system retrieves code changes, analyzes them, builds a structured repository representation in Neo4j, enriches the context using embeddings, and generates contextualized findings through a GraphRAG pipeline. The results are stored, historized, and displayed in a dashboard intended for developers and Tech Leads.

This work covers the state of the art, requirements analysis, global platform design, implementation of the main release entitled "Intelligent Code Analysis with GraphRAG", and the end-to-end scenario from pull request opening to Tech Lead decision-making.

# Liste des figures

Cette section regroupera l'ensemble des figures du rapport, notamment les schemas d'architecture, les diagrammes de sequence, les diagrammes de classes, les captures d'ecran et les schemas du pipeline GraphRAG.

# Liste des tableaux

Cette section recensera les tableaux comparatifs et les tableaux de synthese, tels que la comparaison entre RAG et GraphRAG, la comparaison des modeles LLM, les tableaux de besoins fonctionnels et non fonctionnels, ainsi que les tableaux de resultats.

# Liste des abreviations

- AI : Artificial Intelligence
- AST : Abstract Syntax Tree
- CI : Continuous Integration
- CoT : Chain-of-Thought
- FTS : Full-Text Search
- KB : Knowledge Base
- LLM : Large Language Model
- PR : Pull Request
- RAG : Retrieval-Augmented Generation
- RLHF : Reinforcement Learning from Human Feedback
- UI : User Interface
- UML : Unified Modeling Language
- VPS : Virtual Private Server

# Introduction generale

Le developpement logiciel moderne repose sur des cycles de livraison rapides, des equipes distribuees et une exigence croissante en matiere de qualite, de securite et de maintenabilite. Dans ce contexte, la revue de code constitue une etape essentielle du cycle de vie logiciel. Elle permet d'identifier les erreurs, les vulnerabilites, les incoherences architecturales et les violations des bonnes pratiques avant l'integration finale du code.

Cependant, la revue de code manuelle presente plusieurs limites. Elle depend fortement de la disponibilite des reviewers, de leur charge cognitive, de leur connaissance du projet et du temps alloue a l'analyse. D'autre part, les outils classiques d'analyse statique, bien qu'utiles, restent limites dans leur capacite a comprendre l'intention, le contexte structurel et les dependances entre composants.

L'emergence des modeles de langage et des approches RAG a ouvert de nouvelles perspectives pour la revue de code intelligente. Toutefois, un RAG classique base uniquement sur la similarite vectorielle ne permet pas toujours de recuperer le contexte structurel necessaire a une analyse de code fiable. C'est dans cette optique que s'inscrit notre projet, qui propose une plateforme de revue de code intelligente basee sur GraphRAG, Neo4j, les embeddings et l'orchestration de services analytiques.

Le present rapport expose le cadre general du projet, l'etat de l'art des technologies mobilisees, la conception globale de la plateforme, puis la realisation detaillee de la release centrale : l'analyse intelligente du code avec GraphRAG.

---

# Chapitre 1 : Cadre general du projet

## 1.1 Introduction

Ce chapitre presente le contexte general dans lequel s'inscrit le projet, les objectifs poursuivis ainsi que la place du projet dans l'ecosysteme de l'entreprise ou de la structure d'accueil. Il permet d'introduire la problematique globale et de justifier l'interet du sujet choisi.

## 1.2 Organisme d'accueil / contexte du stage

Le projet a ete realise dans un contexte ou la qualite du code, la gouvernance des pull requests et l'automatisation des revues techniques sont devenues des enjeux importants. L'organisme d'accueil s'interesse a l'industrialisation des workflows de developpement, a l'amelioration de la productivite des equipes et a la reduction du risque technique lors des integrations.

Dans ce cadre, la mise en place d'une plateforme de revue de code intelligente repond a un besoin concret : aider les developpeurs et les Tech Leads a analyser plus rapidement et plus efficacement les changements proposes dans les pull requests.

## 1.3 Presentation du projet

Le projet consiste a concevoir une plateforme capable d'intercepter les changements de code provenant de repositories GitHub, de les analyser automatiquement a l'aide de plusieurs couches de traitement, puis de produire des commentaires et des findings exploitables par les developpeurs. La plateforme combine des techniques d'analyse statique, des graphes de code, des embeddings, une base de connaissances metier et des modeles de langage.

L'architecture du projet repose sur plusieurs briques principales : un backend base sur FastAPI, une orchestration asynchrone avec Celery et Redis, une persistance relationnelle dans PostgreSQL, une base de graphe Neo4j pour la representation structurelle et vectorielle, ainsi qu'un dashboard permettant de visualiser les resultats.

## 1.4 Problematique

La question centrale de ce projet est la suivante : comment automatiser une revue de code intelligente, contextualisee et traçable, tout en l'integrant de maniere naturelle dans le cycle GitHub des developpeurs ?

Cette problematique se declenche a partir de constats pratiques. Les outils d'analyse statique detectent des problemes syntaxiques, stylistiques ou reglementaires, mais ne comprennent pas toujours le contexte du repository ni l'impact d'un changement sur les dependances. Les modeles de langage, quant a eux, peuvent produire des suggestions pertinentes, mais ils souffrent d'hallucinations s'ils ne sont pas suffisamment ancres dans des donnees fiables et structurees.

## 1.5 Objectifs du projet

Le premier objectif est de concevoir une plateforme capable d'analyser automatiquement une pull request en s'appuyant sur un pipeline hybride. Le second objectif est d'ameliorer la qualite des findings grace a un moteur GraphRAG, plus adapte a la structure du code que le RAG simple. Le troisieme objectif est d'assurer une integration harmonieuse avec GitHub, les workflows CI et le dashboard de suivi.

Enfin, le projet vise a fournir un systeme evolutif permettant la reanalyse, l'historisation, l'integration de regles definies par les Tech Leads et la generation de suggestions contextualisees et exploitables.

## 1.6 Methodologie adoptee

La realisation du projet s'est appuyee sur une approche iterative inspiree des methodes agiles. Le travail a ete decoupe en releases et en sprints, permettant de structurer la progression selon des objectifs clairement definis. Chaque sprint a suivi une logique de specification, conception, implementation, tests et validation.

Cette demarche a permis de produire un systeme progressivement enrichi, tout en gardant une coherence globale entre les decisions architecturales, les besoins metier et les contraintes techniques.

## 1.7 Organisation du memoire

Le memoire est organise en plusieurs chapitres complementaires. Apres le cadre general du projet, nous presentons l'analyse des besoins et la planification. Un chapitre est ensuite consacre a l'etat de l'art, couvrant Git, GitHub, les LLM, le RAG, le GraphRAG, le chunking, les embeddings, Neo4j et le prompt engineering. Nous presentons ensuite la conception globale de la plateforme, puis la release centrale dediee a l'analyse intelligente du code avec GraphRAG. Enfin, nous terminons par la demonstration, l'evaluation qualitative, les limites et les perspectives.

## 1.8 Conclusion

Ce premier chapitre a pose le contexte du projet, defini sa problematique et presente ses objectifs. Il constitue le point de depart de l'etude detaillee qui sera poursuivie dans les chapitres suivants.

---

# Chapitre 2 : Analyse des besoins et planification

## 2.1 Introduction

Ce chapitre a pour objectif d'identifier les besoins reels du projet, de formaliser les attentes des utilisateurs et de structurer le travail de realisation. Il sert de base a la conception et permet de traduire la problematique en exigences concretes.

## 2.2 Etude de l'existant

### 2.2.1 Revue de code traditionnelle

La revue de code traditionnelle repose sur l'intervention d'un ou plusieurs reviewers humains qui examinent le code avant sa fusion dans la branche cible. Cette pratique joue un role essentiel dans la reduction des erreurs et la transmission des bonnes pratiques. Cependant, elle reste chronophage et depend fortement de la disponibilite ainsi que du niveau d'expertise des reviewers.

### 2.2.2 Outils classiques d'analyse statique

Des outils comme Ruff, ESLint, Semgrep, SQLFluff ou d'autres linters permettent d'automatiser une partie de la verification du code. Ils sont performants pour detecter des patterns definis, des problemes de style, des vulnerabilites connues ou des violations syntaxiques. Toutefois, ils ne sont pas concus pour raisonner sur le contexte global du repository ni sur l'intention fonctionnelle d'un changement.

### 2.2.3 Limites des approches existantes

Les limites principales observees sont le manque de contextualisation, l'absence de raisonnement inter-fichiers, la difficulte a faire le lien entre les regles metier et le code modifie, ainsi que l'absence de synthese intelligente ancree dans des preuves structurelles. Ces limites justifient l'introduction d'une couche GraphRAG dans la plateforme.

## 2.3 Problematique detaillee

Le systeme doit repondre a plusieurs besoins simultanes. Il doit detecter les changements de code a partir d'une pull request, en extraire un contexte utile, croiser ce contexte avec des regles et des documents, produire des findings exploitables, reduire les hallucinations des LLM et garantir la tracabilite des resultats. Il doit aussi s'integrer proprement a GitHub, au dashboard et a l'historique des analyses.

## 2.4 Objectifs fonctionnels et techniques

Sur le plan fonctionnel, le systeme doit permettre d'enregistrer des repositories, d'analyser les pull requests, de presenter les resultats dans un dashboard, de sauvegarder l'historique et de donner au Tech Lead la possibilite de definir des regles ou templates. Sur le plan technique, il doit supporter le traitement asynchrone, la persistance, l'indexation incrementale et une architecture modulaire capable d'evoluer.

## 2.5 Identification des acteurs

### 2.5.1 Administrateur

L'administrateur configure la plateforme, gere les organisations, les projets, les integrations et eventuellement les parametrages globaux du systeme. Il joue un role central dans l'initialisation et le bon fonctionnement de l'infrastructure.

### 2.5.2 Developpeur

Le developpeur pousse du code vers un repository GitHub et ouvre des pull requests. Il consulte ensuite les commentaires et findings generes par la plateforme afin de corriger son code, d'ameliorer sa qualite et d'augmenter ses chances de validation par le reviewer.

### 2.5.3 Tech Lead / Reviewer

Le Tech Lead ou reviewer valide la pertinence des findings, applique les regles metier, suit les analyses dans le dashboard et prend la decision finale sur la pull request. Il constitue l'acteur cle de la gouvernance qualitative du code.

## 2.6 Recueil des besoins

### 2.6.1 Besoins fonctionnels

Le systeme doit importer un repository GitHub, suivre les branches, recevoir les evenements de pull request via webhook, parser le diff, executer l'analyse, afficher les findings et les sauvegarder. Il doit aussi permettre de relancer une analyse et de visualiser l'historique.

### 2.6.2 Besoins non fonctionnels

Le systeme doit etre performant, modulaire, extensible, traçable, robuste face aux erreurs partielles et securise lors du traitement des diffs. Il doit egalement supporter des repositories relativement volumineux grace a une indexation incrementale.

## 2.7 User stories

Une user story typique peut etre formulee ainsi : "En tant que developpeur, je veux qu'une analyse soit declenchee automatiquement lorsque j'ouvre une pull request, afin d'obtenir rapidement des retours sur mon code." Une autre user story importante est : "En tant que Tech Lead, je veux consulter des findings structures et traceables, afin de prendre une decision fiable sur la pull request."

## 2.8 Cas d'utilisation globaux

Les cas d'utilisation principaux sont : connecter un repository, declencher une analyse a partir d'une pull request, consulter les findings, enregistrer l'historique, parametrer des templates de revue et lancer une reanalyse apres mise a jour de la PR.

## 2.9 Backlog produit

Le backlog a ete structure autour des fonctionnalites essentielles du produit : gestion GitHub, analyse statique, integration GraphRAG, dashboard, historique, templates Tech Lead, securisation des diffs et orchestration asynchrone.

## 2.10 Planification des releases et sprints

La release centrale a ete decoupee en trois sprints majeurs. Le premier concerne l'indexation du repository et la construction du graphe de code. Le deuxieme porte sur la recherche hybride et la generation des findings GraphRAG. Le troisieme couvre l'orchestration, l'historique, les templates Tech Lead et l'integration en production.

## 2.11 Conclusion

Ce chapitre a permis de transformer la problematique en besoins concrets et de structurer la planification de la realisation. Il constitue la base de la conception detaillee presentee dans les chapitres suivants.

---

# Chapitre 3 : Etat de l'art : revue de code, IA, Git et GraphRAG

## 3.1 Introduction

L'objectif de ce chapitre est de presenter les concepts et technologies qui structurent notre solution. Nous y abordons d'abord le workflow Git et GitHub, puis les approches de revue de code assistee par IA, les modeles de langage, le RAG, les strategies de chunking et d'embedding, les graphes de connaissances, Neo4j et le prompt engineering.

## 3.2 Gestion collaborative du code source

### 3.2.1 Presentation de Git

Git est un systeme de gestion de versions distribue. Il permet de conserver l'historique des modifications du code source, de collaborer a plusieurs sur un meme projet et de gerer differentes branches de developpement de facon souple et fiable.

### 3.2.2 Concepts fondamentaux : repository, commit, branch, merge

Le repository represente le depot contenant l'historique complet du projet. Le commit correspond a un instantane versionne du code. La branch permet d'isoler une ligne de travail. Enfin, le merge consiste a integrer les modifications d'une branche dans une autre. Ces concepts sont fondamentaux pour comprendre le cycle de vie des pull requests.

### 3.2.3 Operations Git : init, clone, fetch, pull, push

La commande `init` initialise un nouveau repository local. `clone` recupere un depot distant. `fetch` met a jour les references distantes sans fusion automatique. `pull` combine recuperation et integration locale. `push` envoie les commits locaux vers le serveur distant. Dans le cadre de notre plateforme, ces operations sont importantes pour comprendre la provenance des changements analyses.

### 3.2.4 Historique Git et tracabilite des versions

L'un des principaux apports de Git est la tracabilite. Chaque commit possede un identifiant unique, un auteur, un message et un instant d'enregistrement. Cette propriete rend possible le suivi des evolutions du code et l'association d'une analyse a un commit ou a une pull request donnee.

### 3.2.5 Branches locales et branches distantes

Les branches locales permettent aux developpeurs de travailler en isolation. Les branches distantes representent les etats exposes par la plateforme Git distante. Leur utilisation organisee rend possible des workflows de developpement plus robustes et facilite la revue de code.

### 3.2.6 Workflow Git dans les projets collaboratifs

Dans un projet collaboratif, les developpeurs creent generalement une branche dediee a une fonctionnalite ou a un correctif, y poussent leurs commits, puis ouvrent une pull request. C'est a ce niveau que notre plateforme intervient pour analyser automatiquement le code propose.

### 3.2.7 GitFlow

GitFlow propose une organisation des branches autour de `main`, `develop`, des branches de fonctionnalite, de release et de hotfix. Ce modele est adapte aux projets ayant des cycles de livraison plus formels. Il apporte de la structure, mais peut etre percu comme plus lourd dans les equipes qui privilegient la rapidite.

### 3.2.8 GitHub Flow

GitHub Flow est un workflow plus leger. Il s'articule generalement autour d'une branche principale et de branches courtes dediees a chaque changement. Une pull request est ouverte pour chaque contribution. Ce flux est souvent plus adapte aux environnements de livraison continue.

### 3.2.9 Comparaison GitFlow vs GitHub Flow

GitFlow offre une meilleure separation des phases de developpement et de stabilisation, tandis que GitHub Flow est plus simple et mieux adapte aux equipes qui travaillent de maniere iterative avec des integrations frequentes. Dans notre contexte, le cycle des pull requests et l'integration GitHub s'alignent naturellement avec une logique proche de GitHub Flow.

### 3.2.10 Pull request et merge request

Une pull request est une demande de fusion d'une branche source vers une branche cible, accompagnee d'un espace de discussion et de validation. Le terme merge request est davantage utilise dans d'autres plateformes comme GitLab. Dans notre rapport, nous privilegions le terme pull request car notre plateforme s'integre principalement a GitHub.

### 3.2.11 Cycle de vie d'une pull request

Le cycle de vie d'une pull request inclut la creation, la mise a jour, la revue, les commentaires, les tests d'integration, la validation et la fusion. Chaque etape peut emettre des signaux exploitables par la plateforme pour declencher ou relancer une analyse.

### 3.2.12 Revue collaborative et validation du code

La pull request constitue un point d'intersection entre production de code, validation collaborative et automatisation. L'objectif de notre solution est d'enrichir cette etape avec une analyse intelligente qui vienne completer le jugement humain du reviewer.

## 3.3 GitHub comme plateforme d'integration du code

### 3.3.1 Repositories GitHub

GitHub fournit un environnement complet pour l'hebergement du code, la gestion des branches, les pull requests, les webhooks et les pipelines CI. Son ecosysteme facilite l'integration de solutions externes comme notre plateforme de revue de code intelligente.

### 3.3.2 Pull requests

Les pull requests jouent un role central dans notre architecture. Elles servent de point d'entree au pipeline d'analyse. Le diff qu'elles portent constitue l'objet principal a analyser.

### 3.3.3 Webhooks GitHub

Les webhooks permettent a GitHub de notifier un systeme externe lorsqu'un evenement se produit, par exemple l'ouverture, la mise a jour ou la synchronisation d'une pull request. Ils assurent ainsi un declenchement evenementiel plutot qu'un polling continu.

### 3.3.4 Structure du payload d'une pull request

Le payload d'une pull request contient des informations sur le repository, la branche source, la branche cible, les commits, l'auteur, l'etat de la PR et les URL de recuperation des donnees associees. L'analyse correcte de ce payload permet de determiner le contexte dans lequel l'analyse doit etre executee.

### 3.3.5 GitHub Actions et integration continue

GitHub Actions permet d'executer des workflows automatiques a chaque evenement. Dans un projet de revue de code intelligente, ces workflows peuvent lancer des tests, des verifications de qualite ou interagir avec des analyses automatisees.

### 3.3.6 Execution des controles CI a chaque pull request

L'execution de controles a chaque pull request contribue a la reduction du risque d'integration. Les checks automatises et les commentaires generees par notre plateforme forment ensemble une boucle d'amelioration de la qualite.

### 3.3.7 Feedback automatise dans le cycle de developpement

L'un des enjeux majeurs est de fournir un feedback suffisamment rapide pour etre utile. En integrant l'analyse au cycle GitHub, le developpeur recoit les retours dans un moment ou il peut encore corriger son code efficacement.

## 3.4 Revue de code assistee par intelligence artificielle

### 3.4.1 Analyse statique classique

L'analyse statique examine le code sans execution. Elle permet de signaler des erreurs de style, de securite ou de logique simple. Elle reste indispensable dans notre plateforme, notamment comme couche complementaire et source d'indices structurants.

### 3.4.2 Limites de l'analyse statique

Ses principales limites proviennent de son caractere regle-base et local. Elle ne comprend pas naturellement le contexte semantique ni les dependances complexes entre composants. Elle ne peut pas non plus synthétiser une interpretation globale du changement.

### 3.4.3 Apport des modeles de langage dans la revue de code

Les LLM sont capables de generer des explications, de reformuler des risques et de proposer des corrections. Ils apportent donc une dimension interprétative et contextuelle, a condition d'etre correctement ancres dans des donnees pertinentes.

### 3.4.4 Generation de commentaires automatiques

L'interet des LLM reside notamment dans la generation de commentaires plus proches du langage humain et mieux adaptes a la lecture d'une pull request. Ces commentaires sont plus utiles lorsqu'ils incluent un message clair, un niveau de severite, une justification et une suggestion.

### 3.4.5 Limites des approches purement LLM

Les approches purement generatives souffrent du manque de traçabilite, de l'hallucination et d'une difficulte a garantir la coherence des resultats. C'est pour cette raison que le LLM ne doit pas etre le seul moteur de la revue, mais plutot la couche de generation d'un pipeline ancre.

## 3.5 Modeles de langage (LLM)

### 3.5.1 Definition et principes generaux

Les modeles de langage de grande taille apprennent des distributions statistiques sur des corpus massifs de texte et de code. Ils peuvent ensuite generer des reponses, des explications ou des suggestions a partir d'un prompt.

### 3.5.2 Notion de tokens

Un token est une unite de texte traitee par le modele. La longueur d'un prompt et d'une reponse est donc mesuree en tokens. Cette notion a un impact direct sur le cout, la latence et la quantite de contexte exploitable.

### 3.5.3 Fenetre de contexte (context window)

La fenetre de contexte designe le nombre maximal de tokens qu'un modele peut traiter simultanement. Dans une application de revue de code, cette limite est importante car le diff, les regles, les documents, le sous-graphe et les traces doivent souvent etre compactes.

### 3.5.4 Cout, latence et consommation de tokens

Le cout des LLM depend du nombre de tokens envoyes et generes. La latence depend du fournisseur, de la taille du modele et de la charge systeme. La plateforme doit donc arbitrer entre profondeur d'analyse, rapidite et cout d'usage.

### 3.5.5 Hallucinations et manque d'ancrage

Une hallucination se produit lorsqu'un modele affirme quelque chose qui n'est pas supporte par le contexte reel. Dans la revue de code, ce probleme est critique car il peut produire des recommandations injustifiees. D'ou l'importance du grounding, de la priorite des regles et des references explicites.

### 3.5.6 Comparaison de modeles LLM

Les modeles peuvent etre compares selon leur qualite de raisonnement, leur precision sur le code, leur cout, leur latence, leur taille de contexte et leur disponibilite en local ou en cloud. Selon l'environnement, il peut etre pertinent d'utiliser un modele local pour le developpement et un modele plus performant en production.

### 3.5.7 Modeles ouverts vs modeles proprietaires

Les modeles ouverts offrent davantage de controle et peuvent etre deployes localement, mais ils ont souvent des performances inferieures aux meilleurs modeles proprietaires sur certains usages. Les modeles proprietaires, eux, peuvent offrir de meilleures performances, mais avec un cout plus eleve et une dependance externe plus forte.

### 3.5.8 Criteres de choix d'un LLM pour la plateforme

Le choix d'un LLM dans notre projet repose sur plusieurs criteres : compatibilite avec le code, capacite a respecter un format JSON, maitrise des hallucinations, cout raisonnable, disponibilite selon l'environnement et flexibilite d'integration.

## 3.6 Retrieval-Augmented Generation (RAG)

### 3.6.1 Principe general du RAG

Le RAG consiste a recuperer du contexte pertinent depuis une base externe avant de demander au LLM de generer une reponse. Cela permet d'ameliorer la precision en ancrant le modele dans des donnees plus proches de la question posee.

### 3.6.2 Chaine de traitement d'un pipeline RAG

Un pipeline RAG classique suit generalement les etapes suivantes : collecte des connaissances, decoupage en chunks, generation des embeddings, stockage vectoriel, retrieval des chunks pertinents et generation finale par le LLM.

### 3.6.3 Decoupage des connaissances en chunks

Le chunking permet de transformer un document ou un code volumineux en fragments plus maniables. Le choix de la granularite est essentiel : trop gros, les chunks saturent le contexte ; trop petits, ils perdent leur coherence semantique.

### 3.6.4 Representation vectorielle et embeddings

Les embeddings transforment des fragments de texte ou de code en vecteurs numeriques, afin de rendre possible une recherche par similarite. Leur qualite conditionne directement la precision du retrieval.

### 3.6.5 Recherche semantique

La recherche semantique permet de recuperer des fragments proches du sens de la requete, meme si les mots utilises diffèrent. Cette propriete est utile pour explorer un repository ou des documents techniques, mais elle ne suffit pas a capturer les relations structurelles du code.

### 3.6.6 Limites du RAG simple

Un RAG simple base uniquement sur les vecteurs peut recuperer des morceaux de code semantiquement proches, sans pour autant fournir les dependances, le chemin d'appel, le contexte d'architecture ou les relations entre classes et fonctions. Cette faiblesse motive l'introduction du GraphRAG.

### 3.6.7 Fragmentation du contexte

La fragmentation est l'un des problemes majeurs du RAG standard. Un chunk de fonction peut etre recuperé sans son fichier, sans ses imports ou sans ses appels. L'interpretation par le LLM devient alors fragile.

### 3.6.8 Difficultes sur les donnees de code structurees

Le code source est une donnee structuree par nature. Il inclut des relations d'import, de dependance, d'heritage et d'appel. Une approche uniquement semantique ne rend pas pleinement compte de cette structure.

## 3.7 Strategies de chunking

### 3.7.1 Chunking de code source

Le code source doit etre decoupe en respectant autant que possible les frontieres logiques, comme les fonctions, les classes ou les modules. Cela permet de conserver une unite semantique exploitable lors de la recuperation.

### 3.7.2 Chunking AST / code-aware

Le chunking base sur l'AST ou sur une analyse syntaxique est particulierement adapte au code. Il permet de decouper les fichiers selon leur structure reelle, plutot que selon une simple fenetre de caracteres ou de lignes.

### 3.7.3 Chunking de documentation Markdown

Pour la documentation Markdown, le chunking peut s'appuyer sur les titres, sous-titres et blocs fonctionnels, afin de preserver la coherence des sections.

### 3.7.4 Chunking de fichiers PDF

Les PDF peuvent etre decoupes par section, paragraphe ou bloc thématique. Le decoupage doit tenir compte de la structure du document et de la densite informationnelle.

### 3.7.5 Chunking de tickets Jira

Les tickets Jira peuvent etre representes comme des entites enrichies avec titre, description, commentaires et meta-donnees. Leur chunking peut differer de celui du code en raison de leur nature plus narrative.

### 3.7.6 Chunking de pages web techniques

Les pages web techniques doivent etre nettoyees puis decoupees selon leurs sections principales, afin de limiter le bruit et d'extraire un contenu pertinent pour la base de connaissances.

### 3.7.7 Comparaison des strategies selon le type de contenu

Chaque type de contenu exige une strategie adaptee. Le code demande une approche structurelle, la documentation une approche editoriale, et les tickets une approche semi-structurée. Une bonne plateforme doit etre capable de modulariser ces strategies.

## 3.8 Strategies d'embedding

### 3.8.1 Embeddings pour le code source

Les embeddings de code doivent idealement capturer des indices syntaxiques et semantiques proches de la programmation. Ils sont utilises pour rapprocher un diff de fragments de code similaires dans le repository.

### 3.8.2 Embeddings pour les documents techniques

Les documents techniques, guides internes et regles metier peuvent etre encodes avec des modeles adaptes au texte generaliste. Ces embeddings servent a recuperer des regles et documents proches de la situation analysee.

### 3.8.3 Embeddings pour les regles et politiques

Les regles et politiques internes constituent un cas particulier car elles doivent etre prioritaires dans la generation. Le systeme doit donc pouvoir les identifier, les recuperer et les injecter en amont du contexte repository.

### 3.8.4 Criteres de choix d'un modele d'embedding

Les criteres principaux sont la qualite de la similarite, la taille des vecteurs, la vitesse de calcul, le cout et la coherence avec le contenu traite.

### 3.8.5 Coherence entre type de contenu et representation vectorielle

Une bonne architecture ne se contente pas d'utiliser un modele unique sur tous les contenus sans reflexion. Elle cherche une coherence entre la nature du contenu, la strategie de chunking et la methode d'indexation.

## 3.9 Graphes de connaissances et graphes de code

### 3.9.1 Knowledge graph : concepts de base

Un knowledge graph represente des entites et leurs relations. Il permet de modeliser explicitement des dependances et de raisonner a partir d'elles.

### 3.9.2 Carte de connaissances

La carte de connaissances est une vue organisee des informations utiles au systeme. Dans notre cas, elle inclut des repositories, fichiers, fonctions, classes, chunks, regles, documents, analyses et findings.

### 3.9.3 Representation structurelle des relations

Les relations structurelles rendent possible des traversées pertinentes, comme identifier les fichiers dependants, les fonctions appelantes ou les composants lies a un changement.

### 3.9.4 Graphe de code : fichiers, classes, fonctions, dependances

Le graphe de code est particulierement adapte a la revue de code car il formalise la structure logique du repository. Il depasse une simple representation lineaire des fichiers.

### 3.9.5 Construction de graphes a partir du code

La construction du graphe peut s'appuyer sur l'analyse du code, l'extraction des symboles, l'identification des imports et des appels de fonctions, ainsi que sur un modele de stockage dans Neo4j.

## 3.10 GraphRAG

### 3.10.1 Definition et principes

GraphRAG combine la generation augmentee par retrieval avec l'exploitation d'un graphe de connaissances. Il associe ainsi retrieval semantique et raisonnement structurel.

### 3.10.2 Difference entre RAG et GraphRAG

Le RAG classique recupere des fragments proches semantiquement. Le GraphRAG ajoute des chemins structurels, des voisins pertinents et des sous-graphes utiles a l'analyse.

### 3.10.3 Limites du RAG standard pour l'analyse de code

Les limites du RAG standard apparaissent clairement sur le code : absence de chemins d'appel, perte de contexte d'import, difficulte a localiser les composants impactes et incapacité a raisonner naturellement sur des dependances multi-hop.

### 3.10.4 Retrieval hybride : vecteurs + graphe + symboles

Notre projet s'inscrit dans une logique hybride. Le diff fournit des symboles, les vecteurs rapprochent des chunks semantiquement proches, et le graphe permet une expansion contextuelle. Cette combinaison renforce la precision et la pertinence.

### 3.10.5 Raisonnement multi-hop

Le raisonnement multi-hop consiste a suivre plusieurs relations successives pour estimer l'impact d'un changement. Cette propriete est essentielle dans l'analyse de code complexe.

### 3.10.6 Tracabilite des resultats

Le GraphRAG favorise des findings plus traçables car chaque element du contexte peut etre rattache a des noeuds, des relations ou des documents identifiables.

### 3.10.7 Pourquoi GraphRAG pour notre plateforme

Le choix de GraphRAG dans notre plateforme est motive par la nature structuree du code, la necessite d'une analyse inter-fichiers, l'importance des regles metier et le besoin de limiter les hallucinations du LLM.

## 3.11 Neo4j pour l'analyse de code

### 3.11.1 Presentation de Neo4j

Neo4j est une base de donnees graphe qui permet de stocker des noeuds et des relations avec leurs proprietes. Elle est adaptee aux cas ou la structure des relations est centrale.

### 3.11.2 Modele property graph

Le modele property graph represente les entites sous forme de noeuds etiquetes et les liens sous forme de relations typées, le tout enrichi par des proprietes.

### 3.11.3 Langage Cypher

Cypher est le langage de requete de Neo4j. Il est bien adapte a la recherche de motifs, a la traversée des dependances et a l'extraction de sous-graphes.

### 3.11.4 Traversee de graphe

La traversee de graphe permet d'explorer les voisins, les impacts potentiels et les chemins utiles autour d'un changement de code.

### 3.11.5 Recherche vectorielle native dans Neo4j

L'un des interets de Neo4j dans notre projet est de centraliser la structure graphe et la recherche vectorielle, en evitant la dispersion entre plusieurs stores heterogenes.

### 3.11.6 Mise a jour incrementale avec MERGE

La semantique `MERGE` de Cypher facilite l'upsert et donc la mise a jour incrementale des noeuds et relations. Cette capacite est importante pour eviter une reindexation complete a chaque analyse.

### 3.11.7 Interet de Neo4j dans le projet

Neo4j est retenu car il fournit a la fois un support aux graphes de code, a la traçabilite, a la vectorisation native et aux traversées multi-hop pertinentes pour l'analyse contextuelle.

## 3.12 Prompt engineering pour la revue de code

### 3.12.1 Role du prompt dans la generation

Le prompt joue un role crucial dans la qualite des findings generes. Il structure le travail du LLM, hiérarchise les informations et impose les contraintes de sortie.

### 3.12.2 Structure hierarchique d'un prompt

Un prompt bien concu comprend generalement une instruction systeme, un contexte prioritaire, le diff a analyser, les contraintes de sortie et les attendus metier.

### 3.12.3 Contexte systeme

Le contexte systeme fixe le role du modele, par exemple celui d'un reviewer de code strict, focalise sur la precision, la traçabilite et le respect des regles.

### 3.12.4 Injection des regles metier

Les regles metier doivent etre injectees explicitement dans le prompt, en tant que contexte prioritaire. Cela permet de rapprocher les findings des attentes organisationnelles.

### 3.12.5 Injection du contexte graphe

Le contexte graphe peut prendre la forme d'une liste de dependances, d'appels ou de chemins significatifs. Il enrichit la comprehension du changement au-dela du diff brut.

### 3.12.6 Injection du diff a analyser

Le diff constitue l'objet central de l'analyse. Il doit etre fourni de facon lisible et limitee pour respecter les contraintes de tokens.

### 3.12.7 Contraintes de sortie JSON

Afin de faciliter le post-traitement, le modele doit retourner une structure formelle, idealement en JSON, contenant severite, categorie, message, suggestions et references.

### 3.12.8 Chain-of-Thought

Le raisonnement en chaine peut etre utile pour structurer l'analyse du changement, mais il doit etre utilise avec prudence. Dans un rapport, il convient de distinguer ce qui est theorique de ce qui est reellement industrialise dans la plateforme.

### 3.12.9 Auto-critique

L'auto-critique vise a faire verifier au modele ses propres reponses selon certains criteres. Cette approche est interessante conceptuellement, mais doit etre clairement presentee comme un choix de conception ou une perspective si elle n'est pas pleinement implementee.

### 3.12.10 Grounding et citations

Le grounding impose que le contenu genere soit rattache a des preuves, qu'il s'agisse de regles, de chemins de graphe, de fichiers ou de lignes. Ce mecanisme est essentiel pour limiter les hallucinations.

### 3.12.11 Guardrails anti-hallucination

Les guardrails combinent contraintes de format, seuils de confiance, priorite des regles et ancrage sur des references. Leur role est central dans les systemes de revue de code intelligente.

## 3.13 Synthese et positionnement de notre approche

### 3.13.1 Comparaison avec les approches concurrentes

Les approches concurrentes reposent souvent soit sur l'analyse statique classique, soit sur un LLM direct, soit sur un RAG simple. Notre approche se distingue par l'articulation entre structure graphe, retrieval hybride, base de connaissances et generation traceable.

### 3.13.2 Choix du GraphRAG plutot que du RAG simple

Le choix du GraphRAG est justifie par la necessite d'exploiter les relations structurelles du code. Le repository n'est pas une simple collection de documents : c'est un systeme de composants relies. Cette realite rend le GraphRAG particulierement pertinent.

### 3.13.3 Positionnement de notre solution

Notre solution se positionne comme une plateforme de revue de code intelligente hybride, integree au workflow GitHub et orientee vers la production de findings contextualises, traçables et exploitables.

## 3.14 Conclusion

Ce chapitre a etabli le socle conceptuel et technique du projet. Les notions de Git, GitHub, LLM, RAG, GraphRAG, chunking, embeddings, Neo4j et prompt engineering constituent les fondations de la solution implementee.

---

# Chapitre 4 : Analyse et conception globale de la plateforme AI Code Review

## 4.1 Introduction

Dans ce chapitre, nous presentons la conception globale de la plateforme AI Code Review. Nous explicitons la vision du systeme, ses modules, les integrations externes, les flux de donnees et l'architecture technique generale.

## 4.2 Vision globale de la plateforme

La plateforme a pour vocation d'assister les developpeurs et les reviewers dans l'analyse des pull requests. Elle agit comme une couche d'intelligence intermediaire entre GitHub, les outils d'analyse et les utilisateurs du dashboard.

Le systeme ne remplace pas la revue humaine. Il cherche au contraire a l'augmenter en reduisant le bruit, en mettant en evidence des risques pertinents et en fournissant des explications contextualisees.

## 4.3 Objectifs fonctionnels de la plateforme

La plateforme doit permettre de connecter des repositories, de recevoir des evenements GitHub, de declencher des analyses, de stocker les resultats, de les afficher dans un dashboard, et d'introduire des regles definies par les Tech Leads. Elle doit egalement supporter la reanalyse et la comparaison historique.

## 4.4 Architecture generale

### 4.4.1 Vue d'ensemble de l'architecture

L'architecture globale suit un modele distribue a base de services. GitHub est la source des evenements. FastAPI joue le role de point d'entree. Celery et Redis assurent l'orchestration asynchrone. PostgreSQL persiste les metadonnees relationnelles. Neo4j stocke le graphe et les vecteurs. Le dashboard expose les resultats aux utilisateurs.

### 4.4.2 Architecture backend

Le backend est responsable de l'exposition des APIs, du traitement des webhooks, de l'authentification, de la resolution des repositories, du parsing des diffs, de l'orchestration de l'analyse et de la persistance des resultats.

### 4.4.3 Architecture frontend / dashboard

Le dashboard permet d'afficher les analyses, les findings, les historiques et les templates. Il constitue l'interface de consultation et de pilotage pour les developpeurs et les Tech Leads.

### 4.4.4 Architecture de donnees

Les donnees sont reparties selon leur nature. PostgreSQL gere principalement les structures transactionnelles et l'etat des analyses. Neo4j stocke les noeuds, relations, embeddings et historique structurel. Cette separation favorise la lisibilite et l'evolutivite.

### 4.4.5 Architecture d'integration externe

Les integrations principales concernent GitHub pour les repositories et pull requests, ainsi que les fournisseurs LLM pour la generation de findings. D'autres integrations peuvent concerner la documentation technique ou les bases de connaissances.

## 4.5 Integration GitHub

### 4.5.1 Liaison du repository GitHub a la plateforme

L'onboarding d'un repository consiste a etablir le lien entre un projet de la plateforme et un repository distant. Cette etape permet de savoir quel code analyser et dans quel contexte organisationnel.

### 4.5.2 Onboarding d'un repository

Lors de l'onboarding, la plateforme enregistre les informations du repository, resout les chemins locaux si necessaire, prepare le profil du projet et peut initialiser une premiere indexation de contexte.

### 4.5.3 Declenchement des analyses a partir des pull requests

Une fois le repository connecte, les evenements lies aux pull requests servent de declencheurs. L'ouverture ou la mise a jour d'une PR peut automatiquement lancer une nouvelle analyse.

### 4.5.4 Reception des evenements webhook GitHub

Le backend expose un endpoint webhook recevant les notifications GitHub. Ces evenements sont verifies, parses, puis traduits en actions applicatives.

### 4.5.5 Analyse du payload GitHub

Le payload est utilise pour retrouver le repository, les branches impliquees, le contexte de la pull request et les meta-donnees necessaires a l'orchestration.

### 4.5.6 Cycle de vie d'une pull request dans la plateforme

Dans la plateforme, une pull request passe par plusieurs etats fonctionnels : reception, mise en file, analyse en cours, generation des findings, affichage des resultats, puis eventuelle reanalyse apres mise a jour.

### 4.5.7 Pipeline PR -> webhook -> analyse -> feedback

Ce pipeline relie le monde GitHub au moteur d'analyse interne. Il formalise la chaine de valeur de la plateforme, depuis l'evenement externe jusqu'au feedback structure remis au developpeur et au Tech Lead.

## 4.6 Workflow Git et controle d'operation

### 4.6.1 Workflow de developpement adopte

Le projet s'inscrit dans un workflow base sur les branches de fonctionnalite et les pull requests, ce qui s'aligne bien avec la logique d'analyse automatisee declenchee a chaque changement significatif.

### 4.6.2 Gestion des branches

Les branches permettent de separer les evolutions. Leur gestion est importante car l'analyse doit toujours etre rattachee a un diff coherent entre une branche source et une branche cible.

### 4.6.3 Strategie de commits

Des commits atomiques et correctement messages facilitent la comprehension du travail et la traçabilite. Cette qualite de l'historique est utile meme si le moteur d'analyse s'appuie surtout sur les diffs de pull request.

### 4.6.4 Pull, fetch, merge, rebase dans le cycle projet

Ces operations structurent le cycle de vie du code et influencent indirectement le contexte disponible pour l'analyse, notamment lorsqu'il faut resoudre l'etat local du repository ou reconstituer une base de comparaison.

### 4.6.5 Pull requests et validation

La pull request est le point d'entree ideal pour un moteur de revue de code intelligente car elle concentre le changement, son auteur, son contexte et son espace de discussion.

### 4.6.6 Integration des controles automatiques

La plateforme s'insere dans un ecosysteme de controles automatiques plus large, comprenant la CI, les linters et les analyses intelligentes. L'objectif est de faire converger ces signaux vers un espace de decision coherent.

### 4.6.7 Bonnes pratiques de gouvernance du code

Le systeme encourage indirectement de bonnes pratiques : branches courtes, pull requests ciblées, commentaires explicites et usage de regles metier formalisees.

## 4.7 Integration continue et automatisation

### 4.7.1 GitHub Actions dans le projet

GitHub Actions permet d'executer des verifications automatiques a chaque PR. Cela contribue a constituer un socle de qualite en amont de la revue intelligente.

### 4.7.2 Verifications declenchees a chaque PR

Les verifications peuvent inclure tests unitaires, linters, checks de qualite ou autres verifications de securite. Elles fournissent des signaux complementaires a la couche GraphRAG.

### 4.7.3 Role de la CI dans la qualite du code

La CI automatise les controles repetitifs et permet de detecter rapidement les regressions. Elle ne remplace pas l'analyse contextuelle, mais elle la complete.

### 4.7.4 Interaction entre CI et pipeline d'analyse intelligente

Dans une vision ideale, les resultats CI, les findings statiques et les findings GraphRAG convergent dans le meme espace de restitution afin de permettre une meilleure priorisation.

## 4.8 Conception des modules principaux

### 4.8.1 Module de gestion des repositories

Ce module gere la resolution des repositories, les chemins locaux, les metadonnees de projet et la preparation du contexte d'analyse.

### 4.8.2 Module de revue intelligente

Ce module orchestre la logique d'analyse, depuis le diff jusqu'a la production de findings. Il constitue le coeur metier de la plateforme.

### 4.8.3 Module de base de connaissance

Il centralise les regles, les documents, les patterns et eventuellement les contenus externes relies a la gouvernance technique du projet.

### 4.8.4 Module d'orchestration

L'orchestration s'appuie sur des traitements asynchrones, permettant de gerer les analyses sans bloquer les requetes utilisateurs.

### 4.8.5 Module d'historique

Ce module stocke les analyses successives et permet la comparaison inter-runs, l'audit et la visualisation de tendances.

### 4.8.6 Module de templates Tech Lead

Le module de templates permet aux leads de formaliser des consignes ou des grilles de revue, renforçant l'alignement entre la plateforme et les exigences metier.

### 4.8.7 Module dashboard

Le dashboard est l'interface de sortie du systeme. Il expose les analyses, les findings, les statuts et les vues de suivi.

## 4.9 Modelisation fonctionnelle

### 4.9.1 Diagramme de cas d'utilisation global

Le diagramme de cas d'utilisation global met en evidence les principales interactions entre les acteurs et les modules du systeme.

### 4.9.2 Diagrammes de sequence globaux

Les diagrammes de sequence illustrent le passage d'un evenement GitHub vers l'analyse et la restitution du resultat.

### 4.9.3 Diagramme d'activites global

Le diagramme d'activites permet de decrire le flux operationnel de bout en bout, y compris les transitions entre statuts.

### 4.9.4 Diagramme de classes global

Le diagramme de classes aide a representer les principales entites metier, leurs attributs et leurs relations.

## 4.10 Conception de l'architecture technique

### 4.10.1 FastAPI

FastAPI sert de facade applicative, expose les endpoints, integre les webhooks et coordonne les interactions applicatives.

### 4.10.2 Celery

Celery execute les analyses lourdes en tache asynchrone, ce qui permet de decoupler les traitements intensifs du cycle requete-reponse.

### 4.10.3 Redis

Redis sert principalement de broker ou de support de coordination pour l'execution des taches Celery et, selon les usages, pour des caches intermédiaires.

### 4.10.4 PostgreSQL

PostgreSQL stocke les analyses, leurs statuts, les findings persistants, les metadonnees de projet et d'autres donnees transactionnelles.

### 4.10.5 Neo4j

Neo4j heberge la representation graphe du contexte code et de la connaissance, ainsi que des index vectoriels utilises lors du retrieval.

### 4.10.6 GitHub

GitHub fournit la source du code, des pull requests, des webhooks et du workflow de collaboration qui alimente la plateforme.

### 4.10.7 LLM provider layer

La couche de provider LLM permet d'abstraire le fournisseur utilise et de supporter plusieurs modeles selon l'environnement d'execution.

## 4.11 Securite, tracabilite et resilience

### 4.11.1 Scan des secrets

Avant tout envoi vers le LLM, le diff doit etre scanne afin d'eviter l'exposition de secrets potentiels. Cette etape est importante pour la securite de la plateforme.

### 4.11.2 Redaction du diff

Lorsqu'un contenu sensible est detecte, une version redigee du diff est produite pour garantir que l'analyse conserve sa valeur sans divulguer les informations critiques.

### 4.11.3 Historique des analyses

La conservation de l'historique favorise la traçabilite, l'audit et la comparaison entre analyses successives.

### 4.11.4 Journalisation et audit

La journalisation technique permet de suivre l'etat des traitements et d'identifier les erreurs. Elle contribue a la maintenabilite et a la fiabilite de la solution.

### 4.11.5 Tolerance aux pannes partielles

Le systeme doit pouvoir continuer a fonctionner partiellement si certaines composantes echouent, par exemple si le LLM est temporairement indisponible.

## 4.12 Boucle de feedback et reanalyse

### 4.12.1 Feedback developpeur

Le developpeur utilise les findings pour corriger son code, comprendre les remarques et ajuster sa pull request.

### 4.12.2 Feedback Tech Lead

Le Tech Lead utilise les retours du systeme comme aide a la decision, mais conserve la maitrise de la validation finale.

### 4.12.3 Reanalyse apres mise a jour de la PR

Lorsque le developpeur met a jour sa PR, le systeme peut relancer une analyse afin de mesurer l'evolution des findings.

### 4.12.4 Capitalisation des resultats

Les analyses successives peuvent contribuer a enrichir la connaissance du projet, a affiner les regles et a mieux comprendre les tendances qualitatives.

### 4.12.5 Amelioration continue du systeme

La boucle de feedback doit idealement conduire a une meilleure adaptation de la plateforme aux besoins reels des equipes.

## 4.13 Conclusion

Ce chapitre a presente la conception globale de la plateforme et a situe le moteur GraphRAG dans un ecosysteme plus large, comprenant GitHub, l'orchestration, la persistence, la base de connaissances et l'interface utilisateur.

---

# Chapitre 5 : Release – Analyse intelligente du code avec GraphRAG

## 5.1 Introduction de la release

Cette release constitue le coeur innovant du projet. Elle apporte un moteur d'analyse intelligente base sur GraphRAG, capable d'exploiter simultanement le diff de la pull request, le contexte du repository, les relations structurelles du code, les regles de la base de connaissances et les capacites generatives d'un LLM.

## 5.2 Objectif general de la release

L'objectif de cette release est de transformer un pipeline de revue de code automatisee en un systeme plus intelligent, plus contextualise et plus traçable. Il ne s'agit plus seulement de detecter des anomalies locales, mais de raisonner sur l'impact, les dependances, les regles metier et la coherence du changement propose.

## 5.3 Position de GraphRAG dans la plateforme AI Code Review

GraphRAG occupe une position intermediaire entre la couche de collecte du contexte et la couche de generation des findings. Il agit comme un mecanisme de recuperation et d'organisation du contexte pertinent avant l'intervention du LLM.

## 5.4 Problematique adressee par la release

La release cherche a resoudre les limites d'une revue automatisee basee soit uniquement sur l'analyse statique, soit uniquement sur des LLM. Elle cherche a apporter un contexte de meilleure qualite au modele, afin de produire des findings plus fiables et plus utiles.

## 5.5 Difference entre analyse statique, RAG et GraphRAG

L'analyse statique repose sur des regles predefinies appliquees localement sur le code. Le RAG classique ajoute une recuperation semantique de contexte, mais reste limite dans la prise en compte de la structure du code. Le GraphRAG enrichit encore cette logique en exploitant explicitement les relations du graphe, ce qui le rend plus adapte aux repositories complexes.

## 5.6 Architecture globale du pipeline GraphRAG

Le pipeline GraphRAG de la plateforme se compose de plusieurs couches : indexation du repository, generation des embeddings, construction du graphe Neo4j, extraction du diff, retrieval hybride, assemblage du contexte, generation LLM, persistance des findings et affichage dans le dashboard.

## 5.7 Workflow GraphRAG en deux etapes

### 5.7.1 Etape 1 : indexation et structuration des connaissances

La premiere etape consiste a analyser le repository, le decouper en chunks exploitables, generer des embeddings et construire un graphe representant les entites et dependances du code. Cette phase peut etre complete ou incrementale.

### 5.7.2 Etape 2 : recuperation contextuelle et generation des resultats

La deuxieme etape commence a partir d'un diff de pull request. Le systeme recupere le contexte le plus pertinent selon une logique hybride, priorise les regles de la base de connaissances, assemble un prompt structure et confie la generation finale des findings au LLM.

## 5.8 Sprint 1 : Indexation du repository et construction du graphe de code

### 5.8.1 Introduction du sprint

Ce sprint pose les fondations du moteur GraphRAG. Sans representation structurelle ni contexte indexe, aucune analyse contextuelle fiable n'est possible. L'objectif principal est donc de transformer le repository en une base de connaissances exploitable.

### 5.8.2 Specification des besoins

#### 5.8.2.1 Besoins fonctionnels

Le systeme doit pouvoir importer ou acceder a un repository, detecter les fichiers de code pertinents, les decouper en fragments, generer des embeddings et construire un graphe contenant les entites et relations utiles a l'analyse.

#### 5.8.2.2 Besoins non fonctionnels

L'indexation doit etre assez performante pour supporter des repositories de taille raisonnable. Elle doit aussi etre incrementale afin d'eviter les recalculs inutiles. Enfin, elle doit garantir la traçabilite par organisation, projet et repository.

### 5.8.3 Conception

#### 5.8.3.1 Architecture de l'indexation GraphRAG

L'architecture de l'indexation repose sur un service de coordination qui orchestre le scan des fichiers, le chunking, la generation des embeddings, l'upsert dans Neo4j et la mise a jour des metadonnees du repository.

#### 5.8.3.2 Diagramme de cas d'utilisation : indexer un repository

Le cas d'utilisation "Indexer un repository" met en scene un administrateur ou un service systeme qui declenche l'operation. Le resultat attendu est une base graphe actualisee et prete pour le retrieval.

#### 5.8.3.3 Diagramme de sequence : repository -> chunking -> embeddings -> Neo4j

Le diagramme de sequence doit montrer comment le repository est parcouru, comment chaque fichier est decoupe, comment les embeddings sont generes et comment les noeuds et relations sont injectes dans Neo4j.

#### 5.8.3.4 Strategie de chunking code-aware

Le decoupage du code doit respecter les frontieres logiques, en particulier les fonctions et classes. Une approche code-aware ou AST-aware est preferable a un decoupage arbitraire.

#### 5.8.3.5 Strategies de chunking selon les types de contenu

Dans une architecture complete, le chunking varie selon le type de contenu. Le code est decoupe par fonctions ou classes, la documentation par sections, et les autres artefacts selon leur structure naturelle. Dans le cadre de cette release, l'accent est mis avant tout sur le code source et les documents de la base de connaissances.

#### 5.8.3.6 Strategies d'embedding selon les types de contenu

La plateforme doit pouvoir encoder differents types de contenus de facon compatible avec les recherches ulterieures. Les chunks de code, les regles et les documents doivent donc etre representes de maniere coherente pour etre recherches par similarite.

#### 5.8.3.7 Carte de connaissances de la plateforme

La carte de connaissances regroupe l'ensemble des entites reliees a la revue de code : organisation, projet, repository, fichiers, modules, fonctions, classes, chunks, regles, documents, analyses et findings.

#### 5.8.3.8 Modele hierarchique du graphe Neo4j

Le modele hierarchique part de l'organisation, descend vers le projet puis le repository, avant d'atteindre les fichiers, classes, fonctions et chunks. Cette hierarchie facilite le rattachement contextuel et l'analyse a plusieurs niveaux.

#### 5.8.3.9 Modele des noeuds : Organization, Project, Repository, File, Module, Class, Function, Chunk

Chaque noeud du graphe represente une entite metier ou technique. Les noeuds `File`, `Class`, `Function` et `Chunk` sont au centre du graphe de code, tandis que `Rule` et `KnowledgeDocument` enrichissent la base de connaissances.

#### 5.8.3.10 Relations du graphe : CONTAINS, DEFINES, IMPORTS, CALLS, DEPENDS_ON, CHUNKED_FROM

Les relations expriment la structure et les dependances du code. `CONTAINS` formalise la hierarchie, `DEFINES` rattache les symboles a leurs fichiers, `IMPORTS` et `DEPENDS_ON` capturent des dependances, `CALLS` relie les fonctions et `CHUNKED_FROM` rattache les fragments a leur origine logique.

#### 5.8.3.11 Recherche vectorielle native Neo4j pour les chunks, regles et documents

Le fait de disposer d'index vectoriels dans Neo4j simplifie l'architecture, car le systeme peut interroger a la fois la structure et les embeddings depuis un meme environnement.

#### 5.8.3.12 Mise a jour incrementale du graphe avec MERGE et upsert

La mise a jour incrementale permet de ne recalculer que les parties du graphe impactees par les changements. L'usage de `MERGE` et de mecanismes d'upsert favorise cette optimisation.

### 5.8.4 Realisation

#### 5.8.4.1 Service RepoContextManager

Le service `RepoContextManager` joue le role de coordinateur principal de l'indexation. Il decide si l'operation doit etre complete ou incrementale, scanne les fichiers et orchestre les etapes suivantes.

#### 5.8.4.2 Decoupage du code avec CodeChunker

Le composant de chunking prend chaque fichier et produit une liste de fragments exploitables. Le choix des frontieres est important pour garantir la valeur du retrieval futur.

#### 5.8.4.3 Generation des embeddings

Une fois les chunks produits, des embeddings sont generes et associes a chaque fragment. Cette representation vectorielle rend possible une recherche semantique ulterieure.

#### 5.8.4.4 Construction du graphe avec GraphBuilder

Le composant `GraphBuilder` est charge de transformer les chunks et symboles en noeuds et relations Neo4j. Il cree notamment des entites pour les fonctions, classes et dependances principales.

#### 5.8.4.5 Stockage dans Neo4j

Le stockage dans Neo4j s'effectue via un client centralise qui cree les contraintes, index, noeuds, relations et index vectoriels necessaires.

#### 5.8.4.6 Gestion de l'indexation complete et incrementale

Le systeme peut indexer integralement un repository lors de son onboarding, puis se limiter aux changements lors des mises a jour ulterieures. Cette capacite est essentielle pour la performance.

### 5.8.5 Tests et validation

#### 5.8.5.1 Test d'indexation d'un nouveau repository

Ce test consiste a verifier qu'un repository jamais analyse peut etre parcouru, vectorise et injecte dans Neo4j sans erreur.

#### 5.8.5.2 Test de mise a jour incrementale apres changement de fichiers

Ce test verifie que seuls les fichiers modifies sont re-traites lors d'une evolution du code.

#### 5.8.5.3 Verification des noeuds Neo4j

Il est important de verifier la creation correcte des noeuds et de leurs proprietes.

#### 5.8.5.4 Verification des relations du graphe

La pertinence de l'indexation depend aussi de la qualite des relations. Il faut donc valider la coherence des liens `IMPORTS`, `CALLS`, `DEPENDS_ON` et `CONTAINS`.

### 5.8.6 Conclusion du sprint

Ce sprint a pose la fondation structurelle du moteur GraphRAG. Le repository n'est plus seulement un ensemble de fichiers, mais une base de connaissances navigable et interrogeable.

## 5.9 Sprint 2 : Recherche hybride et generation des resultats GraphRAG

### 5.9.1 Introduction du sprint

Ce sprint vise a exploiter le graphe construit precedemment pour recuperer un contexte pertinent et produire des findings intelligents a partir d'un diff de pull request.

### 5.9.2 Specification des besoins

#### 5.9.2.1 Besoins fonctionnels

Le systeme doit pouvoir analyser un diff, extraire les symboles, recuperer les chunks et documents pertinents, prioriser les regles de la base de connaissances et transmettre un contexte de qualite au LLM.

#### 5.9.2.2 Besoins non fonctionnels

Le systeme doit limiter les hallucinations, conserver la traçabilite du contexte, associer les findings a des fichiers et lignes, et fournir des resultats coherents meme en contexte partiellement degrade.

### 5.9.3 Conception

#### 5.9.3.1 Limites du RAG standard pour les donnees de code structurees

Le RAG standard ne suffit pas pour des repositories riches en dependances. Il peut recuperer des morceaux proches sans restituer les liens entre eux.

#### 5.9.3.2 Pourquoi GraphRAG dans notre projet

GraphRAG permet de combiner la proximite semantique et la structure du code. Il est donc mieux adapte a l'analyse de l'impact des changements.

#### 5.9.3.3 Comparaison RAG simple vs GraphRAG

Le RAG simple repond partiellement au besoin de contexte. Le GraphRAG va plus loin en rendant possible une recuperation multi-couches, fondee sur les relations du graphe.

#### 5.9.3.4 Architecture GraphRAG du pipeline d'analyse

L'architecture du pipeline inclut extraction des symboles, recherche vectorielle, expansion graphe, recuperation des regles, fusion des resultats et generation finale.

#### 5.9.3.5 Strategie de recuperation hybride en couches

La logique retenue repose sur une strategie hybride ou plusieurs sources de contexte sont combinees plutot qu'opposees.

#### 5.9.3.6 Recherche par symboles

L'extraction des symboles depuis le diff permet de retrouver des chunks lies a des fonctions, classes ou noms significatifs explicitement presents dans le changement.

#### 5.9.3.7 Recherche vectorielle sur les chunks de code

La recherche vectorielle recupere les fragments semantiquement proches du diff ou de la question analysee.

#### 5.9.3.8 Expansion multi-hop sur le graphe

L'expansion multi-hop suit les dependances ou imports a partir de fichiers ou chunks de depart, afin de reconstruire un sous-graphe de contexte.

#### 5.9.3.9 Recherche dans les regles de la base de connaissance

Les regles doivent etre recuperees avec une priorite elevee, car elles ont une valeur normative forte dans le cadre de la revue.

#### 5.9.3.10 Recherche dans les documents de la base de connaissance

Les documents techniques et les guides d'architecture enrichissent le contexte sans etre aussi prioritaires que les regles strictes.

#### 5.9.3.11 Fusion, scoring et re-ranking

Les differentes sources doivent etre fusionnees et eventuellement re-classees afin de produire un contexte final de taille raisonnable et de haute valeur.

#### 5.9.3.12 Assemblage du contexte final

L'assemblage consiste a ordonner et compacter les informations retenues avant leur transmission au LLM.

#### 5.9.3.13 Priorite du contexte : KB Rules > KB Docs > Graphe > Repository

Cette priorite permet de garantir qu'un changement sera interprete d'abord a la lumiere des politiques et regles, puis du graphe et enfin du contexte repository plus large.

#### 5.9.3.14 Guardrails anti-hallucination et tracabilite

Les guardrails imposent notamment des references, des seuils de confiance et un format de sortie strict. Ils jouent un role crucial dans la fiabilite du pipeline.

#### 5.9.3.15 Comparaison des modeles LLM dans la plateforme

Dans notre architecture, plusieurs providers peuvent etre envisages selon l'environnement. Il est donc pertinent de comparer local vs cloud, modele plus petit vs modele plus grand, et cout vs precision.

#### 5.9.3.16 Tokens, contexte et contraintes de generation

Le prompt ne peut pas croitre indefiniment. Il faut donc faire des choix de compression et de priorisation pour rester compatible avec la fenetre de contexte.

#### 5.9.3.17 Prompt engineering pour la generation des findings

Le prompt doit guider le modele vers une lecture stricte du diff, des regles et du graphe, tout en imposant une sortie exploitable.

#### 5.9.3.18 Structure du prompt final

Une structure typique comprend un bloc systeme, les regles de la base de connaissances, le contexte graphe, le contexte repository, les findings statiques et le diff a analyser.

### 5.9.4 Realisation

#### 5.9.4.1 Service HybridRetriever / GraphRAGRetriever

Le retriever constitue le coeur de la phase de recuperation. Il combine les differentes strategies pour produire des references contextualisees.

#### 5.9.4.2 Extraction des symboles depuis le diff

Les symboles extraits servent de points de depart a la recherche ciblée dans le graphe ou parmi les chunks indexés.

#### 5.9.4.3 Recherche vectorielle native Neo4j

La recherche vectorielle est effectuee directement dans Neo4j, ce qui simplifie la chaine technique et renforce la cohesion de la couche de contexte.

#### 5.9.4.4 Expansion multi-hop avec Neo4j

Les voisins des fichiers ou chunks impactes sont recuperes pour enrichir le contexte d'analyse.

#### 5.9.4.5 Re-ranking et fusion des resultats

La fusion des resultats permet de combiner les hits semantiques, symboliques, graphiques et documentaires.

#### 5.9.4.6 Assemblage du contexte final

Le contexte final est construit de maniere compacte, avec une priorite explicite aux regles et documents les plus importants.

#### 5.9.4.7 Service GenerationService

Le service de generation encapsule la preparation du prompt, l'appel au LLM et le parsing du resultat.

#### 5.9.4.8 Generation des findings par LLM

Le LLM produit une liste structuree de findings. Ces derniers doivent idealement contenir severite, message, evidence et suggestion.

#### 5.9.4.9 Gestion des limites de contexte et de tokens

Des seuils et restrictions sont appliques pour rester dans des volumes raisonnables de contexte tout en conservant l'essentiel.

#### 5.9.4.10 Normalisation JSON des resultats

Les sorties LLM sont parsees et normalisees pour pouvoir etre persistees et affichees de maniere fiable.

#### 5.9.4.11 Generation des suggestions de correction

Lorsque le contexte est suffisamment clair, le systeme peut proposer des auto-fix ou des suggestions de correction. Toutefois, ces suggestions doivent etre presentees comme des aides, non comme des verites absolues.

### 5.9.5 Tests et validation

#### 5.9.5.1 Test d'un diff simple

Ce test verifie qu'un changement elementaire produit un contexte cohérent et des findings exploitables.

#### 5.9.5.2 Test d'un diff avec dependances entre fichiers

Ce test mesure l'interet de l'expansion graphe lorsqu'un changement impacte indirectement plusieurs composants.

#### 5.9.5.3 Test de priorite des regles KB

Il s'agit de verifier qu'une regle metier importante est bien remontee en premier plan dans le contexte final.

#### 5.9.5.4 Test de generation des findings

Ce test evalue la capacite du LLM a produire un JSON conforme, pertinent et suffisamment ancre.

#### 5.9.5.5 Test de robustesse lorsque le LLM est indisponible

Le systeme doit se degrader proprement en conservant au moins les findings issus d'autres sources si le LLM echoue.

### 5.9.6 Conclusion du sprint

Ce sprint a permis de donner une intelligence contextuelle au pipeline d'analyse. L'apport principal est l'articulation entre retrieval hybride, priorite des regles et generation traceable.

## 5.10 Sprint 3 : Orchestration, historique, templates Tech Lead et integration production

### 5.10.1 Introduction du sprint

Le troisieme sprint vise a industrialiser l'analyse GraphRAG dans le cycle reel de la plateforme. Il ne suffit pas de produire des findings ; il faut encore orchestrer les traitements, persister les resultats, les historiser et les restituer dans le dashboard.

### 5.10.2 Specification des besoins

#### 5.10.2.1 Besoins fonctionnels

Le systeme doit declencher l'analyse depuis GitHub, parser le diff, executer les taches de maniere asynchrone, stocker les resultats, permettre la consultation historique et relier les templates Tech Lead a la logique d'analyse.

#### 5.10.2.2 Besoins non fonctionnels

Il faut garantir la scalabilite du traitement, le suivi de statut, la persistance, la traçabilite et un deploiement compatible avec un environnement de type VPS.

### 5.10.3 Conception

#### 5.10.3.1 Architecture d'orchestration

L'orchestration repose sur des taches asynchrones permettant de decoupler les traitements lourds des appels utilisateur.

#### 5.10.3.2 Diagramme de sequence : Pull Request -> Webhook -> FastAPI -> Celery -> GraphRAG -> Resultat

Ce diagramme doit illustrer de maniere claire la chaine complete de traitement depuis l'evenement GitHub jusqu'a la persistance et la visualisation du resultat.

#### 5.10.3.3 Cycle de vie d'une pull request dans la plateforme

La PR passe par plusieurs statuts applicatifs, ce qui permet au dashboard de refléter l'etat de l'analyse en temps reel ou quasi temps reel.

#### 5.10.3.4 Structure du payload GitHub de pull request

L'etude du payload permet d'identifier les champs effectivement utilises par la plateforme pour recuperer le repository, la branche, l'auteur ou la cible.

#### 5.10.3.5 Integration GitHub Actions et CI a chaque PR

La CI constitue une source de signal additionnelle. Son integration conceptuelle dans la plateforme permet d'articuler checks automatiques et revue intelligente.

#### 5.10.3.6 Controle d'operation et orchestration asynchrone

Le controle d'operation concerne le suivi des taches, les statuts, les reprises partielles, la supervision et la gestion des erreurs.

#### 5.10.3.7 Role de Celery et Redis

Celery execute les traitements asynchrones et Redis sert de support a cette orchestration.

#### 5.10.3.8 Role de PostgreSQL

PostgreSQL persiste l'etat des analyses, les findings et les metadonnees indispensables au suivi metier.

#### 5.10.3.9 Role de Neo4j

Neo4j persiste le contexte structurel, les embeddings, et une partie de l'historique orientee graphe.

#### 5.10.3.10 Historique des analyses et comparaison inter-runs

L'historique permet de mesurer l'evolution des findings, de detecter les regressions et de capitaliser sur les analyses successives.

#### 5.10.3.11 Boucle de feedback et reanalyse

La reanalyse apres mise a jour d'une PR permet de transformer la revue de code en boucle iterative plutot qu'en point de controle unique.

#### 5.10.3.12 Role des templates Tech Lead

Les templates aident a formaliser les attentes de revue et a rapprocher l'analyse automatisee des priorites metier du projet.

#### 5.10.3.13 Structure du prompt final et contraintes de generation

L'orchestration doit transmettre au LLM un prompt propre, structure et compatible avec les limites du modele.

#### 5.10.3.14 Scenario complet : de l'ouverture de la PR a la decision du Tech Lead

Ce scenario constitue la meilleure facon de presenter la valeur de la plateforme dans le rapport et pendant la soutenance.

### 5.10.4 Realisation

#### 5.10.4.1 Reception et traitement des evenements webhook GitHub

Le backend recoit les evenements GitHub, verifie leur validite, puis declenche le flux applicatif approprie.

#### 5.10.4.2 Tache Celery run_graphrag_analysis_pipeline

Cette tache encapsule l'execution de bout en bout de l'analyse GraphRAG. Elle gere la recuperation des donnees, les scans preliminaires, l'execution de l'orchestrateur et la persistance des resultats.

#### 5.10.4.3 Parsing du diff

Le parsing du diff est indispensable pour identifier les fichiers modifies, les lignes ajoutees ou supprimees, et pour fournir une representation exploitable du changement.

#### 5.10.4.4 Scan des secrets et redaction du diff

Cette etape protege le systeme contre l'exposition accidentelle de secrets dans le diff.

#### 5.10.4.5 Demarrage de l'AnalysisRun

Chaque analyse est enregistree comme un run distinct, avec ses meta-donnees, son statut, son horodatage et ses resultats.

#### 5.10.4.6 Execution de l'orchestrateur GraphRAG / LangGraph

L'orchestrateur coordonne les phases de retrieval et de generation, tout en maintenant un trace des statuts et des erreurs.

#### 5.10.4.7 Fusion des resultats : secret scan + static analysis + GraphRAG

Le systeme agrege les signaux issus de plusieurs sources pour produire un resultat final plus riche et plus robuste.

#### 5.10.4.8 Sauvegarde des findings et commentaires

Les findings sont persists avec leurs proprietes principales : severite, categorie, fichier, lignes, message, preuve et suggestion.

#### 5.10.4.9 Historique des analyses

Les analyses successives sont reliees, ce qui permet d'identifier les nouveaux findings, les findings persistants et les corrections effectuees.

#### 5.10.4.10 Comparaison avec les runs precedents

Cette comparaison apporte une dimension temporelle utile a la gouvernance de la qualite.

#### 5.10.4.11 Reanalyse apres mise a jour de la PR

La reanalyse permet au systeme de s'adapter dynamiquement a l'evolution du code propose dans la pull request.

#### 5.10.4.12 Interface Tech Lead Templates

L'interface dediee permet au lead de gerer des templates de revue et de rapprocher l'analyse automatisee des attentes de l'equipe.

#### 5.10.4.13 Deploiement sur VPS

Le deploiement en environnement cible implique l'orchestration de plusieurs services : backend, worker, Redis, PostgreSQL, Neo4j et dashboard.

### 5.10.5 Tests et validation

#### 5.10.5.1 Test de declenchement d'une analyse

Ce test verifie la reception correcte des evenements et le demarrage du pipeline.

#### 5.10.5.2 Test du worker Celery

Il s'agit de s'assurer que les taches asynchrones sont bien prises en charge et executees.

#### 5.10.5.3 Test de sauvegarde des resultats

Les findings et les statuts doivent etre correctement persists pour etre consultables dans le dashboard.

#### 5.10.5.4 Test d'affichage dans le dashboard

La restitution utilisateur doit etre claire, lisible et coherente avec les donnees sauvegardees.

#### 5.10.5.5 Test d'une regle Tech Lead appliquee a une analyse

Ce test mesure l'integration reelle entre la logique metier definie par les leads et le moteur d'analyse.

#### 5.10.5.6 Test de production sur VPS

Ce test porte sur la cohesion de l'ensemble de la stack dans un environnement de deploiement reel.

### 5.10.6 Conclusion du sprint

Ce sprint a transforme un moteur analytique en une fonctionnalite produit integree a la plateforme et exploitable dans un workflow reel de revue de code.

## 5.11 Schema resume de la release

Le schema resume de la release doit presenter le flux suivant : repository GitHub, pull request, webhook, FastAPI, worker Celery, parsing du diff, secret scan, indexation incremental du repository, retrieval hybride, generation LLM, persistence, dashboard et templates Tech Lead.

## 5.12 Apports de la release

Les principaux apports sont l'enrichissement contextuel des analyses, l'introduction d'un graphe de code, la priorisation des regles metier, la reduction du risque d'hallucination et la meilleure integration de la revue intelligente dans le workflow GitHub.

## 5.13 Limites actuelles

Parmi les limites actuelles, on peut citer la dependance a la qualite du graphe, les contraintes de fenetre de contexte, la variabilite des performances du LLM et la necessite d'un travail continu sur la qualite de la base de connaissances.

## 5.14 Perspectives d'amelioration

Les perspectives incluent un enrichissement du graphe, une meilleure exploitation des historiques, une adaptation plus fine du chunking selon les sources, une amelioration des guardrails et une meilleure exploitation de la boucle de feedback humain.

## 5.15 Conclusion de la release

Cette release a apporte le coeur intelligent de la plateforme. Elle a permis de passer d'une revue automatisee partiellement contextualisee a un pipeline GraphRAG plus structure, plus traçable et plus pertinent pour l'analyse de code.

---

# Chapitre 6 : Realisation finale, demonstration et evaluation

## 6.1 Introduction

Ce chapitre presente la mise en oeuvre finale de la solution, son scenario demonstratif de bout en bout, l'analyse qualitative des resultats et une lecture critique de l'ensemble du travail realise.

## 6.2 Environnement materiel et logiciel

Le projet s'appuie sur une architecture logicielle multi-composants integrant backend, worker, base de donnees relationnelle, base de graphe, broker de messages et interface utilisateur. La description precise des versions logicielles, des bibliotheques et de l'environnement de deploiement devra etre adaptee aux valeurs reelles du projet.

## 6.3 Outils et frameworks utilises

Les outils utilises incluent FastAPI, Celery, Redis, PostgreSQL, Neo4j, GitHub, GitHub Actions, ainsi que des bibliotheques de generation d'embeddings, de parsing de code et d'orchestration de pipelines. Cette section doit aussi mentionner les outils front-end utilises pour le dashboard.

## 6.4 Demonstration fonctionnelle

### 6.4.1 Scenario complet A a Z

Le meilleur moyen de demontrer la plateforme consiste a raconter un scenario continu. Un repository est connecte a la plateforme. Un developpeur cree une branche, pousse ses commits et ouvre une pull request. GitHub emet un webhook. Le backend recoit l'evenement et declenche une tache Celery. Le diff est parse, scanne et nettoye. Le moteur GraphRAG recupere le contexte, genere les findings et les persist. Enfin, le dashboard affiche le resultat et le Tech Lead prend sa decision.

### 6.4.2 Onboarding du repository

Cette etape montre comment le repository devient une source de connaissance exploitable. Elle est utile pour illustrer l'indexation initiale et la construction du graphe.

### 6.4.3 Declenchement par pull request

Cette etape doit etre soutenue par une capture ou un diagramme montrant l'ouverture de la PR et la notification vers la plateforme.

### 6.4.4 Analyse intelligente

La demonstration doit ensuite presenter la chaine GraphRAG : retrieval des chunks, recuperation des regles, expansion graphe et generation finale.

### 6.4.5 Affichage des resultats dans le dashboard

Le dashboard permet de visualiser les findings, leur severite, les fichiers concernes et les suggestions. Cette etape donne une dimension produit au rapport.

### 6.4.6 Role du Tech Lead

Le Tech Lead consulte les findings, applique son jugement, et decide d'approuver ou de demander des modifications. Cette boucle renforce l'idee d'un systeme d'assistance et non de remplacement.

### 6.4.7 Reanalyse apres correction

Apres correction du code, une mise a jour de la pull request peut relancer l'analyse. Cela permet de montrer la dimension iterative et historisee du systeme.

## 6.5 Captures d'ecran commentees

### 6.5.1 Capture de l'integration GitHub

Cette capture peut montrer la configuration du repository, l'evenement PR ou un point de liaison entre GitHub et la plateforme.

### 6.5.2 Capture du dashboard

Cette vue doit mettre en valeur l'organisation de l'interface, les statuts, les files d'analyse ou les vues analytiques.

### 6.5.3 Capture des findings

Cette capture illustre la forme finale du feedback remis au developpeur et au reviewer.

### 6.5.4 Capture des templates

Cette section montre comment les Tech Leads peuvent parametrer ou consulter des templates de revue.

### 6.5.5 Capture de l'historique

Une vue historique permet d'illustrer la traçabilite et la comparaison entre analyses.

## 6.6 Evaluation qualitative

### 6.6.1 Qualite des findings generes

L'evaluation qualitative porte sur la pertinence, la clarte et l'utilite des findings. Il convient d'illustrer comment les findings produits sont plus contextualises qu'un simple resultat de linter.

### 6.6.2 Tracabilite

La traçabilite constitue un avantage majeur de notre approche. Un bon finding ne doit pas seulement etre "pertinent", il doit aussi etre rattachable a une preuve interpretable.

### 6.6.3 Reduction des hallucinations

La reduction des hallucinations s'appuie sur la priorite des regles, le retrieval hybride et les contraintes de sortie structuree. Cette section doit rester honnete et critique : l'objectif est de reduire les hallucinations, non de pretendre les supprimer absolument.

### 6.6.4 Integration dans le workflow de revue

La valeur d'une telle plateforme depend aussi de son acceptabilite par les utilisateurs. L'integration harmonieuse au cycle GitHub constitue donc un critere d'evaluation important.

## 6.7 Analyse critique

### 6.7.1 Forces de la solution

Parmi les forces de la solution, on peut citer l'integration GitHub, la traçabilite, l'exploitation d'un graphe de code, la modularite de l'architecture et la complementarite entre signaux statiques et generation LLM.

### 6.7.2 Limites techniques

Les limites techniques concernent notamment la couverture imperfectible du graphe, le cout du retrieval, la precision variable des liens extraits et la dependance a l'etat local ou indexe du repository.

### 6.7.3 Limites liees aux LLM

Les LLM introduisent des enjeux de cout, de format, de disponibilite et de stabilite. Le respect des contraintes JSON et la pertinence des findings doivent etre surveilles en continu.

### 6.7.4 Limites liees au cout et a la latence

Une analyse riche en contexte consomme du temps de calcul et des tokens. Il faut donc arbitrer entre profondeur et rapidite.

### 6.7.5 Difficultes rencontrees

Les difficultes typiques rencontrées dans ce type de projet concernent l'integration de technologies heterogenes, la calibration du contexte, la gestion de l'asynchronisme et l'equilibre entre ambition theorique et faisabilite pratique.

## 6.8 Perspectives

### 6.8.1 Enrichissement de la base de connaissance

Une perspective evidente consiste a enrichir les regles et documents disponibles pour le retrieval.

### 6.8.2 Amelioration des strategies de chunking

Le chunking peut etre raffine pour differents langages et differents types de contenus.

### 6.8.3 Amelioration des embeddings

L'experimentation de modeles mieux specialises pour le code ou pour les documents metier peut ameliorer la qualite du retrieval.

### 6.8.4 Elargissement des modeles LLM supportes

Le support de nouveaux modeles permettrait de comparer davantage les compromis entre cout, precision et latence.

### 6.8.5 Evaluation plus fine de la qualite

Une evaluation plus fine pourrait s'appuyer sur des jeux de cas, des analyses comparatives ou des retours utilisateurs plus formalises.

### 6.8.6 Automatisation plus avancee du feedback loop

A terme, la boucle de feedback pourrait etre mieux capitalisee pour affiner la base de connaissances ou les consignes de revue.

## 6.9 Conclusion

Ce dernier chapitre a presente la concretisation du projet, sa demonstration, son evaluation qualitative, ses limites et ses perspectives. Il permet de mettre en evidence la valeur reelle de la solution proposee.

---

# Conclusion generale

Au terme de ce projet, nous avons concu et realise une plateforme de revue de code intelligente capable d'integrer des signaux classiques d'analyse statique, des mecanismes de retrieval hybride, une representation structurelle du repository sous forme de graphe et des modeles de langage pour produire des findings contextualises.

Le travail mene montre qu'une simple utilisation de LLM ne suffit pas pour construire une revue de code fiable. C'est l'ancrage dans un contexte riche, hiérarchise et traçable qui permet de rendre les resultats plus utiles. Dans cette perspective, le GraphRAG constitue une reponse pertinente aux limites du RAG simple pour l'analyse de code.

L'integration a GitHub, aux pull requests, a l'orchestration asynchrone, a la base de connaissances et au dashboard donne a la solution une dimension produit, et non pas seulement experimentale. Bien que plusieurs perspectives d'amelioration subsistent, le projet apporte une base solide pour une industrialisation progressive de la revue de code intelligente.

# Bibliographie

Cette section devra contenir les references academiques, techniques et officielles utilisees pour justifier les concepts, les choix architecturaux et les technologies mobilisees dans le rapport.

# Webographie

Cette section devra regrouper les documentations officielles, articles techniques, billets d'architecture et sources en ligne utiliseses dans le cadre du projet.

# Annexes

## Annexe A : Schema detaille du graphe Neo4j

Cette annexe peut contenir le schema complet des noeuds et relations, ainsi que les contraintes et index principaux.

## Annexe B : Exemples de requetes Cypher

Cette annexe peut inclure des exemples de requetes de recherche de chunks, d'expansion multi-hop et de recuperation de voisins.

## Annexe C : Structure du payload GitHub webhook

Cette annexe peut presenter un exemple simplifie du payload d'un evenement `pull_request`.

## Annexe D : Exemple de prompt final

Cette annexe peut contenir le prompt final utilise par la couche de generation, en version anonymisee si necessaire.

## Annexe E : Exemple de sortie JSON des findings

Cette annexe peut illustrer la structure attendue des findings generes.

## Annexe F : Schemas d'architecture

Cette annexe peut regrouper les schemas globaux de la plateforme, du pipeline GraphRAG et du workflow PR -> feedback.

## Annexe G : Captures supplementaires

Cette annexe peut centraliser des captures d'ecran qui n'ont pas ete inserees dans le corps principal du rapport.

## Annexe H : Extraits de code importants

Cette annexe peut contenir des extraits limites de code permettant d'illustrer les composants essentiels du projet, comme le `RepoContextManager`, le retriever, le service de generation ou la tache Celery d'analyse.
