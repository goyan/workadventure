# Contribuer au fork Infogène de WorkAdventure

Ce dépôt est un fork de [workadventure/workadventure](https://github.com/workadventure/workadventure) (base `v1.34.4`)
qui alimente notre WorkAdventure interne. La CI construit les images **`play`**, **`back`** et **`map-storage`** du fork.
Les conventions de code de WorkAdventure sont dans `AGENTS.md` / `play/AGENTS.md`.

Le développement du front se fait dans ce fork. Les cartes, bundles et configurations
de déploiement sont dans le dépôt privé
[workadventure-selfhost](https://github.com/goyan/workadventure-selfhost) : son accès
est également nécessaire pour travailler sur ces éléments.

## Panneau Jam déplaçable

Le panneau Jam se déplace en faisant glisser son en-tête à la souris ou au toucher.
L'en-tête peut aussi recevoir le focus : les flèches le déplacent de 20 pixels.
Il reste dans l'écran après redimensionnement et conserve sa position pendant
l'ouverture d'une fiche utilisateur. Les boutons, le défilement et le réordonnancement
de la file restent indépendants du déplacement ; la position est conservée pour la
session de page, sans écriture dans le navigateur.

Recette : déplacer le panneau en zone d'écoute et la liste des salons hors zone,
ouvrir une fiche utilisateur, redimensionner la fenêtre, puis utiliser les boutons
de Jam et réordonner la file. Vérifier aussi le toucher et les flèches sur l'en-tête.

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

Sur `play/` : typecheck, svelte-check, lint, formatage Prettier, complétude des traductions **françaises** (référence
`en-US` ; les autres langues peuvent rester incomplètes, elles retombent sur l'anglais) et tests unitaires.
Les contrats partagés et le back sont également vérifiés, avec les tests du back et les fichiers des messages privés.
Pour les lancer en local (Node 24, `protoc` installé) :

```bash
npm ci --workspace=workadventure-play --workspace=workadventureback
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
Le bandeau décrit aussi les fonctionnalités et correctifs ajoutés depuis le front chargé.
« Outils → Nouveautés » ouvre l'historique complet, accessible sans droit d'édition, avec
type, date, heure et auteur. Les textes sont les sujets français des commits publics `feat(front):`
et `fix(front):` depuis `v1.32.6`, du plus récent au plus ancien ; les dates sont celles des
commits appliqués, affichées avec l'heure dans le fuseau et la langue du lecteur
(`formatReleaseNoteTime`, jours groupés par `groupReleaseNotesByDay`), et les auteurs sont leurs noms Git (sans email ni corps de commit).
`build-play` régénère `play/src/common/release-notes.json` avant chaque image, beta ou release :
la liste ne dépend donc pas d'un service GitHub pendant le jeu. Le snapshot versionné sert
au développement local ; le régénérer depuis le clone complet avec
`node play/scripts/generate-release-notes.mjs`. Une mise à jour sans commit fonctionnel affiche
un message indiquant que le détail n'est pas disponible, et la proposition de rafraîchir reste active.
Décor extérieur (`Phaser/Game/GameScene.ts`) : la propriété Tiled facultative `exteriorTexture`
(type fichier, chemin relatif au TMJ) active une texture répétée derrière la carte. Son origine,
son échelle et son déplacement suivent les tiles de la carte ; elle couvre les bornes étendues
de la caméra. Les limites physiques de la carte restent celles du TMJ.
Utiliser une image dont la largeur et la hauteur sont des puissances de deux (par exemple 128 × 128)
pour que Phaser conserve l'échelle du motif en WebGL. Le jardin et le fond doivent utiliser
cette même image avec le même alignement. Les cartes sans cette propriété gardent leur fond habituel.
Notifications de messages sans service worker (`Notification/MessageNotification.ts`) : si le service worker
est absent (fenêtre privée Firefox) ou si `showNotification()` ne répond pas sous 3 s (client desktop Electron),
une notification de page prend le relais ; son clic ramène l'onglet et ouvre le chat sur le salon, comme le
`notificationclick` du service worker.
Statut depuis l'app desktop (`Api/Desktop/index.ts`, `Interfaces/DesktopAppInterfaces.ts`) : deux membres
facultatifs de `window.WAD`. `onStatusRequest` laisse le client desktop
([workadventure-desktop](https://github.com/aminekun90/workadventure-desktop)) choisir En ligne, Occupé,
Ne pas déranger ou De retour bientôt (mêmes choix que le menu de statut) ; `reportStatus` lui transmet le
statut effectif et son libellé. Sans ces membres, rien ne change.
Bruits de pas (`Phaser/Game/FootstepSounds.ts`, `FootstepSurfaces.ts`) : un pas très discret (volume max 0,015, atténué
jusqu'à 8 cases) pour les joueurs qui marchent dans la même zone que soi, selon le sol sous leurs pieds. Chaque pas varie
(enregistrement tiré au hasard, hauteur, volume, foulée, placement gauche-droite). Le son vient de la
propriété facultative `footstepSound` du prefab (`grass`, `wood`, `carpet`, `stone`, schéma `libs/map-editor`), sinon de la
famille du sol de la couche carte, sinon bois dans une zone et herbe dehors. Sons CC0 de Kenney
(`resources/objects/footsteps/CREDITS.txt`). Les catalogues de sols (dépôt d'infra) doivent porter `footstepSound`.
Écoute d'une bulle depuis son bord, derrière `ENABLE_BUBBLE_LISTENING` (back, désactivée par défaut) : un joueur arrêté
à une case et demie d'une bulle, hors bulle et sans statut silencieux, l'entend à 4 % du volume, plus bas en s'éloignant,
sans vidéo ni publication. Une bulle verrouillée n'est pas entendue. Le back choisit les auditeurs (`Model/BubbleListeners.ts`)
et les fait entrer dans l'espace de la bulle avec `SpaceUser.listenerState` (hors filtre `ALL_USERS`, mais reliés en
WebRTC aux membres). Le front (`WebRtc/BubbleListeningManager.ts`, `Components/Video/BubbleListeningHint.svelte`) joue
les voix et affiche « Hervé vous entend » aux membres.
Tenir cette liste à jour à chaque patch.

### Auteur des annonces et messages privés natifs

Focus du formulaire privé : le champ prend le focus dès l'ouverture, puis le
reprend lorsqu'un envoi se termine et qu'il redevient disponible. Les entrées
de déplacement de l'avatar restent désactivées pendant la saisie et sont
rétablies à la fermeture. Un message reçu n'impose pas un nouveau focus.
Régression reproduite sur le DOM avant correction ; tests de focus,
conservation du brouillon, clavier, envoi et nettoyage dans
`PrivateMessageModal.test.ts`.
Recette beta : ouvrir « Message privé » depuis une fiche, la liste puis une
notification ; taper immédiatement, envoyer, puis taper un second message
sans cliquer dans le champ. Fermer et vérifier les déplacements ordinaires.

L'historique privé affiche les derniers messages à l'ouverture et après un envoi
réussi. Les réponses reçues font défiler l'historique si le lecteur est déjà en
bas (tolérance de 20 px, comme le chat). Remonter lire les anciens messages
suspend ce défilement ; revenir en bas le réactive. Modifier le brouillon,
recevoir un message d'une autre conversation ou subir un échec d'envoi ne
déplace pas l'historique. Ce comportement reste actif au plafond des cent messages.
Recette beta : remplir l'historique, recevoir une réponse en bas, remonter puis
recevoir une autre réponse ; vérifier la position conservée. Envoyer depuis cette
position, puis vérifier le retour au dernier message et le suivi des réponses.

Les noms et textes de l'historique privé sont sélectionnables, comme les messages
du chat classique, malgré la sélection désactivée par défaut sur le jeu.
Recette beta : sélectionner un texte reçu ou envoyé puis le copier avec
Cmd+C/Ctrl+C ; vérifier la copie et le défilement de l'historique.

Les annonces texte affichent le nom de leur auteur, humain ou NPC. Le pusher ajoute `{uuid, name}`
depuis l'identité de la connexion dans le Delta Quill et remplace tout auteur fourni par le client.
Le texte enrichi est conservé, le nom est échappé par Svelte, les anciens messages sans auteur restent lisibles.
Les droits et la portée des annonces, ainsi que le transport audio, gardent leur comportement existant.

« Message privé » dans la fiche d'un avatar et le menu des utilisateurs envoie un texte à distance, sans déplacement
ni conversation de proximité. La requête native `sendPrivateMessageQuery` adresse un UUID présent sur cette carte ;
le back envoie l'événement réservé uniquement aux onglets du destinataire, avec l'identité réelle de l'expéditeur.
Il refuse l'usage de cet événement par les scripts et la Room API. Aucune diffusion de secours n'est utilisée.
Le texte est limité à 500 caractères, à trente messages par minute par connexion ; les destinataires absents
et l'envoi à soi-même sont refusés. Le back et le front doivent prendre en charge cette nouvelle requête protobuf.

La notification privée permet de répondre. Les cent derniers messages privés, toutes salles et tous comptes de ce
navigateur confondus, sont sauvegardés localement avec leur date, auteur et sens. Une connexion restaurée ne montre
que les messages de son identité et de sa salle ; le formulaire filtre ensuite le correspondant. La fermeture
efface la mémoire et les notifications, mais garde cette sauvegarde pour un rechargement ou une visite ultérieure.
Les anciens messages ne déclenchent pas de notification. Le stockage reste propre à ce navigateur et à cet
ordinateur, sans synchronisation serveur ; vider les données du site efface aussi l'historique. Si le navigateur
refuse le stockage, les échanges restent disponibles pendant la session. Les utilisateurs bloqués restent filtrés
à la réception. Le formulaire attend l'accusé du serveur
avant d'ajouter un message sortant ; cet accusé confirme l'acceptation par le serveur, pas la lecture par le destinataire.
En cas d'erreur, le brouillon reste disponible. Un résultat tardif après fermeture du formulaire ne modifie plus l'interface.
Un accusé tardif d'une connexion précédente ne rejoint pas l'historique de la nouvelle salle ou du nouveau compte.

Une croix sur chaque message supprime uniquement cette entrée de l'historique de ce navigateur.
« Effacer l’historique avec cette personne » demande confirmation et ne supprime que les échanges avec
le correspondant affiché, pour le compte et la salle actuels. Les autres correspondants, salles et comptes
sont conservés. Ces actions effacent aussi la notification concernée ; elles ne retirent aucun message chez
le destinataire et ne transmettent aucune demande de suppression au serveur. Le brouillon est conservé.
Annuler, Échap ou fermer la confirmation ne supprime rien. Une confirmation ouverte avant un changement de
session ou la fermeture de la conversation ne peut pas effacer l'historique de la nouvelle session.
Si le navigateur refuse l'écriture, la suppression fonctionne en mémoire mais la copie sauvegardée peut
réapparaître après rechargement. Plusieurs onglets ne coordonnent pas leurs écritures d'historique.

Recette de suppression beta : supprimer un message reçu puis envoyé, recharger et vérifier leur absence.
Effacer une conversation après avoir vérifié le nom dans la confirmation ; annuler une première fois,
puis confirmer. Vérifier le brouillon et l'historique d'un autre correspondant, d'une autre salle et d'un autre
compte. Ouvrir une confirmation puis reconnecter la session : l'ancienne confirmation ne doit rien supprimer.
Le rendu et l'interaction restent à valider par un joueur.

Recette de sauvegarde beta : envoyer et recevoir des privés, fermer/réouvrir le formulaire puis recharger la page ;
vérifier les textes, auteurs et l'ordre, sans notification ancienne. Changer de salle ou de compte et vérifier
l'isolation, puis revenir à la salle initiale. Refuser un envoi et vérifier qu'il n'apparaît pas après rechargement.

Recette beta : envoyer un texte privé à un humain puis à un NPC éloigné, vérifier la réponse privée et l'absence
du message chez un troisième joueur et dans le chat public. Tester aussi un départ du destinataire et une annonce
texte enrichie dont le nom de l'auteur s'affiche. Comportement visuel à valider par un joueur.

### Bascule du chat entre bulle et réunion

Si le panneau affiche déjà une conversation locale, rejoindre une réunion sélectionne son chat ;
rejoindre une nouvelle bulle sélectionne le chat de cette bulle. La sélection attend la confirmation
de l'entrée : une admission annulée ne détourne pas les prochains messages vers ce salon.
Le départ de l'ancien espace ne ferme pas le nouveau chat. Une discussion privée Matrix
ouverte reste sélectionnée, y compris si elle a été choisie pendant l'entrée dans la réunion.

Le correctif est dans `Chat/Connection/Proximity/ProximityChatRoom.ts`, avec des tests de transition,
d'envoi dans le nouvel espace et d'annulation. Aucun changement du protocole ou du back.
Recette : garder le panneau ouvert, entrer dans une zone de réunion, envoyer un message,
puis sortir et rejoindre un autre joueur ; vérifier la sélection et la réception dans chaque espace.
Comportement en jeu à valider en beta.

### Enregistrement des NPC par API

`pusher/controllers/NpcRegisterController.ts` ajoute `POST /register` pour la carte d'entrée beta
`https://wa-beta.goyan.fr/~/carte-antoine-naria-ff0813/office.wam`. Une invitation de 2048 caractères maximum
est validée à chaque appel par l'Admin API interne (`/api/login-url`), via une instance axios sans cache.
L'appel exclut la capture HTTP Sentry pour ne pas enregistrer l'invitation dans son URL.
L'Admin API vérifie sa signature, sa durée et sa salle ; un refus renvoie 403, une indisponibilité 503,
un corps invalide 400. La limite est de dix tentatives par IP par minute, via le même en-tête du proxy
de confiance que les autres routes d'authentification. Le JWT émis ne contient ni accessToken ni tags :
les droits et bans restent vérifiés par `/api/room/access`. La clé NPC vide et le domaine prod font
refuser toutes les invitations par l'Admin API prod. Aucun changement de protobuf ou de back.

### Annonces globales des NPC

Le pusher accepte `playGlobalMessage` d'une identité technique `npc:<id>` portant le tag
`npc-global-message`, uniquement pour les types natifs `message` et `audio` et pour sa carte.
Le back distribue le même message d'administration à tous les joueurs de la carte, indépendamment
des bulles et réunions. Ce tag ne donne aucun droit d'édition, de modération ou de diffusion entre cartes.
Les droits des administrateurs humains restent ceux d'origine. L'Admin API beta décide quels droits
elle attribue aux comptes techniques ; aucun tag ne vient du corps du message ou de l'invitation.

Tests du vrai `SocketManager` : texte et audio autorisés, refus sans tag, identité humaine portant
le tag technique, portée monde et type arbitraire, puis comportement administrateur conservé.
Recette d'affichage et de lecture audio à faire en beta avec un joueur hors de la conversation du NPC.

### Vignettes des NPC sans audio

Un participant dont l'UUID commence par `npc:` et dont les états micro, caméra et
partage d'écran sont tous désactivés reste visible avec son avatar, sans attente
ni erreur de connexion média. `isTextOnlyNpc` est partagé par `VideoBox` et
`SimplePeer` : aucune création ou relance WebRTC vers ce participant, signaux
média ignorés. Le client NPC annonce son audio par `microphoneState` dès sa
connexion au jeu. Les humains au micro coupé et les NPC avec audio conservent
leurs connexions et états habituels. Aucun changement du protocole ou du back.

Recette beta : garder un NPC sans audio dans une réunion/Jam pendant au moins
30 secondes ; son avatar reste visible sans « Reconnexion en cours ». Vérifier
le chat, un humain sans caméra/micro et, si disponible, un NPC avec audio.
Tests de régression sur les pairs et les vignettes, y compris leurs délais.
`VideoMediaBox` affiche aussi le nom, l'avatar et le menu du NPC lorsqu'aucun
flux média n'existe : ces éléments ne dépendent plus de la boucle des flux.
Un test d'interface vérifie leur présence sans vidéo ni spinner après 30 secondes.

### Réunion de zone seulement à plusieurs

Concerne uniquement les zones portant la propriété « démarrer une réunion » (`livekitRoomProperty`).
Seul dans la zone, le joueur n'est pas en réunion : il garde son statut habituel (présent, absent…),
le choisit librement et peut former une bulle, sans espace, chat, son ni flux de réunion.
La réunion démarre dès qu'un autre joueur est dans la zone et s'arrête quand il n'y a plus personne d'autre.
Un joueur qui entre là où quelqu'un se trouve déjà démarre la réunion tout de suite.

`MeetingAreaPresence.ts` suit les zones de réunion du joueur et enchaîne démarrages et arrêts (un arrêt
n'en devance jamais le démarrage). `AreasPropertiesListener` vérifie la présence toutes les 500 ms tant que
le joueur est dans une telle zone, avec la même règle que pour le joueur local (`isPlayerInsideArea`), sur les
joueurs distants connus du front (ceux autour de la vue, ce qui couvre la salle où l'on est). Les NPC
(`npc:<id>`) ne comptent pas. Aucun changement du protocole ou du back : le statut « en réunion » exclut
toujours des bulles une fois la réunion démarrée.

Recette en beta : entrer seul dans une zone de réunion et changer de statut ; faire entrer un second joueur
(réunion des deux côtés, en moins d'une seconde) ; le faire sortir (réunion quittée, statut d'avant).

### Une session par compte et par salle

Un compte connecté n'a plus qu'un avatar par salle. Quand il rejoint la salle depuis un autre onglet, un autre
navigateur ou le client desktop, `GameRoom.join` ferme ses sessions précédentes dans la salle : le dernier arrivé
garde la place. L'ancienne page reçoit un `errorScreenMessage` de type `sessionReplaced` (constante partagée
`SESSION_REPLACED_ERROR_TYPE`), affiche « Session ouverte ailleurs » avec un bouton « Reprendre ici » qui recharge
la page, et ne se reconnecte pas seule : deux onglets ouverts ne se reprennent donc pas la place en boucle.
Les anonymes (uuid tiré du localStorage) gardent l'avertissement d'origine (`duplicateUserConnectedMessage`).

Un onglet déjà coupé du réseau (Mac en veille) ne reçoit pas l'écran : à son réveil, il ouvre une connexion
neuve et reprend la place. Aucun changement du protocole.

Recette en beta : ouvrir la même salle dans un navigateur puis dans le client desktop (un seul avatar, écran
dans le navigateur) ; cliquer « Reprendre ici » (la place revient au navigateur, écran dans le desktop) ;
ouvrir deux salles différentes (aucune éviction).

### Spotify : ce qu'on écoute et zones d'écoute

**Menu → Réglages → Spotify** : « Lier Spotify » ouvre une fenêtre d'autorisation Spotify (flux *authorization
code* avec PKCE, sans secret ; seul le scope `user-read-currently-playing` est demandé). Les jetons restent dans le
`localStorage` du navigateur. Une fois lié, l'interrupteur « Partager ce que j'écoute » (activé par défaut) publie le
morceau en cours, relevé toutes les 15 s ; rien n'est affiché en pause, pour les podcasts ou les publicités.

Une app Spotify en mode développement n'accepte que **cinq comptes**, inscrits à la main dans son tableau de bord
(*User Management*), et l'*extended quota* nous est inaccessible. Sans Client ID personnel, la liaison passe par l'app
du serveur et la section le dit : demander d'abord aux administrateurs d'y ajouter son compte Spotify (5 personnes
maximum). Spotify laisse un compte non inscrit autoriser l'app, puis répond 403 à ses lectures : la section affiche
alors ce même conseil, et le front ne réinterroge Spotify que toutes les 5 minutes. N'importe qui peut à tout moment
utiliser sa propre app (compte Premium) en collant son Client ID dans « Utiliser ma propre app Spotify » ; la section
affiche les étapes et l'URI à déclarer. Le Client ID utilisé est celui de la liaison : en changer demande de délier
puis de relier.

Configuration (repo d'infra, beta et prod) : `SPOTIFY_CLIENT_ID=<Client ID>` (public, aucun secret). Dans l'app
Spotify : cocher **Web API** et déclarer les *Redirect URIs* `https://wa-beta.goyan.fr/spotify/callback` et
`https://wa.goyan.fr/spotify/callback` (`<PUSHER_URL>/spotify/callback`). Spotify refuse `http://localhost` : la
liaison se teste en beta. Sans `SPOTIFY_CLIENT_ID`, seules les apps personnelles fonctionnent.

**Depuis le client desktop** ([workadventure-desktop](https://github.com/aminekun90/workadventure-desktop)) : le
morceau est lu dans l'app Spotify ou Musique de l'ordinateur (`window.WAD.watchSpotifyTrack`,
`Spotify/LocalSpotifyPlayer.ts`), sans liaison, sans app de développeur, sans Premium ni limite de cinq comptes. La
liaison d'un compte reste proposée, en option, pour la musique écoutée sur un autre appareil (téléphone, lecteur web,
enceinte) : `SpotifyListeningSharer` lit alors les deux sources, et l'app de l'ordinateur l'emporte tant qu'elle joue.
Dans un navigateur, la section propose le client desktop en plus de la liaison. Le client desktop doit autoriser la
fenêtre de liaison (`spotify-authorization`, workadventure-desktop 0.1.0-beta.13 ou plus récent).

WorkAdventure envoie aussi au client desktop ce que l'utilisateur partage, quelle qu'en soit la source
(`window.WAD.reportListening`, `Api/Desktop/index.ts`) : titre, artiste, album, lien, pochette, service et Jam
rejointe. Le client l'affiche dans sa barre de menu.

Affichage : une note ♫ animée dans l'étiquette du nom des wokas qui écoutent ou sont dans une Jam, et dans la liste des
utilisateurs « ♫ Artiste — Titre » (lien vers le morceau), ou « 🎧 Artiste — Titre · Jam Salle détente ».

**Zone d'écoute** : propriété « Zone d'écoute » de l'éditeur de zones (`listeningZonePropertyData`). Spotify n'a pas
d'API pour les Jams : quelqu'un dans la zone colle le lien d'invitation de sa Jam (`spotify.link/…` ou
`open.spotify.com/socialsession/…`), la bulle en haut à droite le propose à tous ceux qui sont dans la zone
(« Rejoindre » ouvre Spotify), avec le morceau du DJ s'il a lié son compte et le nombre de participants. Une seule
Jam par zone ; seul son DJ peut la remplacer ou la retirer, et le back la retire dès que le DJ quitte la zone ou se
déconnecte. « Dans la Jam » veut dire « a cliqué Rejoindre et est resté dans la zone » : Spotify ne dit pas qui est
réellement dans une Jam. La bulle invite à lier Spotify ceux qui ne l'ont pas fait.

Réseau : le champ `SpaceUser.spotifyListening` (protobuf) circule dans le space « monde ». Le pusher ne laisse le
client écrire que ce champ, tronque les textes et ne garde qu'un lien `open.spotify.com/track/…`. Le lien de Jam est
une variable de propriété de zone (`jam`), validée par le back (`canUpdateListeningZoneJam`,
`libs/map-editor/src/ListeningZone/ListeningZoneJam.ts`) et retirée par `ListeningZoneManager`. Le protobuf change :
les images `play` et `back` doivent être déployées ensemble.

Code : `front/Spotify/` (compte, lecture du lecteur, diffusion, annuaire), `front/ListeningZone/`,
`pusher/controllers/SpotifyCallbackController.ts`, `back/src/Model/AreaPropertyEvents/ListeningZoneManager.ts`.

Recette en beta : lier Spotify, lancer un morceau, vérifier la note et la liste depuis un second compte ; couper le
partage. Créer une zone d'écoute, y partager une Jam, la rejoindre depuis le second compte (compteur à 2, badge Jam),
faire sortir le DJ (bulle revenue à « Partager ma Jam »). Vérifier si Spotify exige Premium pour rejoindre à distance.

### Écouter en même temps (sans Premium)

Une Jam Spotify ne fait jouer, avec un compte gratuit, que l'enceinte de l'hôte (« Continuer sur cet ordinateur » est
réservé à Premium). « Écouter en même temps », sur la carte « En écoute » d'un autre joueur, fait jouer à **son propre**
Spotify le morceau du joueur suivi, à sa position, et le suit à chaque changement de morceau ou saut.

Réservé à ceux qui ont le client desktop (0.1.0-beta.14 ou plus récent), Spicetify et l'extension
[workadventure-spicetify](https://github.com/aminekun90/workadventure-spicetify) : le bouton n'apparaît que tant que le
client signale l'extension connectée (`window.WAD.onListenAlongAvailable`). Sans eux, rien ne change, et la Jam reste
le moyen d'écouter ensemble.

`SpotifyListening` porte la position (`positionMs`, mesurée à `positionAt`, horloge de l'émetteur) : les autres en
déduisent la position actuelle sans republication continue (`SpotifyListeningSharer` ne republie qu'au-delà de 3 s
d'écart). `ListeningFollower` envoie le morceau à jouer au client (`window.WAD.followListening`), qui le transmet à
l'extension. **Le protobuf change : déployer play et back ensemble.**

Recette en beta : deux postes avec le client desktop, Spicetify et l'extension ; sur l'un, « Écouter en même temps »
sur l'autre ; changer de morceau et sauter dans le morceau chez celui qui est suivi ; « Arrêter d'écouter en même
temps ». Sans l'extension : pas de bouton.

### Sélection et édition en masse

L'outil « Sélection » permet de tracer un rectangle bleu translucide dans l'éditeur.
Les objets qui croisent ce rectangle sont sélectionnés, y compris les sols, murs, meubles,
objets personnalisés et exemplaires superposés ; les zones sont incluses pour les éditeurs
ayant le droit global. Le rectangle et les contours restent visibles après le tracé.

Le panneau propose Copier, Coller, Déplacer, Supprimer et Remplir. Copier conserve un instantané
dans le presse-papiers interne à la salle ; **il ne contient que des objets** : les zones sélectionnées ne sont pas copiées
(une sélection de zones seules se comporte comme une sélection vide pour Copier), alors que Déplacer et Supprimer agissent
toujours sur les zones sélectionnées. Coller et Déplacer affichent un aperçu :
un clic confirme la destination, Échap l'annule. Déplacer se termine après un clic ; Coller est un **tampon** : le mode reste armé
avec le même contenu après chaque pose (une nouvelle copie, de nouveaux identifiants et une entrée d'annulation par clic)
et ne se termine que par Échap, le bouton Annuler, un changement d'outil ou la fermeture de l'éditeur. Une pose refusée garde le mode
et affiche l'erreur ; un clic pendant une pose en cours est ignoré. Le motif armé est surligné dans la liste « Motifs » ;
cliquer un autre motif change de motif sans quitter le mode. Les éléments gardent leurs positions relatives.
Remplir répète la tuile choisie dans la palette dans le rectangle sans déborder ni recréer
une instance identique au même emplacement. Les actions indisponibles sont désactivées.

Chaque opération utilise les commandes natives par élément et forme une seule entrée locale
d'annulation/rétablissement. Les droits et limites sont contrôlés avant l'action groupée.
Les superpositions sont autorisées, comme la pose native avec Maj ; la destination reste
soumise aux droits, limites et contrôles des joueurs. Le protocole réseau conserve les commandes
individuelles : une concurrence entre éditeurs peut entraîner une réconciliation du groupe.
Les calques TMJ statiques restent hors sélection ; le rectangle ne crée pas de zone métier.

#### Motifs partagés

« Enregistrer comme motif » (actif si la sélection contient au moins un objet) demande un nom (1 à 60 caractères) dans un
champ du panneau, puis enregistre la sélection côté Admin API. Le bloc « Motifs », sous « Tuile à poser »,
liste les motifs de tous les éditeurs du monde (nom, nombre d'objets) : **un clic sur un motif le
colle** (même mode Coller que le bouton, il remplace le contenu du presse-papiers interne) ; la poubelle à droite
d'un motif le supprime. Le motif est partagé entre toutes les salles : il ne dépend pas de la carte d'origine.

Le motif contient des positions relatives au coin de **case** qui contient le coin haut-gauche de la sélection (et non ce coin
lui-même : un mur fin est centré sur une ligne de grille, donc 6 px avant elle, et le motif doit garder ce décalage pour que
le collage, qui avance par cases entières, retombe sur la grille de la source), sans les identifiants d'origine
(de nouveaux sont créés au collage). Un motif enregistré avant cette règle reste ancré sur son coin exact : à réenregistrer. Un objet dont le prefab n'est chargé dans aucune collection de la carte
courante est ignoré, et un message indique combien d'objets l'ont été.
**Les motifs ne contiennent que des objets** : le front n'envoie jamais de zone et le pusher refuse (400 `invalid`) un
motif qui en contient. Le schéma commun continue de lire des éléments `area` : les anciens motifs enregistrés avec des
zones se collent sans elles, et ces zones ignorées ne sont pas comptées comme des éléments ignorés (choix, pas erreur).

Chemin d'appel : panneau `SelectionEditor.svelte` → `SelectionEditorTool` (`saveSelectionAsPattern`,
`pasteFromPattern`) et store `MapEditorPatternStore` → pusher `/map-patterns` (`MapPatternController`,
`MapPatternService`) → Admin API `/api/map-patterns`. Le navigateur n'a jamais le jeton de l'Admin API. Le
pusher recalcule le droit à chaque appel (`fetchMemberDataByUuid` pour la salle courante, `canEdit` requis,
sinon 403), valide le motif avec le schéma commun `play/src/common/MapPattern.ts` avant l'envoi et prend l'auteur
dans le jeton authentifié. Limites : 2000 éléments et 256 Kio par motif, 200 motifs au total (409 « quota »),
60 requêtes par minute et par utilisateur (429). Sans `ADMIN_API_URL`/`ADMIN_API_TOKEN` la fonction est
désactivée (« indisponible » dans le panneau). Seul l'**auteur** d'un motif ou un **administrateur** (tag `admin` de l'Admin API, le même que pour les messages globaux)
peut le supprimer : le pusher envoie `requestedBy` (utilisateur authentifié) et `admin` à l'Admin API, qui répond 403 sinon,
et la poubelle n'apparaît que si `canDelete` est vrai. Le navigateur ne reçoit jamais `createdBy`, seulement `canDelete`.
`MapPatternService` utilise sa propre instance axios : la Room API (`AdminAuthenticator`, code amont) pose un cache GET de
5 minutes sur l'instance axios par défaut de tout le processus, qui masquait un motif tout juste créé.

À valider en beta (visuel) : enregistrer, voir le motif dans la liste d'une autre salle, le coller, le supprimer.

### Fumée de course

Quand le joueur local court (Maj maintenu en se déplaçant, hors mode suivi), des bouffées de fumée grises restent au sol derrière
lui (`Phaser/Components/RunSmokeTrail.ts`, appelé par `Player`). Elles grossissent en s'estompant (environ 0,3 s), sont dessinées
sous l'avatar et ne sont pas envoyées aux autres joueurs. Le déplacement au double-clic n'en produit pas.

À valider en beta (visuel) : courir dans les quatre directions, vérifier la taille et la durée de la fumée.

### Animation de course

Quand le joueur court (Maj maintenu en se déplaçant, hors mode suivi), l'animation de marche de l'avatar est jouée deux fois plus vite
(`RUN_ANIMATION_SPEED` dans `Phaser/Player/Animation.ts`, `timeScale` de l'animation dans `Character.playAnimation`). L'état est envoyé aux
autres joueurs par le champ `running` de `PositionMessage` (le pusher et le back le relaient tel quel) : ils voient donc aussi l'avatar courir.
Un changement d'état (début ou fin de course) est envoyé immédiatement, sans attendre le délai d'envoi des positions.

À valider en beta (visuel) : courir avec deux navigateurs et comparer la vitesse d'animation vue de l'autre côté.

### Déplacement au double-clic

Un double-clic gauche sur la carte lance le déplacement vers le point visé à la vitesse
de course habituelle (celle de Maj), via le pathfinding (`Utils/PathfindingManager.ts`, A* sur les cases, sans
dépendance). Les cases bloquées de la grille de collision et les **murs de la couche carte** sont pris en compte : ces
murs sont des **barrières fines entre deux cases** (`Utils/TileBarriers.ts`, déduites du modèle de la couche carte par
`MapLayerBarriers`), pas des volumes, et les cases de part et d'autre restent libres. Un mur horizontal sépare sa case de
celle au sud ; un mur vertical sépare les cases ouest et est sur la rangée **sous** celle où il est dessiné, car sa collision
arrête les pieds de l'avatar (le corps monte de 16 px au-dessus). La case se juge sur les **pieds** de l'avatar, pas sur son
centre. Les diagonales ne coupent pas les coins ; un coin touché par une barrière interdit la diagonale. Le trajet est
ensuite lissé en lignes droites, en gardant la largeur du corps et celle du mur de chaque côté.
La case visée est atteinte exactement (au centre de la case si elle touche un mur). Une pièce fermée est **refusée**, jamais
reportée de l'autre côté du mur. Seule une case qui ne peut pas être occupée (un objet volumineux, via `collisionGrid`) est
remplacée par la case libre voisine la plus proche de l'avatar, sans traverser de mur.
Pendant un trajet calculé, les colliders des murs de la couche carte ne repoussent plus l'avatar (le trajet les évite déjà ;
sinon le recouvrement d'1 px des rectangles de 18 px faisait saccader). Le clavier garde toutes ses collisions.
L'anneau de destination est dessiné au-dessus des sols de la couche carte.
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
Le pathfinding du double-clic **contourne** aussi ces rectangles (`Utils/RectangleObstacles.ts`) : une case dont le centre
mettrait le corps de l'avatar dans un rectangle est occupée, un pas entre deux cases qui en frôle un est refusé, et le trajet
n'est redressé en ligne droite que si cette ligne n'en touche aucun. Depuis que tous les objets ont une hitbox au pixel, sans
ce contournement le trajet calculé traversait les objets puis était refusé : le double-clic ne faisait plus rien. L'eau compte
comme obstacle, sauf pour un nageur ; les murs de la couche carte restent des barrières entre cases. Ajouter un mur annule un trajet en cours du joueur
local ; en retirer un ne l'annule pas. Le gestionnaire Phaser n'a pas de test automatisé (le dépôt n'a pas de banc
Phaser sans navigateur) : comportement validé en jeu uniquement.

### Supprimer une image importée (avec confirmation)

Dans la bibliothèque de l'éditeur, une image importée (catégorie « Personnalisé ») choisie affiche **Supprimer** à côté
d'« Éditer », pour qui peut déjà la supprimer (droit d'édition de la carte ou auteur de l'image, vérifié aussi par
`map-storage`). Une fenêtre demande confirmation (`DeleteCustomEntityModal`) : l'image quitte la bibliothèque de toutes
les cartes, ses exemplaires posés sur la carte ouverte (comptés) sont supprimés, ceux des autres cartes n'apparaîtront
plus ; c'est définitif. Annuler, la croix ou Échap ferment sans rien faire (Échap ne désélectionne pas l'image dans
l'éditeur) ; un double clic ne supprime qu'une fois. Le bouton du formulaire « Éditer » passe par la même confirmation.
La carte de l'objet choisi s'adapte à la largeur du panneau : nom sur plusieurs lignes, boutons qui passent à la ligne,
grille d'images décalée de la hauteur réelle de la carte (plus de vignettes recouvertes).

Correctif `map-storage` : la suppression passe par `mapsManager.executeCommand`, qui planifie la sauvegarde de la carte.
Avant, elle passait par `entitiesManager` : les exemplaires n'étaient retirés qu'en mémoire si la sauvegarde automatique
s'était déjà arrêtée (15 s sans modification), et revenaient comme objets fantômes au rechargement. Ne s'applique qu'où
tourne l'image `map-storage` du fork (beta) ; la prod utilise l'image officielle.

### Hitbox des objets hors grille, des animaux et de l'assise

Règles communes (`play/src/front/Utils/EntityHitbox.ts`), lues par les collisions du joueur, celles des animaux et les sièges :

- **Objet posé hors grille** (placement libre au pixel) : sa grille `collisionGrid` de 32 px n'est plus écrite dans les
  cases de la carte (arrondies vers le bas, jusqu'à 31 px à côté de l'image : mur invisible d'un côté, passage dans le
  meuble de l'autre). Ses cases bloquantes deviennent des rectangles au pixel posés sur l'image. Sur la grille, rien ne
  change. Déplacer un objet sur ou hors de la grille fait passer sa collision de l'un à l'autre.
- **Animal promeneur** (`wander`) : l'objet d'origine est caché (un personnage se promène à sa place) et ne bloque plus
  personne, même avec une hitbox réglée dans la carte.
- **Assise** : la zone d'approche d'un siège prend la hitbox de l'objet, ou les cases de sa grille (une place adossée à sa
  propre case bloquante redevient accessible). La physique ne tourne que quand quelque chose bouge (`DirtyScene`) :
  la détection d'assise prend la boîte du corps depuis la position du sprite, et une téléportation recale le corps
  physique (sinon l'avatar était « aspiré » vers un siège resté sous l'ancienne position).

Vérifié en jeu sur une copie locale de la carte d'équipe : 67 places sur 72 accessibles (54 avant), 1 bloquée et 4 « voisines »
dues au placement (canapés empilés, objets posés dessus), aucune aspiration lointaine.

### Canards promeneurs (champ de catalogue `wander`)

Un prefab de catalogue peut déclarer `wander: { "sheetPath": "canard-sheet.png" }` : une planche au format woka
(96 × 128, 3 colonnes × 4 lignes de 32 px ; lignes bas, gauche, droite, haut ; colonnes pas, immobile, pas), résolue
comme `imagePath`. Hors éditeur, l'objet posé est masqué et remplacé par un personnage animé qui se promène autour de son
point de pose (le « nid ») : il entre et sort des pièces, ouvre les portes et ne bloque personne. Dans l'éditeur, l'objet
immobile réapparaît et s'édite comme un meuble. Champ « fail open » comme `seat` : invalide, il est ignoré ; une planche
introuvable ou trop petite laisse l'objet immobile. Le format WAM ne change pas (catalogue lu par le front seul).

Poses de repos : une planche de 5 colonnes (160 × 128) ajoute **assis** (colonne 3) et **couché** (colonne 4) à
chaque ligne. Le front compte les colonnes d'après la largeur de l'image : à 3 colonnes (le canard), rien ne change.
À l'arrêt, le personnage s'assoit aussitôt, puis se couche après 5 s de pause (`WANDER_LIE_DOWN_AFTER_MS`). Le temps de
pause vient de l'horaire, donc il est le même sur tous les clients ; une étape passée sur place compte comme une étape
entière de pause (personnage couché).

Les animaux (promeneurs et canards de la ruée) ouvrent les portes **sans bruit** : `DoorCharacter.silent`. Une porte
ouverte par un animal reste muette, sauf si un joueur la traverse pendant qu'elle est ouverte : sa fermeture s'entend.

Compagnons : une planche de compagnon de 5 colonnes suit le même format (`Phaser/Companion/CompanionSheet.ts`). Quand
le joueur s'arrête, le compagnon s'assoit, puis se couche après 5 s sans mouvement ; une planche de 3 colonnes (chats et
chiens officiels, canard) ne change pas. Le compagnon suit à 40 px le long du trajet du joueur (56 en amont).

Synchro **déterministe, sans réseau** (`Phaser/Game/Wander/`) : le temps est découpé en étapes de 20 s ; la destination
de chaque étape est tirée d'un hash de l'identifiant de l'entité (FNV-1a puis mulberry32), dans un rayon de 10 cases,
praticable et atteignable depuis le nid. Tous les clients calculent donc la même position, à l'écart d'horloge près. La
vitesse (2 cases/s au moins) est relevée pour garder 3 s de pause en fin d'étape. Les collisions utilisées sont communes à
tous les clients : `getSharedCollisionGrid()` (sans les zones bloquées pour le seul joueur courant), les murs de la couche
carte en barrières, et les cases touchées par les `collisionRectangles` des objets (les personnages n'ont pas de physique).
Tout changement de ces collisions recalcule les trajets. Écarts acceptés : deux versions différentes du front, ou une
carte en cours d'édition, peuvent montrer brièvement des positions différentes.

Catalogue de démonstration côté infra : `workadventure-beta/maps/infogene-animaux/` (collection « Infogène Animaux »).

### Gobeur (retiré)

Le Gobeur (mini-jeu de poursuite) a été retiré le 2026-11-06. Le WAM continue de tolérer la propriété
`gobeurPropertyData` (dépréciée, ignorée par le front, plus proposée dans l'éditeur) pour que les cartes existantes
(dont la carte d'entrée de la beta) se chargent toujours.

### Toquer à une zone verrouillée

S'appuie sur la propriété de zone upstream `lockableAreaPropertyData` (verrou depuis le menu, collision côté navigateur
pour qui est dehors, déverrouillage par le back quand la zone se vide). Ajouts :

- **Toquer** : devant une zone verrouillée, « Espace pour toquer ». Les occupants entendent « toc toc » (même en « Ne
  pas déranger ») et voient une carte « X toque à la porte » avec **Entrer** / **Pas maintenant** ; la première réponse
  reçue l'emporte. Sans réponse : « Personne ne répond » (30 s pour les cartes, 32 s pour le visiteur). Anti-spam : 30 s
  par visiteur et zone. Le visiteur qui s'éloigne de plus de 64 px annule sa demande.
- **Laissez-passer** : *Entrer* lève la collision pour ce seul visiteur (`AreasManager.setLockPass`), pour **une seule
  entrée** : il est consommé dès que le visiteur est dans la zone (événement `entered`), au plus tard après 60 s. Ressorti,
  le visiteur doit toquer à nouveau, sans attendre l'anti-spam. La zone reste verrouillée pour les autres.
- **Admin** : toque et attend comme tout le monde ; personne ne peut forcer une porte verrouillée (le déverrouillage
  upstream par Espace depuis l'extérieur est retiré : une zone se déverrouille d'elle-même quand elle se vide).
- **Portes** : une porte d'une zone verrouillée (`isDoorInZone`) ne s'ouvre que pour un joueur qui est dans la zone ou
  en sort depuis moins de 2 s, ou qui a un laissez-passer ; jamais pour un animal (`DoorAnimator`, `DoorLocks`).
- **Cadenas** : tant qu'une zone est verrouillée, un cadenas rouge est posé au milieu de chacune de ses portes, pour tout le
  monde (occupants compris), au-dessus du voile de nuit (`DEPTH_DOOR_LOCK_INDEX`), avec un fondu de 200 ms ; une porte double
  n'en a qu'un, il reste quand la porte s'ouvre. Dessiné en code (`DoorLockIcons`), placé par
  `DoorAnimator.getLockedDoorMarkers` (milieu de la partie visible : une porte verticale passe sous le raccord du bas).
- **Ne pas déranger** : verrouiller **son** bureau personnel passe en « Ne pas déranger » ; déverrouiller, sortir,
  accepter un visiteur ou quitter la scène remet le statut d'avant, seulement si c'est le lien qui l'avait posé
  (propriété mémorisée sous la clé `knockDndOwnership` pour survivre à un rechargement).
- **Espace** (`Character.handlePressSpacePlayerTextCallback`) : un appui ne déclenche que les textes déjà affichés ;
  un texte créé ou remplacé par un rappel attend l'appui suivant (sinon toquer déclenchait aussitôt le texte d'attente).

Réseau : événements de script `infogene.knock.request|answer|cancel|entered` (`Knock/KnockProtocol.ts`), état local identique
sur chaque navigateur (`KnockState.ts`, échéances depuis la réception, marge de 2 s entre navigateurs). Aucun changement
de back, protobuf, map-storage ni WAM : **compatible avec la prod** (seule l'image `play` change).

Fichiers : `play/src/front/Phaser/Game/Knock/*`, `Stores/KnockStore.ts`, `Components/Knock/KnockRequests.svelte`,
`GameMap/AreasManager.ts`, `Entity/Area.ts`, `Entity/Character.ts`, `MapEditor/MapLayer/{DoorAnimator,DoorLockIcons}.ts`,
`public/resources/objects/doors/door-knock.ogg` (synthétisé par `tools/door_knock.py` du repo d'infra), i18n `area.knock`.

Limites :
- Les événements se forgent depuis la console, comme le verrou upstream qui est déjà contournable côté navigateur.
- Deux occupants qui répondent au même instant peuvent voir brièvement un état différent (chacun garde sa réponse).
- Un joueur arrivé après l'acceptation ne connaît pas le laissez-passer : il voit la porte fermée pour le visiteur.

### Mode nuit

La carte suit l'heure de Paris (`Europe/Paris`, quel que soit le fuseau du poste) : jour de 7 h 30 à 18 h 30,
crépuscule progressif jusqu'à 19 h, nuit jusqu'à 7 h, aube progressive jusqu'à 7 h 30. La nuit, un voile bleu nuit
(`0x0b1030`, opacité 0,6) couvre la carte, les avatars et les animaux ; bulles, noms et interface restent au-dessus
(`DEPTH_NIGHT_INDEX = 1_040_000`).

- **Pièces allumées** : une zone du WAM s'éclaire (bords adoucis de 8 px, fondu de 1 s) tant qu'un joueur connu du
  navigateur a les pieds dedans (même règle que l'entrée de zone : `AREA_POSITION_OFFSET_Y`). Une zone de plus du
  quart de la carte n'éclaire jamais (zones techniques).
- **Halo** : chaque joueur porte une lumière, 1,5 case à l'arrêt, 3 cases en marche (transition linéaire) ; il
  s'éteint dans une pièce allumée et revient en sortant. Pas de halo pour les animaux.
- **Pas de nuit** en mode édition, ni avec le réglage « Désactiver la nuit » (Paramètres → Thème, clé `disableNight`).
- **Recette locale** : `?nightAt=21:00` force l'heure, seulement en développement (`import.meta.env.DEV`).

Rendu : `RenderTexture` à la taille de l'écran (fixe, compensée pour le zoom), remplie de la teinte puis percée par
des pinceaux doux réutilisés ; redessinée seulement quand quelque chose change, puis `markDirty()` (le jeu ne dessine
qu'une scène marquée). Le jour, rien n'est calculé. Rien n'est envoyé sur le réseau : tout le monde voit la même heure.
Seule l'image `play` change : compatible avec la prod.

Fichiers : `play/src/front/Phaser/Game/Night/*` (`NightClock`, `NightLights`, `NightHalos`, `NightRenderDecision` purs
et testés ; `NightOverlay`, `NightManager`), `Stores/NightStore.ts`, `Components/Menu/SettingsSubMenu.svelte`,
`DepthIndexes.ts`, `AREA_POSITION_OFFSET_Y` exporté de `libs/map-editor`, i18n `menu.settings.night`.

Limites :
- Sites intégrés et objets web de la carte (DOM) restent éclairés.
- Sans WebGL (rendu canvas), les pièces ne s'allument pas (le pinceau NineSlice n'a pas de rendu canvas) ; les halos, si.
- Deux pièces allumées qui se touchent gardent un fin trait sombre entre elles.
- Une zone ajoutée par un autre éditeur ne s'allume qu'après rechargement.
- En marchant, les trous du voile peuvent suivre la caméra avec une image de retard.

### Coucou et notifications système

Pour faire revenir sur la carte un collègue dont l'onglet est en arrière-plan.

- **Coucou** : bouton « 👋 Coucou » dans la fiche d'un avatar et dans le menu d'un joueur de la liste. L'expéditeur
  affiche l'émoji 👋 (visible de tous). Un coucou au même destinataire au plus toutes les 10 s (bouton grisé). Si le
  destinataire est en « Ne pas déranger », l'expéditeur lit « X ne veut pas être dérangé : ton coucou l'attendra. »
- **Réception** : carte « X te fait coucou 👋 » avec **Y aller** (`emitAskPosition`), **Répondre** (message privé) et
  **×** ; une seule carte par expéditeur (heure mise à jour). Son et notification au plus une fois par 10 s et par
  expéditeur ; la carte, elle, se met toujours à jour.
- **Notifications système** (`Notification/SystemNotifier.ts`) : coucou, message privé reçu en direct (texte tronqué à
  60 caractères, l'historique restauré ne notifie pas) et toc toc. Seulement si l'onglet n'a pas le focus, la
  permission est accordée et le réglage « notifications » est actif (**désactivé par défaut** : Paramètres). En « Ne pas
  déranger » (demandé ou effectif), seul le toc toc passe. Notification de page (`new Notification`, `renotify`) : un
  clic ramène l'onglet et ouvre la carte ou le message.
- **Son** : le son de réception suit la règle upstream (`allowNotificationSound`) : coupé aussi en « de retour bientôt »,
  en réunion Jitsi/BBB, etc.

Réseau : événement de script `infogene.wave` (`{ targetUuid, at }`, zod), diffusé à la salle ; l'expéditeur est le
`senderId` posé par le serveur. Aucun changement de back, protobuf ni WAM : **compatible avec la prod** (la notification
de message privé n'existe que là où les messages privés du fork existent).

Fichiers : `play/src/front/Phaser/Game/Wave/*` (`WaveProtocol`, `WaveState` purs et testés ; `WaveManager`),
`Stores/WaveStore.ts`, `Components/Wave/WaveCards.svelte`, `Notification/SystemNotifier.ts`,
`Stores/PrivateMessageStore.ts`, `Knock/KnockManager.ts`, `Entity/RemotePlayer.ts`, `UserList/UserActionButton.svelte`,
`GameScene.ts`, i18n `wave`.

Limites :
- Toute la salle reçoit l'événement : on peut voir dans la console qui fait coucou à qui (l'émoji est déjà public).
- Pas de notification sur navigateur mobile (constructeur `Notification` refusé).
- Coucou seulement entre joueurs de la même carte.

### Uploader : fichiers binaires dans Redis et image du fork

`RedisStorageProvider.get()` relit les octets bruts (`withTypeMapping({ [RESP_TYPES.BLOB_STRING]: Buffer })`). L'amont
les relisait en chaîne UTF-8, ce qui détruisait les messages audio globaux et les fichiers du chat stockés dans Redis. Un
fichier expiré ou inconnu répond 404, et non plus 200 avec un corps vide.

`build-play` publie aussi `ghcr.io/goyan/workadventure-uploader`, sur le même commit que les trois autres images.
L'image a un `HEALTHCHECK` sur `/ping` (par `fetch` de Node, l'image slim n'a pas curl), car `deploy.sh` attend l'état
« healthy ». La beta la prend avec les trois autres quand l'image du même commit existe. La prod garde l'uploader officiel.

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

Les murs de l'outil Carte portent un `depthOffset` positif pour masquer ce qui est derrière eux.
Un objet trié sur sa rangée du haut (`depthOffset` négatif, comme les tables du pack de base)
passait donc derrière un mur qu'il chevauche, même posé sur la tuile devant ce mur. Un tel objet
reste désormais devant les murs qu'il chevauche dont le pied est sur une rangée au nord du sien ;
posé sur la tuile du mur ou derrière, il passe toujours derrière (`ObjectDepthFloor.ts`).
Un objet dont le pied est sur une case pleine de la grille de collision d'un autre (une plante sur une grande table)
est dessiné devant lui ; les places assises sont exclues, une chaise glissée sous une table reste derrière.
Il en va de même d'un objet dont le pied est dans l'image d'un autre devant lequel il est naturellement placé
(des livres dans une étagère) : sans cela, l'étagère remontée par le mur derrière elle passait devant eux.

Dans l'éditeur, un objet sélectionné affiche deux boutons ▲ et ▼ (à côté de ⟳ quand l'objet a des rotations).
Chaque clic le fait passer devant (ou derrière) l'image suivante parmi celles qu'il chevauche, du premier plan
au dernier (`depthStep` dans le WAM, `applyDepthStep` dans `ObjectDepthFloor.ts`). Le champ est transporté par
`CreateEntityMessage` / `ModifyEntityMessage` (`optional sint32 depthStep`) : `back` et `map-storage` doivent être
déployés avec ce champ, sinon l'ordre choisi n'est pas enregistré.

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

## Gommes et suppression dans l'éditeur

L'outil « Corbeille » (raccourci `5`) est supprimé : chaque outil a sa propre suppression.
- **Carte** : sa gomme n'efface que les sols et murs de la couche carte (un geste = une entrée d'annulation).
- **Objets** : un bouton « Gomme » (à bascule) supprime l'objet cliqué ou survolé le bouton enfoncé ; un bouton « Supprimer »
  dans le panneau de l'objet sélectionné le supprime (la touche Suppr reste). Les sols et murs de la couche carte
  n'en font jamais partie : ils se gomment avec l'outil Carte, qui garde leurs raccords cohérents.
- **Zones** : un bouton « Gomme » supprime la zone cliquée (la plus petite sous le pointeur) ; un bouton « Supprimer la zone »
  dans son panneau la supprime.
Choisir un objet à poser quitte la gomme ; changer d'outil la désactive. Les commandes WAM natives assurent la sauvegarde,
la diffusion et l'annulation. Les calques de fond TMJ restent gérés dans Tiled.

## Outils de l'éditeur indépendants

Chaque outil ne montre que ce qui le concerne ; le reste est atténué (opacité 0,4, `EntitiesManager.setEntitiesDimming`,
appliqué aussi aux entités qui arrivent d'un autre éditeur) ou masqué :
- **Zones** : les zones sont visibles ; objets, sols et murs sont atténués.
- **Carte** : sols et murs à pleine opacité, objets atténués, zones masquées.
- **Objets** : sols et murs restent à pleine opacité, zones masquées (un clic ne bascule plus vers l'outil Zones).
- Exploration, réglages de la salle et Sélection : rendu normal.
Les zones ne sont jamais incluses dans les motifs partagés.

Les sols et murs atténués sont assombris par une teinte grise (`DIMMED_MAP_LAYER_TINT`) et non par l'opacité : leurs
sprites se chevauchent et une opacité de 0,4 par sprite dessinait un damier le long des murs. Les objets gardent l'opacité.

### Zones calées sur le sol

Le premier clic et la fin du glisser se calent sur le coin de tuile le plus proche (un point blanc, comme l'outil mur, montre
ce coin avant le clic ; il disparaît au-dessus d'une zone existante, où le curseur devient une main : un clic l'ouvre).
Le rectangle est ensuite réduit à la boîte englobante des sols qu'il touche (`MapLayerAreaSnap.ts`) : une zone tracée sur une
pièce prend la taille de la pièce. Hors des sols (herbe, jardin) ou sur une carte sans sol (carte TMJ classique), elle reste
sur la grille de 32 px. Le déplacement et le redimensionnement d'une zone restent
toujours sur la grille (plus besoin de Maj) ; ils ne sont pas contraints au sol. Le panneau de l'outil Zones explique
créer, ouvrir/modifier et supprimer (bouton ou gomme).

## Caméra en mode éditeur

À l'ouverture de l'éditeur, quel que soit l'outil, la caméra se détache de l'avatar sans saut et les contrôles de
l'avatar sont désactivés (raison `mapEditor`). Les flèches et ZQSD / WASD font défiler la carte (même vitesse que
l'Explorateur, `EditorCameraKeys.ts`) ; elles sont ignorées dans un champ de saisie et avec Ctrl / Cmd / Alt (pour
garder Ctrl+Z). Le trackpad à deux doigts déplace aussi la vue ; le glisser clic gauche reste réservé aux outils.
Le verrou `mapEditor` de l'avatar ne bloque pas les événements de scroll ou de pincement : ils atteignent le
gestionnaire de caméra natif. Les autres raisons de blocage (champ, fenêtre, script, écran d'erreur) restent
respectées ; l'Explorateur conserve son gestionnaire de molette pour éviter un double zoom.
Pendant l'édition, aucun clic droit, double-clic gauche ou toucher ne lance de déplacement vers le pointeur.
Les déplacements par clic reprennent leur comportement habituel après fermeture de l'éditeur.
Changer d'outil ne recentre pas la vue. À la fermeture, les contrôles sont rétablis et la caméra revient sur l'avatar
(~300 ms), le zoom de l'Explorateur étant restauré comme avant.

## Recentrage sur la case à l'arrêt

Quand l'avatar du joueur local s'arrête après un déplacement au clavier ou au joystick, il glisse en ~0,1 s (vitesse de
marche) jusqu'au centre de la case sous ses pieds (`Phaser/Player/TileSnap.ts`, `Player.snapToTileCenter`). Pas de
glissé en mode suivi, si un chemin est déjà suivi, si la case est en collision ou si le trajet n'est pas libre
(collisions partielles). Toute nouvelle touche de déplacement l'annule. Le double-clic « courir vers » vise lui aussi le
centre de la case cliquée. Ces deux comportements sont pilotés par la variable `ENABLE_TILE_SNAP` (booléenne,
**désactivée par défaut**) ; sans elle, rien ne change. `GameScene.moveTo` et le pathfinding ne changent pas : `WA.player.moveTo` garde sa position exacte.

## Magnétisme des objets dans l'éditeur

Tous les objets (avec ou sans collision) sont calés sur la grille de case à la pose et au glisser. Maintenir Maj place
au pixel (collisions ignorées, aperçu orange). L'interrupteur « Magnétisme » / « Snap to grid », à droite de l'en-tête du
panneau de choix d'objets, inverse la règle : désactivé, le placement est libre par défaut et Maj cale sur la grille.
L'état (`mapEditorSnapEnabledStore`) ne dure que la session d'édition et revient à activé à la fermeture de l'éditeur.
La décision est dans `Phaser/Game/MapEditor/EntityPlacementSnapping.ts`. Le pinceau de sols (clic droit maintenu) reste
toujours calé (index de case) ; seul Maj y ignore les collisions. `SelectionEditorTool` déplace déjà ses sélections par
cases entières : il n'est pas concerné.

## Redimensionner une image posée

Dans l'éditeur d'objets, cliquer sur une image importée déjà posée : quatre poignées blanches apparaissent
aux coins. Glisser une poignée montre un aperçu, puis relâcher enregistre la taille ; le coin opposé reste fixe.
Les proportions sont conservées par défaut ; décocher « Conserver les proportions » dans le panneau pour
étirer librement. Échap, perte de focus ou relâchement hors du canvas annulent le geste.
Le panneau « Taille de l'image » conserve aussi largeur et hauteur en pixels et le bouton « Appliquer la taille »
(coin supérieur gauche fixe). Les dimensions acceptées sont des entiers de 1 à 4096 pixels.
L'image doit rester dans la carte et respecter les droits d'édition et les nouvelles collisions.

Le moteur officiel ne sauvegarde pas une échelle par instance. Le front importe donc une nouvelle version PNG
de l'image, avec sa grille de collision et sa profondeur adaptées, puis remplace cet exemplaire par les commandes
natives. Son identifiant, son nom et ses propriétés sont conservés ; les autres exemplaires restent
à leur taille précédente.

**Copies redimensionnées** (`MapEditor/PlacedImageVariants.ts`) : chaque copie porte l'étiquette cachée
`resized-from:<id de l'originale>:<largeur>x<hauteur>` (les étiquettes sont gardées par le map-storage officiel). Un
nouveau redimensionnement repart toujours de **l'image d'origine** (jamais d'une copie déjà rééchantillonnée), en lissage
de haute qualité : réduire puis réagrandir rend l'image d'origine (écart nul mesuré, contre une image floue avant). Une
copie de même taille est réutilisée au lieu d'être réimportée. Les copies n'apparaissent plus dans la bibliothèque
(seule l'originale) et s'appellent « nom de l'originale (L×H) », sans chaîne de tailles. Redimensionner un exemplaire
qui montre une copie supprime cette copie du serveur dès qu'aucun autre exemplaire de la carte ne l'utilise (les autres
cartes ne sont pas vérifiables d'ici) ; ce redimensionnement-là n'entre pas dans l'historique d'annulation (annuler
ramènerait une image supprimée) : on redimensionne de nouveau, depuis l'originale, sans perte. Le premier
redimensionnement d'une originale reste annulable. Une copie laissée sans exemplaire par une annulation reste sur le
serveur, cachée, et resservira pour la même taille.
À l'ouverture de la carte, les catalogues sont revalidés auprès du serveur pour charger les nouveaux imports,
même si le navigateur possède encore une ancienne copie en cache.
Ctrl/Cmd+Z annule le remplacement en une étape (sauf celui qui supprime une copie, voir plus haut) ; le rétablissement
le réapplique.

La sauvegarde de l'image est confirmée par le serveur avant le remplacement. Une erreur ou la fermeture du panneau
pendant la préparation laisse l'exemplaire d'origine en place. Le poids maximal des messages du serveur reste applicable.
Un agrandissement au-delà de la taille de l'image d'origine ne peut pas recréer les détails absents. Les copies faites
avant ce correctif n'ont pas d'étiquette : elles servent d'originale à leurs prochains redimensionnements.

## Disponibilité de l'enregistrement

Le bouton d'enregistrement indique « Les enregistrements sont désactivés pour ce monde »
si la salle ne permet pas de démarrer un enregistrement et qu'aucun enregistrement n'est actif.
Ce message remplace aussi le titre « Démarrer l'enregistrement » ; la vidéo de démonstration
ne s'affiche que lorsqu'un démarrage est autorisé. Le message d'indisponibilité n'est pas répété
dans la description de l'infobulle.
Une raison fournie par l'Admin API reste affichée. Le message « Un enregistrement est en cours »
est réservé à un enregistrement confirmé ; les demandes en attente affichent
« Démarrer l'enregistrement… » ou « Arrêter l'enregistrement… ».
L'enregistrement natif nécessite LiveKit Egress et un stockage S3 ; le correctif de l'infobulle
n'active pas ces services.

## Outil « Carte » : sols et murs

Outil distinct des objets (barre latérale, raccourci `8`, `MapLayerEditorTool`). Il dessine la **couche carte** : sols et murs de la salle.
Gestes : mur (glisser une ligne droite), pièce (glisser un rectangle : murs + sol), sol (pinceau, rectangle, seau dans une zone fermée) et gomme
unifiée qui n'efface que sols et murs. Un geste = une entrée d'annulation ; l'aperçu montre en vert ce qui sera créé et en rouge ce qui sera supprimé.

Architecture (`Phaser/Game/MapEditor/MapLayer/`, sans Phaser, testée) :
- `MapLayerModel` : la **source de vérité sémantique** (cellules de sol avec leur famille, segments de mur sur les lignes de la grille avec leur teinte).
  Un futur générateur (tracé → pièces) n'a qu'à remplir ce modèle.
- `MapLayerAutotile` : dérive les prefabs à poser (sol uni, ou « ombre » sur la tuile qui suit un mur horizontal : l'image `ombre` du catalogue est assombrie sur ses premières lignes, la plus foncée contre le mur et estompée vers le bas ; façade fermée ou continue, raccord de chaque sommet) et
  calcule la différence minimale avec les entités déjà posées.
- `MapLayerOperations` : géométrie des gestes et lecture du modèle depuis les entités existantes.
- `MapLayerCatalog` : vocabulaire et identifiants de prefab (**contrat avec les catalogues privés**, jamais renommés).

Le stockage reste des entités WAM ordinaires : aucun champ ajouté au schéma, `map-storage`, `back` et `messages` inchangés. La signification passe par
l'identifiant de prefab (collections `Carte Sols` et `Carte Murs`, tag `Carte`). Les modèles sont relus depuis les entités à chaque geste, donc modifier
un mur recalcule ses raccords. Les anciennes entités `Sols` / `Murs` ne sont pas migrées et restent éditables avec l'outil Objets ; l'éditeur d'objets ne
propose plus les prefabs `Carte`. Les murs sont vus du sud : chaque mur a une surface supérieure (le « capuchon », 12 px) ; un mur horizontal occupe **entièrement la rangée de tuiles de sa ligne
de grille** (capuchon sur les 12 premiers px, face sud de 20 px dessous, pied à la limite de la tuile), pour que sols et murs s'alignent sur la grille ;
un mur vertical n'est qu'un trait. Les murs posés avec l'ancienne géométrie (capuchon centré sur la ligne) sont toujours lus et redessinés alignés à la
prochaine modification de la couche carte. Les capuchons forment un réseau unique : une pièce « raccord » de 12 × 12 px est posée sur chaque sommet
et dessine l'angle, le T, la croix ou le bout fermé selon les murs qui y arrivent. Les façades se suivent sans trait de séparation et se ferment (6 px de plus) quand le
mur s'arrête ; le sprite vertical est une pièce de 12 × 20 px entre deux raccords, par teinte ; un mur vertical qui finit seul (un seul bras au sommet du bas) reçoit sous son capuchon une face sud de 12 × 20 px (`bout-<teinte>`), comme un mur horizontal. Collisions : 6 px au pied de la façade, 6 px pour la bande verticale, décalée de la
hauteur du mur (20 px) car l'empreinte au sol est plus bas que le dessus. Profondeurs : un mur vertical passe devant les façades qu'il croise, les raccords devant les deux.
Les catalogues et leurs images (pack sous licence) sont dans le dépôt privé, voir `goyan-map-layer-prefabs/README.md`
de `workadventure-selfhost`. Disponible sur **toutes les salles**, anciennes comprises : la variable `MAP_LAYER_CATALOG_URLS` (URL séparées par des virgules, lue par le pusher et
transmise au front) ajoute les deux catalogues aux collections de chaque salle ; aucun WAM n'a à être modifié. L'outil ne lit et n'écrit que les entités de ces
collections : les sols et murs posés comme objets classiques ne sont jamais touchés. Sans la variable (ou si le catalogue est injoignable), l'outil l'indique et ne pose rien.
Limites connues : plafond de 4000 entités par geste, remplissage limité à 2500 cases, pas de contrôle de présence des joueurs, pas de fenêtres, pas de
raccords décoratifs au nord. **Comportement visuel non validé dans le jeu.**

Mises à jour de l'outil Carte :
- Aperçu des tracés : le point suit la **base** du mur, pas son sommet.
- Profondeur : les sols sont au niveau le plus bas visible, juste au-dessus des tuiles de fond (`MAP_LAYER_FLOOR_DEPTH`), sous les objets, les murs, les
  avatars et le compagnon, qui ne passent plus tantôt dessus tantôt dessous en traversant une rangée.
- Sélection : Déplacer, Coller, Supprimer et Remplir recalculent sprites et raccords des murs et sols touchés, dans la **même** entrée d'annulation
  (`MapLayerSync`).
- Chargement : chaque collection d'objets de la salle dispose de 10 secondes ; une collection qui ne répond pas ne bloque plus le chargement des
  entités, ni le message « Vérification des catalogues » de l'outil.
- Clics : avec l'outil Carte (comme avec l'outil Zones), un clic sur un objet ne le sélectionne plus ni ne bascule vers l'éditeur d'objets ; seuls sols et murs
  sont touchés (`EntitiesManager`).

Portes (mode « Porte » de l'outil Carte) :
- Une porte remplace **deux segments de mur consécutifs**, centrée sur le curseur, horizontale (vue du sud) ou verticale (vue de dessus). L'aperçu est vert si
  les deux segments sont des murs libres, rouge sinon (message « doorInvalid » au clic). Elle prend la teinte du mur.
- Stockage : deux entités WAM de la collection `Carte Portes` (`porte-h-<teinte>-g|d`, `porte-v-<teinte>-haut|bas`, image = porte fermée). Les murs sous la
  porte restent dans le modèle mais ne sont pas dessinés : gommer la porte rend le mur à l'identique (la gomme enlève la porte, le passage suivant le mur) ;
  gommer le mur retire la porte. Le catalogue est facultatif : sans lui, le bouton est grisé.
- Sol : le sol sous une porte horizontale est un sol ordinaire (pinceau, remplissage, gomme). À la pose, il reprend le sol de la pièce (sud d'abord) s'il n'y en a pas.
  Le remplissage traite la porte comme un mur : les deux côtés restent dissociés.
- Comportement : toujours fermée, elle s'ouvre quand un joueur (local ou distant) ou un compagnon est à moins de 24 px de la porte (`DoorAnimator`), se referme 0,5 s après. Calcul local,
  rien n'est envoyé. Elle ne bloque jamais (collisions du prefab vides) ; une porte verticale ferme pourtant le bas de son passage par une collision du prefab `bas` (l'avatar se tient plus bas que son sprite : sans elle il se placerait dans l'axe du mur, devant lui), et le pathfinder ne la traverse que par sa première rangée. Sons : un enregistrement CC0 de qubodup pour l'ouverture et un pour la fermeture (`play/public/resources/objects/doors/`, crédits dans `CREDITS.txt`), volume selon la distance (au plus 0,3 : les enregistrements sont forts).
- Animation : 8 frames par sens, `...-0` (ouverte) à `...-6` quand la porte s'ouvre vers le nord (horizontale) ou l'ouest (verticale), `...-b0` à `...-b6` vers le sud ou l'est ; la frame fermée est le prefab sans suffixe (40 ms par frame). La porte est **poussée** : le sens est choisi au début de l'ouverture selon le côté du personnage le plus proche (nord/sud pour une horizontale, ouest/est pour une verticale). Sans les frames, la porte reste fermée.
- Rendu : le bout d'un vantail de porte horizontale ouverte a la texture de la face du mur de la teinte (seul son dessus est blanc). Tous les dessus de portes (horizontales, verticales, fermées ou ouvertes) sont blancs avec un contour sombre, comme le dessus des murs. Une porte horizontale remplace tout le mur (chapeau compris) et dessine elle-même ses deux montants de 4 px (ouverture de 56 px) ; son vantail est un volume (22 de haut, 6 d'épaisseur) qui va de l'arête haute de la face du mur (le liseré sous le chapeau) au pied du mur : la porte fermée s'arrête sur cette arête et, au-dessus d'elle entre les montants, on voit le sol ; son dessus est un liseré blanc entre deux traits sombres, comme un petit chapeau posé sur cette arête, avec le sol visible derrière ; une fois la porte entrouverte, le dessus et le bout se voient en volume ; les panneaux sont en relief (arêtes éclairées en haut et à gauche, ombre en bas et à droite) ; les murs voisins vont jusqu'à elle, sans bout ni raccord. Ses frames ont 14 lignes de marge au-dessus et au-dessous (`DOOR_FRAME_MARGIN`) pour que le vantail oblique, en projection oblique comme le chapeau des murs, reste entier : l'animation aligne la ligne 14 sur le haut de la porte avec l'origine de l'entité. Une porte verticale fermée fait 10 px de large (le mur en fait 12, la porte est donc 2 px moins large, y compris son montant fixe), avec un contour sombre de 2 px, aussi épais que celui des murs ; elle a un montant de mur fixe sur son vantail du haut seulement (présent dans toutes les images, sous les vantaux : fermée, la porte le recouvre ; ouverte, il reste visible du côté opposé à son sens d'ouverture ; il garde la largeur du mur, 12 px, porte fermée comme ouverte ; il garde la largeur du mur, 12 px, porte fermée comme ouverte ; il est en brique sur toute sa hauteur, avec la texture du mur de la teinte, le blanc ne restant que sur le raccord du sommet) (ouverture de 48 px : un liseré de 2 px à chaque bout) a deux vantaux, un par tuile, dessinés entre les raccords des sommets (la charnière de chacun touche le liseré qui ferme le bout du mur, avec une petite plaque d'acier), et passe derrière les avatars (`depthOffset` −40). Les sprites reprennent les couleurs de la face du mur de leur teinte, et ont à chaque bout un montant identique à la fin du mur voisin.
- Ombre et coins : le sol devant une porte horizontale n'est jamais ombré (le passage est ouvert) ; le sol sous les murs voisins l'est toujours. Une porte verticale qui part sous un coin ou un T est dessinée par-dessus la face sud du mur horizontal du dessus (`DoorAnimator`, profondeur juste au-dessus de la façade) : on voit alors son montant de mur continuer le mur jusqu'à la porte, au lieu d'une porte qui flotte sous la face. **Non validé dans le jeu.**
- Sprites à ajouter au dépôt privé : voir la maquette « Sprites de porte WorkAdventure » (horizontal 32 × 32 par panneau, vertical 64 × 32 par pièce, vertical
  haut qui commence sous le raccord du premier sommet, 8 frames, 4 teintes, depthOffset de `bas` à régler sous le raccord du sommet suivant). **Gomme : au survol, la porte (ou le mur, ou le sol) que la gomme enlèverait est surlignée en rouge ; gommer une porte la retire sans toucher aux sols autour d'elle (murs et sols restent). Les portes déjà posées avec une ancienne version de l'outil (bouts de mur et raccords à côté d'une porte) se redessinent à la prochaine modification de la couche carte.** **Non validé dans le jeu.**

## Confirmation avant de libérer son bureau

L’action « Libérer mon bureau » ouvre un dialogue avec le nom du bureau. Annuler, fermer ou appuyer sur Échap conserve le bureau. La confirmation revérifie le compte, la salle et la propriété actuelle ; une confirmation devenue obsolète ne libère aucun bureau. Les doubles clics ne déclenchent pas deux libérations. Texte français et anglais, repli anglais explicite pour les autres langues. Recette interactive à confirmer en beta après fusion.

## Nage

Le plongeon (touche d'interaction au bord, ou contact pour une eau « auto ») mène les **pieds** de l'avatar
`DIVE_DEPTH` px dans l'eau. Un corps qui se retrouve dans l'eau sans avoir plongé (piscine posée ou déplacée sur lui,
téléportation) nage aussi : la collision Arcade ne sait pas sortir un corps déjà incrusté dans un rectangle, il traversait
alors l'eau en restant « hors de l'eau ». On sort en marchant sur le bord ; de l'extérieur, l'eau bloque de nouveau.

## Police et ciel de l'interface

Paramètres → « Police » : Pixel (défaut), Système, Classique (Roboto), Arcade (`uiFontStore`, `data-ui-font` sur `<html>`,
piles dans `retro-theme.css`). Le client desktop reçoit palette et police par `window.WAD.reportAppearance` et les applique à
ses fenêtres. La ligne d'immeubles (`PixelSkyline.svelte`) passe en jour avec la palette claire (soleil, nuages qui dérivent,
ciel bleu) ; la nuit, lune et étoiles qui scintillent. `prefers-reduced-motion` coupe les animations.

## Son des messages dans une bulle

Un nouveau texte reçu d’un autre participant (humain ou NPC) dans la discussion de proximité joue le son court de message existant, même lorsque la conversation est affichée. Le réglage « Sons du chat », la mise en sourdine de la conversation et les règles de disponibilité restent respectés. Aucun son pour ses propres envois ou échos, les entrées/sorties ou la relecture de la liste. Les réunions et autres salons conservent leur comportement.

Recette beta : dans une bulle ouverte, recevoir un texte humain puis un texte NPC ; vérifier un son par message. Envoyer un texte soi-même, quitter/rejoindre et rouvrir le panneau : aucun son de message supplémentaire. Désactiver « Sons du chat », puis mettre la conversation en sourdine : réception silencieuse. Vérifier une réunion affichée : comportement conservé. Interaction et écoute à confirmer par l’utilisateur après fusion.

Rafraîchir le jeu après le déploiement et faire le premier essai avec « Sons du chat » activé et le statut « En ligne ». Refaire ensuite le test en « Ne pas déranger » : le texte doit arriver sans son.

## Actions de l’avatar et tenues de bain

Un clic sur son avatar ouvre une roue : profil, danse, café, arrêt, changement de tenue et choix du maillot.
Pendant l’écoute de musique, les avatars humains du catalogue portent un casque pixel avec une note, qui suit leur orientation et leur pose. Les animaux et les avatars externes sans métadonnée humaine ne reçoivent pas cet accessoire.
Les actions s’arrêtent au déplacement et sont partagées via la variable publique de salle `_avatarAction`.
La danse combine les frames existantes avec un balancement ; l’assise génère les jambes pliées dans les quatre sens,
sans ajouter de planches pour chaque couche de personnage.

Les catégories d’objets peuvent porter les interactions `dance`, `coffee`, `sleep` et `toilet`, avec le déclencheur
par touche ou automatique. Les lits et toilettes font approcher le joueur ; les toilettes ajoutent une mosaïque opaque.
Les noms usuels de lits, toilettes et machines à café sont reconnus pour les anciens objets sans catégorie dédiée.

Le maillot apparaît pendant la nage ou à une case maximum de l’eau, puis la tenue habituelle revient.
Le mode automatique utilise deux pièces pour les avatars prédéfinis `female*`, un short pour les autres ;
les avatars personnalisés n’ont pas de métadonnée de genre. La roue et l’onglet Bain de l’éditeur permettent de choisir
explicitement et mémorisent ce choix dans `_avatarSwimwear`. Le profil ne propose pas de sélecteur de maillot. Les images externes interdisant la lecture de pixels gardent leur apparence habituelle.

Le Jukebox demande aussi un nouvel instantané Spotify lors de l’ouverture de sa file dans le client desktop.
L’extension Spicetify relit le contexte après `songchange` et 600 ms après ; les métadonnées absentes sont réessayées,
et les prochains titres restent affichables avant que Spotify leur ait attribué un identifiant de file.

## Position et conversation après reconnexion

Le client mémorise la dernière position pour la carte et le compte, pendant les déplacements et à la fermeture de la page.
Un rafraîchissement revient à cette position si elle reste dans la carte et accessible au compte. Le bureau personnel
ne sert plus de point de connexion automatique ; la maison en bas à droite permet de s’y téléporter explicitement.
Les libellés utilisent les traductions existantes de l’action « Aller à mon bureau ».

La disparition temporaire des variables de zone pendant une reconnexion ne quitte plus le Jam. Les salons restent
sauvegardés côté serveur avec leur délai de reconnexion existant. La conversation de proximité se reforme à la
position restaurée ; les préférences micro et caméra restent celles mémorisées par le client.

Recette locale effectuée avec deux navigateurs : rechargement d’un participant puis redémarrage du back, mêmes
positions et mêmes participants retrouvés, micro coupé et caméra activée conservés. Bouton maison et coupure des
variables du Jam vérifiés avec des données de test. Écoute Spotify réelle, appels externes et partage d’écran non
vérifiés ; recette en beta à confirmer après fusion.
Le choix « Jukebox » reste visible pendant la détection de Spicetify ; il est désactivé tant que l’extension ne répond
pas, puis s’active sans fermer le menu. Une déconnexion de l’extension désactive à nouveau la création. La description
traduite existante indique les prérequis. Deux tests DOM reproduisent ces transitions ; le menu français et son activation
ont aussi été vérifiés dans le navigateur local après rebase sur `infogene`.
