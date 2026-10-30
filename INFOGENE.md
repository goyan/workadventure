# Contribuer au fork Infogène de WorkAdventure

Ce dépôt est un fork de [workadventure/workadventure](https://github.com/workadventure/workadventure) (base `v1.32.6`)
qui alimente notre WorkAdventure interne. Seul le service **`play`** (front + pusher) est notre image ; le reste est officiel.
Les conventions de code de WorkAdventure sont dans `AGENTS.md` / `play/AGENTS.md`.

Le développement du front se fait dans ce fork. Les cartes, bundles et configurations
de déploiement sont dans le dépôt privé
[workadventure-selfhost](https://github.com/goyan/workadventure-selfhost) : son accès
est également nécessaire pour travailler sur ces éléments.

## Le circuit

```
branche feat/xxx ──PR──▶ infogene ──(auto)──▶ BETA  wa-beta.goyan.fr     (staging, compte Authentik requis)
                                   │
                                   └─ release (par un « releaser ») ──▶ PROD  wa.goyan.fr
```

1. **Créer une branche** depuis `infogene` : `git switch -c feat/ma-modif origin/infogene`.
2. **Commits petits et ciblés**, message en français : `feat(front): …`, `fix(front): …`, `test(front): …`, `ci: …`.
   Un patch qui touche peu de fichiers se rebase facilement sur les prochaines versions de WorkAdventure.
3. **Ouvrir une pull request vers `infogene`**. Elle doit avoir : les vérifications vertes (voir ci-dessous) et **une relecture**.
4. **Après fusion**, la CI construit l'image et la **beta se met à jour seule** (~10 min). Tester sur https://wa-beta.goyan.fr
   (Ctrl+F5). *Le code n'est pas déployé en beta avant la fusion.*
5. **Mise en prod** : une release est un tag `v1.32.6-infogene.N` (le numéro final augmente à chaque fois, un tag ne se
   réécrit jamais). Un tag **ne déploie rien seul** : seules les personnes autorisées (« releasers ») décident de la prod.
   Demandez-leur, après validation en beta.

### Depuis un Mac ou un autre poste contributeur : aucun SSH requis

Le clone de ce fork sur le Mac est `~/perso/wa/workadventure` ; le repo d'infra est
`~/perso/wa/workadventure-selfhost`. Le VPS tire les images tout seul : publier sur GitHub suffit.
Suivre `build-play` avec `gh run list --repo goyan/workadventure`, attendre le timer (toutes les 2 minutes),
puis vérifier que https://wa-beta.goyan.fr/ répond 200 ou 302 et tester le jeu dans le navigateur.

La révision exacte du conteneur et ses logs se vérifient sur le VPS, selon la section 3.2 du guide d'infra.
Ils ne constituent pas une étape de publication depuis un poste contributeur. Communiquer la branche et
le SHA du commit publié à la personne qui fait cette vérification. `ubuntu@51.254.136.221` décrit le contexte
d'exploitation sur le VPS, sans impliquer qu'une clé est autorisée depuis le Mac ; ne pas demander ou ajouter
un accès SSH pour publier. Distinguer les preuves : CI réussie, URL beta accessible, révision du conteneur
confirmée côté VPS et comportement visuel confirmé par l'utilisateur.

## Vérifications automatiques d'une PR (`pr-checks`)

Même chaîne que la CI d'origine de WorkAdventure, sur `play/` : typecheck, svelte-check, lint, formatage Prettier,
complétude des traductions, tests unitaires. Pour les lancer en local (Node 24, `protoc` installé) :

```bash
npm ci --workspace=workadventure-play
(cd messages && npm ci && npm run ts-proto)
cd play
npm run typesafe-i18n && npm run typecheck && npm run svelte-check && npm run lint && npm run pretty-check && npm test
npm run pretty        # corrige le formatage
```

## Règles

- **Ne jamais committer de secret** : ce dépôt est **public**.
- Écrire du code (et ses commentaires) en anglais, comme le reste de WorkAdventure ; messages de commit en français.
- Les écouteurs d'événements doivent être nommés et retirés (règle de lint `listeners/*`).
- Ne pas modifier les fichiers de `.github/workflows/` sans en parler : le workflow `build-play` publie l'image de la prod.
- Un comportement visuel (zoom, interaction, interface) n'est « terminé » que quand quelqu'un l'a **vu fonctionner en beta**.
- Pousser sur `infogene` déploie ce code **sur notre serveur** : les droits d'écriture sont réservés aux personnes de confiance.

## Patchs actuellement portés par le fork

Zoom de page désactivé hors canvas (`Utils/PreventBrowserPageZoom.ts`), caméra centrée sur l'avatar à tout zoom et pan
souris/trackpad (`Phaser/Game/CameraManager.ts`, `Phaser/UserInput/GameSceneUserInputHandler.ts`), zoom par défaut par
paliers de 0,25 (`Phaser/Services/HdpiManager.ts`), CI de build et de contrôle (`.github/workflows/`).
Notification de nouvelle version (`Components/BuildUpdateNotification.svelte`, `Network/BuildUpdate.ts`,
`pusher/controllers/FrontController.ts`) : le serveur identifie le front compilé par le SHA-256 de son HTML
(qui référence les assets Vite avec leur hash), le transmet dans la page et expose `/build-version` sans cache.
Le client compare la version de sa page au serveur toutes les minutes et au retour dans l'onglet.
Le bandeau reprend `ToastContainer` et propose « Rafraîchir » ou « Plus tard », sans rechargement automatique.
« Plus tard » masque la notification pour cette session. Les pages déjà ouvertes avant l'installation de ce
patch doivent être rafraîchies une première fois pour pouvoir recevoir les prochaines notifications.
Les nouveaux messages sont traduits ; le haut et le bas sorabe utilisent provisoirement l'anglais.
Décor extérieur (`Phaser/Game/GameScene.ts`) : la propriété Tiled facultative `exteriorTexture`
(type fichier, chemin relatif au TMJ) active une texture répétée derrière la carte. Son origine,
son échelle et son déplacement suivent les tiles de la carte ; elle couvre les bornes étendues
de la caméra. Les limites physiques de la carte restent celles du TMJ.
Utiliser une image dont la largeur et la hauteur sont des puissances de deux (par exemple 128 × 128)
pour que Phaser conserve l'échelle du motif en WebGL. Le jardin et le fond doivent utiliser
cette même image avec le même alignement. Les cartes sans cette propriété gardent leur fond habituel.
Tenir cette liste à jour à chaque patch.

### Sélection et édition en masse

L'outil « Sélection » permet de tracer un rectangle bleu translucide dans l'éditeur.
Les objets qui croisent ce rectangle sont sélectionnés, y compris les sols, murs, meubles,
objets personnalisés et exemplaires superposés ; les zones sont incluses pour les éditeurs
ayant le droit global. Le rectangle et les contours restent visibles après le tracé.

Le panneau propose Copier, Coller, Déplacer, Supprimer et Remplir. Copier conserve un instantané
dans le presse-papiers interne à la salle. Coller et Déplacer affichent un aperçu :
un clic confirme la destination, Échap l'annule. Les éléments gardent leurs positions relatives.
Remplir répète la tuile choisie dans la palette dans le rectangle sans déborder ni recréer
une instance identique au même emplacement. Les actions indisponibles sont désactivées.

Chaque opération utilise les commandes natives par élément et forme une seule entrée locale
d'annulation/rétablissement. Les droits et limites sont contrôlés avant l'action groupée.
Les superpositions sont autorisées, comme la pose native avec Maj ; la destination reste
soumise aux droits, limites et contrôles des joueurs. Le protocole réseau conserve les commandes
individuelles : une concurrence entre éditeurs peut entraîner une réconciliation du groupe.
Les calques TMJ statiques restent hors sélection ; le rectangle ne crée pas de zone métier.

### Déplacement au double-clic

Un double-clic gauche sur la carte lance le déplacement vers le point visé à la vitesse
de course habituelle (celle de Maj), via le pathfinding existant. Les murs et collisions
sont pris en compte, les diagonales ne coupent pas les coins des obstacles. Si la case
visée est bloquée, le moteur essaie les cases voisines accessibles.
Un double-clic au-delà des limites de la carte, sur le décor extérieur, est ignoré.
Une touche de déplacement reprend le contrôle de l'avatar. Un clic simple garde
l'activation des objets, le glisser garde le pan de caméra et le clic droit garde
son déplacement habituel. Le double-clic ne lance pas de déplacement dans l'éditeur
ou quand les contrôles / le déplacement au clic sont désactivés.

Pour valider en beta : double-cliquer de l'autre côté d'un mur, puis dans le jardin ;
vérifier le contournement et la course, reprendre la main avec une flèche, puis tester
un clic simple sur un objet et un glisser de caméra.

### Rectangles de collision des entités

Un prefab de catalogue peut déclarer `collisionRectangles` : des rectangles en pixels, relatifs au coin
haut-gauche de l'entité (`{x, y, width, height}`). Ils bloquent l'avatar en plus (ou à la place) de la grille
`collisionGrid` de 32 px, et suivent l'entité quand l'éditeur la déplace, la copie ou la supprime. Cela permet
des murs et des portes éditables dans le jeu avec des collisions fines, par exemple un mur de 6 px ou une bande
de 3 px au pied d'une façade. Mettre `collisionGrid: [[0]]` pour garder l'aimantation à la grille de l'éditeur.
Le catalogue est lu par le front seul (`EntitiesCollectionsManager`) : les images officielles de `back` et
`map-storage` n'ont pas à changer. L'import d'image de l'éditeur (« Ajouter votre image ») ne porte pas ces
rectangles ; ils se déclarent dans le JSON du catalogue statique. Ne pas les écrire à la main dans le catalogue des
entités personnalisées : `map-storage` l'ouvre et le réécrit avec son schéma, qui supprime le champ.
Une liste de rectangles invalide est ignorée (l'entité reste, sans collision fine) sans faire rejeter le catalogue.
Le pathfinding du double-clic en tient compte en **refusant** le trajet qui les traverse, sans contournement (la grille
de navigation voit la case libre quand `collisionGrid` vaut `[[0]]`). Ajouter un mur annule un trajet en cours du joueur
local ; en retirer un ne l'annule pas. Le gestionnaire Phaser n'a pas de test automatisé (le dépôt n'a pas de banc
Phaser sans navigateur) : comportement validé en jeu uniquement.

### Création de carte depuis l'éditeur

Dans l'éditeur, la propriété de zone « Quitter la carte » (`exit`) propose un bloc **« Créer une nouvelle carte »** : nom, bouton, et la sortie pointe
aussitôt sur la carte créée. Le pusher (image `play`) **demande la carte à l'Admin API** (`POST /api/room/create`, jeton `ADMIN_API_TOKEN` habituel), qui copie un
dossier modèle de `map-storage` ; ni `back` ni `map-storage` ne changent. Le pusher n'a **aucun identifiant d'écriture** de `map-storage` : le compte Basic reste dans
l'Admin API, jamais exposée sur Internet (contrat dans `admin-api/README.md` du repo selfhost).
Endpoint du pusher : `GET /map-creation?roomUrl=…` (le bouton n'apparaît que si `allowed`) et `POST /map-creation` ; les deux exigent le jeton de l'utilisateur
(`authenticated`) et **recalculent le droit côté serveur** par l'Admin API : l'utilisateur doit pouvoir éditer la salle ET porter le tag `MAP_CREATION_TAG`.
L'URL de salle envoyée par le navigateur sert de contexte à ce calcul : elle doit avoir l'origine de `PUSHER_URL` (absolue partout, contrairement à `FRONT_URL`
qui vaut `/` en beta), être de la forme `/~/<chemin>.wam` et exister dans `map-storage` ; elle est reconstruite à partir de son chemin avant l'appel.

Active dès que `ADMIN_API_URL`, `ADMIN_API_TOKEN` et `INTERNAL_MAP_STORAGE_URL` (lecture de `GET /maps`) sont posées ; aucune variable propre à ajouter.
Côté Admin API : `MAP_CREATION_TEMPLATE` (modèle, vide = désactivée → 503), `MAP_CREATION_MAX` (30). Réglages du pusher : `MAP_CREATION_TAG` (défaut `admin`,
`*` = tout éditeur, développement seulement), `MAP_CREATION_MAX_PER_USER_PER_HOUR` (5).

- L'Admin API revérifie le tag `admin` dans sa base, réduit le nom à `carte-<nom simplifié>-<suffixe aléatoire>`, applique le plafond total (dossiers `carte-*` dans
  `map-storage`) et ne crée qu'une carte à la fois. Le pusher vérifie seulement la longueur du nom (1 à 60) ; un nom sans lettre ni chiffre (`???`) est refusé (400).
- Réponses traduites par le pusher : 201 → `{ folder, roomUrl }`, 400 → 400, 403 → 403, 409 (plafond) → 429, autre (503, 401…) → 502. La réponse 201 n'est acceptée que
  pour un dossier `carte-…` et `roomUrl = /~/<dossier>/office.wam` : une sortie ne peut pas pointer ailleurs.
- Les erreurs réseau vers l'Admin API et `map-storage` sont remplacées par une erreur assainie avant de sortir du service (une erreur Axios brute porte l'en-tête
  `Authorization`, donc `ADMIN_API_TOKEN`) ; rien de brut n'est journalisé.
- Sémantique du droit : les tags viennent de l'Admin API pour la salle d'origine citée (salle existante du monde), pas pour la carte à créer. Le seul garde est donc le tag
  (l'Admin API de la selfhost renvoie `canEdit: true` à tous, et tous les comptes portent `admin`). `*` est refusé quand `NODE_ENV=production` (la fonction se désactive).
- Limites du pusher **en mémoire** (par utilisateur et par heure, interrogations 30 par minute) : remises à zéro au redémarrage et non partagées entre instances
  (acceptable en beta mono-instance). Le plafond total, lui, est persistant (compté dans `map-storage` par l'Admin API).
- La liste déroulante des sorties vient de `/api/room/sameWorld` de l'Admin API ; les dossiers `carte-test-*` (essais) en sont exclus.
- Un seul monde : le plafond et le préfixe `carte-` sont globaux. À scoper par monde si un second monde est ajouté.
- Le nom saisi n'est pas écrit dans le WAM (aucune retouche après la copie). Le nom du modèle s'affiche donc dans les listes.
- Les textes sont traduits en français ; les autres langues utilisent provisoirement l'anglais.
- Vérifié : route de l'Admin API de bout en bout en beta (401, 400, 403, 201, WAM servi) ; tests unitaires du pusher (Admin API simulée). **Non vérifié** : le bloc dans
  l'interface de l'éditeur (cliqué à la main), l'appel réel pusher → Admin API, la beta avec ce code.

### Valider la notification en beta

Ouvrir une session après le déploiement du patch, puis garder l'onglet ouvert pendant le déploiement beta suivant.
Le bandeau doit apparaître sans interrompre le jeu ; « Plus tard » le masque et « Rafraîchir » recharge la page.
Un onglet resté en arrière-plan doit détecter la mise à jour à son retour. Une panne réseau ou une réponse
invalide de `/build-version` ne doit pas annoncer de nouvelle version.

### Collisions partielles Tiled — prototype local

La branche `feat/tiled-partial-collisions` ajoute un support facultatif des rectangles
du Collision Editor de Tiled. Activer la propriété booléenne `partialTileCollisions=true`
sur la carte et conserver `collides=true` sur chaque tuile concernée. Les rectangles
doivent rester dans leur case ; les polygones, ellipses et rectangles tournés conservent
la collision pleine existante. Les flips et quarts de tour des tuiles sont pris en compte.
Utiliser des calques non redimensionnés, sans parallaxe.

Le clavier utilise les rectangles précis. Le double-clic et l'éditeur conservent la
grille 32 × 32 : une case portant un mur reste entièrement bloquée pour calculer un
trajet. Les portes doivent donc laisser des cases libres. Le départ et la fin du trajet
sont vérifiés contre les rectangles et la taille de l'avatar ; un trajet risquant de
traverser un mur est refusé. Un changement de mur par script arrête le trajet en cours.
Les calques cachés de collision des meubles gardent leur comportement.

La propriété numérique facultative `tileLayerDepth` sur un calque de tuiles définit sa
profondeur d'affichage en pixels du monde. Pour une façade horizontale de 32 px, séparer
chaque rangée en un calque et régler sa profondeur sur le pied du mur : `(rangée + 1) * 32`.
L'avatar est ainsi masqué derrière la façade et visible devant. La collision reste
indépendante du dessin et peut occuper uniquement les derniers pixels de la tuile.
Sans cette propriété, ou avec une valeur non numérique/non finie, l'ordre existant
par rapport à `floorLayer` est conservé.

Sans la nouvelle propriété, les cartes gardent leurs collisions actuelles. Ce prototype
reste local, sans push ni déploiement. La recette dans le jeu WorkAdventure reste à faire
sur une salle séparée, avant toute modification de la carte beta habituelle.

## Bibliothèques d'objets communes

Le champ `entityCollectionsUrls` de la réponse `/api/map` de l'Admin API s'ajoute aux collections d'objets du WAM
(`GameScene.loadEntityCollections`, `mergeEntityCollectionUrls`). Les collections du WAM passent en premier ; aucun doublon
d'URL ni d'identifiant d'objet n'est conservé (le WAM prime). Sans Admin API (ou sans ce champ) l'effet est nul. Un objet
posé depuis une bibliothèque commune dépend de cette liste : si elle change, l'objet n'est plus résolu.

## Peindre les sols dans l'éditeur

Les dalles de la collection `Infogène Sols` (tag `Sols`, grille `[[0]]`, profondeur `-32`, une case de carte)
se posent au clic gauche maintenu : le mouvement remplit les cases intermédiaires sur la grille.
Le pinceau ignore les exemplaires du même prefab déjà présents à la même position et les créations encore
en attente. Relâcher le bouton, sortir du canvas, perdre le focus, changer d'objet ou d'outil, ou appuyer sur
Échap termine le tracé. Un clic droit abandonne l'aperçu.

Les dalles restent des entités WAM : les commandes natives assurent leur sauvegarde, leur diffusion aux autres
joueurs et l'annulation, une dalle à la fois. Les meubles et murs gardent leur placement au clic.
Deux éditeurs qui peignent simultanément la même case peuvent encore créer un doublon avant de recevoir les
commandes de l'autre ; cette version ne comporte pas de verrou côté serveur.

## Effacer les sols et murs dans l'éditeur

En mode poubelle, maintenir le bouton gauche dans le canvas et déplacer la souris efface les entités
éditables portant le tag `Sols` ou `Murs`. Le segment entre deux positions est pris en compte, y compris
les dalles intermédiaires et les exemplaires superposés. Les dimensions réelles des sprites déterminent
le rectangle traversé, indépendamment de leur collection.

Un clic sans mouvement garde la suppression au relâchement de l'objet ou de la zone pointée.
Pendant un glisser, les meubles et les zones restent en place. Relâcher le bouton, sortir du canvas,
perdre le focus, changer d'outil ou appuyer sur Échap termine le geste ; il faut presser à nouveau
dans le canvas pour reprendre.

Les commandes WAM natives assurent la sauvegarde, la diffusion et l'annulation par entité.
L'annulation d'une suppression conserve désormais les dimensions avant de détruire l'instance,
ce qui permet de restaurer son identifiant, sa position et ses propriétés. Les calques de fond TMJ
restent gérés dans Tiled.

## Caméra en mode éditeur

À l'ouverture de l'éditeur, quel que soit l'outil, la caméra se détache de l'avatar sans saut et les contrôles de
l'avatar sont désactivés (raison `mapEditor`). Les flèches et ZQSD / WASD font défiler la carte (même vitesse que
l'Explorateur, `EditorCameraKeys.ts`) ; elles sont ignorées dans un champ de saisie et avec Ctrl / Cmd / Alt (pour
garder Ctrl+Z). Le trackpad à deux doigts déplace aussi la vue ; le glisser clic gauche reste réservé aux outils.
Changer d'outil ne recentre pas la vue. À la fermeture, les contrôles sont rétablis et la caméra revient sur l'avatar
(~300 ms), le zoom de l'Explorateur étant restauré comme avant.

## Recentrage sur la case à l'arrêt

Quand l'avatar du joueur local s'arrête après un déplacement au clavier ou au joystick, il glisse en ~0,1 s (vitesse de
marche) jusqu'au centre de la case sous ses pieds (`Phaser/Player/TileSnap.ts`, `Player.snapToTileCenter`). Pas de
glissé en mode suivi, si un chemin est déjà suivi, si la case est en collision ou si le trajet n'est pas libre
(collisions partielles). Toute nouvelle touche de déplacement l'annule. Le double-clic « courir vers » vise lui aussi le
centre de la case cliquée. Ces deux comportements sont pilotés par la variable `ENABLE_TILE_SNAP` (booléenne,
**désactivée par défaut**) ; sans elle, rien ne change. `GameScene.moveTo` et le pathfinding ne changent pas : `WA.player.moveTo` garde sa position exacte.
