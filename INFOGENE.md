# Contribuer au fork Infogène de WorkAdventure

Ce dépôt est un fork de [workadventure/workadventure](https://github.com/workadventure/workadventure) (base `v1.34.4`)
qui alimente notre WorkAdventure interne. La CI construit les images **`play`**, **`back`** et **`map-storage`** du fork.
Les conventions de code de WorkAdventure sont dans `AGENTS.md` / `play/AGENTS.md`.

Le développement du front se fait dans ce fork. Les cartes, bundles et configurations
de déploiement sont dans le dépôt privé
[workadventure-selfhost](https://github.com/goyan/workadventure-selfhost) : son accès
est également nécessaire pour travailler sur ces éléments.

## Agendas Outlook (ICS)

Le panneau **Agenda** natif affiche les agendas Outlook de chacun : sous « Mes agendas Outlook », chaque
utilisateur colle le lien ICS d'un agenda publié depuis Outlook sur le web (Paramètres → Calendrier →
Calendriers partagés → Publier un calendrier), 5 au plus. Semaine à venir, réunion en cours, rappels et bouton
**Rejoindre** pour les réunions Teams. Une option, désactivée par défaut, passe l'utilisateur « occupé » pendant
ses réunions : seulement sans statut choisi par l'utilisateur (« absent », posé seul quand l'onglet est caché, ne
compte pas), jamais par-dessus « ne pas déranger », « de retour dans un instant » ou « occupé » ; un statut changé à
la main reste respecté pour les réunions en cours, chevauchements compris, jusqu'à une nouvelle réunion. Les appels au
pusher du module (`pusherRequest.ts`, commun aux agendas et au compagnon) abandonnent après 15 s.

Le module front `external-modules/infogene-calendar` (suivi avec `git add -f` : ce dossier est ignoré pour les
modules privés d'upstream) n'est chargé que si l'Admin API l'annonce dans `/api/map` (`modules`). La scène
retrouve le module par son dossier (`ExternalModuleFactories.ts`), quelle que soit la forme des clés que Vite
donne au `import.meta.glob` : la recherche par clé relative ne trouvait rien depuis le passage du motif à
l'alias `@wa/front`, et le module n'était jamais chargé. Le pusher
relaie `/calendar/sources` et `/calendar/events` vers l'Admin API, l'utilisateur étant toujours celui du jeton.
Seule l'Admin API garde les liens (chiffrés) et lit les ICS : hôtes Outlook uniquement, événements privés sans
titre. Outlook met à jour les agendas publiés avec un délai, souvent de plusieurs heures. Un agenda qu'Outlook
n'a pas servi à un rafraîchissement garde ses événements précédents : sa réunion en cours ne s'arrête pas et
l'utilisateur reste « occupé ».

Recette : ajouter un lien publié, vérifier la semaine (récurrences, journées entières, fuseau), le bouton
Rejoindre, un lien refusé, puis l'option « occupé » sur une réunion courte, avec et sans « ne pas déranger ».

## Compagnon Mac et salles de réunion Teams

Un petit programme macOS (`tools/infogene-companion/`, EventKit) lit les réunions du Calendrier du Mac (comptes
Exchange compris, donc l'agenda Emeria complet que sa publication ICS ne donne pas) et les dépose toutes les deux
minutes avec un jeton personnel créé dans le panneau Agenda (**Gérer** → **Compagnon Mac**, affiché une fois,
révocable). Le pusher relaie `PUT /companion/meetings` (jeton en `Bearer`, 64 Ko, 30/min) et les routes authentifiées
des jetons et des salles vers l'Admin API, qui garde les réunions chiffrées et les ajoute aux événements (`mac:…`,
clé de salle = empreinte du lien Teams, avance d'alarme). Fichiers `MacCompanion*` : `Companion*` désigne déjà les
compagnons animaux d'upstream.

La propriété de zone `teamsMeetingRoomPropertyData` (« Salle de réunion Teams ») marque les salles ; elle est muette
comme `silent`. Une zone silencieuse (donc une salle Teams) coupe aussi les sons du jeu pour qui s'y trouve :
pas, skateboard, météo, portes, Nerf, animaux de la jungle, sons de la carte et musique relayée d'une Jam
(`soundEffectsSilencedStore`, volumes lus à 0) ; ils reviennent à la sortie, les réglages ne bougent pas
(`VolumeStore.setting`). Les notifications (coucou, toc toc, réunion, message) restent audibles. Le rappel d'une réunion à clé propose **Y aller** : la salle est demandée (déjà prise par la réunion,
sinon la première libre) et l'avatar y marche **sans ouvrir Teams** (un nouvel onglet dans le clic mettait le jeu en
arrière-plan, ce qui annule la marche : il fallait recliquer). La marche vise la case libre de la salle la plus proche
de son centre qu'un chemin atteint (`PathfindingManager.nearestReachablePointIn`, toute la salle parcourue) : une table
couvre souvent le centre et ses 8 voisines, seules regardées par une marche « au plus proche », qui échouait alors ; si
aucune case n'est atteinte (salle verrouillée), le centre, comme avant (l'avatar s'arrête devant) ; déjà dans la
salle (second clic), pas de marche : la question vient aussitôt. À l'arrivée dans
cette salle (position réelle de l'avatar, vue à la fin de la marche ou dans les 2 s), une carte demande « Ouvrir la
réunion dans Teams ? » : **Oui** ouvre le lien dans un nouvel onglet, **Non**, × ou Échap ferment. Si l'avatar reste,
la même carte s'affiche aussitôt et dit pourquoi : toutes les salles prises (`rooms-full`), aucun chemin vers la salle
(`no-path`), réservation impossible (`claim-failed` : refus ou pusher injoignable) ; sans salle sur la carte
(`teams-only`), rien de plus. La console garde la cause (`Cannot go to the meeting room <raison> <erreur>`). Une salle
réservée sans y marcher reste tenue jusqu'à la fin de la réunion (+ 15 min). Pieds dans la salle prise par une de ses réunions, **Y aller** est masqué pour
cette réunion (rappel et Agenda ; seul Rejoindre reste) et revient en sortant (`goToHiddenStore`, relevé toutes
les 2 s). **Passage de relais** : pieds dans la salle d'une de ses réunions qui finit au plus tard au début de sa
réunion suivante (enchaînées ; une réunion qui déborde garde sa salle), la suivante reprend la salle : **Y aller**
masqué pour elle dès son délai de rappel, puis, la première finie, cette salle seule demandée pour elle (titre mis
à jour), redemandée toutes les 30 s tant que l'Admin API la refuse (ancienne réservation tenue jusqu'à fin + 15 min,
sauf avec la reprise `pickRoom` du dépôt d'infra). Jamais pour la salle d'une réunion d'un autre utilisateur. En haut de l'Agenda, une carte par réunion en cours **ou** dans son délai de rappel (5 min par défaut,
`meetingsAtHand`), chacune avec Rejoindre / Y aller : à 09:27, « 09:15–09:45 » et « 09:30–10:00 » s'y voient ensemble. Marche interrompue ou terminée hors de la salle : pas de carte. Le titre des
salles prises s'affiche au-dessus d'elles (« Réunion privée » le cas échéant) ; entrer à pied dans une salle pendant
sa réunion réaffiche le rappel. Coupé tant que l'Admin API n'a pas `COMPANION_ENABLED=true`. Guide : repo d'infra,
`docs/compagnon-mac.md`.

## Nerf libre

Cliquer sur son avatar, puis **Équiper le Nerf** dans la roue d'actions ;
**Ranger le Nerf** apparaît au même endroit une fois équipé.
**ESPACE** tire une fléchette avec un pop.
Le tir suit le déplacement, diagonales incluses, ou le regard à l'arrêt. Le blaster
et les tirs sont visibles par les collègues ; les murs, meubles et avatars arrêtent
la fléchette avec un petit éclat de mousse bleu/orange. Aucun score, dégât ni mode jeu.
Les zones de bureau ou de réunion laissent passer les tirs ; leurs murs et meubles restent des obstacles.
**Ranger le Nerf** rend ESPACE aux interactions habituelles.

Les tirs respectent les champs de saisie, les verrous de commandes et l'éditeur.
Le son a son réglage **Nerf** avec écoute dans Paramètres → Sons et s'atténue avec la distance ; les impacts
respectent la préférence système de mouvement réduit. L'équipement n'est pas
persisté après la sortie de salle.

Recette : deux personnes, équiper/ranger, marcher et tirer dans les huit directions,
viser un mur, un meuble et un avatar, puis vérifier les espaces dans une saisie,
l'éditeur et une interaction ESPACE après rangement. Le son est synthétique original,
CC0 ; aucune dépendance, texture externe ni modification du protocole protobuf.

## Torche

Cliquer sur son avatar, puis **Équiper la torche** dans la roue d'actions ; **Ranger la torche** apparaît au même
endroit une fois équipée. La main est unique : équiper la torche range le Nerf, équiper le Nerf range la torche.
Comme le Nerf, la torche n'est refusée ni à la nage ni en véhicule ; on ne l'équipe pas dans l'éditeur (la ranger
reste possible).

- **Partage** : l'état est la variable de joueur publique et non sauvegardée `_torchEquipped` (comme
  `_nerfEquipped`), aucun changement du protocole protobuf ni du `back`. Chaque navigateur dessine la torche et la
  lumière de chaque porteur qu'il voit.
- **Lumière** : orange chaud, 5,5 cases autour de la flamme, de jour comme de nuit ; la nuit, le voile est percé de la
  forme exacte de la lumière (comme la lampe RGB). Elle est arrêtée par les mêmes obstacles que la lampe RGB : cases
  bloquantes, murs de l'outil Carte (porte fermée), objets `castsShadow` ; ni les avatars ni les objets bas ne font
  d'ombre. La lumière part de la flamme, dans la main ; si la flamme passe au-dessus d'un obstacle (avatar collé à un
  mur), elle part juste avant l'obstacle, du côté du corps. Pour un mur horizontal de l'outil Carte, le côté est
  celui du pied du mur (collision de 6 px en bas de la façade) où se tient l'avatar : collé au mur par le nord, son
  corps est sous le chapeau du mur, mais c'est la pièce nord qu'il éclaire. La lumière ne traverse jamais un mur
  (positions limites calculées d'après les collisions du catalogue, pas observées en jeu).
- **Intensité** : la torche équipée, la roue de son avatar montre sous elle « Intensité de la torche » avec − et +
  (de 10 % à 100 % par pas de 10 %, 100 % par défaut ; la roue reste ouverte ; flèches/Tab pour y aller, Entrée ou
  Espace pour changer ; tant que la commande est survolée ou a le focus, le reste de la roue passe à 12 % d'opacité
  pour laisser voir l'avatar et sa lumière, sans laisser passer les clics vers la carte). La dernière valeur est
  gardée avec le compte et dans le navigateur (`torchIntensity`) ; au chargement, celle du compte l'emporte. Elle est
  partagée par une seconde variable de joueur publique, sauvegardée au niveau du monde, `_torchIntensity` (pourcentage
  entier) : un ancien
  client continue de lire `_torchEquipped` seul et voit la torche à pleine lumière ; une torche d'un ancien client
  (variable absente) ou une valeur illisible est à 100 %. L'intensité règle la luminosité de la lumière (multipliée
  par le scintillement) et la part du voile de nuit qu'elle perce ; ni la portée, ni la forme, ni la flamme dans la
  main ne changent. Ce qui est dessiné passe par un fondu (`torchFadeTowards`, 10 % → 100 % en 1 s, au rythme des
  15 pas du scintillement) qui ne repart dans l'autre sens que 1/3 s après son dernier changement de sens marqué :
  la lueur (flamme × intensité, demi-tour marqué dès 0,1, voir « Scintillement ») et le voile (intensité seule,
  dès 0,02) chacun le leur. Même une touche maintenue ou des clics
  rapides d'un collègue (10 % ↔ 100 % à chaque pas, testé) ne font pas plus de trois variations marquées par seconde ;
  à intensité fixe, le scintillement passe inchangé (testé). En mouvement réduit, le fondu reste (il n'y a plus de
  scintillement).
- **Scintillement** : la luminosité de la lueur est le produit de couches, toutes calculées sur l'**heure du
  serveur** (`/server-time`, l'horloge de la nuit ; l'heure du poste en attendant) et d'une graine tirée de l'**id
  utilisateur** du porteur (`torchFlickerSeed`, jamais `Math.random`) : chaque navigateur voit la même flamme pour la
  même personne, et deux torches ne battent pas ensemble.
  - _Respiration_ : bruit de valeur lissé (smoothstep), deux octaves de 0,35 et 0,9 Hz, ±10 % autour de 87 %.
  - _Crépitement_ : bruit de 6 Hz, ±3 %. La lumière est échantillonnée 15 fois par seconde : au-delà de 7,5 Hz un
    bruit se replierait en un plus lent (repliement), d'où 6 Hz, soit 2 à 3 échantillons par alternance.
  - _Rafales_ : temps découpé en créneaux de 8 s, au plus une rafale par créneau, qui commence dans ses 3 premières
    secondes (deux rafales à 5 s d'écart au moins) ; chute de 30 à 35 % en 150 ms puis retour exponentiel en 1,7 s.
    Uniquement **dehors** (grille extérieure de la météo, aux pieds de l'avatar ; sans grille, dehors), selon la
    météo de la carte telle qu'elle est affichée, sans le thème saisonnier personnel (`GameScene.getMapWeather`) :
    brise 0,25 (chance 37,5 % par créneau), pluie 0,6 (62 %), orage 1 (90 %, chute 35 %), brouillard 0,1 (air
    calme). Dedans, aucun vent. `torchWind(weather, outdoor, knownWind)` prend déjà un vent réel de 0 à 1 :
    l'emplacement prévu pour la vitesse du vent d'Open-Meteo, non branchée.
  - _Allumage_ : équipée, la torche monte de 0 à sa lumière en 0,5 s, chez soi et chez ceux qui voient la variable
    changer ; une torche déjà allumée quand on la voit pour la première fois (arrivée dans la salle) l'est tout de
    suite. Le voile de nuit suit l'allumage, pas le scintillement ni les rafales.
  - _Couleur_ : la teinte de la lumière suit sa luminosité, rouge orangé `#ff4a14` jusqu'à 40 %, jaune chaud
    `#ffa83a` à 100 % (vers `#ff9432` à la luminosité habituelle de 87 %) ; changée par une teinte, sans redessiner la forme.
    La flamme dans la main garde ses couleurs (dessinée en `Graphics`, sans teinte).

  Photosensibilité (WCAG 2.3.1) : une **variation marquée** est un changement d'au moins 0,1 de la lumière entre deux
  demi-tours (`TORCH_MARKED_VARIATION`) ; la lueur n'ajoute que 55 % de sa couleur, donc 0,1 change environ 5 % de la
  luminance, la moitié d'un flash au sens WCAG. Le crépitement n'en fait jamais à lui seul. Ce qui est dessiné passe
  par le fondu de la lueur (3 par seconde, assez pour une rafale ou l'allumage) qui interdit deux demi-tours marqués à
  moins de 1/3 s : au plus 3 variations marquées dans toute seconde, testé (fenêtres glissantes d'une seconde, une
  minute, cinq graines, sans vent, brise et orage, intensité fixe ou changée à chaque pas). Mesuré sur 20 graines et
  10 minutes : 2 au plus sur ce qui est dessiné ; la flamme seule, sans garde-fou, 1 sans vent et 3 au plus avec
  rafales. Au seuil strict de 0,02 de la première version, le crépitement demandé (±3 %) en fait 5 : c'est pour lui
  que le seuil de la lueur est 0,1 (raisonnement sur la luminance, non mesuré à l'écran). Mouvement réduit : lumière fixe (ni respiration, ni
  crépitement, ni rafales, ni allumage), couleur fixe selon l'intensité. La forme et la portée de la lumière restent
  fixes : son polygone part de la flamme sans tenir compte de son mouvement.

- **Flamme dans la main** : elle ondule, 30 images par seconde, sur son propre pas (indépendant des 15 pas de la
  lumière, sans recalcul du polygone) : sa pointe penche de 1,8 px au plus, sa hauteur varie de 13 % et sa largeur de
  10 % (sommes d'ondes de 1,7 à 4,4 Hz sans mesure commune, décalées par porteur : deux flammes ne battent pas
  ensemble) ; une braise d'un pixel monte toutes les 1,7 s et s'éteint en fondu (0,7 s). C'est la forme qui bouge,
  pas la luminosité. La scène est redessinée 30 fois par seconde tant qu'une flamme est à l'écran.
- **Mouvement réduit** (préférence système) : lumière, flamme et braise fixes.
- **Coût** : la forme d'une lumière n'est recalculée que si la flamme a bougé d'au moins un pixel ou qu'un obstacle a
  changé dans sa portée (porteur immobile : rien) ; au plus quatre porteurs sont recalculés par image, le joueur local
  en premier. Le scintillement et la flamme redessinent la scène (pas la lumière) tant qu'une torche est à l'écran. Dans
  l'éditeur, les lumières des torches sont éteintes pour soi (la flamme reste dans la main, comme le blaster ; la
  variable n'est pas modifiée).

Code : `play/src/front/Phaser/Game/Torch/*` (protocole, scintillement, forme de la flamme et géométrie sans Phaser,
testés), la main exclusive torche/Nerf dans `Stores/HandToolStore.ts`, la lecture des obstacles est partagée avec la lampe RGB (`Lamps/LightObstacleReader.ts`) et le dessin
réutilise `RgbLampVisual`.

Recette : deux personnes ; équiper/ranger, passer de la torche au Nerf ; marcher le long d'un mur, d'une porte de
l'outil Carte (ouverte et fermée) et d'un meuble haut ; regarder de nuit (`?nightAt=22:00` en dev) ; mouvement réduit
du système ; plusieurs porteurs à l'écran pour le débit d'images.

## Lumières des Jams

La boule disco avec un badge **personne** dans chaque carte de Jam coupe ou réactive les effets lumineux
**pour moi**, y compris pour l'hôte et sans devoir rejoindre le salon. Ce choix
s'applique aux lampes de la page, sans couper la musique ni changer l'affichage
des collègues. Il est conservé pendant la session de page.

Il n'y a plus de coupure **pour tous** (retirée le 2026-11-13 à la demande de l'utilisateur) : chacun coupe pour
soi. Un salon où l'hôte avait coupé pour tous (`lightsOff` encore enregistré, champ gardé pour lire les anciennes
valeurs) s'éclaire de nouveau, et les invités ne voient plus d'indication.

Recette : hôte et invité coupent chacun pour soi ; l'autre garde ses effets et
l'audio continue.

**Salons Live** (depuis le 2026-11-13) : un Live n'a pas de morceau Spotify, et les lampes et la piste ne le
retenaient jamais (« en lecture » venait seulement du morceau de l'hôte). Un Live ouvert compte désormais comme en
lecture : rien d'autre n'est partagé avec tous les postes (aucun message ajouté), et un Live existe pour partager son
audio (« Terminer le Live » ferme le salon et arrête la capture). Là où on le voit, un Live sans audio reste éteint :
l'hôte d'après sa propre capture, un auditeur de ce Live d'après la musique reçue dans son Space. Le rythme vient,
comme pour une Jam Spotify, de la capture de l'hôte ou du flux reçu par l'auditeur ; un joueur de la zone qui
n'écoute pas ne reçoit pas de rythme (même règle que les Jams Spotify). Plafond de trois flashs par seconde, mouvement
réduit et coupure « pour moi » inchangés.

## Piste de danse

L'objet **Piste de danse** (éditeur, section **Lampes**) est un sol de dalles carrées sombres aux joints néon, une
dalle par case. Une partie des dalles s'allume en cyan, violet ou magenta, avec des fondus.

- **Sans musique**, la piste enchaîne ses motifs (groupes de dalles, vagues, ondes depuis le centre, damier, pluie,
  spirale, balayages), un nouveau toutes les 10 à 20 secondes avec une transition douce. Le motif vient de l'horloge du
  poste : deux joueurs dont l'horloge est à l'heure voient la même piste au même moment (non recetté à deux postes).
- **Quand un Jam joue** (le Jam est choisi par la position, comme pour les lampes : celui de la zone d'écoute où se
  trouve le milieu de la piste), chaque battement avance le motif d'un pas et fait briller la piste, et le motif change
  tous les 16 battements. La piste d'un Jam que l'on n'entend pas, ou dont les effets sont coupés (pour soi ou par
  l'hôte), garde son animation sans musique ; un silence de moins de deux secondes ne l'y renvoie pas.
- **Photosensibilité** : une dalle s'allume au plus trois fois par seconde et un battement n'est pris qu'au plus trois
  fois par seconde (WCAG 2.3.1), quels que soient la musique et le motif. Avec la préférence système de mouvement
  réduit, la piste est quatre fois plus lente, sans éclat sur les battements, avec des fondus de plus d'une seconde.
- **Taille** : sélectionner la piste dans l'éditeur affiche **Taille de la piste** (largeur et hauteur en cases, de 2 à 60) et quatre poignées aux coins, qui vont de case en case. La taille est portée par la propriété existante
  `lampPropertyData` : le format des cartes est inchangé. L'effet couvre exactement l'objet et le suit quand on le
  déplace. Sans réglage, la piste fait la taille de son image (4 × 4 cases).
- La piste est dessinée au sol, sous les avatars et les meubles, et au-dessus de l'obscurité d'une pièce dont les
  lampes jouent. Elle recouvre un tapis posé au même endroit. La nuit, elle reste sous le voile de nuit d'une pièce
  vide.

Code : `play/src/front/Phaser/Game/Lamps/DanceFloor*.ts` (motifs et moteur sans Phaser, testés ; rendu : une texture
d'un pixel par dalle étirée sur la piste, joints répétés, halo additif), entrée de catalogue
`lamp: { kind: "dancefloor" }` avec `layer: "floor"`. Un front plus ancien ignore ce genre : l'objet s'affiche comme
une simple image.

Recette : poser la piste, l'étirer par une poignée puis par les curseurs, annuler, la déplacer ; fermer l'éditeur et
regarder les motifs s'enchaîner ; `?lampDemo` (ou un Jam dans la zone) pour les battements ; mouvement réduit du
système pour la version lente.

## Lampe RGB à ombres portées

L'objet **Lampe RGB** (éditeur, section **Lampes**, entrée de catalogue `lamp: { kind: "rgb" }`) éclaire un cône d'une
couleur choisie. Les murs et les meubles hauts arrêtent sa lumière et laissent une ombre derrière eux.

- **Réglages** : sélectionner la lampe dans l'éditeur affiche **Lumière de la lampe** : couleur, portée (1 à 20 cases),
  ouverture (10° à 360° ; 360° éclaire tout autour) et direction. Sur la carte, la poignée carrée au bout du cône
  oriente la lumière et règle sa portée d'un seul geste, les deux losanges l'ouvrent ou la referment. La lumière, ombres
  comprises, suit le geste ; l'enregistrement se fait au relâchement (un seul pas à annuler). Sans réglage : blanc
  chaud, 6 cases, tout autour.
- **Ce qui arrête la lumière** : les cases bloquantes des calques de la carte, les murs de l'outil Carte (une porte
  fermée arrête la lumière, une porte ouverte la laisse passer) et les objets dont l'entrée de catalogue porte
  `castsShadow: true` (leurs `collisionRectangles`, sinon les cases de leur `collisionGrid`). Les autres objets (une
  table basse) et les avatars ne font pas d'ombre. Une lampe posée sur un mur ou sur un meuble haut éclaire quand même.
- **Jour et nuit** : la lampe éclaire tout le temps, sans musique, et même quand les effets lumineux des Jams sont
  coupés (ce n'est pas un effet de Jam : rien ne clignote ; seule une lampe réglée en rotation bouge, et elle se fige
  quand on coupe ses effets lumineux, voir plus bas). La nuit, le voile est percé de la forme exacte de sa
  lumière. Elle n'est pas pilotée par script pour l'instant ; elle relit sa propriété à chaque image, ce qui le
  permettra.
- **Format** : les réglages sont dans une nouvelle propriété d'objet `rgbLampPropertyData` (`color`, `radius`,
  `direction`, `angle`), dans le WAM : tous les joueurs voient la même lampe. Les trois images (`play`, `back`,
  `map-storage`) lisent le WAM avec le même schéma : elles doivent toutes connaître cette propriété, et une carte où une
  lampe a été réglée n'est plus lisible par une image plus ancienne (à savoir avant un retour arrière). Tant qu'aucune
  lampe n'est réglée, rien n'est écrit dans la carte. Un front plus ancien ignore le genre `rgb` du catalogue : l'objet
  s'affiche comme une simple image.

- **Rotation (gyrophare)** : dans **Lumière de la lampe**, l'interrupteur **Tourner comme un gyrophare** fait tourner le
  faisceau, à une **vitesse** de 10 à 120 tours par minute (30 par défaut, par pas de 5), en **sens horaire** ou
  **anti-horaire**. Les ombres tournent avec lui et le voile de nuit suit le faisceau. L'angle vient de l'horloge, sans
  aucun message réseau : à chaque tour entier depuis l'époque Unix (1er janvier 1970 UTC), le faisceau pointe vers la
  **direction** réglée, qui sert donc de phase ; tous les joueurs voient le même faisceau au même moment. L'horloge est
  celle du serveur (`/server-time`, comme la nuit), demandée seulement quand une lampe tourne ; en attendant sa réponse,
  celle du poste (le faisceau saute une fois à la réponse). Le faisceau reste **fixe** à sa direction pour les joueurs
  qui ont demandé moins d'animations (préférence système) ou coupé leurs effets lumineux **pour soi** (Paramètres →
  Ambiance, ou la boule « pour moi » d'un Jam : `lampEffectsEnabledStore`) ; rallumés, il reprend là où l'horloge
  le place, en phase avec les autres, et **tant que l'éditeur est ouvert** pour soi : la poignée
  du bout reste sur le faisceau et règle la phase sans ambiguïté (fermer l'éditeur pour voir tourner). Une lampe à 360°
  d'ouverture ne peut pas tourner (rien ne changerait à l'écran) : le réglage est grisé, avec l'explication.
  **Photosensibilité** : un seul faisceau passe sur un observateur immobile au plus 2 fois par seconde (120 tr/min),
  sous les 3 flashs par seconde de WCAG 2.3.1 (testé au cône le plus étroit, 10°). Limite : **deux lampes** à
  120 tr/min qui balaient le même endroit y passent 4 fois par seconde (au-dessus du seuil) ; rien ne l'empêche
  aujourd'hui (plafond à 90 tr/min, ou décalage des lampes voisines, à décider). Format : trois champs facultatifs
  de `rgbLampPropertyData` (`rotation`, `rotationSpeed`, `rotationClockwise`) ; absents, la lampe est fixe ; une valeur
  invalide est ignorée sans refuser la carte ; rien n'est écrit sur une lampe qui n'a jamais tourné. Une image plus
  ancienne (`play`, `back`, `map-storage` de la PR #199) **ne refuse pas** une carte qui les porte : elle retire ces
  champs à la lecture (Zod, vérifié par un test du schéma), la lampe y est fixe ; un `map-storage` ancien qui
  réécrit la carte peut donc les effacer (non vérifié). Déployer les trois
  images ensemble. Coût : le tour complet de lumière (lancer de rayons, ombres comprises) n'est calculé qu'au réglage,
  au déplacement ou quand un obstacle change dans sa portée (une porte de l'outil Carte qui s'ouvre au passage de
  quelqu'un compte : hors budget, 7 à 8 fois plus cher que le cône étroit d'une lampe fixe) ; à chaque pas, le faisceau est découpé dans ce tour
  (`coneOfLitPolygon`, sans rayon), puis la texture est redessinée. Seules les lampes à l'écran sont redessinées,
  dès 1° de mouvement (même à 10 tr/min, presque à chaque image), au plus 4 par image (les plus anciennes d'abord :
  au-delà de 4 lampes à l'écran, chacune avance moins souvent, par sauts plus grands), soit au plus 240 dessins de
  texture par seconde à 60 images par seconde. Mesure hors navigateur, 10 lampes, calcul seul : découpage 0,03 à
  0,1 ms par pas pour les 10 sur une carte de bureaux (6 à 20 cases), 0,8 ms sur des piliers une case sur deux à
  20 cases ; le tour complet coûte 0,5 ms (bureaux, 6 cases) à 5 ms (bureaux 20 cases, ou piliers
  6 cases) pour les 10, et 330 ms sur les piliers à 20 cases (pire cas). Le dessin de la texture (dégradé sur
  (2 × portée en px / 4)² texels, 37 Ko à 6 cases, 400 Ko à 20 cases, envoyés au GPU à chaque pas : au plus
  9 Mo/s à 6 cases, 98 Mo/s à 20 cases) et la recomposition du voile de nuit à chaque pas ne sont pas mesurés. Le
  tour complet des piliers à 20 cases (330 ms pour 10 lampes) fait une saccade visible : acceptable sur des bureaux,
  pas sur ce pire cas.

Code : `play/src/front/Phaser/Game/Lamps/RgbLamp*.ts`. Le calcul est sans Phaser et testé : segments d'obstacles
(`RgbLampObstacles`), polygone éclairé par lancer de rayons découpé par le cône (`RgbLampGeometry`). Rendu : une
texture par lampe (dégradé découpé par le polygone, un texel pour quatre pixels de carte, ce qui adoucit le bord des
ombres), en fusion additive, redessinée seulement quand la lampe, ses réglages ou un obstacle dans sa portée changent.
Mesure hors navigateur (calcul seul, sans le dessin des textures) : 20 lampes de 10 cases recalculées ensemble en 4 à
6 ms sur une carte de bureaux, 50 ms environ sur une carte de piliers isolés, une case sur deux (le pire cas, une
fois) ; rien par image tant que rien ne change.

Recette : poser la lampe près d'un mur, d'une porte de l'outil Carte et d'un meuble haut ; tirer la poignée du bout,
puis les losanges ; changer la couleur ; annuler ; déplacer la lampe et le meuble ; ouvrir la porte en la traversant ;
regarder de nuit (`?nightAt=22:00` en dev).
Rotation (code `RgbLampRotation.ts`, `coneOfLitPolygon`) : activer la rotation, fermer l'éditeur, comparer deux postes
côte à côte (même faisceau au même moment) ; 120 tr/min avec 10° d'ouverture ; sens anti-horaire ; près d'un mur et
d'une porte qui s'ouvre ; de nuit ; mouvement réduit du système ; effets lumineux coupés puis rallumés pour soi ; une dizaine de lampes tournantes à l'écran pour le
débit d'images.

## Interrupteurs

Un **interrupteur** allume et éteint des lampes RGB, pour tout le monde. Plusieurs interrupteurs peuvent commander la
même lampe, et un interrupteur plusieurs lampes : l'état (allumée ou éteinte) appartient à la lampe, un interrupteur
n'a pas de position à lui (comme un va-et-vient).

- **Poser** : éditeur, section **Lampes**, objet **Interrupteur**. Il commande aussitôt **les lampes de sa pièce**.
  N'importe quel autre objet peut devenir interrupteur : le sélectionner et ajouter la propriété **Interrupteur**. Une
  lampe peut l'être aussi, et se commander elle-même.
- **Câbler** (panneau de l'interrupteur) :
  - **Les lampes de cette pièce** : les lampes RGB de la plus petite zone de la carte où se tient le pied de
    l'interrupteur, au même niveau que lui ; à l'étage, sans zone, l'étage lui-même. Une lampe ou un interrupteur
    juste hors d'une pièce lui appartient quand même : jusqu'à 4 cases au-dessus (lampe accrochée au mur du haut),
    une case sur les autres côtés ; entre deux pièces, la plus proche (`roomIdAt`). Une lampe sur la case juste
    au-dessus d'une pièce (la face de son mur) est à cette pièce, même si la zone de la pièce du dessus a été tracée
    jusque-là. Pour un mur plus haut recouvert par une autre zone : bouton **Lier des lampes**.
  - Dans l'éditeur, une **lampe sélectionnée** montre par des traits tout ce qui la commande. Une lampe ajoutée plus tard dans la
    pièce est commandée sans rien refaire. Hors de toute pièce, l'interrupteur ne commande rien et le panneau le dit.
  - **Lampes choisies** : bouton **🔗 Lier des lampes** (toujours visible, sur l'interrupteur comme sur le capteur
    et la minuterie), puis un clic sur une lampe, où qu'elle soit sur la carte, la lie ou la délie (un pas
    d'annulation par clic), **Terminer** pour finir. Parti du mode pièce, le bouton garde les lampes de la pièce
    comme point de départ. 200 lampes au plus.
  - L'interrupteur sélectionné montre ses cibles : un trait jaune et un cercle. Une lampe sélectionnée affiche
    « Commandée par n interrupteurs ».
  - **Réservé aux tags** : liste de tags séparés par des virgules ; vide, tout le monde peut l'actionner.
- **En jeu** : clic ou touche d'interaction sur l'interrupteur. Si une de ses lampes est allumée, tout s'éteint ;
  sinon tout s'allume. Un petit voyant sur l'objet est vert quand une de ses lampes est allumée. La lampe s'allume ou
  s'éteint en fondu de 200 ms (aussitôt si le système demande moins d'animations). Une lampe éteinte ne donne plus
  aucune lumière et ne perce plus le voile de nuit ; une lampe en rotation ne tourne plus. Dans l'éditeur, toutes les
  lampes restent allumées pour pouvoir les régler.
- **Déclencheurs automatiques** (menu **Déclencheur** du panneau ; objets **Capteur de présence** et **Minuterie** de
  la section Lampes, prêts à l'emploi) :
  - **Présence** : quelqu'un **dans cette pièce** (la plus petite zone du niveau du capteur), **dans la zone**
    choisie dans la liste des zones nommées, **autour du capteur** (1 à 20 cases, 3 par défaut) ou **dans un cône
    devant le capteur** (direction en degrés, 90 = vers le bas, ouverture 10° à 360°, portée en cases, comme le
    faisceau d'une lampe). Les lampes s'éteignent après un délai sans personne (0 à 600 s, **30 s** par défaut). Les
    avatars comptent, et les **animaux promeneurs** (posés sur la carte, de la jungle, apprivoisés) ; un capteur ne
    sent que son niveau, les animaux sont au sol ; les murs ne comptent pas.
  - **Présence dans le bâtiment** : quelqu'un n'importe où dans le bâtiment du capteur, à n'importe quel étage —
    pour les déclenchements globaux (toutes les lampes d'un bâtiment, plus tard ses volets). Un **bâtiment** est le
    bloc d'un seul tenant de cases qui ne sont pas dehors, murs compris (`labelBuildings`, à partir de la grille
    dedans/dehors des murs de l'outil Carte) ; deux bâtiments qui ne se touchent que par un coin restent distincts.
    Capteur sélectionné : le rectangle qui entoure son bâtiment est dessiné. Un capteur posé dehors ne se déclenche
    jamais (le panneau le dit). Comme le serveur n'a pas les murs de la carte, c'est chaque navigateur qui signale
    que **son** avatar (ou un de ses animaux) est dans le bâtiment d'un capteur, par le même message que pour les
    animaux ; le serveur réunit les signalements et applique le délai d'extinction. Un onglet en arrière-plan ne
    signale plus rien : pour ces capteurs, le serveur garde le dernier signalement d'un joueur tant qu'il est dans la
    salle et n'a pas bougé depuis.
  - **Plage horaire** : de `HH:MM` à `HH:MM`, **heure du lieu de la carte** (Paris sans lieu choisi), peut passer
    minuit ; pas de jours de la semaine.
  - Capteur sélectionné dans l'éditeur : la zone, le disque ou le cône qu'il surveille est dessiné en bleu.
  - Un capteur ou une minuterie ne s'actionne pas à la main (le serveur refuse aussi l'appui).
  - **Lampe à capteur intégré** : sur une lampe RGB, bouton **Ajouter un capteur à cette lampe** (elle s'allume quand
    quelqu'un est à moins de 3 cases, s'éteint 30 s après). Ajouter la propriété Interrupteur à une lampe la câble sur
    elle-même ; on peut lui ajouter d'autres lampes.
  - **Plusieurs déclencheurs sur une lampe** : elle est allumée tant qu'au moins un tient (quelqu'un détecté, ou dans
    la plage). **Interrupteur manuel et capteur** : le geste tient tant que rien ne change côté déclencheurs — j'éteins
    à la main, ça reste éteint tant que la pièce est occupée ; pièce vidée puis réoccupée, le capteur rallume.
  - Une lampe à déclencheur est **éteinte** quand personne n'est détecté et hors plage, y compris à l'ouverture de
    la salle : poser un capteur éteint la pièce vide.
  - **Qui décide** : le serveur, 5 fois par seconde (une lampe s'allume avant qu'un avatar qui marche l'ait dépassée), pour les seuls objets à déclencheur (`SwitchTriggerEvaluator`) ;
    il écrit dans le même magasin d'état. Il ne sait pas ce qu'est une lampe ni la taille d'un objet : l'**éditeur
    ouvert** enregistre dans la carte la pièce du capteur (`trigger.areaId`) et ses lampes (`resolvedTargets`), et les
    remet à jour quand on déplace le capteur ou qu'on ajoute une lampe, quel que soit l'outil de l'éditeur en cours,
    **hors de l'historique** d'annulation (jamais deux fois la même mise à jour en moins de 5 s) ; un capteur collé
    oublie la pièce et les lampes de son original ; le centre d'un
    capteur est pris à une demi-case de son coin. Les animaux n'existent que dans les navigateurs : chacun signale au
    serveur les capteurs où se trouve un de ses animaux (`ReportSwitchPresenceMessage`, répété toutes les 2 s, oublié
    après 5 s) ; sans joueur connecté, aucun animal ne compte.
  - **Propriété mal formée** : la carte en cours d'édition garde ce que la dernière commande portait, sans validation.
    Le jeu et le serveur lisent donc un interrupteur par un lecteur validé (`switchPropertyIn`) : incomplet, il prend
    ses valeurs par défaut ; mal formé, il est ignoré ; un déclencheur mal formé en fait un interrupteur manuel.
  - Limites : un capteur supprimé laisse ses lampes dans leur dernier état ; un
    client modifié peut tenir un capteur allumé en signalant un animal ; un joueur immobile dont le navigateur avait
    signalé un animal dans un bâtiment y tient les lampes allumées tant qu'il ne bouge pas ; la lampe dupliquée (⧉)
    d'une lampe à capteur intégré commande encore l'originale (à recâbler).
- **Obscurité de la nuit (réglage personnel)** : Paramètres → Ambiance → Cycle jour/nuit, curseur de 5 % (claire) à
  95 % (très sombre), 60 % par défaut comme avant ; c'est l'opacité du voile en pleine nuit (`nightDarknessStore`,
  gardé dans le navigateur, `nightOpacityWith`) : crépuscule et aube en gardent leur part, la lune l'éclaircit comme
  avant, lampes, torches et halos le percent comme avant. « Revenir à 60 % » sous le curseur.
- **Deuxième rebond (réglage personnel, à l'essai)** : sous l'effet « 3 · Rebond », l'interrupteur « Deuxième rebond »
  (`secondBounceOnStore`, coupé par défaut) fait renvoyer la lumière une seconde fois, par les murs qu'éclairent les
  premiers rebonds (`secondBounceSources`) : la lumière va un coin plus loin, beaucoup plus faible (part d'une part).
  Au plus 4 de plus par lampe, les plus forts, soit 10 lumières renvoyées par lampe fixe au lieu de 6 ; c'est l'effet
  le plus coûteux (autant de lancers de rayons et de formes à découper dans le voile). Porté par le code de partage
  (36 réglages).
- **Sélecteur des effets de lumière indirecte** : chacun des trois effets a son interrupteur, « 1 · Ambiance des
  pièces », « 2 · Bords des lumières adoucis », « 3 · Rebond de la lumière sur les murs » (`ambienceOnStore`,
  `softEdgeOnStore`, `bounceOnStore`, tous activés par défaut) ; un effet coupé ne dessine plus rien mais garde son
  dosage (`shown…Store`), pour comparer avec et sans d'un clic. Portés par le code de partage (35 réglages).
- **Lumière indirecte (réglages personnels)** : Paramètres → Ambiance → Cycle jour/nuit, trois curseurs gardés dans le
  navigateur. (1) **Ambiance des pièces** (`Night/AmbientLight.ts`, `roomAmbience`) : une pièce (zone de la carte) où
  entre la lumière d'une lampe RGB ou d'une torche, par sa porte ou depuis un coin, est éclaircie partout ; curseur
  « jusqu'à x % du voile » (`ambienceStrengthStore`, 25 % par défaut, 0 : aucune) et curseur « ambiance maximale quand
  x % de la pièce est éclairée » (`ambienceFullShareStore`, 30 % par défaut) ; chaque lumière compte pour sa force ;
  recalculé seulement quand les lumières, les zones ou un réglage changent. (2) **Bords adoucis**
  (`lightSoftEdgeStore`, 8 px par défaut, 0 à 32 px) : le bord de la lumière d'une lampe ou d'une torche est flouté
  dans sa texture (`LightSoftEdge`, flou du canevas ; bord net sur un navigateur sans filtre de canevas). Ambiance et
  bords à 0 : lumière directe seule, bords nets, comme avant. Limites : l'ambiance éclaircit le voile sans le
  teinter de la couleur de la lampe, ne vaut que dans une zone (rien dehors ni dans une pièce sans zone), ne compte
  pas la lumière de lune entrée par les fenêtres, et le flou déborde d'autant derrière un mur ; pas de vrai rebond
  (une lumière ne tourne pas au coin d'une porte).
- **Rebond de la lumière sur les murs (réglage personnel)** : curseur « Rebond sur les murs » (`lightBounceStore`,
  40 % par défaut, 0 : aucun), avec les réglages de lumière indirecte. Chaque tronçon de mur qu'une lampe RGB **fixe**
  éclaire renvoie une petite lumière (`Lamps/LightBounce.ts`, `bounceSources`) : un demi-tour posé 4 px devant le mur,
  tourné vers le côté de la lampe, de la couleur de la lampe, d'autant plus fort que la lumière y est forte et que le
  tronçon est long (un tronçon de plus de 4 cases en renvoie plusieurs), portée de 2 à 5 cases ; au plus 6 par lampe,
  les plus forts. Chacun est une vraie lumière, lancée contre les mêmes obstacles : elle perce le voile de nuit et
  compte pour l'ambiance des pièces ; ainsi la lumière **tourne au coin d'une porte**. Recalculé seulement quand la
  lampe est redessinée. Limites : un seul rebond ; pas pour une lampe tournante (gyrophare) ni pour les torches ni la
  lumière de lune ; les objets hauts renvoient comme des murs ; coût : jusqu'à 6 lancers de rayons et 6 petites
  textures de plus par lampe.
- **Fuseau horaire de la carte** : le lieu de la carte (`weatherLocation`, choisi dans « Météo de la carte ») porte
  son fuseau (`timezone`, nom IANA rendu par la recherche de ville d'Open-Meteo, champ facultatif du WAM et du
  protobuf `MapLocationMessage.timezone`). L'**horloge** sous la barre d'actions affiche l'heure de ce lieu
  (`worldClockTimeZone`, `mapTimeZoneStore` ; l'heure de l'ordinateur en mode « Heure de mon ordinateur ») et les
  **minuteries** des lampes lisent leurs heures dans ce fuseau (`minutesOfDayIn`, évalué par `back`). Sans lieu, ou
  pour un lieu choisi avant ce changement (pas de fuseau enregistré : rechoisir la ville), ou si le fuseau n'en est
  pas un : heure de Paris. Restent à l'heure de Paris pour toutes les cartes : saisons, thème de Noël, programme de la
  météo automatique. `play`, `back` et `map-storage` à déployer ensemble.
- **Éclairage du jeu dans l'éditeur (réglage personnel)** : l'éditeur de carte masque le voile de nuit, pour voir ce qu'on
  édite ; le **bouton soleil-lune sous la barre d'outils de l'éditeur** (ou l'interrupteur « Même éclairage dans l'éditeur de carte qu'en jeu », Paramètres → Ambiance → Cycle jour/nuit,
  `nightInEditorStore`, désactivé par défaut) le laisse, avec l'obscurité, l'ambiance et les rebonds réglés : on règle
  couleur, portée et intensité d'une lampe comme elle sera la nuit. Les zones ajoutées ou déplacées ne comptent pour
  la nuit qu'à la fermeture de l'éditeur ; les torches n'y éclairent pas.
- **Compteur de performances (réglage personnel)** : Paramètres → Ambiance, « Afficher le compteur de performances »
  (`perfShownStore`, masqué par défaut) affiche, à gauche du groupe central de la barre d'actions (à partir d'une
  largeur moyenne), sur la dernière demi-seconde : images par seconde, plus longue attente entre deux images (une
  saccade que la moyenne cache), temps moyen de calcul de la scène et de rendu d'une image, en ms ; texte en couleur
  d'alerte sous 30 images/s ou au-delà de 50 ms d'attente. `Perf/PerfMeter.ts` (calcul), `Perf/PerfMonitor.ts`
  (écoute les événements `preupdate`/`postupdate` de la scène et `prerender`/`postrender` du jeu, seulement quand le
  compteur est affiché). Le jeu ne redessine que quand quelque chose a changé : le temps de rendu d'une scène au repos
  est proche de zéro.
- **Mise en évidence des zones sous l'éclairage réaliste** : la propriété de zone d'origine « Mise en évidence »
  (`highlight`, `DarkenOutsideAreaEffect`) assombrit tout ce qui est hors de la zone quand on y entre ; l'éditeur
  l'ajoute d'office à une zone silencieuse, donc aux salles de réunion. Sous « Éclairage réaliste », bloc « Réglages
  avancés » : l'interrupteur « Ne plus assombrir le reste de la carte en entrant dans une zone »
  (`noAreaHighlightStore`, **activé par défaut**) la coupe pour soi tant que l'éclairage réaliste est activé
  (`areaHighlightHiddenStore`) ; coupée pendant qu'on est dans la zone, elle s'efface aussitôt. Sans éclairage
  réaliste, rien ne change. Porté par le code de partage (37 réglages).
- **Puissance d'une lampe RGB, en lumens** (`Lamps/LampLumens.ts`) : dans l'éditeur de la lampe, le curseur
  « Puissance » (75 à 6 100 lm) et ses préréglages (Bougie 75, Appoint 200, Bureau 360, Ampoule 450, Plafonnier
  1 600, Projecteur 3 500) règlent **portée et intensité ensemble**, comme pour une vraie lampe ; les deux anciens
  curseurs sont dans le bloc « Réglage libre ». Rien ne change dans le format de la carte : la lampe garde `radius` et
  `intensity`, les lumens n'en sont qu'une lecture (`lumensOfLamp`), et une lampe réglée librement n'en a pas tant
  qu'on ne choisit pas une puissance. Modèle : lampe à 2,20 m du sol éclairant vers le bas, case de 1,20 m² au sol,
  éclairement au sol = flux / (2π (d² + h²)), portée arrêtée à 2 lux, pied pleinement éclairé à partir du flux de la
  lampe par défaut (6 cases, 100 % ≈ 600 lm) ; soit lumens ≈ 15 × cases² + 60. **Un faisceau étroit concentre** : les mêmes
  lumens dans un cône de θ degrés valent 360/θ fois plus qu'en éclairant tout autour (réflecteur) ; une ampoule de
  450 lm porte à 5 cases tout autour, à 10,5 cases dans un quart de cercle, jamais au-delà de 20 cases. Dans
  l'éditeur, resserrer l'ouverture d'une lampe réglée en puissance garde ses lumens et allonge sa portée ; une lampe
  en réglage libre garde sa portée ; la poignée d'ouverture sur la carte ne recale pas la portée. Ces constantes sont des choix, pas
  des mesures. **Décroissance réelle (réglage personnel, à l'essai)** : Paramètres → Lumière indirecte,
  « Décroissance réelle de la lumière » (`realFalloffStore`, coupé par défaut) dessine la lumière des lampes et des
  torches selon cette loi (`realLightFalloff` : plus forte au pied, longue traîne faible, environ 23 % à mi-portée
  d'une lampe de 6 cases au lieu de 56 %) ; porté par le code de partage (38 réglages).
- **Lumière du ciel par une porte ouverte** : une porte horizontale de l'outil Carte, pleine ou vitrée, laisse entrer
  la lumière du soleil ou de la lune **tant qu'elle est ouverte**, sur ses deux cases de large et depuis le sol ; une
  porte vitrée fermée reste une vitre, une porte pleine fermée ne laisse rien passer. Vaut pour une porte qui donne
  dehors et pour une porte entre deux pièces (la lumière continue, comme par une fenêtre intérieure, **sans** les 15 %
  perdus par un verre). L'état des portes est relu deux fois par seconde au plus (`SkyWindowLightManager.readWalls`,
  option `isDoorOpen`) : la tache apparaît ou disparaît une demi-seconde au plus après la porte. Portes verticales
  non concernées, comme les fenêtres.
- **Lumière du ciel à travers deux fenêtres** (`SkyShadows/SkyWindowLight.ts`, `lightThroughPanes`) : la lumière du
  soleil ou de la lune entrée par une vitre continue par les vitres **entre deux pièces** (fenêtres et portes vitrées
  des murs horizontaux, `interiorOpenings`). Les rayons du ciel sont parallèles : un point de la pièce suivante est
  éclairé quand il est à la fois dans la tache de la vitre d'entrée (non découpée à sa pièce) et dans la tache que
  jetterait la vitre intérieure si elle donnait dehors ; la tache de la pièce suivante est l'intersection des deux,
  découpée à cette pièce. Ce calcul exact ne laisse presque rien passer avec des vitres d'une case (les hauteurs de
  la carte sont petites devant ses distances : le rayon arrive au mur d'en face sous l'appui de la fenêtre) ; quand il
  ne donne rien, la vitre **relaie** : une lumière qui traverse la pièce jusqu'à moins d'une case du mur intérieur
  éclaire la vitre qu'elle atteint, et cette vitre jette sa propre tache dans la pièce suivante, sur la largeur que
  la lumière couvre (`spanAt`). Un soleil bas porte loin et traverse ; un soleil haut s'arrête avant le mur intérieur ; des
  vitres hautes laissent passer plus. Chaque vitre traversée garde 85 % de la lumière ; 3 vitres en enfilade au plus.
  Limites : rien n'est regardé entre les deux vitres (meuble, cloison), murs horizontaux seulement, une porte ouverte
  ne laisse pas passer cette lumière, et la tache reste bornée par la longueur maximale des ombres réglée.
- **Nuages au-dessus des bâtiments, vu de haut** (`cloudsOverRoofs`, `Weather/Clouds.ts`) : les nuages ne sont dessinés
  que dehors, découpés autour des bâtiments, tant qu'on joue de près ; dézoomé (un pixel de carte sur 0,7 pixel d'écran
  ou moins), ils passent progressivement aussi par-dessus les pièces, et entièrement à partir de 0,45 : la caméra est
  au-dessus d'eux. Leurs ombres restent au sol, dehors. Vaut pour les nuages de beau temps et ceux de pluie.
- **Partager ses réglages de lumière** : Paramètres → Ambiance, « Copier le code de mes réglages » donne un code
  (`LUM1-…`, `Stores/LightSettingsCode.ts`) qui porte les 38 réglages personnels de lumière (obscurité de la nuit,
  éclairage réaliste, lumière indirecte, soleil et lune avec leurs limites, ce qui projette une ombre et sous quelle
  forme) ; l'autre le colle dans « Coller un code reçu » puis « Appliquer ». Rien ne passe par le serveur. À la
  lecture, seuls les réglages connus et du bon genre sont appliqués, chacun gardant ses bornes ; un réglage inconnu
  (code d'une version plus récente) est ignoré. Les noms des réglages (`Stores/LightSettings.ts`) font partie du
  code : ne jamais en réutiliser un pour autre chose. Hors du code : mode du cycle jour/nuit, nuages, effets des
  lampes de Jam.
- **Éclairage réaliste (réglage personnel)** : Paramètres → Ambiance → Cycle jour/nuit, interrupteur « Éclairage
  réaliste : les pièces ne s'allument plus toutes seules », désactivé par défaut, gardé dans le navigateur
  (`realisticNightStore`). Activé, la nuit, une pièce occupée ne s'éclaire plus d'elle-même : seules ses lampes (et
  les torches) percent le voile ; chaque avatar garde son halo. Sert à essayer interrupteurs et capteurs avant le
  voile de nuit réaliste. Les autres joueurs ne sont pas concernés.
- **Par défaut tout est allumé** : une carte faite avant les interrupteurs ne change pas.
- **Copier, coller** : un interrupteur collé avec ses lampes commande les copies ; les lampes choisies qui n'ont pas
  été copiées avec lui sont retirées de la copie. Un motif ne garde pas les lampes choisies (utiliser le mode pièce).
  Le bouton ⧉ Dupliquer garde les mêmes lampes : c'est un second interrupteur pour elles.
- **Format** : le câblage est dans la carte (propriété d'objet `switchPropertyData` : `key`, `targets` en
  `{ mode: "zone" }` ou `{ mode: "ids", ids }`, `allowedTags`). L'état n'est **pas** dans la carte : le serveur
  (`back`, `EntityStateManager`) le tient, l'envoie à l'entrée dans la salle et à chaque changement, et le garde dans
  Redis (hash `entity-states:<salle>`, seulement les lampes éteintes) : il survit à une salle vide et à un
  redémarrage. Un appui ne modifie jamais la carte et n'entre pas dans annuler/rétablir. Entrée de catalogue :
  `switch: true` donne la propriété à la pose.
- **Contrôles du serveur** : l'interrupteur existe et commande cette clé, les tags du joueur conviennent, chaque cible
  existe et est listée (lampes choisies) ou au même niveau et à 60 cases au plus (lampes de la pièce : le serveur n'a
  pas les catalogues, c'est le front qui trouve la pièce) ; 5 appuis par seconde et par joueur, 3 changements par
  seconde et par lampe, quel que soit le nombre de joueurs.
- **Déploiement** : `play`, `back` et `map-storage` ensemble (nouveau message, nouvelle propriété de la carte) ; une
  image plus ancienne de `map-storage` retirerait la propriété. Un front plus ancien voit toutes les lampes allumées.
- **Cadre pour la suite** : les états possibles sont une liste fermée (`ENTITY_STATE_KEYS`, aujourd'hui `on`) et le
  genre d'objet qui les porte se déclare à un seul endroit (`entityStateKeysOf`). Un volet (`open`) s'y ajoutera sans
  nouveau message. Les lampes de Jam et la piste de danse suivent la musique et ne sont pas commandées. Les règles
  automatiques (présence, cône, horaires) sont décrites plus haut.

## Paroles de karaoké

Le bouton **Karaoké** d'un Jam Spotify ou d'un Jukebox ouvre les paroles à gauche,
pour soi seulement. Les auditeurs de l'audio relayé n'ont besoin ni de compte
Spotify ni d'invitation supplémentaire. Les salons Live sont exclus.
Cliquer à nouveau sur **Karaoké** ferme le panneau ; cliquer sur celui d'un autre
Jam change la source des paroles.
Le panneau est à 16 px du bord gauche de la zone de jeu, donc juste à droite du panneau
latéral (chat, utilisateurs) quand il est ouvert : cette zone commence déjà après lui.

Les paroles gratuites viennent de LRCLIB, puis de lyrics.ovh pour un repli sans
synchronisation. Quand l'édition exacte de l'album n'a que du texte brut sur LRCLIB,
une recherche titre/artiste reprend une autre édition synchronisée de même durée
(±3 s, même album d'abord) ; sans elle, ou en cas d'erreur, le texte brut reste.
Une version choisie à la main n'est pas remplacée. Le morceau courant passe avant le préchargement du seul titre
suivant connu ; la file peut changer. Les paroles suivent la position de l'hôte,
conservent le morceau en pause et se recalibrent après une recherche. Le lecteur
desktop fournit ses changements ; la Web API est relue toutes les cinq secondes.
Un hôte avec un ancien front garde les métadonnées déjà partagées, avec leur
précision de présence.

La ligne en cours reste au milieu du panneau ; elle se remplit en vert du début de la
ligne au début de la suivante (les paroles ne sont horodatées que par ligne), les
lignes passées et à venir sont estompées, une pause musicale affiche une note.
Sous le titre, une barre montre l'avancement du morceau quand sa durée est connue ;
le morceau suivant connu est annoncé en bas. Avec le mouvement réduit du système,
la ligne en cours est verte d'un bloc et le défilement est immédiat.

Le réglage d'avance/retard (bouton à l'horloge, replié par défaut) compense le délai
de l'audio relayé. Faire défiler les paroles suspend leur suivi ; **Suivre la lecture** le reprend. **Choisir une autre
version** recherche un titre/artiste pour cet affichage uniquement. Une absence,
un instrumental et une erreur ont des messages distincts ; un changement de
morceau retire les anciennes paroles. Fermer le panneau conserve l'audio.
La synchronisation se fait par ligne, selon la couverture de la source.
Les paroles du titre suivant déjà chargées s'affichent dès que l'hôte annonce
sa lecture, même si l'album et la durée arrivent seulement à ce moment.
Une recherche en cours du suivant est conservée à la transition. Côté navigateur,
une lecture lente de la file Spotify ne retarde plus le suivi du morceau courant.
Le réglage « Partager ce que j'écoute » de l'hôte reste respecté : le désactiver
arrête la lecture des métadonnées et efface celles déjà annoncées.

Recette : hôte et auditeur audio sans Spotify, morceau courant puis suivant,
pause/reprise/recherche, file réordonnée et saut, lecture manuelle/reprise,
réglage du délai, autre version et morceau introuvable, fermeture et saisie sans
déplacement de l'avatar. Aucun compte fournisseur, dépendance ou protobuf ajouté.

## Jam Spotify terminée ou sans lecture

L'API Web Spotify ne connaît pas les Jams : aucune route ne dit qu'une Jam a pris fin
ni qu'un lien d'invitation a expiré, et la page d'aide « Jam » de Spotify ne précise
ni durée ni expiration. WorkAdventure ne voit donc que le lecteur de l'hôte, lu par
la boucle existante du karaoké (Web API toutes les 5 s, `Retry-After` respecté, 403
relu après 5 min ; aucune requête ajoutée). Le navigateur de l'hôte joint un statut
facultatif à l'état du karaoké (événement de salle existant, ignoré par les anciens
fronts) :

- **rien en lecture** : réponse 204 (« Playback not available or active ») ou app
  Spotify du desktop sans morceau ;
- **lecteur non lu** : ni lecteur desktop ni compte Spotify lié, le morceau ne vient
  que de la présence, sans position (le cas « position inconnue » vu en beta) ;
- **autorisation expirée** : Spotify a refusé le refresh token, ce qui a délié le
  compte (non retenu après un rechargement : il se lit alors « non lié ») ;
- **accès refusé** : 403, compte absent de l'app Spotify du serveur.
- **lecture limitée** : 429, Spotify demande d'attendre (`Retry-After`) ;
- **lecture impossible** : réponse non OK (code affiché à l'hôte), réponse illisible,
  ou Spotify injoignable (réseau, délai, demande de jeton).

**App de bureau (workadventure-desktop 1.1.4).** `watchSpotifyTrack` lit l'app
Spotify du Mac par AppleScript (`spotify-player.ts`), **sans position**, sauf quand
l'extension Spicetify WorkAdventure est connectée (`spicetifyTrack()`, position depuis
0.1.0-beta.14). `watchSpotifyPlayback` ne relaie que cette extension et envoie `null`
tant qu'elle ne rapporte rien (`spicetifyPlayback()` à l'abonnement, `ipc.ts`) : ce
`null` veut dire « extension absente », pas « rien ne joue ». Le cas de la beta du
13/11 : app de bureau sans Spicetify ni compte lié dans son stockage (le bouton
« Partager aussi depuis un autre appareil » n'apparaît que non lié ; une liaison faite
dans un navigateur ne vaut pas pour l'app de bureau). Le morceau venait d'AppleScript
sans position, puis le `null` de Spicetify le remplaçait par « rien en lecture ».
Désormais l'hôte voit **« L'app de bureau lit votre morceau sans sa position »**
(connecter l'extension, ou lier Spotify dans l'app de bureau : la Web API donne alors
la position, et un `null` ultérieur ne l'efface pas) ; « rien en lecture » est réservé
à un état Spicetify sans morceau, à AppleScript qui ne lit rien ou à un 204.

Un compte lié dont la lecture Web API échoue est nommé de même (429, code HTTP, réponse
illisible, Spotify injoignable). Une demande de jeton à Spotify est abandonnée après
10 s : avant, un rafraîchissement sans réponse suspendait toutes les lectures du
lecteur jusqu'au rechargement.

Quand la position de l'hôte d'une Jam Spotify manque **sans raison connue**, la carte et
le karaoké affichent en dernier recours « Position de lecture indisponible : la Jam
s'est sûrement arrêtée sur Spotify » avec **Coller un nouveau lien de Jam** (mis en avant
aussi pour « rien en lecture »). Une raison connue est affichée seule, avec
un bouton **Réglages Spotify** quand il faut relier le compte, et **Coller un nouveau
lien de Jam** à tout moment : le lien remplace l'ancien sans fermer le salon (titre,
lumières, zone conservés, même hors de la zone). L'audio relayé continue : le Space
`jam:…` est nommé d'après la salle, la zone et l'hôte, jamais d'après le lien ; ni la
capture de l'hôte ni l'écoute des auditeurs ne s'arrêtent, à l'expiration comme au
remplacement du lien. Les auditeurs voient
seulement « rien en lecture » ; ceux qui avaient rejoint par l'ancien lien sont
invités à rejoindre à nouveau (Rejoindre ouvre le nouveau lien). Le karaoké remplace
« position inconnue » ou « pas de morceau » par la raison connue, avec l'action utile
pour l'hôte (réglages Spotify, ou **Coller un nouveau lien de Jam** qui ouvre le champ
dans le karaoké même, avec le focus), et reste ouvert sur le nouveau lien. Sur la carte,
le même bouton ouvre le champ avec le focus. Après l'envoi, la carte et le karaoké disent « Enregistrement du
nouveau lien… », puis « Lien de la Jam mis à jour. » dès que le serveur renvoie la salle
avec ce lien (la variable de zone n'est jamais écrite localement d'abord : son retour
prouve l'enregistrement), ou « Le nouveau lien n'a pas été enregistré : réessayez. »
au bout de 10 s sans retour (refus du back ou perte). Un lien qui n'est pas une
invitation de Jam est refusé tout de suite dans le champ.

Limites : si le Spotify de l'hôte continue de jouer après la fin de la Jam, rien ne
le signale (seul le bouton de nouveau lien reste utile). Un hôte qui n'a jamais lié
Spotify, hors client desktop, voit en permanence la mention « lecteur non lu ». Un
invité arrivé après le début d'un 204 ne voit l'avertissement qu'au prochain
changement d'état de l'hôte, ou en ouvrant le karaoké.

Recette : Jam expirée réelle (statut observé chez l'hôte : 204 ou lecture continue),
navigateur sans Spotify lié, refresh refusé, collage d'un nouveau lien hors de la
zone avec un auditeur audio et un invité Spotify, karaoké ouvert des deux côtés.

### Demander un nouveau lien à l'hôte

Sur la carte d'une Jam Spotify dont l'hôte publie « rien en lecture », ou une position
manquante sans raison connue, un auditeur a **Demander un nouveau lien**. Une demande
par auditeur et par Jam toutes les 2 minutes : le bouton passe à « Demande envoyée »
pendant ce délai. L'hôte, seul destinataire, reçoit une carte en haut à droite
(« Antoine demande un nouveau lien de Jam », « Antoine et 2 autres… » : une carte par
Jam, dernier demandeur d'abord) avec **Coller un nouveau lien de Jam** (champ dans la
carte, focalisé) et ×. Elle disparaît quand le lien change ou que le salon se ferme.

Mécanisme du coucou réutilisé : événement de script de la salle
`infogene.jam-link-request` (zone, propriété, lien), envoyé au seul hôte, expéditeur
fixé par le serveur ; aucun protocole ni back changé. Son de bulle (coupé en « Ne pas
déranger » par `GameScene.playSound`) et notification système (`SystemNotifier`, type
`jamLinkRequest`) si l'onglet n'a pas le focus, avec le réglage et la permission du
coucou ; comme le coucou et contrairement au toc toc, rien ne passe « Ne pas déranger »
(la carte reste) : une demande de lien n'est pas urgente. Un même auditeur ne relance
le son et la notification qu'au bout de 2 minutes.

Recette : deux postes ; l'hôte arrête Spotify ; l'auditeur demande, voit « Demande
envoyée » ; l'hôte voit la carte, le son, la notification onglet en arrière-plan, puis
colle un lien : la carte disparaît. Refaire en « Ne pas déranger » et avec trois
auditeurs.

## Compteur des Jams et écoute audio

« Écouter l'audio » suffit pour apparaître parmi les participants d'un Jam Spotify :
aucun compte Spotify, extension ni clic sur le lien d'invitation n'est nécessaire.
L'appartenance est publiée une fois la session audio connectée, puis retirée à
l'arrêt de cette écoute si aucun Jam n'a aussi été rejoint. Une personne présente
par Spotify et par l'audio est comptée une fois. Un salon ouvert inclut toujours
son hôte, même lorsque celui-ci écoute l'audio d'un autre salon.

Recette : l'hôte ouvre un Jam Spotify et partage son audio ; un second compte
clique seulement « Écouter l'audio ». Le compteur passe de 1 à 2 et la liste des
utilisateurs nomme le Jam de l'auditeur. Arrêter cette écoute ramène le compteur
à 1 ; la reprendre après rechargement le ramène à 2. Rejoindre aussi le même Jam
par son invitation conserve 2. Vérifier également un salon Live et un Jukebox.

## Salons Live

Dans une zone d'écoute, « Ouvrir un salon » propose **Live** en plus du Jam Spotify
et du Jukebox. L'hôte choisit une entrée audio physique (carte son USB) ou virtuelle,
puis « Partager l'audio ». Les invités cliquent « Écouter l'audio » et règlent leur
volume ici, sans Spotify ni extension. La capture et le transport stéréo réutilisent
le partage audio des Jams ; le micro de conversation reste exclu du choix de source.
« Terminer le Live » ferme le salon et arrête sa capture.

Le volume d'écoute de la musique d'un Jam (Spotify, Jukebox ou Live) est gardé dans le navigateur
(`localUserStore`, clé `jamMusicVolume`, valeur de 0 à 1) : un rechargement, donc un redéploiement, ne le remet
plus à 100 %. La sourdine, elle, reste pour la session.

Recette : sur un Mac, brancher un instrument via une carte USB, garder le micro de
conversation séparé, ouvrir un Live et partager cette carte. Écouter depuis un
second compte, vérifier volume/pause/arrêt, fermeture du panneau, départ du salon,
débranchement USB et reprise après rechargement. Tester aussi une entrée virtuelle.
Les salons Live nécessitent le back du fork, qui accepte ce nouveau type de salon.

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

## Bouton « Mon bureau » de la barre d'actions

Comme dans Gather, un bouton bureau (`PersonalDeskMenuItem.svelte`) se trouve dans la barre du haut, entre l'émoji et
les applications, avant le micro et la caméra. Avec un bureau réservé sur la carte, un clic **fait marcher** l'avatar
jusqu'au bureau, comme Cmd/Ctrl+D (`personalDeskActions.ts`, partagé avec Outils). L'infobulle affiche le raccourci
`walkMyDesk` tel qu'il est réglé dans le menu des raccourcis, ou n'affiche rien s'il est retiré. Debout dans son bureau,
il dit « S’asseoir à mon bureau » et fait asseoir ; assis à son bureau, il est grisé et dit « Vous êtes à votre
bureau » (le bouton d'Outils suit les mêmes états, `personalDeskModeStore`, d'après `userSeatedStore` que `Player`
tient à jour). Sans bureau sur la carte, il propose « Trouver un bureau libre »
(la liste des bureaux libres de l'explorateur). Le bouton n'apparaît qu'à partir de la largeur `@md` de la barre : le
groupe de gauche ne rétrécit pas, et un bouton de plus juste au-dessus de `@sm` repousserait le menu profil hors de la
barre. Outils garde donc « Aller à mon bureau » pour les petites largeurs, par exception à la règle « un seul endroit
par réglage » (6d71e0378), qui avait retiré « Explorer le salon » d'Outils parce que son bouton flottant reste visible à
toutes les largeurs.

À l'arrivée, l'avatar **s'assoit** sur le siège du bureau, comme après un double-clic sur ce siège (bouton, Cmd/Ctrl+D
et Outils : `GameScene.walkToPersonalDesk`, logique dans `Player/DeskSeat.ts`). Le siège choisi est le siège libre dont
la place est dans la zone du bureau, le plus proche du centre de la zone : une zone personnelle ne dit pas quelle chaise
est la sienne, et elle entoure en général un seul poste, dont la chaise est au centre plutôt qu'une chaise de visiteur
au bord. Siège pris : le suivant le plus proche. Aucun siège libre dans le bureau : marche jusqu'au centre, debout,
comme avant. Déjà assis à son bureau : rien. Debout dans son bureau, l'avatar s'assoit ; sans siège libre, rien ne
se passe. `Player.sitOnSeat` garde ses refus (nage, eau, suivi, siège hors de portée) : l'avatar reste alors debout.

Recette : avec un bureau, cliquer (marche puis assise), entrer dans le bureau (bouton grisé, infobulle), réassigner le
raccourci ; chaise du bureau prise par un collègue, bureau sans chaise ; sans bureau, ouvrir la liste des bureaux
libres ; réduire la fenêtre jusqu'au repli de la barre.

## Le circuit

```
branche feat/xxx ──PR──▶ infogene ──(auto)──▶ BETA  wa-beta.goyan.fr     (staging, compte Authentik requis)
                                   │
                                   └─ release (par un « releaser ») ──▶ PROD  wa.goyan.fr
```

1. **Créer une branche** depuis `infogene` : `git switch -c feat/ma-modif origin/infogene`.
2. **Commits petits et ciblés**, message en français : `feat(front): …`, `fix(front): …`, `test(front): …`, `ci: …`.
   Un patch qui touche peu de fichiers se rebase facilement sur les prochaines versions de WorkAdventure.
   **Au moins un commit `feat(front): …`, `fix(front): …`, `feat(carte): …` ou `fix(carte): …`** par pull request,
   rédigé pour un lecteur non technique : son sujet est le texte affiché dans « Outils → Nouveautés ». Le contrôle
   « Note de nouveautés » refuse la pull request sinon, et liste dans le résumé de son exécution les notes à paraître.
   Rien à annoncer (docs, CI, tests) : écrire la ligne `Nouveautes: aucune` dans le message d'un commit. Ne pas
   fusionner en « squash » (le sujet deviendrait le titre de la pull request). Contrôle en local :
   `node play/scripts/check-release-note.mjs` (compare à `origin/infogene`).
3. **Ouvrir une pull request vers `infogene`**. Elle doit avoir : les vérifications vertes (voir ci-dessous) et **une relecture**.
4. **Après fusion**, la CI construit l'image et la **beta se met à jour seule** (~10 min). Tester sur https://wa-beta.goyan.fr
   (Ctrl+F5). _Le code n'est pas déployé en beta avant la fusion._
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
Zoom de la caméra gardé après un rechargement (F5) : `CameraManager` enregistre dans le navigateur (`localUserStore`,
clé `cameraZoomModifier`, pour toutes les cartes) le facteur de zoom choisi par l'utilisateur par rapport au zoom par
défaut, 300 ms après la fin du geste ou tout de suite à la fermeture de la page, puis le reprend au démarrage de la
scène dans les limites de l'écran et de la carte (`Phaser/Game/ZoomPersistence.ts`). Les zooms imposés par une zone de
focus, l'éditeur de carte ou le cadrage d'un trajet ne sont pas enregistrés ; une valeur absente ou corrompue garde le
zoom par défaut.
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
La réunion démarre dès qu'un autre joueur est dans la zone. Une fois démarrée, elle ne s'arrête que quand le joueur
quitte la zone, même s'il y reste seul. Un joueur qui entre là où quelqu'un se trouve déjà démarre la réunion tout de suite.

`MeetingAreaPresence.ts` suit les zones de réunion du joueur et enchaîne démarrages et arrêts (un arrêt
n'en devance jamais le démarrage). `AreasPropertiesListener` vérifie toutes les 500 ms, tant que le joueur est dans une
telle zone, si un autre joueur s'y trouve, avec la même règle que pour le joueur local (`isPlayerInsideArea`). Les NPC
(`npc:<id>`) ne comptent pas.

Pourquoi l'arrêt ne dépend pas des autres : le front ne connaît que les joueurs autour de la caméra (le pusher ne lui
envoie que ceux-là). Déplacer la caméra vide cette liste, même si personne ne bouge. Une règle « arrêter quand il n'y
a plus personne » coupait donc l'appel à chaque mouvement de caméra (constaté en beta, Dancefloor, novembre 2026). L'espace de la
réunion ne sert pas non plus de témoin : il ne reçoit ses membres que si quelqu'un est abonné à `usersStore`, et un
client peut ne pas avoir rejoint la réunion. Aucun changement du protocole ou du back : le statut « en réunion » exclut
toujours des bulles une fois la réunion démarrée.

Recette en beta : entrer seul dans une zone de réunion et changer de statut ; en réunion à deux, éloigner la caméra
de la zone sans bouger son woka (l'appel continue) ; faire entrer un second joueur
(réunion des deux côtés, en moins d'une seconde) ; le faire sortir (l'appel continue pour celui qui reste) ; sortir
soi-même (réunion quittée, statut d'avant).

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

**Menu → Réglages → Spotify** : « Lier Spotify » ouvre une fenêtre d'autorisation Spotify (flux _authorization
code_ avec PKCE, sans secret ; seul le scope `user-read-currently-playing` est demandé). Les jetons restent dans le
`localStorage` du navigateur. Une fois lié, l'interrupteur « Partager ce que j'écoute » (activé par défaut) publie le
morceau en cours, relevé toutes les 15 s ; rien n'est affiché en pause, pour les podcasts ou les publicités.

Une app Spotify en mode développement n'accepte que **cinq comptes**, inscrits à la main dans son tableau de bord
(_User Management_), et l'_extended quota_ nous est inaccessible. Sans Client ID personnel, la liaison passe par l'app
du serveur et la section le dit : demander d'abord aux administrateurs d'y ajouter son compte Spotify (5 personnes
maximum). Spotify laisse un compte non inscrit autoriser l'app, puis répond 403 à ses lectures : la section affiche
alors ce même conseil, et le front ne réinterroge Spotify que toutes les 5 minutes. N'importe qui peut à tout moment
utiliser sa propre app (compte Premium) en collant son Client ID dans « Utiliser ma propre app Spotify » ; la section
affiche les étapes et l'URI à déclarer. Le Client ID utilisé est celui de la liaison : en changer demande de délier
puis de relier.

Configuration (repo d'infra, beta et prod) : `SPOTIFY_CLIENT_ID=<Client ID>` (public, aucun secret). Dans l'app
Spotify : cocher **Web API** et déclarer les _Redirect URIs_ `https://wa-beta.goyan.fr/spotify/callback` et
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

Courir avec Maj ne déclenche pas l'assise automatique quand on traverse ou touche un siège.
L'assise automatique reste disponible en marchant ou en s'arrêtant, même si Maj reste maintenu ;
les sièges configurés sur la touche d'interaction conservent leur fonctionnement.

Quand le joueur court (Maj maintenu en se déplaçant, hors mode suivi), l'animation de marche de l'avatar est jouée deux fois plus vite
(`RUN_ANIMATION_SPEED` dans `Phaser/Player/Animation.ts`, `timeScale` de l'animation dans `Character.playAnimation`). L'état est envoyé aux
autres joueurs par le champ `running` de `PositionMessage` (le pusher et le back le relaient tel quel) : ils voient donc aussi l'avatar courir.
Un changement d'état (début ou fin de course) est envoyé immédiatement, sans attendre le délai d'envoi des positions.

À valider en beta (visuel) : courir avec deux navigateurs et comparer la vitesse d'animation vue de l'autre côté.

### Déplacement au double-clic

Un double-clic gauche sur la carte lance le déplacement vers le point visé à la vitesse
de course habituelle (celle de Maj), via le pathfinding (`Utils/PathfindingManager.ts`, A\* sur les cases, sans
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
**Sièges** : la course ne s'assoit sur aucun siège en route, ni sur celui contre lequel elle s'arrête
(`Player.stayStandingHere`). Un double-clic **sur un siège libre** — n'importe où sur l'image de l'objet, place la plus
proche du clic pour un canapé, place libre voisine si celle-ci est prise (`Seat.findSeatAtPoint`) — court jusqu'à lui
puis s'y assoit (`Player.sitOnSeat`, qui reprend la glissade habituelle) : siège à touche d'interaction compris, siège
qu'on vient de quitter ou autre place du même canapé aussi, véhicule rangé. Pas d'assise si la course est annulée, en mode
suivi, à la nage, ou si elle s'arrête à plus d'une case et demie du siège.
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

### Jungle : lions et tigres près des arbres

Module du front seul (`Phaser/Game/Jungle/`) : aucun changement de WAM, de protocole ni de schéma de catalogue.

- **Allumage** : la jungle vit sur une carte où un objet « Panneau jungle » est posé, c'est-à-dire une entrée de
  catalogue au tag `Jungle` **sans** champ `wander`. Les **espèces** sont les entrées chargées au tag `Jungle` **avec**
  `wander` (lion, tigre). Sans panneau, sans espèce chargée ou avant le calcul de la grille « dehors » : rien.
- **Tirage** (`JunglePlan.ts`, pur) : un arbre est un objet posé dont le prefab commence par `Nature:tree-`, pied (milieu
  du bas de l'image) dehors selon `OutdoorGrid`. Un hash (`wanderSeed`) de l'arbre et du jour à Paris retient un arbre
  sur trois et choisit l'espèce ; nid = case libre dehors la plus proche du pied, à 3 cases au plus, sinon pas d'animal ;
  50 animaux au plus par carte, triés par hash. Le même pour tous, quel que soit l'ordre de lecture des arbres ; il
  change chaque jour (horloge du poste, comme les promenades).
- **Promenade** : `WanderingCharactersManager.setFreeCharacters`, des promeneurs **sans objet** : rayon de 5 cases au lieu
  de 10, cases et chemins limités au dehors (`JungleWanderMap.ts` : un chemin qui passe par un bâtiment n'est pas un
  chemin), pas de sièges, jamais ouvreurs de portes, masqués en mode éditeur. Les animaux posés à la main (canard, lion
  posé depuis le catalogue) ne changent pas.
- **Recalage** : `JungleManager` relit la carte toutes les 500 ms (`GameJungle.ts`) et n'applique le tirage que s'il
  change ; une nouvelle grille « dehors » donne une nouvelle carte de promenade.
- **Cris** (`JungleCries.ts`, pur) : une étape de 20 s sur 12 a un cri (en moyenne un cri toutes les 4 min par animal),
  tirée de l'identifiant de l'animal et du numéro d'étape, joué quand l'animal est à l'arrêt ; entendu à moins de
  12 cases, plus faible avec la distance (linéaire) ; au plus un cri toutes les 20 s par joueur ; rien onglet caché, son
  bloqué ou audio verrouillé. Sons `play/public/resources/objects/jungle/{lion,tigre}.mp3`, chargés après le
  préchargement de la scène (pendant celui-ci, un fichier manquant afficherait l'écran d'erreur réseau), une fois par
  page : un son absent ou illisible ne joue rien et ne casse rien.
- **Réglages** : Paramètres → Ambiance « Afficher les animaux de la jungle » (`jungleEnabledStore`, activé par défaut,
  gardé dans le navigateur ; éteint : ni animaux ni cris). Paramètres → Sons « Cris des animaux de la jungle »
  (`jungleVolumeStore`, issu de `environmentVolume`), avec écoute du lion.
- **Non vérifié** : rendu en jeu (de jour, de nuit, sous la pluie), présence d'arbres `Nature:tree-*` dehors sur les cartes
  de la beta, qualité et volume réels des cris, coût de 10 calculs de chemin de plus ; deux clients côte à côte.

#### Apprivoiser les animaux promeneurs (lions, tigres, canards…)

Tous les animaux promeneurs s'apprivoisent : ceux de la jungle (`jungle:<arbre>`) et ceux posés sur la carte avec une
feuille `wander` (`entity:<id de l'entité>`, `WanderingCharactersManager.tameableCharacters`). Le code est resté dans
`Jungle/` et l'événement garde son nom `infogene.jungle.companion` (compatibilité) : « jungle » y est historique.

- **Geste** : à 1,5 case au plus des pieds d'un animal de la jungle libre, l'invite « [ESPACE] pour apprivoiser cet
  animal 🐾 » (la même mécanique que l'invite de siège à touche, `InteractionPrompt`) ; ESPACE ou un clic l'apprivoise :
  il quitte son errance et suit son maître (un animal posé : son objet reste masqué tant qu'il est mené, même quand son
  maître est hors de vue ; dans l'éditeur, l'objet d'un animal posé reste visible et modifiable même mené par un autre
  joueur, et il reste affiché tant que la feuille n'est pas chargée). **Jusqu'à 5 compagnons par joueur** : l'invite « apprivoiser » reste proposée
  tant qu'on en a moins de 5. Près d'un de ses compagnons, la même touche le relâche (« pour relâcher votre
  compagnon ») : il revient tout de suite à son programme de promenade, là où ce programme le place (pas de marche de
  retour, il peut donc réapparaître d'un coup autour de son nid). La touche agit sur l'animal **le plus proche** à portée :
  un compagnon (relâché) ou un animal libre (apprivoisé, s'il reste de la place).
- **Suivi** (`JungleCompanionFollow.ts`, pur) : l'animal repasse par les positions de son maître (il contourne donc les
  murs que le maître a contournés) et s'arrête 2 cases derrière lui, mesurées le long de ce chemin ; il marche plus vite
  quand il est loin (96 à 640 px/s) ; au-delà de 10 cases (téléportation, véhicule rapide) il saute à côté du maître ;
  les positions du maître dans l'eau ne sont pas suivies : l'animal attend au bord. Animation de marche des promeneurs,
  pas de siège. Le suivi à 2 cases est plus long que le rayon de l'invite (1,5) : l'invite « relâcher » n'occupe pas
  ESPACE à l'arrêt ; il faut revenir vers son compagnon pour la voir (testé : un maître qui rebrousse chemin passe à
  moins de 1,5 case de la place de tête comme d'une place arrière). **Relâcher sans rebrousser chemin** : la roue de son
  propre avatar (clic sur soi) montre « Relâcher mes animaux (n) » dès qu'on en a un (icône patte) ; elle les relâche
  tous. Choisi plutôt qu'une invite plus large : une invite qui couvrirait le groupe à l'arrêt prendrait ESPACE en
  permanence (siège à touche, objets) ; la roue est déjà là pour la torche et le Nerf.
- **Garde-fou** : même appelée par une invite périmée, l'action « apprivoiser » ne prend que l'animal encore à portée
  (1,5 case), présent et revendiqué par personne.
- **Groupe** (`COMPANION_SLOTS`) : les compagnons ne vont pas en file indienne mais forment une petite grappe autour du
  point situé 2 cases derrière le maître sur sa piste ; chacun a sa place, dans l'ordre où ils ont été apprivoisés : le
  premier sur la piste, les deux suivants de part et d'autre (une case à gauche et à droite, 12 px plus en arrière),
  les deux derniers plus en arrière (40 px, une demi-case de chaque côté). Chaque place est à une case au moins des
  autres : les animaux (32 px) ne se superposent pas. Le groupe tourne avec la piste (direction lue 16 px devant) et
  chaque animal rejoint sa nouvelle place en environ 250 ms. Les places de côté ne regardent pas les collisions : dans un
  passage d'une case, un animal de côté peut mordre sur un mur.
- **Partage** : un **événement de salle** `infogene.jungle.companion`, la liste des compagnons du maître
  (`{ companions: [{ animal, since }] }`, 5 au plus, validée par zod, `since` = heure du serveur ; liste vide = aucun),
  et non une variable de joueur : le serveur n'envoie les variables d'un joueur qu'aux joueurs dont
  le champ de vision le contient (`PositionNotifier` du back, zones), alors qu'un animal apprivoisé quitte son nid, où les
  autres le cherchent. L'événement atteint toute la salle (`GameRoom.dispatchEvent`, expéditeur fixé par le serveur ;
  son propre écho est ignoré). Le maître l'annonce toutes les 5 s, par un minuteur de la page (la boucle Phaser dort
  onglet caché) ; quitter la carte (fermeture de la scène) ou la page (`pagehide` : rechargement, onglet fermé) envoie
  « relâché », et à la première vue d'un animal apprivoisable le joueur annonce « aucun compagnon » : rien n'est gardé
  avec le compte. Sur une carte sans animal apprivoisable, rien n'est diffusé (ni à l'arrivée ni au départ). À la
  réception d'une liste vide (un joueur qui arrive, ou qui relâche tout), chaque maître réannonce aussitôt ses
  compagnons (au plus une fois par seconde) : le nouveau venu ne les voit pas errer pendant 5 s ; sauf si ses
  annonces se sont interrompues plus de 75 s (veille du poste) : il relâche alors tout, comme les autres l'ont fait. Une annonce non
  renouvelée pendant 75 s expire (plantage, réseau perdu) ; plus d'une minute parce que les minuteurs d'un onglet caché
  longtemps ne tournent plus qu'une fois par minute. Le maître dont les annonces se sont interrompues plus longtemps
  que cela relâche ses compagnons de lui-même (les autres l'ont déjà fait). Aucun changement de protocole ni du back.
  **Compatibilité** : le format de la première version (`{ animal, since }`, un compagnon) est encore lu ; un client de
  la première version ignore le nouveau format (champ `companions` inconnu, sans erreur) et voit donc les compagnons
  d'un nouveau client errer autour de leur nid.
- **Premier arrivé** (`jungleCompanionOwners`) : par animal ; **le tenant reste** : un animal vu avec le même maître
  depuis 3 s (`COMPANION_HOLD_MS`) lui reste tant qu'il le revendique, même si une revendication au `since` plus ancien
  arrive ensuite (`since` vient du client : un client modifié pourrait sinon voler un animal déjà apprivoisé). Seuls les
  messages croisés de moins de 3 s se départagent par `since`. Limite : un joueur qui arrive voit les deux
  revendications à la fois et applique `since` ; il se range à l'avis des autres seulement au changement suivant. un animal revendiqué par quelqu'un n'est pas proposé ; si
  deux messages se croisent, le plus petit `since` de cet animal gagne, puis le plus petit id utilisateur ; le perdant
  relâche cet animal seul, sans rien afficher, et garde ses autres compagnons. Au-delà de 5 par joueur (jamais envoyé
  par un client), seuls ses 5 premiers comptent.
- **Ce que voient les autres** : l'animal suit son maître et n'erre plus ; si le maître est hors de vue, l'animal est
  masqué (ni ici ni autour de son nid) et réapparaît à ses pieds quand il revient en vue. **Un animal mené ne crie
  plus** (dedans comme dehors : le plus simple, `JungleHearing.led`). **Portes** : un animal mené ouvre les portes sur
  son chemin, comme son maître (`forEachDoorOpener`), donc il ne passe pas à travers une porte fermée ; exception non
  traitée : la porte d'une zone verrouillée reste fermée aux animaux, et un compagnon qui suit un maître admis par un
  « toc toc » est dessiné à travers.
- **Cas particuliers** : pas de compagnon dans l'éditeur (ouvrir l'éditeur les relâche tous, rien n'est proposé) ; un
  animal qui sort du tirage (jungle désactivée dans les réglages, nouveau jour) est relâché, les autres restent ; un autre animal sur le même arbre le
  lendemain repart du suivi. Véhicule : suivi normal (rattrapage, saut au-delà de 10 cases). Mouvement réduit : rien de
  changé (le suivi est un déplacement comme celui des avatars, sans flash). Une valeur reçue qui ne désigne pas un
  animal du tirage local est ignorée. Si un siège à touche ou la nage proposent aussi ESPACE au même endroit, les deux
  actions partent, comme entre les invites existantes ; Nerf équipé, ESPACE tire et l'invite ne se prend qu'au clic
  (règle commune des invites, `GameSceneUserInputHandler.addSpaceEventListener`).
- **Correctif d'invite** (`PopUpTriggerActionMessage.svelte`, sert aussi à la nage, aux sièges à touche et aux scripts) :
  une invite remplacée dans la même image sous le même identifiant garde son composant (`popupStore`) ; ESPACE gardait
  l'ancienne action (on relâchait le lion, on apprivoisait le tigre… et le lion suivait) et l'écouteur n'était pas retiré
  à la fermeture. L'écouteur appelle désormais l'action courante et c'est lui qui est retiré.
- **Code** : `Jungle/{JungleCompanionProtocol,JungleCompanionFollow,JungleCompanions}.ts` (testés sans Phaser),
  `GameJungle.ts` (câblage), `WanderingCharactersManager.{tameableCharacters,characterPose,setCharacterLead,isLed}`
  (une pose fournie remplace le programme, animaux de la jungle comme animaux posés), entrée de roue dans
  `GameSceneUserInputHandler`, i18n `trigger.jungleTame`/`trigger.jungleRelease`/`woka.menu.releaseAnimals`.
- **Non vérifié** : tout le rendu en jeu ; deux joueurs réels (annonce, expiration, course) ; l'heure serveur absente
  (`since` pris sur l'horloge du poste) ; le suivi derrière un joueur distant (positions interpolées) ; le passage d'une
  porte (ouverte par l'animal) ; un animal posé apprivoisé (canard) ; l'entrée de roue ; le groupe dans un couloir
  étroit et dans les virages ; le coût de l'annonce dans une salle chargée ; le bridage réel des minuteurs d'un onglet caché longtemps ;
  l'envoi effectif de « relâché » au `pagehide` (la connexion peut se fermer avant).

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
- **Laissez-passer** : _Entrer_ lève la collision pour ce seul visiteur (`AreasManager.setLockPass`), pour **une seule
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

Par défaut, la carte suit l'heure du serveur et **le vrai soleil de Paris** (48,8566° N, 2,3522° E, le même pour tout le
monde, quel que soit le fuseau ou le réglage de l'horloge du poste) : le voile commence au coucher du soleil (élévation
−0,833°) et est complet à la fin du crépuscule civil (−6°) ; le matin, il reste complet jusqu'au début de l'aube civile
(−6°) et disparaît au lever (−0,833°). Entre les deux, l'opacité suit l'élévation du soleil (presque linéaire en temps sur
ces 30 à 40 minutes). Le 12 novembre 2026, par exemple : voile de 17 h 14 à 17 h 48, nuit complète jusqu'à 7 h 20, jour à
7 h 55 ; au solstice d'été, coucher à 21 h 58 et nuit à 22 h 41. La position du soleil est calculée dans le navigateur
(équations solaires de la NOAA, `sunElevationInParis` dans `NightClock.ts`), sans service ni dépendance, une fois par
seconde ; les tests la comparent aux tables publiées de timeanddate.com (équinoxe, solstices, jours des changements
d'heure) à ±2 min. La nuit, un voile bleu nuit
(`0x0b1030`, opacité 0,6) couvre la carte, les avatars et les animaux ; bulles, noms et interface restent au-dessus
(`DEPTH_NIGHT_INDEX = 1_040_000`).

- **Pièces allumées** : une zone du WAM s'éclaire (bords adoucis de 8 px, fondu de 1 s) tant qu'un joueur connu du
  navigateur a les pieds dedans (même règle que l'entrée de zone : `AREA_POSITION_OFFSET_Y`). Une zone de plus du
  quart de la carte n'éclaire jamais (zones techniques).
- **Halo** : chaque joueur porte une lumière, 1,5 case à l'arrêt, 3 cases en marche (transition linéaire) ; il
  s'éteint dans une pièce allumée et revient en sortant. Pas de halo pour les animaux.
- **Choix personnel** dans Paramètres → Thème → Cycle jour/nuit : heure du serveur (défaut), heure de mon ordinateur
  (horloge et fuseau du poste : la date et l'heure affichées par le poste sont lues comme une heure de Paris, puis
  éclairées par le soleil de Paris de ce jour-là ; un poste qui affiche 22 h voit la nuit de Paris à 22 h), ou désactivé. La clé `nightMode` est mémorisée ; l’ancienne préférence `disableNight` est conservée.
- **Pas de nuit** en mode édition ou lorsque le cycle est désactivé.
- **Recette locale** : `?nightAt=21:00` force l'heure de Paris du jour courant (soleil de ce jour), seulement en
  développement (`import.meta.env.DEV`).

L’horloge du mode nuit se synchronise via `/server-time` sans cache au démarrage, toutes les cinq minutes et au retour
dans la fenêtre. Entre deux réponses elle avance avec l’horloge monotone du navigateur ; un changement de l’heure du
poste n’altère pas le cycle. Pendant une coupure elle conserve la dernière référence serveur. Avant la première réponse,
le voile reste masqué. Les requêtes et écouteurs sont supprimés à la fermeture de la scène.

Recette locale : deux clients avec des fuseaux et horloges de poste différents gardent la même heure serveur et le même
cycle. Un client passant à l’heure de son ordinateur suit son propre fuseau sans changer le rendu de l’autre joueur.
Les trois choix prennent effet immédiatement et restent mémorisés après rechargement ; désactiver masque le voile.
Une horloge HH:mm est affichée près des commandes en bas à droite et suit la même référence : heure de Paris pour
le serveur, fuseau du poste pour le choix ordinateur. Elle reste visible lorsque le cycle est désactivé (heure serveur).
La maison est toujours visible ; elle est grisée sans zone personnelle attribuée et téléporte au centre de sa zone lorsqu’elle est disponible.
La recette visuelle en beta reste à confirmer après fusion.

Rendu : `RenderTexture` à la taille de l'écran (fixe, compensée pour le zoom), remplie de la teinte puis percée par
des pinceaux doux réutilisés ; redessinée seulement quand quelque chose change, puis `markDirty()` (le jeu ne dessine
qu'une scène marquée). Le jour, rien n'est calculé. Seule l'heure est synchronisée avec le serveur ; l'éclairage reste calculé localement.
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

### Pause café

Pour se retrouver autour d'un café improvisé, sans pointage ni historique.

- **Départ** : l'action « Café » (roue de l'avatar ou machine à café) affiche une tasse fixe au-dessus du pseudo
  (4 px de marge), seule la vapeur bouge. Elle envoie l'invitation au plus une fois toutes les 15 min.
- **Réception** : petite carte « ☕ X prend une pause café » avec **Rejoindre** (`emitAskPosition`) et **×**. Elle
  disparaît quand X change d'action, sinon au bout de 10 min. Pas de son, pas de notification système, rien en
  « Ne pas déranger », rien d'enregistré. Une carte par expéditeur.
- **Aller vers un collègue** : « Rejoindre », « Y aller » du coucou et « Aller à » du menu s'arrêtent à une case
  (32 px) de la personne, à la place libre la plus proche, au lieu de se poser sur elle.
- **Trajets** : la boîte du corps est calculée depuis le sprite (le corps physique reste figé tant que rien ne bouge,
  après une apparition ou une téléportation). Le meuble que l'avatar chevauche au départ est ignoré, pour sortir d'un
  avatar apparu dans un objet.

Réseau : événement de script `infogene.coffee` (`{ state: "start" | "end", at }`, zod), diffusé à la salle ; un
expéditeur pas encore connu est attendu jusqu'à 5 s (`worldSpace.waitForSpaceUser`). Aucun changement de back,
protobuf ni WAM : **compatible avec la prod**.

Fichiers : `play/src/front/Phaser/Game/Coffee/*` (`CoffeeProtocol`, `CoffeeState` purs et testés ; `CoffeeManager`),
`Game/RoomSender.ts` (partagé avec le coucou), `Stores/CoffeeStore.ts`, `Components/Coffee/CoffeeCards.svelte`,
`Entity/AvatarActionEffect.ts`, `Utils/{BodyBox,PathStop,RectangleObstacles}.ts`, `GameMap/{GameMapFrontWrapper,
StaticGroupsPath}.ts`, `Connection/RoomConnection.ts`, `Player/Player.ts`, `GameScene.ts`, i18n `coffee`.

Limites :

- Sur la carte d'équipe, la zone d'arrivée chevauche des meubles de la réserve : un avatar peut y apparaître dans une
  poche dont les passages sont plus étroits qu'une case. Le clavier en sort, pas les trajets calculés.
- Café seulement entre joueurs de la même carte.

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

- **Carte** : sa gomme n'efface que les sols et murs de la couche carte (un geste = une entrée d'annulation). Ce que le geste touche au départ décide : parti d'un mur (ou d'une porte, d'une fenêtre), il efface les segments de la ligne de ce mur (rangée d'un mur horizontal, colonne d'un vertical), de la case de départ à celle d'arrivée, avec leurs portes et fenêtres, sans toucher aux sols ; parti d'un sol, il n'efface que les sols survolés, jamais un mur traversé. Un clic efface ce qui est sous le curseur (porte ou fenêtre d'abord, puis le mur). Un mur vertical se vise à 10 px de part et d'autre de son axe (`ERASER_VERTICAL_HIT_WIDTH`). Pendant le glisser, ce qui partira est en rouge.
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

À l'ouverture de l'éditeur, quel que soit l'outil, la caméra se détache de l'avatar sans saut (`CameraManager.enterMapEditor`).
L'avatar reste sur place : dans l'éditeur, `GameScene.update` envoie les touches de déplacement à `CameraManager.move`
au lieu de l'avatar. Les flèches et ZQSD / WASD font donc défiler la carte, à vitesse constante à l'écran quel que soit le zoom ;
elles sont ignorées dans un champ de saisie et avec Ctrl / Cmd (`UserInputManager.getEventListForGameTick`, pour garder
Ctrl+Z). L'ancien `EditorCameraKeys.ts` et la raison de verrouillage `mapEditor` n'existent plus depuis la fusion
amont Phaser 4 (`ba731f2f0`) : ce paragraphe décrit le code actuel.
Le trackpad à deux doigts déplace la vue ; le pincement, Ctrl+molette et une molette crantée zooment sur le curseur.
Le glisser clic gauche déplace la vue dans l'Explorateur seulement ; avec les autres outils il sert à l'outil, et la vue se
déplace au bouton du milieu ou avec Espace + clic gauche (`MapPanShortcut`). Les raisons de blocage (champ, fenêtre, script,
écran d'erreur) restent respectées.
Pendant l'édition, aucun clic droit, double-clic gauche ou toucher ne lance de déplacement vers le pointeur.
Les déplacements par clic reprennent leur comportement habituel après fermeture de l'éditeur.
Changer d'outil ne recentre pas la vue. À la fermeture, la caméra revient sur l'avatar (~1 s) ; un zoom arrière poussé
au-delà du palier de résistance revient au zoom d'avant l'éditeur.

## Raccourcis des outils, outil Carte et Réglages de carte

- **Raccourcis 1 à 8** (`MapEditor/EditorToolShortcuts.ts`) : lus par la position de la touche (`event.code` `Digit1`…,
  pavé numérique quand Verr. Num tape un chiffre), donc sans Maj sur AZERTY. 1 Explorer, 2 Zones, 3 Objets,
  4 Réglages de carte, 6 fermer l'éditeur, 7 Sélection, 8 Carte ; 5 reste à l'émote du jeu. L'infobulle de chaque outil de la
  barre affiche son numéro. Ctrl / Cmd / Alt + chiffre ne change pas d'outil. Sans droit d'édition, une touche d'outil
  indisponible ne fait rien (avant, 2 fermait l'éditeur) ; 1 ouvre toujours l'Explorer.
- **Fermer avec la touche `** : inchangé, la touche qui tape « `» ferme l'éditeur, de même qu'une touche morte placée sur
la touche`Backquote` (clavier US international). Les autres touches mortes ne ferment plus l'éditeur : le ^ d'un clavier
français le fermait (`event.key` « Dead »). La touche ² d'un AZERTY PC ne le fermait pas et ne le ferme toujours pas.
- **Outil Carte, tracé** : pendant un geste, le pointeur est capturé par le canvas (`MapDragPointerCapture`, comme le glisser
  de l'Explorer). Passer sur le panneau, la barre d'actions ou une bulle vidéo n'annule plus le pinceau, la gomme ou la pièce ;
  Échap, une perte de capture bouton enfoncé ou la perte du focus de la fenêtre annulent toujours le tracé.
- **Outil Carte, portes** : la disponibilité des portes est remise à zéro au début de la vérification des catalogues de la
  salle. Sans catalogue de portes, l'outil repasse en « Mur », n'affiche plus d'aperçu de porte, et un clic en mode Porte
  affiche « Cette salle n’a pas de catalogue de portes… ».
- **Réglages de carte** : Échap les ferme (hors champ de saisie), et la fermeture revient à l'outil utilisé avant
  (`MapEditorModeManager.closeWamSettings`), l'outil Objets s'il n'y en avait pas. Le bouton « Fermer » est traduit.

Recette : sur un Mac AZERTY, touches 1 à 8 sans Maj, ^ (l'éditeur reste ouvert), ` ; survoler les outils de la barre ;
peindre un sol en traversant la barre d'actions et le panneau, puis recommencer et appuyer sur Échap ; dans une salle sans
portes, vérifier le mode Mur ; ouvrir les Réglages depuis l'outil Carte et les fermer par Échap et par le bouton.

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
Limites connues : plafond de 4000 entités par geste, remplissage limité à 2500 cases, pas de contrôle de présence des joueurs, pas de
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

Fenêtres (mode « Fenêtre » de l'outil Carte) :

- Une fenêtre remplace la façade d'**un segment de mur horizontal** (32 px). Clic ou glissé le long du mur : une fenêtre
  par case de la rangée de départ ; aperçu vert sur un mur horizontal libre, rouge sur un mur vertical, une porte, une
  fenêtre déjà posée ou sans mur (message « windowInvalid » si rien n'est posable). Côte à côte, elles forment une baie.
  Pas de fenêtre sur un mur vertical : vu de dessus, il n'a pas de face où la voir.
- Déplacer : en mode « Fenêtre », appuyer sur une fenêtre posée et la glisser ; au relâcher elle passe sur le segment
  visé s'il peut la recevoir (mur horizontal libre, même sur un autre mur), sinon elle reste (« windowInvalid »). Les
  murs ne bougent pas ; relâcher sur son propre segment ne fait rien. Un déplacement = une entrée d'annulation.
- On voit à travers : la vitre de l'image est semi-transparente (bleu ciel `#90d6f1`, bande `#579be1` en haut, alpha 180). Ce que la façade cache (avatar collé au mur
  côté nord, haut d'un meuble, sol de la pièce derrière) apparaît dans la vitre ; aucun code de rendu dédié.
- Stockage : une entité WAM de la collection `Carte Fenêtres` (`fenetre-<teinte>-<bout>`, mêmes bouts, place, collision et
  profondeur que la façade qu'elle remplace). Le mur reste dans le modèle sous la fenêtre (`MapLayerModel.setWindow`) :
  un passage de gomme retire la fenêtre (la façade revient), le suivant le mur ; retirer le mur retire la fenêtre. Une
  porte ne se pose pas sur une fenêtre. Catalogue facultatif : sans lui, bouton grisé (« windowsUnavailable »).
- Ailleurs, une fenêtre est un mur : obstacle, chemin, grille dehors/dedans (`OUTDOOR_WALL_COLLECTIONS`), lumière des
  lampes (`MAP_LAYER_WALL_LIKE_COLLECTIONS`). Les images (dérivées des façades du pack) sont générées par
  `tools/build_window_prefabs.mjs` du dépôt infra et restent dans le dépôt privé.

Murs hauts (réglage « Hauteur » de l'outil Carte) :

- Hauteur choisie de 1 à 4 cases, une par mode : murs (et murs d'une pièce), portes, fenêtres. Une hauteur n'est proposée
  que si le catalogue chargé en a les pièces (`facade-blanc-mid-hN`, `porte-h-blanc-g-hM`, `fenetre-blanc-mid-hM`) ;
  sinon bouton grisé avec une explication, et la pose se fait en hauteur 1. Tracer sur un mur existant le remplace.
- Géométrie : un mur de hauteur N est le mur de hauteur 1 remonté de `32 × (N − 1)` px (`wallRise`), face de
  `20 + 32 × (N − 1)` px. Le pied, les collisions, le « dehors », la lumière (torche, lampes), le chemin et la zone de
  clic des modes de tracé (rangée du pied) ne changent pas. Une carte sans pièce `-h` se lit et se dessine comme avant
  (placements figés dans `MapLayerHeights.test.ts`).
- Noms (contrat avec le catalogue privé ; hauteur 1 = nom sans suffixe, `-h1` refusé) : `facade-<t>-<bouts>-hN`,
  `mur-vertical-<t>-hN`, `bout-<t>-hN`, `raccord-<bras>-hN`, `fenetre-<t>-<bouts>-hM`, `porte-h-<t>-<g|d>-hM` (images
  d'animation `-hM-<n>` / `-hM-b<n>`), `linteau-<t>-<bouts>-hN-oM` (mur plein au-dessus d'une porte ou d'une fenêtre de
  hauteur M < N), `porte-v-<t>-<haut|bas>-hN` (porte verticale : toujours la hauteur de son mur, le plus bas de ses deux
  segments, sans réglage propre).
- Modèle : `WallEdge.height`, hauteur propre des portes horizontales (`DoorRef.height`) et des fenêtres
  (`getWindowHeight`), ramenée à celle du mur (pose, ou mur abaissé). Relecture : chaque pièce haute à sa place
  remontée ; la hauteur du mur au-dessus d'une ouverture vient du linteau ; résultat indépendant de l'ordre des objets.
- Raccords par niveau : sur un sommet, un raccord par hauteur présente, reliant les murs de cette hauteur. Une façade ne
  continue que vers un voisin au moins aussi haut, sinon elle se ferme (le plus bas continue sous elle). Un mur
  horizontal plus haut qu'un niveau cache ce niveau, sauf le bras sud. Un mur vertical seul à un niveau reçoit son
  `bout` à ce niveau. Porte ou fenêtre plus basse que son mur : linteau, raccords au niveau du mur. Porte verticale dans
  un mur vertical haut : remontée avec son chapeau (`wallRise(N)`), pour rester visible de dessus ; aucune bande sur ses
  deux segments (le passage reste libre), raccords de ses sommets extérieurs au niveau du mur, comme en hauteur 1.
- Outil « Pièce » (`applyRoom`, toutes hauteurs) : tout le rectangle tracé est du sol visible. Le mur nord va sur la
  ligne au-dessus du rectangle (il se tient sur la rangée au-dessus, son pied au bord haut du rectangle, et la rangée
  « ombre » tombe sur la première rangée du rectangle), les murs de côté le rejoignent ; au bord haut de la carte, le mur
  nord reste sur la première rangée. Le sol est posé sur le rectangle et sur la rangée où se tient le mur sud (l'avatar
  y marche jusqu'au pied du mur, un mur haut translucide la montre), sans écraser un sol déjà là sur cette rangée, et
  jamais sous le mur nord ; aucun sol n'est retiré. Les pièces déjà tracées ne sont pas modifiées. Conséquence pour
  les zones calées sur le sol (`snapRectToFloors`) : la zone d'une pièce neuve s'étend aussi sur la rangée de son mur
  sud.
- Hauteur des portes : le mode Porte propose « Auto 1 2 3 4 », Auto par défaut : la porte prend la hauteur de son mur
  (le plus bas de ses deux segments), 2 cases au plus (`DOOR_AUTO_MAX_HEIGHT`) ; un choix 1 à 4 est ramené à la hauteur
  du mur. Cliquer en mode Porte sur une porte horizontale déjà posée (même sommet) lui donne la hauteur qui serait posée
  si elle diffère, en une commande ; sinon rien (aperçu vert seulement dans le premier cas, `planDoorAt`). Les fenêtres
  n'ont pas d'Auto, et poser une fenêtre sur une fenêtre ne change pas sa hauteur (code séparé : mode Hauteur).
- Mode « Hauteur » (`MapLayerHeightEdit`, logique pure testée ; l'outil ne fait que dessiner et valider) : un clic sur un
  mur, une porte ou une fenêtre déjà posés le sélectionne (surligné en bleu, contour blanc au survol), sur **toute son
  image**, dessus remonté compris ; quand plusieurs images sont sous le pointeur, celle dont le pied est le plus au sud
  (dessinée devant), et le linteau devant la porte ou la fenêtre dont il couvre le chapeau. Glisser depuis un élément
  sélectionne les segments de sa ligne jusqu'à celui sous le pointeur, avec la porte ou la fenêtre qu'ils portent ; un
  clic dans le vide (ou Échap, ou un autre mode) vide la sélection. La rangée 1 à 4 montre la hauteur commune (aucune
  si elle est mixte) et applique celle cliquée en une commande (un Ctrl+Z), la sélection restant : les murs d'abord,
  teinte conservée (baisser un mur baisse sa porte ou sa fenêtre), puis portes et fenêtres, ramenées à leur mur
  (`setDoorHeight`, `setWindowHeight`). Une porte verticale se sélectionne comme ses deux segments de mur. Les
  hauteurs que le catalogue n'a pas pour tout ce qui est sélectionné sont grisées.
- Transparence (`WallFade`, pour soi seulement, rien n'est envoyé) : éditeur ouvert, murs, portes et fenêtres à 45 % ;
  en jeu, quand les pieds de son avatar sont dans une pièce (`OutdoorGrid.roomAt`, cases d'intérieur reliées), les
  pièces de hauteur ≥ 2 **devant** elle (les murs horizontaux dont le pied est juste au sud de la pièce, `roomsBehind`),
  avec leurs portes, fenêtres et linteaux et les raccords à bras est ou ouest de leur chapeau, à 55 %. Le mur du fond
  et les murs de côté (bandes, bouts, raccords sans bras est ni ouest, portes verticales) restent opaques : ils ne
  cachent rien de la pièce, et ce qui est derrière eux ne doit pas se voir à travers. En plus, dedans comme dehors,
  quand son avatar passe derrière une pièce d'un mur horizontal de hauteur ≥ 2 (`wallHidesPlayer` : au nord de son
  pied, sous le haut de son image, dans sa largeur à une demi-largeur d'avatar près) **et** se trouve dans le même
  espace que le sol juste au nord de ce pied (même pièce, ou dehors tous les deux), c'est **tout le mur droit** qui
  s'estompe : la suite continue de segments horizontaux de la même ligne, du côté de cet espace seulement (une partie
  du mur qui borde une autre pièce au nord reste opaque ; une portion de hauteur 1 ne s'estompe pas mais ne coupe pas
  la suite). Un mur vertical haut ne s'estompe que si son chapeau passe sur le corps de l'avatar, à 16 px de sa ligne.
  Sur la rangée d'un mur horizontal haut, en venant du dehors (case « mur » de la grille, sans pièce gardée), l'espace
  de l'avatar est celui du sol juste au nord de la pièce de mur derrière laquelle il se tient : le mur reste estompé
  jusqu'à son pied. Sans grille du dehors, seule la géométrie compte. Un raccord droit (`raccord-EW`, toute hauteur) est posé sur les
  chapeaux de ses deux façades, dessinés à l'identique : translucide par-dessus, il ferait un carré plus clair (deux
  images à 45 ou 55 % superposées) ; il est donc invisible tant que son mur est estompé et revient à 1 au moment où les
  façades y reviennent. Même règle pour le raccord de bout (bras E ou W seul) d'un mur de hauteur ≥ 2 : ses façades,
  fenêtres et linteaux à bout ferment eux-mêmes leur chapeau avec les pixels de ce raccord (catalogue, infra 4a8fa35) ;
  en hauteur 1 le raccord de bout reste dessiné (`isDrawnByCapsUnder`).
  Fondu de 200 ms. Sur la rangée d'un mur (case « mur » de la grille), la dernière pièce connue est gardée ; elle
  s'oublie dehors.
- Limites connues : changer d'outil dans l'éditeur remet un instant les murs à l'opaque (`EntitiesManager` réinitialise
  l'opacité des pièces de la carte), le fondu la rétablit ; cliquer sur la partie remontée d'un mur haut ne le vise pas
  dans les modes gomme, porte et fenêtre (rangée du pied ; le mode Hauteur, lui, vise toute l'image) ; superpositions
  translucides restantes (dessins différents, non corrigées) : raccords d'angle, de T et de croix sur le chapeau des
  façades, raccords de bout d'un mur de hauteur 1 sur le débord de 6 px de sa façade, linteau sur le chapeau de sa porte ou de sa fenêtre (12 px), bout d'un mur vertical
  haut sur la façade d'un mur plus bas, porte verticale sous un T sur la face du mur du dessus ; un mur vertical bas rejoint par un mur vertical plus haut n'a pas de règle
  dédiée ; ombre au sol inchangée. **Rendu non vu à l'écran ; catalogue des pièces hautes dans le dépôt privé.**

Portes vitrées (interrupteur « Vitrée » du mode Porte) :

- Variante des portes **horizontales** : les deux panneaux de chaque vantail laissent place à une vitre claire (bleu et
  bande des fenêtres, mais 45 % d'opacité, avec un reflet en diagonale), poignée et cadre gardés ; on voit nettement à
  travers, même porte entrouverte. Une porte
  verticale reste pleine (vue de dessus, c'est un trait).
- Interrupteur éteint par défaut, gardé le temps de la page : il choisit la variante des **nouvelles** portes
  horizontales. Un clic sur une porte horizontale déjà posée lui donne les réglages du panneau (vitrée ou pleine selon
  l'interrupteur, hauteur Auto ou choisie) ; si elle les a déjà, il l'inverse (pleine ↔ vitrée), comme avant les murs
  hauts (aperçu vert sur la porte, une entrée d'annulation). Grisé quand le catalogue de la salle n'a pas les portes vitrées :
  les nouvelles portes sont alors pleines et un clic ne rend pas vitrée une porte pleine.
- Stockage : `DoorRef.glazed` (absent pour une porte pleine), porté par le nom des pièces
  `porte-h-<teinte>-<g|d>-vitree` puis le suffixe d'image (`-3`, `-b3`) ; une porte verticale vitrée n'existe pas.
  Ouverture, collision, verrou et toc toc identiques à une porte pleine. Images générées par
  `tools/build_door_prefabs.mjs` du dépôt infra.
- Avec les murs hauts : vitrée et hauteur sont indépendantes, `porte-h-<teinte>-<g|d>-vitree-h<M>` (vitree, puis la
  hauteur, puis l'image). Une porte vitrée de hauteur M n'est proposée que si le catalogue a
  `porte-h-<teinte>-g-vitree-h<M>`, sinon elle retombe à la hauteur 1. Changer la hauteur d'une porte vitrée (mode
  Hauteur, mur abaissé) la laisse vitrée ; dehors, fondu et profondeur : comme la porte pleine de même hauteur.

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

## Relief et lacs

Lot 1 de « relief et eau vivante » (conception et plan dans le dépôt d'infra,
`docs/superpowers/{specs,plans}/2026-11-18-relief-eau*`). Rivières et inondations : lots suivants.

**Dans l'éditeur.** Nouvel outil **Relief** (pelle, chiffre 9, éditeurs de la carte entière seulement). Le pinceau est
une sphère : « Creuser » enlève au sol une calotte (toute la force au centre, rien au bord), « Remblayer » la remet.
Un clic ou un glissé est un geste, envoyé au relâchement en une commande (annulée d'un Ctrl+Z) ; Échap l'abandonne.
Dans un même geste une cellule n'est creusée qu'une fois, repasser creuse davantage, jusqu'à la profondeur maximale
de la carte. Curseurs : diamètre (1 à 12 cases), force (automatique : un huitième du diamètre). Le relief ne se creuse
que dehors (grille extérieure de la météo), jamais sous un mur. Réglages enregistrés dans la carte, dans le même
panneau : profondeur maximale (1 à 8 cases, 2 par défaut), ruissellement (10 par défaut : le terrain autour apporte
dix fois la surface du creux), évaporation par temps sec (0,2 mm/h par défaut), absorption du sol plat (5 mm/h),
**vitesse de l'eau** (60 par défaut : une minute pour une heure ; à 1, comme en vrai, une pluie remplit un lac en
des heures). **Source** et **puits** sont des
propriétés d'objet (`waterSourcePropertyData`, `waterSinkPropertyData`, débit enregistré en litres par minute, réglé en m³/h, L/s, L/min ou m³/s, de 0 à 1 000 m³/s), à ajouter à
n'importe quel objet depuis son panneau : une source verse à son pied, un puits retire l'eau qui arrive au sien. Le
pied (milieu du bas de l'image) est écrit dans la propriété par l'éditeur (`anchorX`, `anchorY`,
`Terrain/WaterAnchor.ts`), car `back` ne connaît pas la taille des objets.

**Modèle** (`libs/map-editor/src/Terrain/`, lu à l'identique par `back` et par le front). Le relief est un champ
facultatif du WAM (`terrain` : hauteurs par cellule de 16 px, 0 au sol, négatif creusé, par blocs de 16 × 16 ; absent =
carte plate, aucune migration). Échelle des lampes : une case = 1,2 m² de sol (`TILE_AREA_M2`), donc 1 mm de pluie =
1,2 litre par case.

**L'eau est simulée par cellules** (`WaterGrid`) : chaque cellule a une hauteur d'eau, et à chaque pas l'eau passe
vers les voisines dont la surface (sol + eau) est plus basse. Une source fait donc une flaque à son pied, qui coule
dans la pente ; un creux plein déborde par son point le plus bas ; sur sol plat une inondation monte et avance tant
que l'eau arrive. La surface de l'eau est plafonnée à 18 px au-dessus du sol : juste au-dessus de la profondeur où l'on nage (16 px, environ 0,5 m), loin sous le premier palier (52 px) : on
garde les pieds au sec à l'étage. La grille couvre l'emprise du relief et des sources, plus 48 cellules de marge
(600 × 600 au plus) ; l'eau qui en sort est perdue. Un premier modèle « une cuvette, un niveau » a été essayé puis
retiré : l'eau y apparaissait au point le plus bas de toute la région creusée, loin de la source.

**Sources et puits.** N'importe quel objet devient une source ou un puits depuis ses propriétés. Le débit se règle
par un nombre, deux boutons − et + (pas de la taille de la valeur : 1, 2… 10, 20… 100, 200…) et une unité au choix
(m³/h, L/s, L/min, m³/s ; le choix est gardé dans le navigateur, le débit est enregistré en litres par minute). L'eau
d'une source descend la plus grande pente jusqu'au premier creux, en mouillant le lit ; un puits retire l'eau d'un disque autour de son pied (l'eau plus loin doit couler jusqu'à lui). Ce rayon se règle
par objet, en cases (`radius`, de 0 à 10) : une case et demie par défaut pour un puits ; pour une source, 0 (au pied)
ou un disque sur lequel l'eau est versée. Une entrée de catalogue peut porter
`waterFlow: { kind: "source" | "sink", flow (m³/h), anchor }` : l'objet posé est alors une source ou un puits
aussitôt (catalogue `Infogène Eau` du dépôt d'infra : fontaine de 2 × 2 cases, gouffre rond de 3 cases). Sous chaque
réglage de l'eau, une ligne rappelle ses valeurs réelles (ordres de grandeur).

**Murs et portes.** Les murs de l'outil Carte arrêtent l'eau : `back` les lit dans les objets de la carte
(`waterWallsOf`, d'après le nom et la place des pièces `Carte Murs` et `Carte Fenêtres` du sol, sans le code de
l'éditeur ; un test du front vérifie que les deux lisent les mêmes murs). Un mur horizontal ou une fenêtre retient
l'eau à son pied, un mur vertical entre les deux colonnes de sa ligne. Une porte laisse passer l'eau, ouverte ou
fermée : une inondation entre dans un bâtiment par ses portes. Un puits ne prend pas l'eau de l'autre côté d'un mur,
une source ne verse pas à travers. Un mur construit ou retiré refait la grille en gardant l'eau là où elle est. Les
murs d'un palier ne comptent pas (l'eau reste au sol).

**Courant.** L'eau emporte l'avatar : le navigateur lit la pente de la surface de l'eau (sol + eau) autour de lui
(`Terrain/WaterCurrent.ts`, sur deux cellules de chaque côté) et l'ajoute à son déplacement. Rien dans une eau au
repos (pente sous 0,1 px par cellule) ni sous un quart de case d'eau ; à moitié entre un quart et une demi-case,
pleinement quand on nage. À une pente de 2 px par cellule la poussée est à son maximum : le quart de la vitesse de la marche,
multiplié par la « force du courant » de la carte (`settings.water.current`, de 0 à 2, 1 par défaut ; 0 coupe le
courant). Un sol sec, ou sous un film d'eau trop mince pour emporter, n'est pas une pente : une berge ne repousse pas, et le bord d'une inondation n'attire pas ; seul un creux nettement plus bas que le sol sous l'eau attire (l'eau y tombe). Pas
de poussée assis, en suivi, sur un palier, ni pendant un trajet au double-clic. Les autres joueurs voient la dérive
par la position, comme tout déplacement.

**Canoë.** Troisième véhicule au choix (Mon avatar → Véhicule), avec ses trois couleurs (coque, bord, pagaie). Ce
n'est pas un véhicule du sol : il se met à l'eau tout seul. Là où l'on nagerait dans l'eau du relief (16 px et
plus), l'avatar est dans son canoë au lieu de nager, pour tout le monde (`Player.updateCanoe` passe le véhicule en
mode « toujours » sur l'eau et « coupé » ailleurs ; `isCanoeAfloat`). Vitesse de la marche (la nage est à 0,6), deux
fois plus en pagayant fort (touche de course) ; le courant l'emporte moitié moins qu'un nageur. Pas de canoë à
terre, dans une piscine (on y nage), sur un palier, en suivi, ni pour un costume qui n'est pas humain ; la roue
d'actions ne propose rien pour lui. Dessiné en code (`Vehicle/CanoeArtwork.ts`), comme les autres véhicules.

**`back` calcule** (`TerrainWaterManager`) : dix pas par seconde, avec la pluie sur les cellules creusées (et le
ruissellement), l'évaporation des cellules mouillées par temps sec seulement, l'eau bue par le sol plat, les sources
et les puits (`WaterInputs.ts`). Une fois par seconde il annonce à la salle ce qui a changé (deux octets par cellule,
en huitièmes de pixel, XOR avec l'état précédent, gzip ; état complet à l'arrivée d'un joueur, après une édition du
relief et toutes les 30 annonces) et les chiffres du bilan. Une eau au repos sans rien qui arrive n'est ni calculée
ni annoncée ; une carte sans relief ni source ne coûte rien. L'eau est sauvée dans Redis (`terrain-water:<salle>`)
toutes les 30 s et reprise au redémarrage, sans rattrapage du temps d'arrêt. Quand le relief change, l'eau reste où
elle était. `back` connaît la pluie par `rainRateAt` : pluie fixe 2 mm/h, orage 10 mm/h, programme automatique, débit
réel d'Open-Meteo pour une carte en Réel (`RainTimelineService`). Le programme automatique, les saisons et la lecture
d'Open-Meteo vivent pour cela dans `libs/map-editor/src/Weather/` (les anciens chemins du front les réexportent).

**Tableau de bord** (panneau Relief, « Bilan de l'eau ») : ce qui entre (pluie, sources) et ce qui sort (puits,
évaporation, bu par le sol, perdu au bord) en m³/h du temps de la carte, avec l'unité propre du réglage à côté (mm/h),
une barre par ligne à la même échelle, la tendance (entrées moins sorties), le stock en m³ et la surface sous l'eau.
Mis à jour chaque seconde par `back` tant que l'eau bouge.

**En jeu.** `Terrain/TerrainView.ts` dessine le relief (fond assombri avec la profondeur, pentes éclairées du
nord-ouest) et l'eau (bleu clair, plus sombre avec la profondeur, liseré sur la rive) dans un canevas lissé d'un
pixel par cellule, sous les objets et les avatars, redessiné seulement quand le relief, l'eau ou la vue changent
(dix fois par seconde pendant que l'eau glisse d'un état au suivant). On **nage** au-delà d'une demi-case d'eau
(16 px), comme dans une piscine, sans invite ; en dessous on marche. Un avatar sur un palier ne nage pas. Les flaques
de la pluie ne se posent pas sur le relief ; les éclaboussures deviennent des ronds sur l'eau.

**Limites.** L'eau traverse encore les murs (elle devra passer par les portes seulement : `back` ne connaît pas les
murs). Pas de mode Rivière tracée. Relief négatif seulement, au sol et dehors. Animaux et compagnons ignorent l'eau.
Pas de courant qui pousse l'avatar. Un geste immense part en plusieurs commandes (autant d'annulations). Les valeurs
par défaut du rythme sont à doser avec le tableau de bord. `play`, `back` et `map-storage` se déploient ensemble.

## Météo de la carte

Dans « Outils → Météo », un éditeur de la carte choisit
Ciel clair, Pluie, Neige ou Orage et sauvegarde. Le réglage `settings.weather` du WAM est validé
et transmis à tous les joueurs par le protocole natif d’édition ; une carte sans ce réglage reste au ciel clair.
Les droits limités à une zone personnelle ne permettent pas de modifier la météo commune.

Les particules suivent les coordonnées de la carte, avec un rendu limité à 30 images/s et au champ visible.
L’orage produit une lueur douce synchronisée sur l’heure serveur, indépendante du choix personnel jour/nuit.
« Paramètres → Thème → Afficher la météo » masque les effets pour soi et conserve ce choix après rechargement.
Les effets sont masqués pendant l’édition. La pluie joue en boucle et le tonnerre suit la lueur commune ;
la neige reste silencieuse. Les sons respectent le blocage audio personnel et attendent le déverrouillage audio du navigateur.
« Paramètres → Bruitages » règle séparément les pas et l’environnement (météo, portes et audio de la carte),
de 0 à 100 %, avec sauvegarde personnelle. Les appels et les Jams conservent leurs réglages existants.
« Outils → Cycle jour/nuit » ouvre directement le choix personnel serveur / ordinateur / désactivé.
Cette première version couvre toute la carte, sans accumulation de neige ni distinction entre intérieur et extérieur.

**Pluie selon son intensité.** La pluie et l’orage (météo fixe, automatique ou réelle) sont dessinés par
`Weather/Rain.ts` : gouttes en trois plans (tête claire et traîne), d’autant plus nombreuses que la pluie est forte,
autant à l’écran quel que soit le zoom ; elles penchent avec le vent de la carte (`rainLean`, vers l’est sans vent
connu) ; il pleut davantage sous l’épaisseur d’un nuage de pluie que dans une trouée ; éclaboussures au sol (aucune
en mouvement réduit) ; voile et volume de la pluie selon l’intensité. En météo **Réelle**, l’intensité vient des
précipitations d’Open-Meteo (`precipitation` de `minutely_15`, champ facultatif `RealWeatherSlot.rainRate` en mm/h,
changée en 10 min) : pluie faible jusqu’à 2,5 mm/h, modérée jusqu’à 7,6, forte au-delà (glossaire de l’AMS ; la
courbe entre ces seuils est un choix, `rainIntensity`). Pluie fixe ou automatique : niveau moyen ; un orage tombe
toujours fort. **Flaques** (`Weather/Puddles.ts`) : dehors, sous les objets et les avatars, toujours aux mêmes
endroits de la carte ; elles se remplissent pendant les dix premières minutes d’une pluie et sèchent en vingt
minutes, d’après les dates du serveur (les mêmes pour tous) ; pluie et orage qui se suivent comptent pour un seul
épisode. Réglages personnels (Paramètres → Ambiance, bloc « Pluie », gardés dans le navigateur) : quantité de
gouttes, inclinaison avec le vent, éclaboussures, flaques, effet des nuages. En développement seulement,
`?rainLevel=0.8` force l’intensité et `?rainLevel=cycle` la fait varier de la bruine à l’averse en 40 s.
Limites : les éclaboussures passent par-dessus les avatars et les arbres ; les flaques se posent sur tout sol
extérieur ; après une éclaircie, elles repartent de zéro. `play` (front et pusher) seul.

Recette : ouvrir la même carte WAM dans deux sessions, changer chaque météo depuis Outils,
marcher et zoomer ; désactiver les effets dans une seule session et recharger pour vérifier la préférence.
Vérifier la pluie, le tonnerre après la lueur et la neige silencieuse ; régler chaque volume, couper
l’environnement pendant la pluie puis recharger. Vérifier aussi l’arrêt des sons en ciel clair et pendant l’édition.

### Arbres au vent

Les arbres `Nature:tree-*` se balancent avec le vent de la météo de la carte (`Nature/TreeSway.ts`, `TreePoses.ts`) :

- Le tronc reste fixe (30 % du bas de l'image) et le feuillage se plie, de plus en plus vers la cime : chaque ligne de
  pixels est décalée d'un nombre entier de pixels, sans rotation, donc sans flou. La cime bouge de 4 px au plus.
- L'arbre penche du côté où va le vent (2,5 px par vent de 80 km/h ou plus) et oscille autour (0,8 px par calme,
  2,5 px en tempête). Sans météo réelle : brise de 10 km/h du nord-ouest, comme les nuages.
- Les images pliées sont fabriquées par le navigateur à la première utilisation (`TreePoseTextures`, une par image et
  par pose) : aucun fichier de catalogue. Une image illisible laisse l'arbre immobile.
- L'image pliée n'est posée sur l'arbre que le temps du dessin (`PRE_RENDER` / `RENDER`) : collisions, éditeur et
  lectures de l'objet ne voient rien. La carte n'est redessinée que quand un arbre change de pose.
- Même pose pour tous (heure du serveur, identifiant de l'arbre). Rien en mode édition, ni avec la météo masquée ou le
  mouvement réduit.

### Arbres : feuilles d'automne et neige

Les arbres qui se balancent (`Nature:tree-*`, `Nature/TreeSway.ts`) réagissent à la saison qu'ils affichent
(`Nature/TreeSeasonEffects.ts`, calculs purs dans `TreeLeafFall.ts` et `TreeSnowLoad.ts`) :

- **Automne** : des feuilles partent du feuillage et tombent au pied de l'arbre, poussées dans le sens du vent
  (6 à la fois au plus par arbre, 15 % de ces chutes par temps calme, toutes à partir de 80 km/h). Un tapis reste au
  sol autour du pied, sous les personnages : de rien le 1er septembre à 40 feuilles par arbre le 30 novembre (la moitié
  hors saison, avec le thème personnel Automne).
- **Neige** (météo de la carte, fonte, ou thème Noël) : la neige se pose au sommet de l'arbre et descend le long du
  feuillage (charge = couverture de neige de la carte × cycle propre à l'arbre, de 15 % à 100 % en 150 à 270 s), puis
  se décroche au seuil : deux paquets tombent, un de chaque côté. L'image sans neige est dessinée par-dessus l'image
  d'hiver, coupée par le haut ; seuls les arbres qui ont une image d'hiver sont concernés.
- Tout vient de l'heure du serveur et de l'identifiant de l'arbre : même rendu pour tous, sans réseau. Rien en mode
  édition, ni avec la météo masquée ou le mouvement réduit ; dehors et à l'écran seulement ; 15 dessins par seconde.

### Suite météo et raccourcis (PR 136)

- Outils → Météo → Automatique : ciel clair, pluie, orage, neige, changement toutes les 30 minutes sur l’heure serveur. Les choix fixes restent disponibles. Le cycle conserve sa phase après reconnexion.
- L’horloge reste fixe en haut à droite, à droite de la position initiale du bouton Jam. Après déplacement, le bouton Réinitialiser la position replace le panneau sous le profil.
- Maison : téléportation au bureau possédé sur la carte. Sans bureau, liste des zones personnelles libres et réclamables : Aller fait marcher jusqu’à la zone, puis la confirmation existante permet de la réclamer. Connexion, attribution dynamique et tags restent requis. Aucun bureau n’est attribué automatiquement.
- Double-clic sur la carte : animation de sprint et fumée pendant le trajet, fin des effets à l’arrêt ; aucun effet de course pendant la nage.
- Ambiance à 5 % par défaut, volume des pas séparé ; préférences déjà enregistrées conservées. rain.mp3, thunder.mp3, snow.mp3 et sunny.mp3 fournis par le propriétaire remplacent les sons synthétiques. L’origine/licence de ces fichiers n’a pas été fournie ; ne pas les présenter comme CC0.

### Météo dehors et thème saisonnier

**Extérieur détecté seul.** Est dehors tout ce qu'on atteint depuis le bord de la carte sans traverser un objet des
collections « Carte Murs », « Carte Portes » ou « Infogène Murs fins » (cases de 8 px, `Outdoor/OutdoorGrid.ts` : les murs de la carte d'équipe commencent en milieu de case de 32 px, une grille de 32 px laissait une bande d'herbe nue le long des façades ; la neige du sol couvre aussi les cases de mur qui touchent le dehors, cachées sous l'image du mur).
Une pièce fermée, avec ou sans porte, est dedans ; terrasse et chemins sont dehors. La grille est recalculée 300 ms
après le dernier changement de mur ou de porte (`Outdoor/OutdoorTracker.ts`). Aucun changement du format WAM.

**Météo seulement dehors.** Pluie, neige, voile et lueur d'orage ne sont plus dessinés au-dessus des pièces
(`WeatherManager`, option `outdoorGrid`). Les sons ne changent pas. Une carte sans mur reste entièrement dehors.

**Thème saisonnier** (« Paramètres → Ambiance → Thème saisonnier ») : Auto, Automne, Noël, Aucun. Réglage perso
(`seasonalTheme` dans le navigateur), appliqué sans recharger. Il remplace « Thème de Noël » (repris une fois :
Toujours → Noël, Jamais → Aucun) et « Sol extérieur » (effacé). Auto suit le calendrier de Paris, revérifié chaque
minute : automne du 1er septembre au 30 novembre, Noël du 1er décembre au 6 janvier ; tant que l'heure du serveur
n'est pas reçue, Auto n'affiche rien (`Seasonal/SeasonalTheme.ts`). `SeasonalThemeManager` crée le décor du thème
(`SeasonalDecor`), le masque pendant l'édition et le reconstruit quand un mur ou un objet change.

- **Noël** (`Christmas/ChristmasDecor.ts`) : la météo affichée pour soi devient Neige (flocons et son de la météo
  existante), le sol extérieur se couvre de neige bleutée, les objets dehors portent une neige épaisse sur leur bord du
  haut, les sols posés dehors sont givrés, et chaque joueur laisse des empreintes (une tous les 16 px en marche, une
  trace en course, fondu en 45 s, 400 au plus). Les arbres saisonniers prennent leur image d'hiver, sans neige ajoutée.
- **Automne** (`Autumn/`) : la météo de la carte est gardée ; l'herbe prend la texture d'automne d'Amine, les arbres
  leur image d'automne ; feuilles éparses (une par carré de 48 px, placement fixe), feuilles qui tombent (couche de la
  boucle météo, même par temps clair), tas de feuilles au pied des objets dehors (arbres compris), feuilles soulevées
  par les pas (3-4 feuilles de 5×3 px tous les 24 px en marche, 5-6 tous les 16 px en course, 120 au plus). Palette `#c8642a`, `#d9a23b`,
  `#9b3d23`, `#7a5a2e` ; aucune image ajoutée.

Empreintes et feuilles soulevées sont calculées par chaque navigateur depuis les positions déjà reçues : rien sur le
réseau. « Afficher la météo » coupé retire aussi ce qui tombe (flocons de Noël, feuilles) ; le reste suit le thème.
Sans thème, la neige de la carte tient sur l'herbe pour tout le monde (elle était réservée à « Suivre la saison et la
météo »).

Limites : un mur manquant laisse entrer le décor ; une image d'objet illisible (CORS) reste sans neige ni tas ; un objet
déplacé par une autre personne garde son décor à l'ancien endroit jusqu'au prochain changement de mur ou à la sortie de
l'éditeur.

Recette : thème « Automne » puis « Noël », marcher puis courir dehors et dans une pièce, poser un objet dehors, ouvrir
l'éditeur et retirer un mur d'une pièce puis le remettre ; « Aucun » et une carte en orage : pluie et voile seulement
dehors.

### Contrôles d'ambiance du client desktop

Le pont optionnel `WAD.onEnvironmentRequest` / `reportEnvironment` permet au client desktop de régler directement
la météo commune du WAM (avec les mêmes droits d'édition et la même commande de sauvegarde), ainsi que les
préférences personnelles jour/nuit, thème saisonnier (`seasonal`) et effets météo. Les emplacements des réglages dans
WA restent identiques. Les anciens réglages `christmas` (auto, always, never → Auto, Noël, Aucun) et `ground` (ignoré)
restent acceptés et rapportés pour les clients desktop antérieurs au thème saisonnier.
L'état remonte à chaque changement, au plus une vérification par seconde dans la boucle du jeu, sans minuterie
supplémentaire ; il inclut la météo affichée et la nuit effective pour les icônes. Sortir du salon désactive les contrôles.

### Météo réelle, lieu de la carte et bandeau

**Mode « Réel »** (Paramètres → Météo de la carte) : le temps prévu au lieu de la carte, quart d'heure par quart
d'heure. Le pusher (`RealWeatherService`) demande à Open-Meteo `minutely_15` (code WMO et température, 2 h passées et
6 h à venir), au plus toutes les 30 min par lieu (2 min tant qu'il n'a rien pour maintenant). Chaque navigateur lit le
quart d'heure en cours à l'heure du jeu (`realWeatherAt`) : la météo change à la même heure pour tous, un épisode est
daté du début de sa série (fondu d'entrée et de sortie du brouillard, neige qui tient puis fond comme en Automatique).
Un quart d'heure commencé, ou qui commence avant le prochain relevé des navigateurs (5 min), n'est jamais réécrit.
Sans réponse, la carte passe en Automatique. Neige hors saison dessinée en pluie, comme pour les autres modes.

**Lieu de la carte** (`weatherLocation` du WAM, Paris par défaut) : recherche de ville par le géocodage Open-Meteo
via le pusher, « Revenir à Paris » (`clearLocation` du protobuf). Le jour/nuit suit ce lieu sur l'heure du serveur ;
avec « Heure de mon ordinateur » ou `?nightAt`, l'heure est lue comme celle de Paris et le soleil reste celui de Paris.

**Aperçu** : tuile, fréquence ou ville essayées s'affichent tout de suite pour soi seul, jusqu'à la fermeture du
panneau ; sauvegarder les applique à tous.

**Bandeau** (menu des applications → « Météo », choix gardé dans le navigateur) : maintenant, +1 h et +4 h sous
l'horloge, températures en mode Réel, programme saisonnier en Automatique. Pour « Maintenant », la vitesse du vent
réel du lieu (km/h arrondis, `wind_speed_10m` déjà lu, aucune requête de plus), avec une petite icône de rafales ; rien
si le vent est inconnu ; pas pour +1 h et +4 h, pour que le bandeau tienne sur un écran étroit. Quand sa direction est
connue (`wind_direction_10m`, déjà lu), une flèche vers là où va le vent remplace les rafales, suivie de la provenance
sur 8 points (« ↘ NO 22 km/h », secteurs de 45° centrés, `WindDirection.ts`) ; flèche tournée par quarts de tour pour
rester nette ; pas de direction sans vitesse ni par vent arrondi à 0 km/h.

**Pusher** : `/real-weather` et `/real-weather/places`, authentifiés, 30 requêtes par minute et par joueur
(`PerUserRateLimiter`, partagé avec les paroles) ; 20 nouveaux lieux et 30 recherches par minute pour tout le pusher,
50 lieux suivis (le moins récemment demandé est oublié) ; pannes d'Open-Meteo journalisées et envoyées à Sentry.

**Compatibilité** : `play`, `back` et `map-storage` ensemble (valeur `real` du `WeatherType`, champs protobuf
`location` et `clearLocation`). L'app de bureau, inchangée, voit une carte en Réel comme Automatique ; y choisir
Automatique ne change rien (choix volontaire : on ne sait pas si l'app renvoie d'elle-même sa valeur affichée).

**Licence** : l'API gratuite d'Open-Meteo est réservée à un usage non commercial, données CC BY 4.0 (source citée
dans le panneau des réglages, pas dans le bandeau).

### Nuages

**Nuages et ombres portées** (conception : `docs/superpowers/specs/2026-11-14-nuages-design.md` du repo d'infra) :
les nuages sont une intensité (0 à 1) d'un ciel clair, jamais un temps rendu par le programme. Tuile fixe « Nuageux »
(`WeatherType.Cloudy`, dessinée en ciel clair à 0,5) ; en Auto, chaîne à part sur les tranches claires (hiver 50 %,
printemps 35 %, été 20 %, automne 40 % en Normale ; pluie/orage/neige/brouillard inchangés), case « Nuageux »
(`weatherAuto.clouds`, absent = oui ; proto `autoClouds`) ; en Réel, couverture nuageuse d'Open-Meteo (`cloud_cover`, %
par quart d'heure, même appel), codes WMO 1/2/3 → 0,2/0,5/0,9 en secours ; la couverture d'une pluie ou d'un orage règle
la densité de ses nuages gris ou sombres (0,6 au moins). Fondu de 3 min.

**Rendu** (`Weather/Clouds.ts`) : nuages blancs et leurs ombres décalées à l'opposé du soleil du lieu de la carte
(`sunPositionAt`, azimut Meeus ; ombre de 3 cases de haut, 6 au plus), **dehors seulement et au-dessus de tout**
(avatars compris) ; voile gris en ciel couvert ; nuages gris sur la pluie, sombres sur l'orage, sans ombre. Ciel et
brouillard **fixés à la carte** (motif répété, `repeatedOverView`) : le zoom et la caméra ne les déplacent pas. 60 px/s,
15 images/s, blocs d'environ 12 px à l'écran ; la nuit, nuages gris-bleu sombre (teinte progressive de 2° à −6°,
comme le voile de nuit), sans ombre ni voile couvert, sous les lumières des lampes ; immobiles en mouvement réduit. Interrupteur personnel « Afficher les nuages et leurs ombres »
(Paramètres → Ambiance). Bandeau : soleil et nuage, ou nuage seul au-dessus de 0,8.

### Ombres du soleil et de la lune

**Lune** (`Night/MoonClock.ts`) : hauteur et azimut (même convention que `sunPositionAt`, parallaxe comprise, sans
réfraction) et fraction éclairée, par les termes principaux de Meeus (chap. 47, termes de 0,001° et plus ; chap. 48,
formule approchée). Testée sur l'exemple 47.a (valeurs reprises de PyMeeus) et sur les levers, couchers, passages au
méridien et illuminations publiés par timeanddate.com pour Paris et Sydney (novembre 2026). Même instant et même lieu
que le soleil : `?nightAt=HH:MM` (dev) montre aussi la lune à cette heure.

**Lumière du ciel** (`Night/SkyLight.ts`, calculée une fois par seconde par `NightManager.skyLight()`) : un seul astre
à la fois. Le soleil tant qu'il projette des ombres (fondu de 6° à 2° d'élévation, comme les ombres des nuages), doré
près de l'horizon, blanc haut ; puis la lune quand la nuit tombe (de rien à un soleil de 2° jusqu'à la fin du crépuscule
civil, et seulement levée de 2° au moins), bleu froid, 0,3 au plus × lumière de sa phase : au changement les deux sont
éteints, jamais deux jeux d'ombres nets. Lumière de la phase (`moonPhaseLight`) : « Réaliste » (défaut), loi de
Krisciunas & Schaefer 1991 (PASP 103, éq. 8-9, d'après Allen 1976), un quartier ≈ 9 % de la pleine lune ; « Linéaire »,
la fraction éclairée. La météo de la carte l'atténue sans cacher les ombres (`skyWeatherFactor` : ciel couvert 35 %,
neige 50 %, pluie et brouillard 30 %, orage 15 %) ; la neige du thème de Noël, décor personnel, n'atténue rien ; météo
masquée ou nuages coupés : ciel clair. Une lune brillante éclaircit le
voile de nuit d'un cinquième (30 % au plus avec une intensité réglée plus haut, `moonlitNightOpacity`), rien par
nouvelle lune.

**Ce qui bouge** (`SkyMovingShadows`) : chaque avatar dehors a sa vraie silhouette couchée au sol à l'opposé de
l'astre (ses calques dessinés dans un petit canevas rempli de la couleur des ombres, refait seulement quand un calque
change d'image ; image tournée et étirée depuis ses pieds, `fallenShadowPose`) ; chaque animal promeneur a un ovale
(`ovalShadowPose`). Une petite image par personnage, qui le suit : rien de la carte n'est redessiné. Pas d'ombre pour
un avatar invisible, à la nage, sur un palier ou dans une pièce ; ovale de repli si ses calques ne sont pas lisibles.
Les petits éléments du catalogue nature (rochers, herbes, fleurs, souches) projettent une petite ombre ronde, avec
les ombres fixes. **Par catégorie** (Paramètres → Ambiance → « Ce qui projette une ombre », personnel, gardé dans le
navigateur) : murs, meubles et objets hauts, arbres, petits éléments, avatars, animaux, pour le soleil comme pour la
lune. **Forme au choix** pour les arbres, les avatars et les animaux, « Ovale » ou « Réaliste » (défauts : arbres et
animaux en ovale, avatars en réaliste), pour comparer le rendu et le coût : un arbre réaliste est sa propre image
couchée au sol, dessinée dans la texture des ombres fixes puis remplie de leur couleur ; un animal réaliste a sa
silhouette comme un avatar. Mesuré une fois en local (carte d'équipe, 169 arbres, 34 personnages) : redessin des ombres
fixes 0,35 ms en réaliste contre 0,24 ms en ovale, mise à jour des ombres mobiles 0,016 ms par image.
Les petits éléments ont aussi le choix Ovale / Réaliste. **Ombres des arbres au vent** (interrupteur, activé par
défaut) : la cime de l'ombre se déplace avec la cime de l'arbre (`TreeSway.poseOf`, `TreeSway.version`), en ovale
comme en réaliste ; les ombres fixes sont alors redessinées à chaque changement de pose, 14 fois par seconde. Mesuré
une fois en local (carte d'équipe, vent de 20 km/h, écran non plafonné) : 142 → 134 images/s en ovale, 135 → 126 en
réaliste, soit 5 à 7 % ; sans l'interrupteur, un redessin par seconde au plus.
Limites : silhouette d'un avatar non coupée au bord d'une pièce, véhicule et compagnon sans ombre propre.

**Ombres** (`SkyShadows/`) : les murs de l'outil Carte (pied du mur, hauteur = nombre de cases ; portes et fenêtres
comptées comme mur), les objets `castsShadow` (rectangles de collision, 1,5 case de haut) et les arbres du catalogue nature (`Nature:tree-*`, et les `nature-`, `snow-tree-`, `seasonal-`, `winter-auto-` de deux cases de haut ou plus)
(houppier rond sur un tronc) projettent sur le sol leur pied balayé à l'opposé de l'astre, longueur hauteur /
tan(élévation), **4 cases au plus** par défaut (réglable, plafond dur 8 cases), même sens que les ombres des nuages. Une texture bleu-noir, opacité 0,4 ×
intensité, **dehors seulement** (`OutdoorGrid`), posée sur le sol (profondeur 0,7 : au-dessus des sols, sous tout ce
qui est trié par y). Redessinée seulement quand l'astre a bougé d'un demi-degré, quand ce qui projette ou le dehors
change, à chaque division par deux de la résolution au zoom, à un changement de réglage, ou avant qu'un défilement
n'atteigne le bord ; un fondu ne change que l'opacité. Coupées dans l'éditeur. « Désactiver la nuit » : soleil seul tant
qu'il est levé, pas de lune.

**Réglages personnels** (Paramètres → Ambiance, `Stores/SkyLightStore.ts`, gardés dans le navigateur, rien ne change
pour les autres) : un interrupteur par astre, « Ombres et lumière du soleil » et « Ombres et lumière de la lune »
(activés par défaut) ; chacun coupe pour son astre les ombres, la teinte et l'éclaircissement du voile et les taches par
les fenêtres, l'autre continue. Avec la lune : « Intensité de la lune selon sa phase », Linéaire ou Réaliste (défaut).
Sous chaque astre activé, des **limites** (curseurs) :
- intensité minimale (0 à 100 %, défaut 0) et maximale (0 à 200 %, défaut 100 %) : en part de l'astre à son plus fort
  (soleil haut par ciel clair, pleine lune haute) ; la lumière calculée (météo, phase) est mise à l'échelle du maximum
  puis ramenée dans la plage. Le fondu à l'horizon et au crépuscule s'applique après : astre couché = 0 malgré un
  minimum ; pour la lune levée, le minimum vaut **quelle que soit la phase** (un peu de lune même en fin croissant).
  Résultat borné à 1 (opacité d'ombre 0,4 au plus) ;
- couleur minimale (0 à 100 %) et maximale (0 à 200 %, défaut 100 %) : force de la teinte de l'astre (soleil doré près
  de l'horizon, presque blanc haut ; bleu froid de la lune), 0 % = neutre, au-delà de 100 % teinte accentuée ;
- longueur minimale des ombres (0 à 2 cases, pas de 0,25) et maximale (1 à 8 cases, pas de 0,5, défaut 4) : la longueur
  hauteur / tan(élévation) est ramenée dans la plage ; avec un minimum, même à midi un obstacle garde cette ombre.
Un minimum au-dessus du maximum est ramené au maximum (`boundedTo`).

**Par les fenêtres** (`SkyShadows/SkyWindowLight*`) : par chaque fenêtre et porte vitrée de l'outil Carte entre le
dehors et une pièce, dont la face reçoit l'astre, une tache de lumière sur le sol de la pièce (entre les rayons qui
passent par le bas et le haut de la vitre, inclinée avec l'astre, 4 cases au plus), de la teinte de l'astre, ajoutée,
gardée dans les cases de la pièce (`OutdoorGrid.roomAt`). La nuit, la lune y perce un peu le voile. Interrupteur et
limites d'intensité et de couleur de son astre ; la longueur maximale des ombres borne la tache, pas la minimale. Hauteur de vitre approchée (8 px au-dessus du sol jusqu'à 6 px sous le haut de l'ouverture).

**Limites** : sol seulement (rien à l'étage, objets des paliers ignorés) ; une ombre tombe sous les murs et objets
voisins au lieu de monter sur leur façade ; un soleil haut au sud cache presque toute l'ombre derrière le mur qui la
projette (vue 3/4) ; tuiles de collision Tiled sans hauteur, donc sans ombre ; état des portes ignoré.

## Arrière-plan de caméra gardé

Le choix d'arrière-plan (flou ou image) est gardé dans le navigateur par le code amont. Il était effacé pour de bon
quand le fond ne pouvait pas s'appliquer (échec du moteur, par exemple pendant un redéploiement) ou quand le monde ne
proposait pas l'image au chargement. `backgroundConfigStore.disableForSession()` le coupe désormais pour la page seule :
le choix gardé est retenté au chargement suivant. Choisir « aucun » l'efface toujours (`reset`).

## Écran « Mon avatar » plus rapide

La liste des wokas était redemandée au serveur à chaque ouverture de l'écran de choix (spinner à chaque fois) et chaque
vignette se redessinait 60 fois par seconde. `gameManager.loadWokaData()` garde désormais la liste de chaque salle pour
la page (`WokaListCache` : une requête par salle, copie par appelant, échec oublié pour que « Réessayer » redemande) ;
l'écran de choix l'utilise et le menu profil la précharge à son ouverture. `WokaImage` ne redessine plus qu'au
chargement d'une image ou au changement de ce qu'elle montre (direction, taille, maillot, véhicule).

## Éditeur d'objets : éditer l'objet posé et le dupliquer

Après une pose, l'objet choisi reste armé pour en poser d'autres ; un clic sur un objet de la carte reposait alors un
exemplaire (ou était refusé en rouge) au lieu de l'ouvrir. Désormais un clic sur un objet ouvre ses propriétés même
quand un objet est armé (`EntityClickIntent.clickSelectsEntity`), un clic dans le vide pose toujours. On pose encore
sur un objet de sol (une chaise sur un tapis), et par-dessus n'importe quel objet en maintenant Maj. Le bouton ⧉, à côté
de ⟳ ▲ ▼ au-dessus de l'objet sélectionné, arme une copie de cet objet avec ses propriétés (`EntityDuplicate`) : chaque
clic en pose un exemplaire, Échap ou clic droit arrête. La copie par Ctrl+glisser d'origine reste, mais Ctrl+clic est un
clic droit sur Mac.

## Éditeur d'objets : ergonomie de l'outil Objets

Suite d'un audit de l'outil Objets (lu dans le code, puis corrigé) :

- un clic droit (Ctrl+clic sur Mac) sur un objet de la carte ne l'ouvre plus : il lâche seulement l'objet armé
  (`EntitiesManager`, bouton testé avant la sélection) ;
- un objet supprimé pendant qu'il est ouvert (Ctrl+Z de sa pose ou de sa rotation, autre éditeur) ferme ses propriétés
  et ses boutons ; un objet remplacé sous le même identifiant (rotation, redimensionnement) les garde
  (`EntitiesManager.syncSelectionWithMap`, appelé après chaque commande de la file de `MapEditorModeManager`) ;
- Ctrl+Z annule bien une modification de propriété : `addProperty`, `updateProperty` et `deleteProperty` créent une
  nouvelle liste au lieu de modifier celle du WAM, que l'annulation relit (comme `setProperty`) ;
- « Retour » de la bibliothèque ne supprime plus l'objet resté sélectionné, et déposer un fichier sur la carte quitte
  l'objet sélectionné ;
- Échap ou clic droit efface aussi le motif « Impossible de le poser ici » ;
- les boutons ⟳ ▲ ▼ ⧉ suivent l'objet (glisser, annulation, autre éditeur), recalés à chaque image ;
- un passage de gomme est une seule étape à annuler : les objets disparaissent aussitôt et sont supprimés ensemble au
  relâchement (`executeCommands`), réaffichés si la suppression échoue ;
- relâcher un objet glissé avec Cmd ou Option (en plus de Ctrl) pose une copie ; Ctrl+Y (ou Cmd+Y) rétablit ;
- une ligne d'aide rappelle les raccourcis dans la bibliothèque (Maj, Échap / clic droit, Suppr, ⧉ / Cmd ou Ctrl +
  glisser, Cmd ou Ctrl + Z).

## Éditeur : outils Sélection et Zones

Correctifs tirés d'un audit de l'ergonomie de l'éditeur, faits d'après la lecture du code et non reproduits en jeu :

- **Sélection, zones** : une zone n'est prise que si le rectangle la contient entièrement. Avant, il suffisait de la
  toucher, et une grande zone invisible (une salle, un étage) partait avec les meubles quand on cliquait sur Supprimer
  ou Déplacer. Le contour des zones est dessiné en blanc dans l'outil Sélection.
- **Sélection, bureau personnel** : Supprimer refuse une sélection qui contient un bureau personnel et renvoie vers
  l'outil Zones, qui demande quoi faire de son mobilier (`ActionPopupOnPersonalAreaWithEntities`). Le déplacer reste
  possible.
- **Sélection, filtres** : cases Objets / Sols et murs / Zones (`mapEditorSelectionFiltersStore`). « Sols et murs »
  (prefabs de l'outil Carte, `isMapLayerPrefab`) est décoché par défaut ; changer une case resélectionne le rectangle courant.
- **Sélection, mode tampon** : Coller en série et Déplacer restent armés quand la souris sort du canvas (panneau,
  barres) ou que la fenêtre perd le focus ; seul l'appui en cours est abandonné.
- **Sélection, annuler** : après Cmd/Ctrl+Z ou un rétablissement (`refreshSelectionAfterHistory`, appelé par
  `MapEditorModeManager`), le rectangle est recalé sur les éléments sélectionnés restants, ou effacé si plus rien n'est
  sélectionné. Un rectangle qui contient encore tous les éléments est gardé (cible de Remplir).
- **Motifs partagés** : la poubelle demande « Supprimer ce motif pour tous ? Oui / Non » (`PatternDeleteButton.svelte`).
- **Raccourcis** : une ligne dans le panneau Sélection rappelle Cmd/Ctrl+C, Cmd/Ctrl+V, Suppr et Échap. Dans l'outil Zones,
  Échap ferme les propriétés de la zone sélectionnée.
- **Zones, duplication** : glisser une zone avec Ctrl, Cmd ou Option la duplique (`isAreaDuplicateGesture`), alors que
  Ctrl+clic ouvre le menu contextuel sur Mac. La consigne de l'outil le mentionne. Les écouteurs des touches Ctrl et
  Maj sont retirés à la désactivation : ils s'empilaient à chaque activation et changeaient le curseur des autres outils.

## Paliers et escaliers de l'outil Carte

Étages posés sur le dessus des murs hauts, reliés par des escaliers. Tout est dessiné par l'outil Carte, section
« Paliers » du panneau. Livré en beta le 2026-11-17 (PR #263) ; images du catalogue provisoires.

- **Principe** : chaque objet posé a une altitude en pixels (`EntityData.elevation`, absente = au sol). La position
  enregistrée reste celle de l'image, dessinée d'autant plus au nord ; l'endroit au sol est `(x, y + elevation)`.
  L'avatar garde sa position à l'écran et a une altitude à part (`Character.setFloorZ`). Le champ traverse le
  protocole (`CreateEntityMessage.elevation`, `ModifyEntityMessage.elevation`) : `play`, `back` et `map-storage`
  ensemble, un ancien `map-storage` le retire.
- **Niveaux** : un palier se pose sur des murs de 2, 3 ou 4 cases, à 52, 84 ou 116 px (`floorElevation`). L'interface
  ne montre jamais de pixels : « Niveau 2 », « Niveau 3 », « Niveau 4 » (hauteur des murs en cases,
  `floorLevelTiles`), suivi de « palier N » quand le niveau a des dalles (rang parmi les niveaux posés).
- **Pièces** (collection `Carte Paliers`, contrat avec le catalogue privé, `MapLayerFloors.ts`) : `dalle-<famille>` ;
  `escalier-<n|e|s|o>-l<1|2>-<montée>[-v2][-vide]`, montée `h2`/`h3`/`h4` (du sol au dessus d'un mur : 52, 84, 116 px) ou
  `m1`/`m2` (entre deux dessus de murs : 32, 64 px), `-vide` = flanc ouvert. Un escalier est un seul objet. Sa longueur
  au sol est d'une case par case montée (arrondi au-dessus), une de plus vers le sud (sinon il ne descendrait pas
  l'écran). Les pièces n'ont pas de collision : le jeu garde l'avatar sur les dalles et les escaliers.
- **Modèle** (`FloorModel.ts`) : dalles par altitude et par case, escaliers avec leur niveau de départ et d'arrivée.
  Une trémie est simplement des cases sans dalle.
- **Marche** (`FloorWalk.ts`, pur et testé) : montée et descente dans les quatre directions ; le bord des dalles est un
  garde-corps (l'avatar garde la largeur de son corps sur les dalles) ; on entre et on sort d'un escalier par son pied,
  par ses côtés sur sa moitié basse, et par son haut ; un côté longé par un mur est fermé (`stairSideClosed`, d'après
  `wallBarriers`) ; on ne sort pas en haut d'un escalier qui n'arrive sur aucune dalle ; un avatar dont la dalle
  disparaît est remis au sol. En hauteur, le sol ne bloque plus et ses objets, sièges, piscines et portes ne
  réagissent plus à l'avatar.
- **Rendu** (`FloorDepth.ts`) : une bande de profondeurs par altitude, tout ce qui est en hauteur passe au-dessus de
  ce qui est plus bas. Dans l'éditeur, les niveaux au-dessus du niveau édité sont à 30 %.
- **Étages lisibles** (`Floors/LevelFocus.ts`, `StairHints.ts`, `StairHintsView.ts`, `FloorLevelStack.svelte`), sur le
  modèle des jeux en vue de dessus à étages (Project Zomboid) : l'étage de l'avatar est net (sur un escalier, ses deux
  étages). **Au-dessus** : dans une pièce ou en hauteur, tout étage au-dessus est caché entier avec ce qui y est posé
  (objets, murs, garde-corps, avatars, escaliers qui en partent) ; dehors au sol, un bâtiment reste entier et seules
  les dalles autour de l'avatar s'estompent (`aboveLevelShows`). **En dessous** : un seul voile gris foncé (`0x2b2f38`,
  0,7) posé juste sous la bande de l'étage courant (rien n'est filtré objet par objet), en fondu de 300 ms à l'arrivée,
  retiré d'un coup dès qu'on redescend (`veilAlphaToward`). **Escaliers** : seuls ceux qui partent de l'étage courant
  ou y arrivent sont visibles (`stairShows`) ; un escalier entre deux autres étages semblerait partir d'ici. Ceux qui
  arrivent d'en dessous passent au-dessus du voile (`stairDepth`, profondeur recalculée par `floorPieceDepth`) ; un
  escalier dessiné par-dessus l'avatar passe à 50 % (`stairCoversAvatar`). Pas de flèche animée sur les marches
  (essayées puis retirées : bruit visuel) ; à 2 cases ou moins d'un bout (case lue au sol,
  `avatarGroundTile`) une étiquette nomme l'étage de l'autre bout (« Niveau 2 ↑ », « Sol ↓ »). Sous l'horloge, la
  pile des étages de la carte, l'étage courant en blanc après « ▶ » (`FloorLevelsStore.ts`). Éditeur ouvert ou carte
  sans palier : rien de tout cela.
- **Escaliers courts** (`-v2`) : nouveaux escaliers posés par le mode Escalier quand le catalogue de la salle les a
  (`mapLayerShortStairsAvailableStore`, les anciens sinon) : **une case au sol** vers le nord, l'est et l'ouest
  (`stairRun(…, short)`), la longueur habituelle vers le sud (l'avatar y descend l'écran : il faut une longueur
  supérieure à la hauteur). Dessin éclairé d'en haut, nez de marche, rampes sur un flanc vide (profils est et ouest).
  Les escaliers déjà posés gardent nom, longueur et dessin.
- **Éditeur** (`MapLayerFloorEditing.ts`, `FloorOperations.ts`) :
  - « Niveau » : choisi à la main ; pipette par Alt+clic, Cmd+clic ou le bouton « Prendre le niveau sous le
    pointeur » ; le nom du niveau suit le pointeur (un même point de l'écran est une case de chaque niveau).
  - « Dalles de palier » : rectangle au niveau choisi (le mode quitte le sol tout seul).
  - « Escalier » : « Part du » (niveau courant), « Monte jusqu'à » (niveaux atteignables ; par défaut un niveau déjà
    posé), direction, largeur, flanc vide. La trémie est découpée dans le palier d'arrivée et rebouchée au retrait.
    Aperçu : rond = première marche, flèche = arrivée, bleu = dalles d'arrivée, orange = pas de dalle à l'arrivée,
    rouge = dalles retirées pour la trémie. Un escalier posé sans arrivée garde ses cases d'arrivée barrées d'orange.
  - « Gomme de palier » : rectangle pour les dalles, clic sur un escalier qui part du niveau courant.
  - Les pièces de palier sont réservées à l'outil Carte (`isMapLayerPrefab`) : les autres outils ne les prennent pas.
- **Altitude partagée** (`Floors/FloorProtocol.ts`) : variable de joueur `_floorZ`, publique et non sauvegardée
  (patron de la torche) ; exacte sur un palier, par pas de 4 px et au plus toutes les 150 ms sur un escalier ; un
  ancien client ou une valeur invalide = au sol.
- **Objets sur un palier** : le panneau Objets propose « Poser sur » dès que la carte a un palier : **Auto** (le
  palier dessiné sous le pointeur, le sol s'il n'y en a pas), **Sol** (meubler sous une mezzanine) ou un niveau posé
  (`mapEditorPlacementLevelStore`, `placementElevation`). L'aperçu passe au-dessus du palier, se cale sur ses dalles et
  affiche le nom du niveau ; un objet déplacé suit la même règle au lâcher. Tri dans la bande de son niveau, collisions en
  rectangles pour les avatars de son niveau seulement (rien dans la couche de cases, qui est celle du sol), même
  transparence que son palier.
- **Tableau accroché** (`applyHungOnWallDepth`) : c'est le niveau de l'objet qui dit s'il est accroché. Au sol
  (niveau 0, et donc en **Auto** hors d'un palier), un objet dont l'image tombe sur la face d'un mur haut est
  **derrière** ce mur, caché par lui. Avec un niveau au-dessus du sol choisi dans le sélecteur, sans dalle de ce
  niveau sous son pied et avec toute son image sur la face sud de murs, il est dessiné juste par-dessus ces murs.
- **Murs, portes et fenêtres sur un palier** (`MapLayerLevels.ts`) : mêmes pièces dans des collections à part
  (`Carte Murs Paliers`, `Carte Portes Paliers`, `Carte Fenêtres Paliers`), avec l'altitude de leur palier. Tout ce
  qui lit les murs du sol (lumière, dehors, chemin, portes, transparence) ne les voit pas, sans rien savoir des
  paliers. Les modes Mur, Pièce, Porte, Fenêtre, Hauteur et Gomme travaillent au niveau choisi : l'outil lit les
  pièces du niveau comme si elles étaient au sol, applique le modèle et l'autotile du sol, et replace le résultat au
  niveau. Une pièce tracée sur un palier pose ses dalles avec ses murs. Le dessus de murs posés sur un palier est un
  niveau proposé, nommé par la somme des hauteurs (« Niveau 2+2 »). Les portes d'étage s'ouvrent pour les
  personnages de leur niveau (`Floors/UpperDoors.ts` : un animateur des portes du sol par niveau, nourri des pièces et
  des personnages de ce niveau vus comme au sol) ; celles du sol ne s'ouvrent plus pour un personnage en hauteur.
- **En hauteur, le sol ne réagit pas** : pas de nage, de tenue de bain ni de glisse au-dessus d'une piscine ou d'une
  patinoire ; pas de chapeau de neige ni de tas de feuilles sur les pièces de palier (`isRaisedFloorCollection`).
- **Escalier à flanc vide** (`-vide`) : un avatar du niveau de départ passe dessous là où la hauteur libre atteint
  40 px ; ailleurs, et pour un flanc plein, l'escalier bloque comme avant.
- **Sélecteur de niveau commun** (`FloorLevelPicker.svelte`, en haut du panneau Carte et du panneau Objets ; choix
  partagé `mapEditorPlacementLevelStore`) : une ligne Auto · pipette · Sol · paliers posés, une ligne Niveau − / +
  (n'importe quel niveau, une case de mur à la fois, avec ou sans dalles : `steppableLevels`) et Palier − / + (palier
  posé suivant ou précédent). **Auto** suit le palier dessiné sous le pointeur, le sol ailleurs. Dans l'outil Carte, un
  clic en mode Porte, Fenêtre ou Hauteur sur un mur d'un autre niveau passe à ce niveau (`levelOfWallAt`).
- **Profondeurs** : les bandes des paliers commencent au-dessus de tout le sol, objets « au-dessus des avatars »
  compris (un arbre derrière une maison est caché par son étage), et restent sous les calques de recouvrement.
- **Cas pris en charge** : mezzanine sur murs de 2, 3 ou 4 ; escalier du sol à chaque niveau ; escaliers courts entre
  niveaux (2→3, 3→4, 2→4) ; escalier arrivant au bord d'un palier ou dans une trémie ; largeur 1 ou 2 ; pièce,
  murs et meubles sur un palier ; étage sur étage.
- **Par niveau** : sièges (`getSeats(scene, altitude)`), objets à action et objets à interaction ne valent que
  pour le palier où ils sont posés ; une fléchette de Nerf vole à la hauteur du tireur (elle ne touche que les
  joueurs de ce palier, et les murs du sol seulement tirée du sol) ; on n'apprivoise un animal que depuis le sol ; les
  autres joueurs s'estompent avec leur palier.
- **Trajet par double-clic et « Y aller »** (`FloorPath.ts`, `GameScene.floorWalkTo`) : dès que le départ ou
  l'arrivée est sur un palier, le trajet passe par les dalles et les escaliers, contourne les murs de chaque étage
  (les portes sont franchissables) et évite les cases d'escalier au sol. Sans escalier menant à l'arrivée, depuis un
  escalier, ou pour un trajet qui reste au sol : trajet ordinaire. Les meubles des paliers ne sont pas contournés.
- **Bulles par niveau** (`back/src/Model/FloorLevel.ts`) : le `back` lit l'altitude que le navigateur publie dans
  la variable de joueur `_floorZ` ; deux joueurs ne forment une bulle, et n'en écoutent une, que sur le même palier
  (moins de 6 px d'écart : deux niveaux peuvent n'être qu'à 12 px). Monter ou descendre fait quitter la bulle ; à
  mi-escalier, aucune bulle. Aucun changement de protocole.
- **Zones par niveau** : champ facultatif `AreaData.elevation` (absent = sol, aucune migration ; protobuf
  `CreateAreaMessage.elevation = 9`, `ModifyAreaMessage.elevation = 10`). Le rectangle d'une zone est là où on la
  voit, comme un objet. Une zone ne vaut que pour les joueurs de son palier (`isAtAreaLevel`, `GameMapAreas` reçoit
  la position avec son altitude) : entrée et sortie, verrou et toquer, collision d'une zone fermée, compte des
  occupants, objets d'un bureau perso, suivi des zones côté `back` (`AreaZoneTracker`). Une réservation de bureau ne
  peut pas changer le niveau d'une zone. `play`, `back` et `map-storage` ensemble.
- **Éditeur de zones** : le sélecteur de niveau commun en haut du panneau ; une zone est créée au niveau choisi (en
  Auto, sur le palier dessiné sous elle) ; avec un niveau choisi, les zones des autres niveaux sont estompées et ne
  se saisissent plus ; en Auto, là où des zones de plusieurs niveaux se recouvrent, celles du palier sous le
  pointeur ; « Niveau de cette zone » dans le panneau d'une zone la déplace de niveau au-dessus du même endroit.
- **Aussi par niveau de zone** : le droit de poser, déplacer ou supprimer un objet dans une zone (bureau perso,
  zone à droits) se lit sur les zones du palier de l'objet, côté front et côté `map-storage` ; une zone n'est
  allumée la nuit que par les joueurs de son palier ; une lampe ou une piste de danse se rattache à la zone
  d'écoute de son palier ; les bruits de pas « dedans » suivent le palier du joueur. Une zone dessinée sur un palier
  s'aligne sur la grille de ses dalles.
- **Eau et météo** : on nage dans une piscine du palier où l'on se trouve (`getWaterRectangles(scene, altitude)`) ;
  la météo ne se dessine sur aucune dalle ni aucun escalier de palier, ni sur le haut des murs de 2 cases et plus
  (`Weather/RaisedCover.ts`) : un étage est un morceau de bâtiment, où qu'il se tienne.
- **Lumière sur un mur haut** (`Lamps/RgbLampObstacles.ts`, `wallSegments`) : un mur horizontal de 2 cases et plus
  arrête la lumière au niveau de son dessus (dessiné au-dessus de son pied), pas à son pied : une lampe ou une
  torche au sud éclaire toute la façade, une lampe dans la pièce derrière n'en éclaire rien. Les côtés de la façade
  sont fermés à ses bouts et là où un mur part vers le sud.
- **Sol sous un mur estompé** (`FadedWallFloor.ts`, `FadedWallFloorView.ts`) : une pièce a son sol sous le haut de
  son mur de devant, pas sous son pied ; estompé (55 %), ce mur laissait voir le sol en haut et le terrain de dehors
  en bas, en deux tons. Le jeu dessine, pour soi seulement et sans rien poser sur la carte, le sol de la pièce sous
  les cases sans sol d'un mur haut estompé ; rien dans l'éditeur.
- **Lampes de Jam à l'étage** (`LampManager.raisedFloorZoneOf`, `FloorSpike.floorZoneAt`) : la lumière d'une lampe
  reste dans la plus petite zone où elle se tient ; à l'étage, sans zone de ce niveau, elle s'étalait dans un carré
  autour d'elle, par-dessus les murs. Un étage compte maintenant comme une zone : le rectangle qui entoure ses
  dalles. Une zone posée à ce niveau, plus petite, l'emporte.
- **Altitude après un rechargement** (`LastPlayerPosition.ts`, `FloorSpike.restore`) : la dernière position gardée
  dans le navigateur porte l'altitude du palier (`floorZ`, absent au sol) ; au rechargement (un déploiement recharge
  la page), l'avatar est reposé sur ce palier si une de ses dalles est encore sous lui, sinon au sol. Sur un
  escalier, la dernière position gardée reste celle d'avant l'escalier.
- **Dalles en verre** : interrupteur « Dalles en verre » du mode Dalles ; pièce `dalle-verre` de `Carte Paliers`
  (`SLAB_GLASS_FAMILY`, une famille de dalle qui n'est pas un sol du rez-de-chaussée), translucide comme les
  vitres : on voit à travers ce qui est sous le palier. Grisé tant que le catalogue de la salle n'a pas la pièce.
- **Garde-corps** (`FloorRailings.ts`, `Floors/FloorRailingsView.ts`) : dessinés par le jeu le long de chaque bord
  d'un palier qui donne sur le vide, sans rien poser sur la carte (les paliers déjà construits les reçoivent). Pas
  de garde-corps là où un escalier arrive ou repart, ni le long d'un mur d'étage, ni le long d'un mur d'en dessous
  qui monte plus haut que le palier (mezzanine contre le mur haut de sa pièce) ; un mur dont le dessus est au niveau
  du palier garde son garde-corps, comme une terrasse. Vitrage sous une main courante sombre, 12 px de haut ; celui
  du bord nord passe derrière qui se tient sur la dalle, les autres devant.
- **Ce qui s'estompe** (`Floors/FloorSpike.ts`, par étage et non par altitude : `FloorGroups.ts` sépare les
  étages de deux bâtiments, même à la même altitude). Pour un étage situé au-dessus de l'avatar :
  dans une pièce, l'étage qui a des dalles au-dessus de cette pièce s'estompe (35 %) avec ses objets, ses
  garde-corps et les escaliers posés dessus, et l'étage d'un autre bâtiment dessiné par-dessus la pièce n'est pas
  dessiné du tout ; dehors, un bâtiment reste plein et seules les dalles à deux cases autour de l'avatar s'estompent
  quand l'étage le recouvre ; l'étage vers lequel on monte s'estompe. Un escalier s'estompe quand il recouvre
  l'avatar situé plus bas que son arrivée. Les dalles qui recouvrent un escalier ne le laissent voir que d'en dessous.
- **Pas encore** : zones verrouillées pour les portes d'étage ; transparence des murs
  d'étage devant l'avatar ; compagnons et animaux restent au sol ; une zone de départ en
  hauteur fait apparaître au sol ; les portes d'étage sont lues fermées par les lumières ; images définitives.
- **Lumières par palier** (`LightObstaclesByLevel`) : une lampe RGB et une torche sont arrêtées par les murs et
  les objets hauts du palier où elles se trouvent, pas par ceux du sol ni par les cases de la carte ; sur un
  escalier, ou sur un palier sans rien de posé, rien ne les arrête. Une piste de danse posée sur un palier est
  dessinée par-dessus ses dalles. Une zone d'étage se déplace et se redimensionne à la souris sur la grille de son
  palier.
- **Essai sans carte** : `?palier=piece`, `?palier=1` ou `?palier=<colonne>,<rangée>` dessine en code une disposition
  d'essai en mémoire (`Floors/FloorSpike.ts`).

Recette : tracer une pièce à murs de 2 ; poser les dalles au niveau 2 ; poser un escalier du sol (sa trémie se
découpe) ; fermer l'éditeur, monter, marcher jusqu'aux bords, redescendre, passer dessous (le palier s'estompe) ;
ajouter un palier niveau 4 et un escalier « part du niveau 2, monte jusqu'à niveau 4 » ; vérifier la pipette, la
gomme, annuler et rétablir ; recharger la page (les altitudes sont conservées).

## Zoom lors de l’ouverture des réglages desktop

Ouvrir ou fermer un panneau latéral conserve le zoom choisi dans une zone de cadrage.
Le redimensionnement recentre la zone sans réappliquer son zoom automatique ni perdre sa marge.
Le moteur met à jour la caméra active même lorsque le redimensionnement vient du navigateur,
y compris lors du passage entre zoom du canvas et zoom de la caméra sur écran Retina.
Tests de régression avec une caméra Phaser aux densités 1 et 2.
Recette : entrer dans une zone de cadrage, dézoomer, puis ouvrir et fermer Réglages ;
vérifier la conservation du zoom, puis sortir de la zone et vérifier le suivi de l’avatar.
Validation en beta à effectuer après fusion.
