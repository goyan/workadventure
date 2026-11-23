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

## Symbole de perception modifiée

Un petit symbole flotte au-dessus du nom d'un joueur qui ne perçoit pas le monde partagé, comme sous l'effet d'un
sort :

- **œil barré violet** : il est en **mode Basique** (ni nuit, ni météo, ni effets) ;
- **œil dans une boule de cristal cyan** : il suit la **météo d'une autre ville** (« Jour dans le monde ») ;
- **goutte d'eau bleue** : son **eau rapide** est active (son eau du relief va 60 fois plus vite, pour lui seul).
  Une ville suivie l'emporte sur l'eau rapide, le Basique sur les deux.

Les deux portent la même étoile qui scintille ; leurs formes diffèrent (œil plat et barre, anneau), pour être distingués
sans les couleurs. Au survol du symbole, une infobulle le dit (« Mode Basique : ne voit ni la nuit ni la météo », « Suit
la météo d'une autre ville » : la ville n'est jamais transmise). Le Basique l'emporte sur une ville suivie : il coupe
aussi la météo de cette ville (lu dans le code : dessin de la météo, `WeatherManager` ; nuit, `effectiveNightModeStore` ;
sol, `TerrainView`).

- **Qui le voit** : seulement un joueur qui perçoit lui-même le monde partagé (ni Basique, ni ville suivie), jamais
  au-dessus de son propre avatar (`shownPerceptionMark`, `Perception/PerceptionProtocol.ts`).
- **Partage** : variable de joueur publique `_perception`, non sauvegardée (`none`, `basic`, `place`, `water` ; toute autre
  valeur lue `none`), publiée à l'entrée dans la salle et à chaque changement (`PerceptionManager`). Aucun changement
  du protocole ni de `back` ; un ancien client n'affiche rien. Le Basique compte tel qu'il est choisi, même dans
  l'éditeur (le symbole ne clignote pas à chaque édition) ; un essai de météo dans le panneau de la carte n'est pas
  une ville suivie.
- **Place** : élément de la pastille du nom (`UsernamePerceptionDisplay`), donc dans la même couche au-dessus de la
  nuit et du brouillard, à la même échelle, et il suit le palier et l'avion comme le nom ; 2 px au-dessus de la
  pastille, au-dessus des cœurs du Nerf quand ils s'affichent ; caché pendant une bulle de texte ou une émote, et avec
  la pastille quand la mini-vidéo est sur l'avatar.
- **Animation** : flottement de 1 px par pixel entier (deux positions en 2,4 s) et scintillement de l'étoile en trois
  pas, joués par le navigateur (Web Animations) : la scène Phaser n'est jamais redessinée pour eux ; une animation du
  navigateur par symbole visible, coût non mesuré. Immobile avec « mouvement réduit ».

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

### Économie d'énergie

Réglage **par carte**, coupé par défaut (Paramètres → Ambiance → « Éclairage de la carte », visible pour qui peut
éditer la carte, enregistré au changement) : les lampes RGB posées **dehors** s'éteignent le jour quand le ciel éclaire
assez, et se rallument à la tombée du jour ou sous un gros orage. Valable pour tous les joueurs. Gyrophares compris ;
torches, lampes de Jam, piste de danse et lampes des pièces jamais concernées.

- **WAM** : `settings.lighting.energySaving` (absent = coupé), `LightingSettings` dans `libs/map-editor/src/types.ts`.
  **Protocole** : `UpdateLightingSettingMessage { bool energySaving = 1; }`, case 10 de `UpdateWAMSettingsMessage` (le 9 est pris par les piscines de la PR #392)
  (message à part : passer par celui de la météo relancerait son cycle, `map-storage` y réécrit `startedAt`).
  `play`, `back` et `map-storage` se déploient ensemble.
- **Règle** (`Lamps/EnergySaving.ts`, sans Phaser, testée) : lumière du jour = `min(1, élévation du soleil / 15°)` ×
  facteur météo (`skyWeatherFactor` : clair 1, couvert 0,35, pluie (gouttes ou flocons) et brouillard 0,3, orage 0,15).
  Extinction à 0,25, rallumage sous 0,18 (hystérésis). Entre les deux, l'état est celui du dernier instant hors de la
  bande, cherché en remontant le temps par minutes (6 h au plus, « allumé » sinon) : un joueur qui arrive voit ce que
  voient les autres. Calculé une fois par seconde. Heures à Paris, 20 novembre : ciel clair, éteintes 8 h 41,
  rallumées 16 h 40 ; couvert 9 h 38 / 16 h 01 ; pluie ou brouillard 9 h 54 / 15 h 50 ; orage : jamais éteintes
  (et rallumées s'il arrive en journée).
- **Entrées, les mêmes pour tous** (`GameScene.mapDaylightAt`) : heure du serveur (rien n'est éteint tant qu'elle
  n'est pas connue), soleil du lieu de la carte (Paris par défaut), météo de la carte à cet instant avec ses nuages.
  Rien de personnel : ni « Désactiver la nuit », ni l'horloge de l'ordinateur, ni le thème saisonnier, ni les nuages
  masqués, ni la météo de la ville suivie sur son horloge (`Lamps/MapDaylight.ts` lit `mapWeatherSettings`, pas
  `shownWeatherSettings`). Quel que soit son mode d'horloge (« Toujours nuit », « Jour dans le monde »…), chacun voit
  les lampes de dehors suivre le jour réel de la carte. Écarts possibles : la personne qui essaie une météo dans le panneau (aperçu) voit les lampes suivre son
  essai ; en météo Réelle, un navigateur qui attend encore la réponse du pusher affiche la météo automatique.
- **Dehors** : pied de l'image de la lampe (milieu du bas), lu sur la grille dehors/dedans (`OutdoorGrid.isOutdoorAt`) ;
  pour une lampe sur un palier, le sol sous elle. Une lampe dont le pied tombe dans un mur (façade) compte comme de
  pièce. Grille pas encore connue : rien n'est éteint.
- **Interrupteurs** : l'économie éteint par-dessus, sans rien écrire dans l'état partagé des lampes (`RgbLamps`,
  option `isSaved`, multipliée par le niveau de l'interrupteur) : au retour de l'obscurité la lampe revient comme son
  interrupteur l'a laissée. Une lampe éteinte ainsi ne dessine rien, ne renvoie rien sur les murs et ne perce plus le
  voile de nuit. Fondu de 1,5 s (net en mouvement réduit). Dans l'éditeur, inchangé : lampes éteintes, ou allumées
  quand le bouton soleil-lune montre l'éclairage du jeu, pour pouvoir les régler.

Recette : activer le réglage sur une carte qui a une lampe dehors et une dans une pièce ; en journée, la lampe du
dehors s'éteint en 1,5 s, celle de la pièce reste (`?nightAt` ne sert à rien ici : l'économie lit l'heure du
serveur) ; choisir « Orage » dans la météo de la carte en plein jour : la lampe du dehors se rallume ; éteindre la
lampe à son interrupteur, attendre le soir : elle reste éteinte ; deux navigateurs côte à côte à l'aube ou au
crépuscule, l'un ouvert depuis longtemps, l'autre rechargé : même état.

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
  pas un : heure de Paris. Depuis le 2026-11-21, saisons et programme de la météo automatique suivent aussi ce lieu
  (voir « Saisons du lieu de la carte »). `play`, `back` et `map-storage` à déployer ensemble.
- **Saisons du lieu de la carte** (2026-11-21) : la saison d'une carte est celle de son lieu (`seasonAt(date, place)`,
  `libs/map-editor/src/Weather/SeasonClock.ts`, la même fonction pour `back` et pour chaque navigateur, lieu lu dans
  `settings.weatherLocation` enregistré). Hémisphère nord (latitude ≥ 0) : saisons météorologiques habituelles ;
  hémisphère sud : décalées de six mois (décembre à février = été, mars à mai = automne). Le mois se lit dans le fuseau
  du lieu (`placeCalendar`, Paris sans fuseau connu : un lieu choisi avant la #293 garde son hémisphère et le jour de
  Paris). Suivent la saison du lieu : l'herbe du pré (`MeadowManager`), les arbres saisonniers (`EntitiesManager`), la
  limite de la neige des hauteurs et l'allure dans la neige (`GameScene.getGroundSeason`), le tapis de feuilles
  (`autumnProgressAt`, 1er mars au 31 mai au sud), le thème saisonnier « Auto » (automne de la carte, pas du
  calendrier de Paris) et la **météo automatique** : parts de la saison du lieu, jour tiré dans le fuseau du lieu,
  brouillard avant 11 h et orages de 13 h à 21 h à l'heure du lieu (`autoWeatherAt(date, auto, place)`,
  `cloudinessAt`, `autoWeatherChanges`). Les heures de l'aperçu de « Météo de la carte » sont celles du lieu choisi.
  Sans lieu (ou à Paris) : rien ne change, empreinte du programme figée dans `tests/WeatherSchedulePlace.test.ts`.
  Limites : les tropiques reçoivent les quatre saisons selon le signe de leur latitude (pas de saison sèche et humide) ;
  les créneaux de 30 min restent calés sur l'heure du monde, décalés d'un quart d'heure pour un fuseau au quart
  d'heure (Népal, Chatham) ; le tirage quotidien de la jungle reste au jour de Paris.
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
- **Imports dans `play/` : alias `@wa/...`, jamais de chemin relatif qui remonte** (`../`). `@wa/*` pointe sur
  `play/src/*` (`play/tsconfig.json`, Vite, Vitest) : `import { gameManager } from "@wa/front/Phaser/Game/GameManager"`,
  pas `"../../../Phaser/Game/GameManager"`. Vaut pour tout fichier créé ou modifié, tests compris
  (`@wa/front/...` au lieu de `../../../../../src/front/...`). Seul un fichier voisin du même dossier s'importe en
  `./`. Le code amont encore en relatif est converti quand on le touche.
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
Le bandeau décrit aussi les fonctionnalités et correctifs ajoutés depuis le front chargé, chacun suivi
de son auteur en plus discret (« … — Hervé », `Components/ReleaseNoteItem.svelte`), le même nom public que
dans « Outils → Nouveautés » ; une ligne sans auteur s'affiche sans tiret.
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

### Animaux terrestres et eau du relief

Front seul pour le comportement (`Phaser/Game/Wander/`), plus un réglage de carte. Vaut pour **tous** les animaux
promeneurs : ceux de la jungle et ceux posés sur la carte (champ `wander` : chiens, chats, canards). Un animal mené
par son maître ne change pas.

- **Ils n'entrent pas dans l'eau** (`WanderWater.ts`, pur) : une case de 32 px est mouillée dès qu'une de ses quatre
  cellules de relief porte 2 px d'eau (`WET_ON_PX`), et le reste jusqu'à moins de 1 px (`WET_OFF_PX`) : une rive qui
  oscille ne bouge pas. L'eau lue est le dernier état envoyé par le serveur (`TerrainWater.settledDepthAt`), sans le
  glissement d'affichage : la même eau pour tous (mais voir les limites : entre 1 et 2 px, la case dépend de ce que
  le navigateur a vu avant). Les cases mouillées sont fermées dans la grille des promeneurs
  (`WanderingCharactersManager.refreshMap`), relue au plus deux fois par seconde et seulement si le serveur a annoncé
  un nouvel état.
- **Ils fuient l'eau qui monte** : quand des cases deviennent mouillées ou sèches, seuls les animaux dont le territoire
  (rayon + 2 cases) les touche recalculent leur promenade, et ils **courent** (192 px/s, en ligne droite) de là où ils
  sont jusqu'à leur nouvelle place au lieu d'y sauter. Un lac au repos ne dérange personne.
- **Ils boivent** (`WanderSchedule.computeDrinkDestination`, `isDrinkLeg`) : une étape de 20 s par intervalle, décalée
  par animal ; destination = une des 6 rives les plus proches du nid dans son rayon (case sèche et libre qui touche
  une case mouillée par un côté, sans mur entre les deux, `shoresOf`), la première atteignable. Arrivé, il se tourne
  vers l'eau (`WanderPose.drinking`). Tout se déduit de l'identifiant, du numéro d'étape et de la carte : même rive
  pour tous ceux qui voient les mêmes cases mouillées, sans réseau. Sans eau à portée, promenade habituelle.
- **Animation** (`WanderDrink.ts`, pur) : aucune planche n'a d'image « boire » ; l'image debout s'incline vers l'eau
  (de profil, 16°) ou s'accroupit (de face ou de dos), la tête va et vient d'un pixel, puis l'animal se redresse un
  quart du cycle de 2,4 s. Pose fixe en mouvement réduit.
- **Réglage** : `settings.life.drinkInterval` (secondes, 20 à 3600, 120 par défaut), curseur « Intervalle entre deux
  boissons » de l'outil Vie, actif même quand les poissons sont coupés. Champ facultatif `drinkInterval = 8` de
  `UpdateLifeSettingMessage` : un navigateur plus ancien qui enregistre les autres réglages laisse celui-ci tel quel.
- **Nids** : le nid d'un animal de la jungle est la case libre la plus proche de son arbre ; une case mouillée n'est
  pas libre, donc l'eau qui prend le nid le déplace, et l'animal court au nouveau (`setFreeCharacters`). Un animal
  posé sur la carte garde son nid, même sous l'eau.
- **Limites** : la fuite va en ligne droite (elle peut couper un coin d'eau ou d'objet) ; un animal posé dont le nid
  est sous l'eau y reste ; une carte entièrement inondée fige les animaux ; une case entre 1 et 2 px d'eau est
  mouillée pour un navigateur qui l'a vue plus haute et sèche pour un navigateur arrivé depuis : deux joueurs peuvent
  alors voir un animal à deux endroits, jusqu'à ce que l'eau monte ou descende ; l'eau des piscines était déjà
  évitée, on n'y boit pas ; pas de ronds dans l'eau ; seuil de 2 px choisi sans mesure.

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
- **Jour dans le monde** (menu de l'horloge) : « Matin », « Midi » et « Soir » se lisent à la **hauteur du soleil**,
  pas à une heure (18 h 30 solaire, c'est la nuit noire d'un hiver de Paris et le plein jour d'un été de Reykjavik) ;
  `worldCityOf` de `WorldDaylight.ts`, calcul du jeu (`sunPositionAt`, `trueSolarMinutes`) :
  - **Matin** : la ville dont le soleil est le plus près de **+10°** parmi celles où il est à plus de 2° et monte
    (une heure ou plus avant le midi solaire vrai) ; **Soir** : **+8°** parmi celles où il descend (une heure ou plus
    après). À ces hauteurs les ombres du soleil sont entières (elles s'effacent de 6° à 2°) et au plus long (un objet
    en jette six à sept fois sa hauteur, coupée à la longueur réglée), dans une lumière dorée (le soleil blanchit de 5°
    à 35°) ; le soir est un peu plus bas, plus chaud. Sous 2° plus d'ombres : ni matin ni soir. Sans ville dans la
    bonne phase (jamais vu avec la liste), la plus proche en hauteur dont le soleil va dans le bon sens, puis la plus
    proche en hauteur. La ville affichée est gardée tant que son soleil reste à 6° de la cible et dans la bonne phase
    (soir gardé de 14° jusqu'à 2°, jamais après le coucher) : environ un changement de ville par heure.
  - **Midi** : la ville la plus proche de son midi solaire vrai, gardée tant qu'elle en est à 50 min au plus (toujours
    à moins d'une heure).
  - **Villes du nord** (PR « lieux du ciel du monde ») : avec la liste d'origine (37 villes), mesuré minute par
    minute (21 mars, juin, septembre, novembre, décembre 2026), le soleil retenu n'était entre 2° et 16° que 81 à 96 %
    du temps le matin et 80 à 97 % le soir, avec des pires cas à 45° (matin du 21 juin, Anchorage à 19:41 UTC) et 36°
    (soir du 21 novembre, Honolulu à 00:40 UTC). Cause mesurée : pas les deux océans en soi, mais la **latitude**. En
    été boréal le soleil d'une ville à 50-65° N passe 10° en montant des heures avant celui d'une ville tempérée de même
    longitude ; en hiver boréal il descend à 8° tôt l'après-midi. Il manquait donc des villes du nord dans le Pacifique
    Nord, en Extrême-Orient russe et à Terre-Neuve ; aucune ville du sud (Papeete, Apia, Ushuaïa, Sainte-Hélène…) n'a
    été retenue par la recherche. Ajoutées : **Unalaska** (53,89 N, 166,53 O, `America/Anchorage`), **St. John's**
    (47,56 N, 52,71 O, `America/St_Johns`), **Khabarovsk** (48,48 N, 135,08 E, `Asia/Vladivostok`),
    **Petropavlovsk-Kamtchatski** (53,02 N, 158,65 E, `Asia/Kamchatka`), **Anadyr** (64,73 N, 177,52 E,
    `Asia/Anadyr`) ; coordonnées de Wikipédia, fuseaux de la base tz (`zone1970.tab`). Après, minute par minute le 6
    et le 21 de chaque mois : au moins **97,0 %** du temps entre 2° et 16° pour chaque jour et chaque moment, pire cas
    **20,2°**. Ce qui reste : les matins d'équinoxe vers 16 h UTC (Vancouver ~19°), le soir de juin vers 11 h 30 UTC
    (Katmandou ~20°), quelques nuits UTC de novembre et février (Bangkok ~20°). Un test garde la couverture (le 6 et
    le 21 de chaque mois, au quart d'heure : 95 % au moins, 21° au plus). Effets : l'**heure choisie** et **Midi**
    peuvent tomber sur ces villes (ex. 18 h 30 le 21 juin à 06:00 UTC : Unalaska au lieu d'Auckland) ; un **point
    cliqué** près d'elles porte leur nom et leur fuseau.
  - **Pluie** et **Neige** (sous les moments, goutte et flocon) : le ciel d'un lieu où il pleut (ou neige) **en ce
    moment**, d'après la météo réelle. Au clic, le navigateur demande au pusher `/real-weather/world` (authentifié,
    30 requêtes/min par joueur comme les autres routes météo), qui pose **une seule** requête à Open-Meteo pour tous
    les lieux (`openMeteoWorldUrl` : coordonnées séparées par des virgules, `current=weather_code,temperature_2m,
    relative_humidity_2m,precipitation,is_day`), gardée 10 min pour tout le pusher (`WorldWeatherService`, une
    requête partagée entre clics simultanés, nouvel essai une minute après un échec, rien de plus vieux que 30 min) ;
    le navigateur garde la réponse 5 min (`WorldWeatherClient`). Jamais en fond : seulement au clic. Chaque lieu de
    la requête compte comme un appel du quota gratuit (46 lieux, 10 000 appels/jour) : au plus 6 requêtes par heure.
    Lieux : les villes du ciel du monde (`WORLD_CITIES`, déplacées dans `common/WorldCities.ts` pour le pusher) et
    quatre lieux réputés enneigés, demandés pour la pluie et la neige seulement, pas pour les moments
    (`WORLD_WEATHER_EXTRA_PLACES` : Sapporo, Tromsø, Nuuk, Ushuaïa ; Wikipédia et `zone1970.tab`). **Règle** comme
    le jeu (`WorldWeatherPick.fallOf`) : il tombe quelque chose quand le code WMO est une pluie, une neige ou un
    orage (`weatherFromWmoCode`, même avec 0 mm comptés : le jeu dessine alors une pluie faible), et c'est de la
    **neige** dès la moitié de neige au thermomètre mouillé (`snowShare` de `Precipitation.ts`), pas d'après le code
    (un code de neige par 9 °C est dessiné en pluie). **Choix** : de jour d'abord (pour la voir), puis la plus
    forte, puis par nom ; un second clic prend le lieu suivant de cette liste, en boucle. Le lieu est marqué sur la
    carte du monde (le point jaune du lieu suivi), l'horloge prend son heure (il peut y faire nuit). Le menu dit
    « Ciel de Lisbonne : il y pleut (2,4 mm/h) » ou « … il y neige (0,4 mm/h d'eau) », « faiblement » sans eau
    comptée, puis « Il n'y pleut plus » quand la météo du lieu suivi (relue toutes les 5 min) ne le montre plus ; le
    lieu reste. Aucun lieu : « Il ne neige dans aucune ville de la liste en ce moment », échec : « La météo du monde
    est indisponible pour l'instant : rien n'a changé » ; le lieu suivi ne change pas. Ordre : un point cliqué
    l'emporte, puis le lieu de pluie ou de neige, puis le moment ; un moment ou un clic sur la carte quitte le lieu
    (`clearWorldFall`). Choix gardé dans le navigateur (`nightWorldFall`, par le nom du lieu).
  - **Heure choisie** : inchangée, la ville dont l'**heure solaire vraie** est la plus proche (avec l'équation du
    temps, ±16 min selon la saison), gardée à 50 min près. **Point cliqué** sur la carte : le menu dit alors
    « Ciel de … (point choisi sur la carte) », surligné, puisqu'aucun moment n'est enfoncé. Le point garde ses
    coordonnées pour le soleil et la météo ; il ne porte le **nom** d'une ville de la liste qu'à 150 km d'elle au plus
    (`NAMED_POINT_RADIUS_KM`, distance orthodromique, `nearestCityOf`). Plus loin, forme courte (horloge, pastille
    météo) : la ville de repère et sa distance, « Auckland 4 000 km » (« Auckland 4,000 km » en anglais), jamais la
    ville seule, qui reste réservée à un point à 150 km au plus ; un nom de ville de plus de 14 caractères y est
    coupé d'une ellipse, la distance gardée (« Petropavlovsk… 12 300 km », `shortCityName`), pour que la ligne de
    l'horloge tienne. La pastille ne coupe plus à la virgule le nom d'un point (la virgule du séparateur de milliers
    anglais), seulement celui d'une ville du lieu de la carte. Forme longue, avec les coordonnées en degrés entiers « 72° S 170° E · Auckland à 4 000 km » (sans parenthèses : le tableau le met déjà entre parenthèses, « Ton air (…, −34 °C) » ; `WorldPlace.longName` : menu de
    l'horloge, fiche météo personnelle, « Météo expliquée ») ; ouest « O » en français, « W » en anglais. Avant, un
    clic dans l'océan Austral s'appelait « Auckland » comme le lieu du serveur : deux fiches « Auckland » à 14 °C et
    −34 °C. Son **fuseau** : celui de la ville la plus proche à 1 000 km au plus (`CITY_TIME_ZONE_RADIUS_KM`, heure
    civile de la région, heure d'été comprise), sinon celui de sa longitude, `Etc/GMT±N` (une heure par 15°, signe
    inversé : `Etc/GMT-11` = UTC+11) : la ville la plus proche d'un point de l'Antarctique peut être à plusieurs
    heures de lui. Les cases de la liste sont espacées : la plupart des clics à terre, même en Europe, se nomment
    désormais par leurs coordonnées. La carte du monde du menu s'ombre avec le voile du jeu lui-même
  (`worldShadeAt` = `nightOpacityAt` vu de chaque point) : plein jour jusqu'à −0,833°, assombrie jusqu'à −6°, nuit
  au-delà. Dessinée pixel par pixel (240 × 120) : environ 7 ms par dessin (mesuré en conteneur Linux sur un Mac), une
  fois par seconde tant que le menu est ouvert en mode monde.
- **Mode Basique** : il coupe le cycle (plein jour). Le menu de l'horloge le dit en une ligne et surligne le mode
  effectif, « Désactivé », pas le mode enregistré ; celui-ci revient en quittant le Basique (`effectiveNightModeStore`,
  lu aussi par `NightManager`). Le panneau du ciel du monde est masqué tant que le Basique s'applique.
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

- **Carte** : une seule gomme (« Gomme ») pour toute la couche carte, au niveau choisi : sols, murs, portes, fenêtres,
  dalles de palier, escaliers et rampes (un geste = une entrée d'annulation ; l'ancienne « Gomme de palier » est
  retirée). **Ce qui est entouré en rouge au survol est exactement ce que le clic efface**, à sa vraie place et avec sa
  vraie forme : l'escalier ou la rampe entier, la porte, la fenêtre ou le mur avec toute sa hauteur (un mur haut se
  prend aussi par son haut), la dalle à son altitude, la case de sol. Règle commune à l'aperçu et à l'action :
  `MapLayer/MapLayerTarget.ts` (`eraseTargetUnder`, `erasePlan`, `applyErase`) ; la cible est désignée par ce qui ne
  change pas d'une lecture de la carte à l'autre (niveau et première marche d'un escalier, segment d'un mur, case d'une
  dalle) et retrouvée sur la carte relue juste avant l'enregistrement. Priorité sous le pointeur : escalier ou rampe,
  puis porte, fenêtre, mur, puis dalle, puis sol (`ERASE_PRIORITY`). Ce que le geste touche au départ décide : parti
  d'un escalier, il l'efface (sa trémie est rebouchée) ; parti d'un mur (ou d'une porte, d'une fenêtre), il efface les
  segments de la ligne de ce mur (rangée d'un mur horizontal, colonne d'un vertical), de la case de départ à celle
  d'arrivée, avec leurs portes et fenêtres, sans toucher aux sols ; ailleurs, sur un palier il retire les dalles du
  rectangle, au sol il n'efface que les sols survolés, jamais un mur traversé. Un mur vertical se vise à 10 px de part
  et d'autre de son axe (`ERASER_VERTICAL_HIT_WIDTH`). Pendant le glisser, ce qui partira est en rouge. La gomme suit
  le niveau choisi dès que la salle a les paliers, même sans les murs d'étage ; en « Auto », un escalier sous le
  pointeur donne son niveau de départ, même là où son image passe sur un palier plus haut.
  Couleurs de l'outil Carte : rouge = sera effacé (ou refusé), blanc = sera pris et déplacé (fenêtre, escalier, rampe),
  bleu = sélection du mode Hauteur, vert = sera posé ou modifié. Une fenêtre haute se prend aussi par son haut ; une
  porte haute déjà posée est entourée sur toute sa hauteur en mode Porte.
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
**vitesse de l'eau** (1 par défaut depuis le 2026-11-22, comme en vrai : une pluie remplit un lac en des heures,
une source de 100 m³/h verse 100 m³ par heure réelle ; 60 pour un essai : une minute pour une heure ; jusqu'à 1 000). **Source** et **puits** sont des
propriétés d'objet (`waterSourcePropertyData`, `waterSinkPropertyData`, débit enregistré en litres par minute, réglé en m³/h, L/s, L/min ou m³/s, de 0 à 1 000 m³/s), à ajouter à
n'importe quel objet depuis son panneau : une source verse à son pied, un puits retire l'eau qui arrive au sien. Le
pied (milieu du bas de l'image) est écrit dans la propriété par l'éditeur (`anchorX`, `anchorY`,
`Terrain/WaterAnchor.ts`), car `back` ne connaît pas la taille des objets.

**Niveau tenu** (champ facultatif `level` des deux propriétés, en pixels d'altitude, réglé en mètres dans le panneau,
interrupteur « Tenir un niveau ») : une source ne verse que tant que l'eau à son pied est sous ce niveau, un puits ne
prend que l'eau au-dessus (trop-plein). À chaque pas, l'un et l'autre sont limités à ce qui amène l'eau de leur disque
au niveau (`heldFlow` de `WaterGrid.ts`) ; un puits à niveau ne prend que dans son disque, il n'aspire pas le plan
d'eau. Un lac reste ainsi plein quelle que soit la météo, sans déborder. Sans `level`, rien ne change. Le repère de
l'outil Relief écrit le niveau après le débit (« +60 m³/h → −0.5 m »).
Le panneau enregistre la propriété entière à chaque changement (`onSetProperty`) : décocher « Tenir un niveau »
retire bien le niveau de la carte (une fusion le gardait, corrigé le 2026-11-20).
**Pipette du niveau** (bouton à côté de « Tenir un niveau », source et puits) : un clic sur la pipette arme la visée
(viseur sur la carte, aide et aperçu « Sous le curseur : eau −1,2 m (sol −3,6 m) » dans le panneau), le clic suivant
sur la carte prend le niveau à ce point, active « Tenir un niveau » et l'enregistre comme une saisie. Valeur prise :
la surface de l'eau s'il y en a (tenir un lac à son niveau), sinon le sol ; Alt + clic prend le sol sous l'eau. Même
lecture que la pastille des étages (`groundReadingAt`, fond des piscines, dernier état du serveur, aussi sur une carte
sans relief), au décimètre comme le champ, bornée vers l'intérieur à −8,7 … 17,5 m (`Terrain/WaterLevelPipette.ts`).
Seul un clic sans glissement prend la valeur : glisser déplace la vue, même dans l'éditeur ; Espace + glisser et le
bouton du milieu aussi. Le clic de visée ne fait rien d'autre : ni marche, ni objet choisi ou déplacé
(`waterLevelPipetteArmed`/`waterLevelPipetteOwnsPointer` dans `EntitiesManager` et `EntityEditorTool`, qui
n'ouvre plus une piscine survolée pendant la visée). Échap (capturé, il ne désélectionne pas la source) ou un second
clic sur la pipette annule ; fermer le panneau désarme. Arrondie au décimètre, la valeur prise est à ±1,5 px de la
surface réelle : un lac « tenu à son niveau » peut encore monter ou cesser d'être alimenté de cet écart.

**Modèle** (`libs/map-editor/src/Terrain/`, lu à l'identique par `back` et par le front). Le relief est un champ
facultatif du WAM (`terrain` : hauteurs par cellule de 16 px, 0 au sol, négatif creusé, par blocs de 16 × 16 ; absent =
carte plate, aucune migration). Échelle des lampes : une case = 1,2 m² de sol (`TILE_AREA_M2`), donc 1 mm de pluie =
1,2 litre par case.

**L'eau est simulée par cellules** (`WaterGrid`) : chaque cellule a une hauteur d'eau, et à chaque pas l'eau passe
vers les voisines dont la surface (sol + eau) est plus basse. Une source fait donc une flaque à son pied, qui coule
dans la pente ; un creux plein déborde par son point le plus bas ; sur sol plat une inondation monte et avance tant
que l'eau arrive. La surface de l'eau est plafonnée à 18 px au-dessus du sol : juste au-dessus de la profondeur où l'on nage (16 px, environ 0,5 m), loin sous le premier palier (52 px) ; ce plafond vaut pour toute l'eau, versée, tombée ou qui coule (sans lui, une forte pluie sur une large région creusée empilait l'eau en dôme, la surface en pente partout, parce que l'eau n'avance que d'une cellule par pas) : on
garde les pieds au sec à l'étage. La grille couvre l'emprise du relief et des sources, plus 48 cellules de marge
(600 × 600 au plus) ; l'eau qui en sort est perdue. Un premier modèle « une cuvette, un niveau » a été essayé puis
retiré : l'eau y apparaissait au point le plus bas de toute la région creusée, loin de la source.

**L'eau vue en mouvement.** Le navigateur dessine ce qu'il sait déjà du courant (`Terrain/WaterFoam.ts`, logique
pure ; `Terrain/WaterFlowView.ts`, dessin), sans rien demander au serveur : de l'écume portée par le courant (traits
clairs qui naissent là où l'eau court, d'autant plus nombreux et plus longs que le courant est fort, 240 au plus à
l'écran, rien en eau calme ; dès 2 px d'eau, alors qu'un avatar n'est emporté qu'à partir de 8, `waterCurrentAt` avec
son seuil `shallowest`), un tourbillon sur chaque puits qui a de l'eau autour de son disque (il tourne de 0,2 à 1,5
tour par seconde selon le débit réglé) et des ronds qui s'élargissent sur chaque source. Dessiné 15 fois par seconde ;
chaque navigateur a ses propres traits (un décor, rien n'est partagé). Rien pour qui a demandé moins de mouvement.

**Finesse qui s'allège quand le serveur sature** (`Terrain/WaterLoad.ts`, `TerrainWaterManager`). Le serveur des
salles n'a qu'un fil : un pas de l'eau qui dure autant que l'intervalle entre deux pas (100 ms) retient tout le
reste (déplacements, chat, autres salles). Chaque pas est chronométré ; la durée est une moyenne glissante sur
environ 2 s (un pas lent isolé ne change rien). La finesse et les envois demandés par la carte deviennent des
**plafonds** :

- au-delà de **50 %** de l'intervalle : la finesse baisse, d'un coup jusqu'à ce qui devrait suffire (le coût suit
  la finesse), d'un cran au moins ; à la finesse 1, les envois aux joueurs passent à 1 par seconde ;
- sous **25 %** pendant 10 s : un cran est rendu (les envois d'abord), jamais au-dessus du réglage de la carte ;
- entre les deux : rien ne bouge, pour que la finesse n'oscille pas.

Par salle : une carte lourde ne dégrade pas les autres. L'outil Relief le dit sous le curseur (« Serveur chargé :
finesse réduite à 5 sur 8 »), par `easedPrecision` et `easedUpdates` de `TerrainWaterStatsMessage` (champs 10 et
11, absents quand rien n'est réduit). Le réglage enregistré de la carte ne change pas. Effet : une eau moins
précise (vagues plus amorties, fronts moins nets) pendant les moments les plus lourds, un tsunami compris. Sans
inertie, seuls les envois peuvent être réduits. Seuils posés par raisonnement, non calés sur une mesure en jeu.

**L'eau à inertie en quatre passes par plage de lignes** (`Terrain/WaterKernel.ts`). Les quatre balayages d'un
mouvement (flux, ce qu'une cellule peut donner, mise à l'échelle, profondeurs) sont des fonctions à part qui
prennent une plage de lignes : la forme dont un découpage sur plusieurs fils a besoin. Une passe ne lit rien
qu'une passe en cours écrit sur d'autres lignes, donc des bandes de lignes donnent les mêmes chiffres dans
n'importe quel ordre (`tests/WaterKernel.test.ts`). L'eau perdue (`lostPx` : bord de la carte, plafond des crues)
est sommée ligne par ligne, puis les lignes dans l'ordre : la somme ne dépend plus de qui calcule quelles lignes.
Ce bilan a changé une fois dans ses derniers chiffres (3 pour cent mille milliards au plus) ; l'eau, elle, est
identique : `WaterFingerprints.test.ts` garde deux empreintes par scénario, celle de l'eau seule (inchangée depuis
`eb17d9b92`) et celle de tout, réenregistrée pour les huit scénarios qui perdent de l'eau.
**Noyau de l'eau compilé en WebAssembly** (`libs/map-editor/kernel/water_kernel.c`, `Terrain/WaterKernel.ts`,
`Terrain/WaterKernelWasm.ts`). Les quatre passes d'un mouvement de l'eau à inertie (flux, ce qu'une cellule peut
donner, mise à l'échelle, profondeurs) existent deux fois, au bit près : en TypeScript (`WaterKernel.ts`, la
référence et le repli) et en C compilé en WebAssembly. **Éteint par défaut**, et allumé sans toucher au code :

- **serveur** : variable d'environnement `WATER_KERNEL=wasm` de `back` (`Ground/ServerWaterKernel.ts`). Elle vaut
  pour le fil des salles et pour les fils de calcul (`GROUND_THREADS`), qui héritent de l'environnement. Le journal
  le dit au démarrage de la première salle : « The water of the rooms is computed by the WebAssembly kernel », ou
  « … by the TypeScript kernel », suivi de la raison si le noyau compilé n'a pas pu être chargé ; chaque fil de
  calcul ajoute sa ligne ;
- **navigateur** (eau de la météo locale, eau rapide) : `localStorage.setItem("waterKernel", "wasm")` dans la
  console, puis recharger ; lu au démarrage de l'eau locale, transmis à son worker, qui l'écrit dans la console ;
- **code** : `setWaterKernel("wasm")` pour les grilles créées ensuite, ou le sixième paramètre de `WaterGrid`.

- **Mesure** (carte d'Antoine inondée, 480 × 320, finesse 3, médiane de 300 pas, trois passes alternées) : un pas
  de la grille 10,5 → 6,6 ms (×1,6) ; les passes seules 9,7 → 5,8 ms (×1,67). `-O3` et le SIMD n'apportent rien.
- **Mémoire** : le noyau compilé EST l'allocateur des tableaux de sa grille (`WaterArrays`) : ils sont découpés
  dans sa mémoire WebAssembly, faite une fois au premier tableau ; le reste du code les lit comme des
  `Float32Array` ordinaires, sans copie. `setWaterKernel(noyau, partagé)` choisit où les grilles d'un fil gardent
  leurs tableaux.
- **Avec les bandes** (`GROUND_BANDS`) : la mémoire de la grille est partagée, elle part avec ses tableaux vers
  les fils d'appoint, qui y chargent chacun leur propre instance du module et appellent les mêmes passes sur
  leurs tranches de lignes (`InertiaMove.compiled`). Le module est construit deux fois du même source, pour une
  mémoire propre et pour une mémoire partagée. Chaque fil a sa pile à lui dans cette mémoire (le pointeur de pile
  du module est réglé par instance), et le script de construction refuse un noyau qui aurait des données ou des
  variables globales : rien du module n'est partagé à l'insu des fils.
- **Mesure du pas entier dans le montage du fil de calcul** (carte d'Antoine inondée, apports, passes et envoi
  compris, médiane de 300 pas, deux passes alternées, machine chargée à 10) : TypeScript 11,5 ms sur une bande et
  7,0 ms sur deux ; noyau compilé 6,5 ms sur une bande et 4,0 ms sur deux. Processeur consommé par pas, tous fils
  compris : 11,9 et 12,8 ms en TypeScript, 6,9 et 7,5 ms avec le noyau compilé. Même eau dans les quatre cas.
- **Mêmes bits** : doubles entre la lecture et l'écriture d'un flottant simple, opérations dans l'ordre du
  TypeScript, `f64.max`/`f64.min` de WebAssembly (qui traitent NaN et les deux zéros comme JavaScript), table des
  puissances calculée par le TypeScript, ni `-ffast-math` ni contraction. Juge : `tests/WaterKernelWasm.test.ts`
  joue les 19 scénarios et une carte accélérée sur les deux noyaux côte à côte, compare tout à chaque pas, et
  vérifie les passes par plage de lignes ; il tourne aussi dans les tests de `play`, donc dans la CI de PR.
- **Construction** : `libs/map-editor/kernel/build.sh` (Docker seul : `clang` 19 de Debian 13), binaire de 3,9 Ko
  commité en base64 dans `WaterKernelWasm.generated.ts` avec l'empreinte de son source. Le job « Noyau de l'eau
  reconstruit » de `pr-checks` le reconstruit et compare, hors du contrôle exigé.
- **Repli** : si le chargement échoue, la grille calcule en TypeScript, la même eau, et le journal dit pourquoi.

**Où une grille d'eau garde ses tableaux** (`Terrain/WaterArrays.ts`). Les tableaux que les quatre passes lisent et
écrivent (profondeurs, sol, niveau de débordement, frottement, creux, côtés fermés, flux, ce que chaque cellule peut
donner, vitesses, eau perdue par ligne) sont demandés à un allocateur `WaterArrays` : mémoire ordinaire par défaut,
comme avant ; mémoire partagée entre fils (`sharedWaterArrays`, un `SharedArrayBuffer` par tableau) quand on le
demande, pour la grille (dernier paramètre de `WaterGrid`) ou pour toutes celles du fil (`setWaterArrays`). On peut
aussi donner une fabrique `(cellules, lignes) => WaterArrays`, appelée une fois par grille avec sa taille : pour une
mémoire dimensionnée une fois et qui ne grandit pas (celle d'un noyau compilé). C'est la
seule façon d'allouer : un découpage du pas sur plusieurs fils, ou un noyau compilé qui garde les tableaux dans sa
mémoire, en sont d'autres implémentations, et la grille ne sait pas où vivent ses tableaux. Rien ne le demande
encore : aucun comportement ne change. `WaterFingerprints.test.ts` rejoue ses 19 scénarios en mémoire partagée,
mêmes empreintes. Mesuré (banc commun, carte d'entrée inondée) : un pas coûte autant sur tableaux partagés que
sur tableaux ordinaires (9,14 contre 9,16 ms).

**Un pas de l'eau partagé entre plusieurs cœurs** (`Terrain/WaterBands.ts`, `back/src/Model/Ground/GroundBands.ts`,
`GroundBandWorker.ts`). **Éteint par défaut** : `GROUND_BANDS` (variable d'environnement de `back`, lue par
`Ground/ServerGroundThreads.ts`) dit sur combien de bandes chaque fil de calcul partage les pas de ses eaux : 1,
le fil seul, comme avant. À N, le fil de calcul démarre N − 1 fils d'appoint. Sans effet si `GROUND_THREADS` vaut 0
(le journal le dit au démarrage).
  - **Découpage** : chaque passe d'un mouvement est coupée en tranches de lignes, quatre par fil. Chaque fil
    **réclame** une tranche (une opération atomique sur un tableau partagé), la calcule, réclame la suivante ; le fil
    de calcul fait de même, puis n'attend que les tranches réclamées par d'autres. Un fil d'appoint lent à se
    réveiller ou privé de cœur ne retarde donc pas le pas : ses tranches sont prises par les autres.
  - **Identité au bit près** : une passe n'écrit, pour une ligne, que les cellules de cette ligne, et ne lit dans les
    autres lignes que des tableaux qu'elle n'écrit pas ; l'eau perdue est cumulée ligne par ligne par le fil de
    calcul. L'ordre et la taille des tranches n'ont aucun effet. Vérifié sur les 19 empreintes
    (`WaterFingerprints.test.ts`, tranches prises dans un ordre tiré au sort), sur de vrais fils à 2, 3 et 4 bandes
    (`back/tests/GroundBands.test.ts`) et sur le test d'identité du sol dans un vrai fil de calcul à 3 bandes
    (`RemoteRoomGround.test.ts`).
  - **Aucune attente active** : les fils d'appoint dorment (`Atomics.wait`) entre deux passes et entre deux pas, le
    fil de calcul dort en attendant une tranche. Ils apprennent les tableaux d'une grille par un message lu au
    réveil (`receiveMessageOnPort`), qui dit aussi quel noyau calcule (`kernel: "typescript"` ; un noyau compilé y
    viendrait avec sa mémoire). Mesuré : un fil de calcul et trois fils d'appoint au repos, 1,9 ms de processeur en
    2 s pour tout le processus.
  - **Perte d'un fil d'appoint** : endormi, il est retiré, l'eau continue avec une bande de moins, le journal le
    dit. Au milieu d'une tranche (ou si sa passe lève une erreur), le pas ne peut pas être fini au bit près : le fil
    de calcul attend une seconde au plus (`BAND_PATIENCE_MS`), puis s'arrête, et ses salles repartent du dernier
    instantané de leur eau par le mécanisme de perte d'un fil ; le fil relancé a une bande de moins, et plus aucune
    après trois pertes (`BAND_LOSSES_BEFORE_NONE`, dit dans le journal).
  - **Surchauffe du serveur** (`back/src/Services/CpuTracker.ts`, code d'origine WorkAdventure modifié) : le mode
    « overheat », où `SocketManager.handleUserMovesMessage` ne relaie plus les déplacements intermédiaires des
    joueurs, jugeait le processeur de tout le processus (`process.cpuUsage()`), fils de calcul compris. Avec le fil
    de calcul, l'eau le déclenchait alors que le fil des joueurs était au repos (beta : 60 % d'un cœur pour l'eau,
    9 % pour les joueurs). Il juge maintenant le fil qui l'appelle, celui des joueurs (`process.threadCpuUsage()`,
    Node 23.9 et plus ; à défaut, le processus comme avant). Même seuil (`CPU_OVERHEAT_THRESHOLD`, 80 % par
    défaut), même sens. Sans fil de calcul, la mesure baisse seulement de ce que V8 fait dans ses propres fils
    (ramasse-miettes, compilation).
  - **Repli quand la machine n'a pas de cœur pour les bandes** : un fil d'appoint qui a réclamé une tranche puis
    perd son cœur fait attendre le fil de calcul à la fin de la passe ; personne ne peut reprendre sa tranche (elle
    est à moitié écrite). Le fil de calcul chronomètre cette attente, pas après pas : au-delà de 20 ms dans un pas
    (`BAND_SLOW_WAIT_MS` ; moins d'1 ms en temps normal, 14 ms au pire mesurés sur une machine saturée), il calcule
    seul pendant dix secondes (`BAND_ALONE_MS`), fils d'appoint endormis, puis réessaie, et le dit dans le journal.
    La borne d'une seconde reste le dernier recours. Même eau au bit près, noyau TypeScript ou compilé. Sur
    `/metrics` : `workadventure_water_band_steps` (pas partagés depuis la dernière lecture),
    `workadventure_water_band_wait_p99_seconds` et `_max_seconds` (attente du fil de calcul par pas),
    `workadventure_water_bands_left_alone` (replis).
  - **Compte des tranches** : à la fermeture d'une salle, le fil de calcul dit à qui l'a démarré combien de
    tranches il a calculées lui-même et combien ses fils d'appoint (`GroundThreads.slices()`). Le test du sol entier
    à 3 bandes s'en sert pour prouver que les fils d'appoint ont travaillé : il demande au fil de calcul d'attendre,
    une passe sur cinquante, qu'un autre ait réclamé une tranche (`patientBands`, jamais demandé par le serveur).
  - **Eau sans inertie** (rattrapage, pose de l'eau, carte sans inertie) : aucune passe n'est partagée ; ses
    profondeurs et leur double, qui changent de place à chaque pas, sont tous deux en mémoire partagée, et les fils
    d'appoint apprennent le changement au pas à inertie suivant (`tests/WaterBands.test.ts`).
  - **Ce que mesurent le budget de l'accélération et le seuil d'allègement** : toujours la durée d'horloge du pas
    dans le fil de calcul. Avec des bandes elle baisse alors que le processeur total monte : ces deux garde-fous ne
    voient pas ce que les fils d'appoint prennent aux autres cœurs.

**L'eau se pose à la fin du rattrapage** (`WaterSimulation.liveAgain`, `settle`). Le rattrapage d'une salle vide fait
vivre l'eau sans inertie par pas de 600 s, et chaque pas ne la déplace qu'une fois : il la laisse entassée là où
elle est arrivée et creusée là où elle est partie. L'eau à inertie repartait de ces niveaux inégaux : de fausses
vagues et une poussée d'écume à chaque retour dans une salle restée vide. Une fois le temps manqué vécu, l'eau fait
maintenant jusqu'à 400 pas sans inertie et sans aucun apport (ni pluie, ni source, ni puits, ni évaporation : le
temps ne passe pas), qui ne font que la niveler dans ses lacs ; elle s'arrête plus tôt si elle est au repos.

- **Qui compte le temps** : la prairie. `liveAgain` rend `true` tant que l'eau veut d'autres tours ; le rattrapage
  de la prairie les lui donne dans son budget de 8 ms par tour, et `catchingUp()` reste vrai jusqu'au bout. Le fil
  des salles et le fil de calcul passent par le même câblage (`GroundSimulation`).
- **Volume** : inchangé dans un lac fermé (test) ; ne part que ce qui sort par le bord de la carte ou dépasse le
  plafond des crues, compté dans les pertes comme à tout pas.
- **Mesuré sur la carte d'Antoine en crue**, cellules avec écume 30 s après la réouverture (régime permanent :
  4 300) : 10 min d'absence 13 800 → 2 100 ; 1 h 24 400 → 2 000 ; 1 jour 44 300 → 5 500. Après un jour il reste
  une houle : l'écume remonte à 14 700 cellules à 2 min (20 200 avant). Le réveil s'allonge de 1,5 à 3,5 s
  (1,2 à 2,6 s de calcul, étalés).
- **Limites** : les drains des pièces et les pompes des piscines ne tournent pas pendant ces pas (aucun temps ne
  passe) ; rien vu à l'écran.

**L'allègement compte toutes les salles du fil** (`WaterLoads`, `threadWaterLoads` dans `WaterLoad.ts`). Chaque
salle ne regardait que ses propres pas : deux grandes salles à 48 % de l'intervalle chacune saturaient le fil sans
qu'aucune ne s'allège. Les durées moyennes des pas de toutes les eaux du fil s'additionnent maintenant, et c'est la
somme qui est comparée aux seuils de 50 % et 25 %.

- **Partage** : quand la somme dépasse 50 %, toutes les eaux du fil s'allègent en même temps, du même rapport
  (finesse × 50 % / part du fil, un cran au moins). La plus lourde rend donc le plus de millisecondes, aucune n'est
  épargnée, et celle dont le pas est chronométré en premier ne paie pas pour les autres. Les envois ne sont réduits
  que lorsque plus aucune eau du fil n'a de finesse à rendre. La restitution est commune aussi : les envois
  d'abord, puis un cran de finesse pour chacune, après 10 s sous 25 %.
- **Sortie** : une salle qui ferme, ou dont la carte n'a plus d'eau, se retire (`WaterLoad.release`) ; les autres
  retrouvent leur finesse.
- **Périmètre** : « le fil » est le module chargé. Les salles du serveur partagent celui du processus ; un fil de
  calcul (#495) aura le sien, comme le navigateur qui simule son eau. Les pas de la prairie ne sont pas comptés.
  Un test qui crée plusieurs eaux vide le registre entre deux cas (`threadWaterLoads.clear()`), ou donne à chaque
  eau son registre (`new WaterLoad(100, new WaterLoads())`).
- **Limite** : une salle légère est allégée du même rapport qu'une lourde, donc elle perd de la finesse pour un
  gain faible. Non mesuré en jeu ni sur le VPS ; seuils inchangés.

**Petits gains sur le fil du serveur, à modèle inchangé** (lot 1 de l'étude du serveur de l'eau, novembre 2026).
Le processus des salles n'a qu'un fil ; cinq changements de plomberie, aucun de physique :

- **Compression des états envoyés** (`toldZip` dans `TerrainWaterManager`) : gzip avec la stratégie RLE de zlib
  (plages d'un même octet, sans recherche de chaînes répétées). Les états sont des différences avec l'état
  précédent : des plages de zéros et de quelques valeurs. Mesuré sur 2 259 charges réelles de la carte d'entrée de
  la beta : différences presque vides 2,0 → 0,46 ms et −9 % d'octets ; différences partielles 6,5 → 1,3 ms et
  −4 % ; vitesses 0,27 → 0,07 ms et −4 % ; états entiers (un toutes les 30 s, et à l'arrivée d'un joueur)
  8,6 → 2,5 ms et +6 %. Le niveau 1 de gzip sans RLE coûtait +7 à +20 % d'octets pour un gain moindre : écarté.
  Les navigateurs décompressent comme avant. La sauvegarde (Redis) garde le gzip par défaut.
- **Rien d'écrit quand rien n'a été calculé** (`untold` dans `WaterSimulation`) : la grille n'est réécrite en octets et comparée à l'état
  connu de la salle que si un pas, un impact ou une nouvelle grille est passé depuis le dernier envoi. 600 × 600
  sans eau : 0,57 → 0,02 ms par pas ; lac au repos : 0,89 → 0,001 ms. Un test qui modifie la grille dans le dos du
  gestionnaire doit le dire (`manager["untold"] = true`).
- **`WaterGrid.writeDepths`** arrondit sans `Math.round` (mêmes octets) : 0,46 → 0,12 ms pour 153 600 cellules.
- **Sélections sans branchement** dans la boucle des flux de l'eau à inertie (`Math.max`, `Math.min`, `Math.abs`
  au lieu de `a > b ? a : b`, mêmes valeurs au bit près) : `grid.step` 13,1 → 10,1 ms sur la carte d'entrée
  mouillée à 70 %.
- **Rattrapage d'une salle vide borné en temps** (`MeadowSimulation.stepCatchUp`, `hurryCatchUp`) : les tranches du
  temps manqué étaient vécues par paquets de 150 toutes les 2 s, chaque paquet retenant le fil 0,3 à 0,5 s (34 fois
  pour une semaine). Elles sont vécues 8 ms à la fois (`CATCH_UP_BUDGET_MS`), avec 8 ms de pause
  (`CATCH_UP_PAUSE_MS`) : la moitié du fil au plus. Dire l'état à la salle (une fois par seconde) et le sauvegarder
  ont leur propre tour. Mêmes tranches, même ordre, même état final (test de différence dans
  `MeadowManager.test.ts`). Mesuré sur la carte d'entrée, 7 jours manqués : tour le plus long 422 → 15 ms ; avec
  les minuteurs réels, retard maximal de la boucle d'événements 467 → 18 à 38 ms selon la charge de la machine de
  mesure (99e centile 10,6 ms), rattrapage fini en 28 s d'horloge au lieu de 70 s. Le joueur qui entre pendant ce
  temps voit la prairie et l'eau avancer d'un envoi par seconde, comme avant. Un navigateur qui fait tourner la
  simulation pour lui-même ne rattrape jamais (il part d'un état donné, `seed`) : ce chemin n'y est pas atteint.

**Fil de calcul par salle** (lot 3 de la même étude, livré en plusieurs PR ; rien n'est activé tant que la dernière
ne l'est pas).

- **Sol commun** (`Terrain/GroundSimulation.ts`, PR 1). Le câblage de l'eau du relief et de la prairie était écrit
  deux fois : dans `GameRoom` pour le serveur, dans `LocalTerrainSimulation` pour le sol d'un joueur. Il vit
  maintenant dans `GroundSimulation` : l'air dit pluie ou neige aux deux, la neige qui fond sur la prairie coule
  vers l'eau, l'eau mouille la prairie, les avatars tiennent les portes ; en option les catastrophes qui agissent
  sur l'eau à chaque pas (averses, drains, boules) et le rattrapage d'un sol laissé seul (l'eau le vit alors avec
  la prairie). `strike` (comète : l'eau du cratère, puis la glace) et `burn` (boule de feu : l'eau, puis le sol)
  appellent les deux dans l'ordre que `GameRoom` suivait. Dans cette PR seul le navigateur s'en sert
  (`LocalTerrainSimulation`), sans changement de comportement : `GroundSimulation.test.ts` compare, sur 400 pas
  avec neige, comète et boule de feu, les états dits par un sol câblé à la main et par `GroundSimulation` (mêmes
  octets).
- **La vie aquatique relit l'eau moins cher** (`Life/WaterBodies.ts`, `Life/LandPlaces.ts`, `Terrain/CellMask.ts`,
  `AquaticLifeManager`). Fil de calcul allumé, ce qui tenait encore le fil des salles était la vie aquatique : deux
  fois par seconde elle relisait toute l'eau (étendues d'eau un pas sur deux, terres toutes les 5 s), 14 ms en
  moyenne et jusqu'à 57 ms par pas sur la carte d'entrée inondée, assez pour faire à elle seule le 99e centile du
  retard de la boucle. Quatre changements, à résultat identique : les cellules des piscines et les tuiles sous les
  ponts se demandent à un masque d'octets (`cellMaskOf`) au lieu d'une clé de texte fabriquée par cellule ;
  `waterBodiesOf` lit les cellules telles qu'elles sont tenues (`WaterView.cells`) au lieu de demander chaque
  voisine ; `landPlacesOf` demande chaque cellule une fois ; les murs, les arbres et les ponts de la carte ne sont
  relus qu'à un changement de carte (`mapChanged`), plus à chaque pas (ils parcouraient tous les objets de la carte :
  3 ms par pas). Mesuré sur la carte d'entrée inondée (Mac très chargé) : pas de vie 14,8 → 3,2 ms en moyenne,
  maximum 57 → 15 ms ; un pas ordinaire dure 1 à 2 ms, il reste un pas de 7 à 16 ms toutes les 5 s (relecture des
  terres). `WaterBodiesIdentity.test.ts` garde l'ancienne lecture comme référence : mêmes étendues, mêmes réponses
  cellule par cellule, mêmes tirages, mêmes poissons (population comparée à chaque état) le long d'une crue qui
  monte et redescend avec lac, étang, chenal, piscine, mur et porte qui se ferme et s'ouvre, sur la grille et sur
  un instantané ; mêmes terres avec murs et pont.
- **La vie ne relit ses lieux que quand un seuil est franchi** (`WaterView.crossings`, `WaterGrid.crossings`,
  `AquaticLifeManager`). La vie relisait ses étendues d'eau (au plus une fois par seconde) et ses terres (toutes les
  5 s) dès que l'eau avait bougé, donc toujours. Or ce qu'elle lit ne dépend que de trois profondeurs
  (`LIFE_DEPTHS_PX` : le film de 2 px où l'on boit et où le sol est sec, les 8 px d'un poisson, les 16 px d'un
  dauphin et du gué) et des portes. L'eau tient deux compteurs qui ne montent que lorsqu'une cellule franchit l'une
  de ces profondeurs (`swim` : 8 ou 16 px, ou une porte ; `land` : 2 ou 16 px), comparés quand on les demande
  (dans le fil des salles) ou publiés avec l'instantané (fil de calcul). La vie garde ses lieux tant que le
  compteur qui les concerne n'a pas bougé : elle aurait relu les mêmes. **Résultat identique**, vérifié par
  `AquaticLifeManagerCrossings.test.ts` : trois vies sur la même eau (relecture à chaque changement comme avant,
  compteurs sur la grille, compteurs sur un instantané) disent et sauvegardent la même chose et tiennent les
  mêmes lieux à chaque pas, le long d'une crue, puis d'une nappe qui franchit un seuil à la fois, puis d'une
  porte qui coupe le lac sans qu'aucune profondeur bouge ; cinq mutations (un seuil ou la porte oubliés) font
  chacune échouer le test. **Gain mesuré** : sur une eau immobile, plus aucune relecture. **Sur la carte d'entrée
  inondée, aucun** : tant que l'eau coule, des nappes minces franchissent un seuil quelque part à chaque seconde,
  même 60 s après l'arrêt des sources (30 relectures d'étendues et 6 de terres en 30 s, comme avant) ; les pas
  de 10 à 15 ms toutes les 5 s restent. Pour une eau qui coule, la suite est de calculer ces lieux dans le fil de
  calcul et de les publier.
- **Rattrapage de la vie aquatique borné en temps** (`AquaticLifeManager.stepCatchUp`, `hurryCatchUp`). Une salle
  vide depuis plus d'une minute fait revivre à sa vie le temps manqué (30 minutes au plus), par paquets de 120 pas à
  chaque tour, sur le fil des salles. Prévu pour 90 ms par tour ; sur la carte d'entrée inondée, où un pas coûte des
  millisecondes et relit ses lieux pendant que l'eau coule, un tour tenait le fil jusqu'à 2,4 s (13 s sur les 25
  premières secondes d'une salle rouverte après une demi-heure) : c'est le blocage vu à l'arrivée du premier joueur.
  Les pas sont maintenant vécus par tranches de 8 ms au plus (`CATCH_UP_BUDGET_MS`), avec 8 ms de pause
  (`CATCH_UP_PAUSE_MS`), comme la prairie depuis #489 : mêmes pas, même ordre, même état final
  (`AquaticLifeManagerCatchUp.test.ts`). Mesuré, même salle : tour le plus long 2 431 → 24 ms, rattrapage fini en
  6 s.
- **Rivages des terres lus en une question par cellule** (`LandPlaces.readShores`). Le pas de vie le plus long qui
  restait (toutes les 5 s, quand les terres sont relues) se décompose ainsi sur la carte d'entrée inondée (Mac au
  calme) : terres 2,1 ms, étendues d'eau 1,05 ms, population 1 à 2 ms, et **rivages 5,4 ms** : à la première soif
  d'un animal après chaque relecture des terres, chaque cellule était demandée pour elle-même puis par chacune de
  ses voisines. Une question par cellule : 5,4 → 2,0 ms, mêmes rivages (`WaterBodiesIdentity.test.ts` compare le
  rivage le plus proche depuis une cellule sur seize à celui que donne `atShore`, le long de la crue).
- **Catastrophes dans le sol d'un joueur** (`LocalTerrainSimulation`, `LocalTerrainWorker`). Le sol d'un joueur
  (météo d'un lieu choisi) ignorait les catastrophes de la salle : il les voyait sans que son eau en soit touchée.
  Il sait maintenant les recevoir, par le sol commun : `setCatastrophes` (averses, drains, boules du moment, qui
  agissent à chaque pas de son eau), `strike`, `burn`, `shatter`, `soak`, `ignite`, et les commandes du même nom
  dans le protocole de son worker (`LocalTerrainCommand`). Le contrôleur les lui envoie depuis la PR suivante
  (`LocalCatastropheRelay`, voir « Eau rapide »).
- **Façade du sol dans `back`** (`back/src/Model/Ground/RoomGround.ts`, `InlineRoomGround.ts`, PR 2). `GameRoom`
  ne tient plus `TerrainWaterManager` et `MeadowManager` : il parle à un `RoomGround` (démarrer l'eau, démarrer la
  prairie, arrêter, carte changée ; comète, boule de feu, glace brisée, averse qui mouille, feu posé ; niveau d'une
  boule, grille de l'eau et sa version pour la vie aquatique, feu pour les animaux ; glace d'une tuile, prairie
  faite ou non, rattrapage en cours pour les cabanes de pêche ; états entiers pour un joueur qui entre). Ce que le sol lit de la salle est demandé à chaque fois par `RoomGroundInputs` (avatars, averses,
  drains, boules, brouteurs, air, conditions et seuils du feu). La seule implémentation, `InlineRoomGround`, calcule
  dans le fil des salles avec les deux gestionnaires d'avant, câblés par `GroundSimulation` : même comportement.
  Deux ordres changent sans effet : à la fermeture d'une salle l'eau s'arrête juste avant la prairie (et non plus
  avant la vie aquatique) ; à une édition de carte la prairie relit la carte avant la vie aquatique (aucune des
  deux ne lit l'autre à ce moment-là). `back/tests/RoomGround.test.ts` compare, avec les vrais minuteurs simulés,
  ce sol à un sol câblé à la main comme `GameRoom` le faisait : 90 s de pluie et de neige avec une source, le
  drain d'un bâtiment (siphon sur un sol « Carte Sols »), averse, comète, boule traînée, drain, feu, boule de feu,
  glace brisée, redoux, carte changée ; puis une salle rouverte après trois heures (rattrapage). Mêmes messages à
  la salle, mêmes écritures Redis, mêmes niveaux de boule.
- **Vue de l'eau et instantané** (`Terrain/WaterView.ts`, `Terrain/BallLevels.ts`, PR 3). Ce qui lit l'eau sans la
  calculer (vie aquatique : `waterBodiesOf`, `stepPopulation`, `swim`, `AquaticLifeManager` ; niveau d'une boule)
  ne demande plus un `WaterGrid` mais une `WaterView` : `bounds`, `depthAt`, `canCross`, `restLevelAt`. `WaterGrid`
  en est une ; `WaterSnapshotView` en est une autre, sur une copie de la grille (`WaterSnapshot`) que
  `WaterGrid.publish` écrit : les profondeurs à chaque publication, le sol sous les boules et les côtés fermés par
  les portes seulement quand ils ont changé (compteur `shape`). La mémoire de l'instantané peut être partagée entre
  fils ; un compteur d'écritures (impair pendant une écriture) garantit qu'un lecteur ne prend jamais un état à
  moitié écrit, et `refresh` prend l'instantané en entier, pour qu'une boucle sur les cellules voie une seule eau.
  Le niveau au repos (`restLevelOf`) et la mémoire du niveau des boules (`BallLevels`) sont sortis de `WaterGrid`
  et de `WaterSimulation` sans changer de calcul. **Dans le fil des salles rien ne lit l'instantané** : la façade
  rend la grille elle-même, comme avant ; l'instantané sert au fil de calcul (PR 4). `WaterView.test.ts` : la vue
  répond comme la grille, cellule par cellule et au-delà des bords, après des pas, une porte fermée, une boule
  posée, déplacée, retirée, en mémoire propre et partagée ; mêmes étendues d'eau pour la vie ; même niveau de boule.
- **Le fil de calcul** (`back/src/Model/Ground/{GroundProtocol,GroundThreads,GroundWorker,HostedGround,
  RemoteRoomGround}.ts`, PR 4). **Éteint par défaut** : `GROUND_THREADS` (variable d'environnement de `back`) dit
  combien de fils le serveur consacre au sol de ses salles ; 0, valeur par défaut, garde le calcul dans le fil des
  salles (`InlineRoomGround`), exactement comme avant. Au-delà, `GameRoom` reçoit un `RemoteRoomGround` :
  - **Dans le fil** (`GroundWorker`, un `worker_threads` ; `back` tourne sous `tsx`, dont le fil hérite le chargeur,
    donc pas de compilation ni de changement d'image) un `HostedGround` par salle fait tourner les mêmes
    gestionnaires (`InlineRoomGround`), nourris par ce que la salle envoie au lieu de la lire.
  - **Le fil des salles envoie** (`GroundCommand`) : l'état que le sol lit de la salle (taille de la carte, avatars,
    averses, drains, boules, brouteurs, air, conditions et seuils du feu, météo réelle), comparé toutes les 100 ms
    et envoyé seulement s'il a changé ; la carte à chaque édition, **sans son relief tant que c'est le même objet**
    (le relief pèse la moitié d'une carte, et l'eau reconnaît une édition du relief à son objet : une copie du même
    relief lui ferait refaire sa grille et perdre ses courants) ; les catastrophes (comète, boule de feu, glace
    brisée, averse, feu posé), précédées de l'état du moment ; chaque position de boule demandée par la salle.
  - **Le fil répond** (`GroundTold`) : les messages pour les joueurs, déjà compressés, relayés tels quels ; avec
    chaque état de l'eau, l'état entier que la salle connaît (pour le joueur qui entre : compressé à ce moment-là,
    comme avant) ; après chaque pas de prairie, la prairie et les arbres pour qui entre, le feu vu par les animaux,
    la glace de chaque tuile (cabanes de pêche) ; les champs à sauvegarder, que le fil des salles écrit dans Redis
    (mêmes clés, mêmes valeurs) ; les demandes de météo passée (le fil des salles seul parle à l'extérieur).
  - **L'eau lue par la salle** (vie aquatique, cabanes, niveau d'une boule) est l'instantané partagé
    (`WaterSnapshotView`), publié après chaque pas d'eau, chaque pas de prairie et chaque catastrophe : **au plus un
    pas de retard (0,1 s)**. Le niveau d'une boule est décidé des deux côtés par la même règle (`BallLevels`).
  - **Fil perdu** (plantage) : `GroundThreads` en relance un, et chaque salle y redémarre son sol, l'eau depuis
    l'instantané que la salle tient (l'eau cachée sous une boule est perdue), la prairie depuis la dernière
    sauvegarde. Trois pertes en cinq minutes : le sol de la salle repasse dans le fil des salles.
  - **Répartition** : une salle va au fil qui a le moins de salles et n'en change plus.
  - **Allègement dans un fil de calcul** (`WaterLoads.mayTake`, `GroundWorker`). La somme des pas des eaux d'un fil
    (#497) est comparée à 50 % de l'intervalle dans le fil des salles, où les joueurs attendent derrière l'eau :
    inchangé. Dans un fil de calcul personne n'attend, l'eau doit seulement tenir sa cadence : le seuil y est de
    90 % (`GROUND_THREAD_SHARE`). La finesse y revient dès que le fil pourrait la porter (ce que les eaux
    prendraient avec un niveau de plus, le coût supposé suivre la finesse, reste sous 95 % du seuil), et non sous
    la moitié du seuil, qui aurait laissé un tel fil aux deux tiers de ce qu'il tient. Mesuré sur un vrai fil,
    salles comme la carte d'entrée inondée, Mac : à 50 %, 6 salles tombent à la finesse 2 et 8 à la finesse 1 ou
    2 ; à 80 %, 8 salles cèdent un niveau ; à 90 %, 8 salles gardent la finesse 3 (86 % d'un cœur, 10 pas par
    seconde), 10 salles passent à 2, 12 à 1 ou 2, toujours à 10 pas par seconde. Limite : le coût ne suit pas tout
    à fait la finesse (de 2 à 3 il monte de 26 % sur cette carte, pas de 50 %), donc après un pic (une salle qui
    démarre) la finesse 3 ne revient que si le fil est sous 57 % à la finesse 2 : 8 salles restent alors à 2
    (68 % d'un cœur) alors que le fil tiendrait 3.
  - **Réglage et module** : `GROUND_THREADS` est lu par `Ground/ServerGroundThreads.ts`, seul à valider
    l'environnement de `back` ; `GroundThreads.ts`, le fil et ses tests n'en dépendent pas (un test tourne sans aucune
    variable d'environnement). Un fil qui meurt au démarrage le dit dans les journaux de `back`, avec sa raison.
  - **Journaux** : au démarrage, `back` dit où le sol est calculé (« The ground of the rooms (water and meadow) is
    computed on N thread(s) of its own (GROUND_THREADS) », ou « … on the thread of the rooms (GROUND_THREADS is
    0) ») ; « Ground thread i of N starts for its first room » quand un fil démarre pour sa première salle ;
    « … starts again after a loss (start k) » quand il est relancé, après l'erreur « A thread that computes the
    ground of rooms was lost ».
  - **Mesuré** (Mac M4 Max chargé, carte d'entrée de la beta inondée à 42 %, inertie, finesse 3, 5 envois/s, vraies
    classes, deux passes alternées) : retard d'un minuteur de 2 ms sur le fil des salles, 99e centile 12 ms →
    0,4 ms ; maximum 16 à 33 ms → 2,1 à 2,6 ms ; part des retards de plus de 10 ms 1,9 % → 0. Une édition de carte
    retient le fil des salles 48 ms → 1,7 ms (la lecture des murs et des sols se fait dans le fil de calcul).
    L'entrée d'un joueur coûte 1 ms des deux côtés.
  - **Tests** (`back/tests/RemoteRoomGround.test.ts`) : conduit pas à pas (`pause` des simulations, horloge et
    hasard donnés), le sol distant dit et sauvegarde **les mêmes octets** que le sol câblé à la main dans le fil
    des salles, eau et prairie, sur 130 s (pluie, neige, source, drain de bâtiment, toutes les catastrophes,
    carte changée, canicule et feu), par les messages seuls puis sur un vrai fil ; ce que la salle lit en chemin
    (eau, version, feu, glace, états pour qui entre, niveaux de boule) est identique ; le rattrapage d'une salle
    rouverte après trois heures aussi ; en temps réel sur un vrai fil : marche, arrêt avec sauvegarde, deux fils
    perdus puis repli dans le fil des salles.
  - **Reste à faire** (PR suivantes) : l'allègement de finesse (`WaterLoad`) ne regarde que sa salle, pas la somme
    des salles d'un fil ; la carte éditée est encore copiée entière hors relief.

Preuve d'identité : `libs/map-editor/tests/WaterFingerprints.test.ts` joue 19 scénarios de `WaterGrid` et finit
chacun sur une empreinte (profondeurs, flux, vitesses, bilans, octets envoyés) enregistrée avec le code d'avant
(`eb17d9b92`) ; un changement voulu de la physique les réenregistre par
`RECORD_WATER_FINGERPRINTS=1 npx vitest run tests/WaterFingerprints.test.ts`. Côté serveur, 751 envois de la carte
d'entrée (sources, rattrapage, pluie, météore, boule) donnent la même empreinte une fois décompressés.

Bilan sur la carte d'entrée mouillée à 70 % (Mac M4 Max, Node 24, contre `infogene` à 9e5507971) : un envoi
7,1 → 2,8 ms ; un pas entier sous la pluie 21,2 → 12,9 ms en moyenne ; octets envoyés −4 %. Non fait dans ce lot : `WaterLoad` nourri par la somme des pas
de toutes les salles. Le retard de la boucle d'événements de `back` est déjà exposé par `prom-client`
(`nodejs_eventloop_lag_p99_seconds` sur `/metrics`, `PrometheusController`) : rien à ajouter pour le lire sur le
serveur, il suffit d'interroger ce point d'accès.

**Durée du pas de l'eau et part du sol dans son fil, sur `/metrics`.** Le calcul du sol dit lui-même ce qu'il
coûte, dans les trois montages (fil des salles, fil de calcul `GROUND_THREADS`, bandes `GROUND_BANDS`) : la mesure
est prise dans le fil qui calcule (`Ground/GroundTimings.ts`, autour du pas de `TerrainWaterManager` et de
`MeadowManager`), un fil de calcul l'envoie une fois par seconde au fil des salles, et `Services/GroundMetrics.ts`
l'expose. Comme le retard de boucle, chaque valeur porte sur la **fenêtre depuis la lecture précédente** : lire deux
fois à une minute d'écart et ne garder que la seconde lecture.

| Métrique | Sens |
|---|---|
| `workadventure_water_step_p50_seconds`, `_p90_`, `_p99_` | durée sous laquelle sont 50, 90 et 99 % des pas de l'eau, toutes salles confondues (seaux de 5 % : la valeur dite dépasse la vraie de 5 % au plus) |
| `workadventure_water_step_max_seconds` | pas le plus long (exact) |
| `workadventure_water_steps` | nombre de pas de l'eau dans la fenêtre (10 par seconde et par salle dont l'eau bouge) |
| `workadventure_ground_busy_ratio{thread=…}` | part de son temps (0 à 1) qu'un fil a donnée aux pas de l'eau et de la prairie ; `thread="rooms"` : le fil des salles, `thread="1"`… : un fil de calcul |

Aucune salle n'est nommée. Avec des bandes, la durée est celle du pas vu par le fil qui mène (ce qu'attend la
salle) ; le temps des fils d'appoint n'est pas compté dans la part. La durée du pas ne compte pas la copie de l'eau
pour la salle ; la part du fil la compte. Une durée lue au réveil d'un fil qui dort entre deux pas dépend de la
charge de la machine : comparer deux réglages sur la même machine et à la même heure.

**Écume des vagues et moutons du vent.** Trois écumes, chacune avec sa règle, toutes calculées par le navigateur à
partir de ce qu'il reçoit déjà (profondeurs, vent) :

- **Écume de courant** (ci-dessus) : réservée à l'eau peu profonde (moins de 32 px, une case : ruisseau, rivière,
  nappe qui court sur la terre). En eau plus profonde, le courant d'une houle ne porte pas d'écume, sauf s'il est
  presque au plus fort.
- **Déferlement et rivage** (`Terrain/BreakingFoam.ts`) : une vague fait de l'écume quand elle est haute pour l'eau
  où elle court. Hauteur de la vague (surface de la cellule moins le creux le plus bas à 3 cellules autour) divisée
  par la profondeur sous ce creux : rien sous 0,3, tout blanc à 0,78 (seuil réel de déferlement en eau peu
  profonde). Une houle longue sur fond profond, même haute, n'en fait donc aucune : l'onde d'une comète reste
  lisse au large et blanchit en approchant des rives, sur les hauts-fonds et là où le bourrelet de l'impact
  retombe. Une cascade en fait aussi. Une vague de moins de 3 px (10 cm) est une ride : aucune écume ; la dose
  croît avec la hauteur jusqu'à 12 px (40 cm). S'y ajoute le **front de crue** : une cellule sèche à l'état
  précédent, mouillée maintenant, à côté d'une eau déjà là (pas la pluie qui remplit une mare). L'écume reste
  derrière la vague et s'efface de moitié toutes les 1,8 s.
  Deux choses ne sont pas des vagues et ne font plus d'écume : la **pente du fond** (le creux n'est plus cherché
  sous le lit de la cellule : une nappe qui descend un rivage n'a pas de « vague » de la hauteur de la pente) et
  la **marche entre deux eaux qu'un mur sépare** (la recherche du creux s'arrête à un mur ou à une porte, prise
  fermée ; murs lus par `landWallsOf`, dans `TerrainView.closedSides`). L'**eau vive** garde la sienne : une eau
  qui tombe d'au moins 3 px et court plus vite que ses propres vagues (vitesse transmise par le serveur divisée
  par `waveSpeed(profondeur)`, le nombre de Froude : rien sous 1, tout à 2) : torrent sur une berge raide,
  cascade. Sans vitesse transmise (eau sans inertie), la vitesse est lue sur la pente de la surface. Mesuré sur la
  carte d'Antoine en crue (64 % sous l'eau) : cellules qui écument en permanence 1 405 → 692, écume visible
  5 480 → 4 710 cellules, intensité totale −34 %. Le reste est fait de vraies vagues.
  L'écume d'un état **monte pendant que l'eau y glisse** (sur le temps écoulé depuis l'état précédent, 1 s au
  plus), au lieu d'apparaître d'un coup à sa réception : à un état par seconde (eau locale, garde-fou réseau,
  cartes réglées à 1 envoi), elle venait par bouffées. Vague qui déferle en continu, lue toutes les 50 ms :
  à 1 état par seconde, écume moyenne 4,64 → 5,51 (5,52 → 5,68 à 5 états), écart creux à crête 41 % → 12 %, plus
  grand saut entre deux dessins 40 % → 1 %.
- **Mer du vent, déferlement et moutons** (`Terrain/WindSea.ts`, `Terrain/WindSeaShader.ts`) : le vent lève sur
  l'eau libre des vagues courtes qui grossissent avec lui et avec la distance qu'il a parcourue sur l'eau (le fetch,
  mesuré depuis la rive au vent ; fetch effectif, moyenne en cos² des directions à ±40° du vent : le calme derrière
  une île se resserre et s'efface sous le vent). Loi de croissance et spectre du rapport JONSWAP
  (Hasselmann et al. 1973) : 40 km/h sur 200 m donnent des crêtes d'environ 1 m (30 px) et 8 cm de creux à crête
  significatifs, 80 km/h sur 142 m des crêtes de 1,3 m. Échelle réelle du jeu, sans grossissement. Douze vagues de
  fréquence et de direction fixes (écart autour du vent d'une mer du vent), sommées par le shader ; aucune plus courte
  que 4 px. Elles sont choisies par pas de 5 km/h et de 10° : un vent qui hésite garde les mêmes vagues, sans saut,
  seule leur hauteur le suit. Sur les hauts-fonds, elles ne dépassent pas 0,8 fois la profondeur.
  Une crête **déferle** quand sa pente dépasse celle de la vague la plus raide possible (H/L = 0,142, Michell 1893,
  Miche 1944) : les moutons naissent sur ces crêtes, plus de tirage au hasard ; une crête ne casse que sur une partie
  de sa longueur, qui change à mesure qu'elle avance (de courts moutons en brise, presque toute la crête en tempête). Les **groupes de vagues** viennent à
  des places et des tailles aléatoires (un champ lisse, de moyenne quadratique 1, qui monte ou baisse la hauteur, et
  qui avance à la vitesse des groupes) : quelques vagues sommées battraient en motif régulier, ce qu'une vraie mer ne
  fait pas. La **lumière** (pente tournée vers la lumière ou non) lit surtout les vagues de plus de 8 à 24 px : les
  plus courtes faisaient des hachures ; elles comptent entières dans le déferlement. L'**écume** laissée est une
  **mémoire** (`Terrain/WindSeaFoam.ts`) : une image de l'écume autour de la caméra (768 x 512 texels, un texel pour
  2 px de jeu au zoom habituel, plus gros quand on dézoome), refaite 15 fois par seconde à partir d'elle-même sur la
  carte graphique, deux textures en alternance. Chaque crête qui déferle y dépose son écume, en fines lignes dans le
  sens du vent ; l'écume dérive à 3 % du vent (Wu 1983) et s'efface en 3 s (Callaghan et al. 2012). La crête avance
  plus vite que son écume : elle laisse derrière elle une traînée aussi longue qu'elle a déferlé, irrégulière, qui
  pâlit, sans motif d'ensemble ; chaque traînée a sa largeur, sa blancheur et sa durée (de la moitié à une fois et
  demie de la durée moyenne), tirées d'un bruit lent qui dérive avec l'écume. Translucide en brise, plus opaque par grand vent, selon l'échelle de Beaufort (OMM :
  traînées à force 7, bien marquées à 8, denses à 9, la mer blanche à 10) ; plus épaisse par grand vent, elle dure plus
  longtemps (jusqu'à 1,6 fois au-delà de 89 km/h). L'écume est un état de la page : elle part
  de rien au chargement ou après un saut de caméra et se forme en quelques secondes ; elle est ensuite la même chez
  tous, les crêtes étant les mêmes.
  La part blanchie suit la loi usuelle des moutons (Monahan et O'Muircheartaigh, 1980), mesurée sur le GPU avec les
  vrais shaders (sonde de l'étude : passe d'écume et eau sur 1024 x 640 px d'eau ouverte au fetch de 200 m, 12 s de
  mise en route, moyenne des 3 dernières secondes) : le seuil de pente est le seuil physique à 11 % près de 20 à
  60 km/h (table `BREAKING_FACTORS`) ; au-delà, la loi demande plus de blanc que les crêtes plus raides que Michell
  n'en donnent (seuil 25 % plus bas à 82 km/h) : le vent arrache l'écume de crêtes pas encore assez raides. Au-delà de 90 km/h, où les mesures de cette loi s'arrêtent, le blanc des moutons tend vers
  45 % au plus (`whitecapWhite`). Au-delà de 30 m/s, la nappe blanche d'un ouragan s'y ajoute et la mer blanchit
  (`spumeShare`, voir « Catastrophes : l'ouragan »). Mesuré : 0,13 % à 20 km/h (loi 0,13 %), 1,41 % à 40 (1,41),
  5,66 % à 60 (5,63), 16,3 % à 82 (16,3), 34,2 % à 110 (visée 34,2). Sur un fetch plus court, moins de moutons.
  Rien ne change sous 10 km/h. Seulement dehors, sur une eau d'au moins 8 px, non gelée. Le vent est celui que le
  joueur voit (carte, réglé à la main, ou météo réelle).
  Qualité graphique : **Basse**, pas de mer du vent ; **Moyenne**, image de l'écume deux fois plus grossière (un texel
  pour 4 px au moins) et refaite 10 fois par seconde. Coût mesuré (Mac M4 Max, 1920 x 1080 couvert d'eau) : shader de
  l'eau 1,0 → 1,4 ms par image ; passe de l'écume environ 0,1 ms, 15 fois par seconde.

Le déferlement des vagues du serveur et la mer du vent sont dessinés par le **shader de l'eau**
(`Terrain/GroundSplat.ts`), comme l'écume de rive : l'écume des vagues lui arrive par cellule (rouge du paquet 9),
déchirée par un bruit fin qui bouillonne ; le fetch par cellule (rouge du paquet 11, recalculé quand le vent tourne
de plus de 5° ou quand les rives ont bougé (hystérésis : une cellule se ferme sous 2 px d'eau, s'ouvre au-delà de 6 px),
au plus toutes les 3 s ; à la fin, seul ce paquet est réécrit (`GroundSplat.setFetch`), jamais le sol ; un rayon du fetch effectif par image : 12 à 17 ms
d'un bloc sur la carte d'Antoine, 45 ms sur une carte quatre fois plus grande) ; les vagues par des uniformes (phases calculées sur le processeur et
ramenées dans [0, 1), aucun sinus d'un grand nombre, aucun hachage par sinus : pas de dérive sur une page ouverte des
jours). Compilé seulement si la carte graphique a la précision haute et 128 vecteurs d'uniformes ; sinon ni mer du
vent ni moutons. Sans shader (rendu de secours), ni l'un ni l'autre. Coupés avec l'effet « eau en mouvement ».

Aucun réglage, rien d'envoyé par le serveur. Non vu à l'écran par un agent.

**Sources et puits repérés dans l'outil Relief.** Tant que l'outil Relief est ouvert, chaque objet qui porte une
propriété de source ou de puits est repéré sur la carte (`Terrain/WaterMarks.ts`, logique pure ;
`Terrain/WaterMarksView.ts`, dessin, créé et détruit par `TerrainEditorTool`) : une pastille bleue marquée + pour une
source, orange marquée − pour un puits, là où son eau sort ou part (le milieu de la cellule que le serveur utilise),
un halo qui bat, le disque qu'elle arrose ou vide, et son débit écrit dessous en m³/h. Une source ou un puits réglé à
0 est repéré aussi, plus pâle. Les pastilles gardent leur taille à l'écran quel que soit le zoom (14 px de rayon, 10
px de carte au moins). Les objets sont relus une fois par seconde ; halo fixe pour qui a demandé moins de mouvement.
Vu par l'éditeur seulement, rien n'est écrit dans la carte. Le panneau Relief rappelle les deux couleurs.

**Aplanir, lisser, lire le relief.** L'outil Relief a deux modes de plus. « Aplanir » ramène le sol vers un niveau,
d'une force au plus par passage : le niveau du sol là où le geste commence (une pipette), ou une profondeur choisie
dans le panneau ; le milieu du pinceau sort plat, son bord en pente (`discWeight`), ce qui donne un fond de lac plat
et des berges. « Lisser » rapproche chaque case de la moyenne d'elle-même et de ses huit voisines (tout le chemin
en un passage à 32 px de force). Les deux respectent la profondeur maximale de la carte et les cases interdites
(`strokeChanges`, modes `flatten` et `smooth`). Tant que l'outil est ouvert, le panneau dit la profondeur du sol
sous le curseur, et la carte montre les courbes de niveau : une ligne fine tous les 8 px de profondeur, une plus
marquée par case (`Terrain/TerrainContours.ts`), le long des bords des cases, pour celui qui édite seulement (un
interrupteur les masque ; au-delà de 30 000 morceaux dans la vue, seules les lignes marquées sont dessinées). Rien ne change
dans la carte enregistrée ni sur le fil : un geste envoie toujours des hauteurs par case. Les courbes sont gardées
morceau de carte par morceau de carte (`ContourCache`) : un coup ne recalcule que les morceaux qu'il a changés et
leurs voisins, et seules les régions de 1024 px dans la vue sont tracées (Phaser retrace un `Graphics` en entier à
chaque image). Dézoomé sous la moitié, les lignes d'une région sont montrées en image, peinte une fois à l'échelle de
la puissance de deux qui suit le zoom (un quart au plus : 256 px pour une région), puis repeinte quand un coup y
change le relief (`ContourView`) : tracées en lignes de 1 px du monde, elles tombaient sous le pixel de l'écran et ne
se voyaient qu'en pointillés. Mesuré le 2026-11-23 sur la carte d'Antoine en dev local (113 000 morceaux de lignes) : 7 ms par
image et environ 100 ms par coup avant, l'outil Relief ouvert ; 59 à 62 images/s en creusant après. Le flou du sol
(`smoothWeights`), refait à chaque coup sur toute la zone dessinée, passe en deux passes (même résultat à l'octet
près) : 280 ms avant, 30 ms après, la carte entière en vue. Le sol n'est plus dessiné qu'au-dessus de la carte et de
deux cases autour (`nextDrawnArea`) : la carte entière en vue, il couvrait 16 000 × 7 600 px ; et rezoomé, il se
redessine à la taille de la vue (avant, 60 à 75 ms à chaque mise à jour de l'humidité, même au zoom 1). Hors de la
carte, le shader du sol ne peignait que le givre par temps de gel : il n'y est plus.

**Sols.** L'outil Relief a un mode « Sol » : le pinceau peint un des six sols sur tout son disque (terre,
prairie, argile, sable, rocher, gravier), « Sol d'origine » efface. Le sol d'une case est gardé à côté de sa hauteur
(`TerrainData.soil`, mêmes morceaux de 16 × 16 cases, 0 = non peinte ; `Terrain/Soils.ts`, `soilAt`, `withSoils`) et
voyage dans le message du relief (`ModifyTerrainMessage.soils`, facultatif pour un ancien client), avec la même
annulation. Dessin : un voile de la couleur du sol sous les ombres du relief et sous l'eau (`SOIL_TINTS`). **Eau** :
chaque sol boit une part de l'« absorption du sol » de la carte (`soilDrinks`) — rocher rien, argile un dixième,
terre et prairie comme le sol d'origine, sable et gravier cinq fois plus et **même dans un creux** : un lac tient
sur du rocher ou de l'argile, une mare creusée dans le sable se vide. Une case non peinte se comporte exactement
comme avant (le sol plat boit, un creux garde son eau). Le sol ne compte que là où le serveur simule l'eau (le
relief, les sources, et leur marge). **Marche** : le sable ralentit (80 % de la vitesse) et une argile sur laquelle de l'eau repose est de la boue
(55 %), pour l'avatar au sol, à pied ou en véhicule, pas à la nage (`soilPace`, `Terrain/GroundPace.ts`) ; chaque
navigateur le calcule pour son avatar, rien sur le fil. **Humidité et herbe** : le serveur tient un **pré** par carte
(`Terrain/Meadow.ts`, `MeadowManager`, case de 32 px, toute la carte, un pas toutes les 2 s, Redis `meadow:<salle>`) :
l'**humidité du sol** de chaque case monte sous la pluie de la carte et sous l'eau qui repose dessus, se répand aux
quatre voisines, **descend les pentes**, et se perd à l'allure de chaque sol (argile 30 min, prairie 15, terre 10,
sable 2, gravier 1, rocher rien) ; l'**herbe** pousse seule sur un sol fertile (terre et sol d'origine, prairie plus
vite, argile moitié moins ; jamais sur sable, rocher, gravier) quand il est humide sans être détrempé (25 à 90 %),
sans eau dessus, de jour (du lever au coucher du soleil au lieu de la carte, Paris sans lieu, comme le cycle jour/nuit du jeu :
`Weather/SunPosition.ts` de la bibliothèque, `isDaylightAt` ; de 7 h à 19 h avant le 2026-11-20), en saison (pleine au printemps et en été, 40 % en automne,
rien en hiver), et **moins vite en altitude** (rien au-delà de 192 px, 6 cases) ; un pré plein en 10 minutes de
bonnes conditions ; elle meurt de soif en 20 minutes sur un sol sec, noyée en 1 minute sous l'eau. Dehors seulement
(ce que les murs de l'outil Carte ferment n'a pas de pré), jamais sur un sol posé par l'outil Carte. Résultat : un
anneau d'herbe autour des lacs, un pré après la pluie. Automatique sur toutes les cartes ; chaque carte règle la sienne dans l'outil Relief, bloc « Herbe de la
carte » (`settings.meadow`, `UpdateMeadowSettingMessage`) : interrupteur (coupée, la carte est nue aussitôt), durée
pour un pré plein (1 à 120 min, 10 par défaut), durée de la mort de soif (1 à 240 min, 20), tenue de l'humidité du
sol (× 0,25 à × 8). La salle
reçoit l'état entier toutes les 10 s quand il a changé (`MeadowMessage`, un octet par case pour l'herbe, un pour
l'humidité, gzip) et à l'entrée ; le navigateur dessine l'herbe en voile vert moucheté sur le sol, sous l'eau
(`Terrain/MeadowState.ts`, dans `TerrainView`), là où c'est dehors pour lui. Une argile détrempée (60 % d'humidité)
est de la boue même sans eau dessus. L'outil Relief dit l'humidité et l'herbe sous le curseur. `play`, `back` et `map-storage` à déployer ensemble.

**Les antilopes broutent.** À chaque pas du pré (2 s), chaque antilope libre de la vie de la terre mange l'herbe de
la case sous elle (`Meadow.graze`, une case pleine en 2 minutes, `GRAZE_SECONDS` ; `AquaticLifeManager.grazers`,
donné au `MeadowManager` par `GameRoom`). L'herbe repousse comme ailleurs : un troupeau qui reste au même endroit y
laisse le sol nu. À l'écran, une antilope immobile sur une case qui a de l'herbe (15 % et plus) baisse la tête, dans
la pose de la boisson (`LandLifeView`, calculé par le navigateur à partir du pré qu'il reçoit). Brouter ne change
rien à la vie des antilopes : elles ne cherchent pas l'herbe et n'ont pas faim sans elle. Rien sur le fil.

**Neige en altitude** (`Terrain/SnowLine.ts`). La neige tient sur les monts à partir d'une altitude qui dépend de la
saison du lieu de la carte (Paris sans lieu, saisons inversées au sud) : 96 px (3 cases) en hiver, 160 px au printemps et en automne, 224 px en été ; fine à
la limite, complète 32 px plus haut (`snowCover`). Le navigateur la dessine en voile blanc sur le sol et l'herbe,
sous les ombres des pentes, dehors seulement (`TerrainView`, `snowAlpha`) ; on y marche moins vite (85 % sous une
couverture complète, `snowPace` dans `GroundPace.ts`) ; le serveur y fait mourir l'herbe, à l'allure de la soif sous
une couverture complète (`Meadow.step`). Tout se calcule à partir du relief et de la saison : rien dans la carte ni
sur le fil, aucun réglage. Indépendante de la neige de la météo (qui blanchit toute la carte) et du thème personnel.

**Altitude de l'avatar.** Sur une carte qui a un relief, la pile des étages, à gauche de l'horloge (dessous sur un écran de moins de 768 px), dit l'altitude de
l'avatar, en mètres (une case d'altitude ≈ 1,10 m, `metresOf`) : la hauteur du relief sous ses pieds quand il est au
sol (négative dans un creux, positive sur un mont), l'altitude de son palier quand il est en hauteur
(`Floors/AvatarAltitude.ts`, `avatarAltitudeStore`). La pile s'affiche donc aussi sur une carte sans étage dès qu'elle
a un relief ; rien ne change sur une carte sans relief. **Dans l'éditeur** la pile reste affichée, avec les mêmes
altitudes : elle y montre le niveau sur lequel l'éditeur travaille (« Auto » suit le palier sous le pointeur) et le
choisit, comme le sélecteur de niveau du panneau (`floorLevelStack`, paramètre `editor` ; `chooseEditorLevel` de
`MainLayout.svelte`). Dessous, une seconde ligne
(pastille de 200 px) dit **ce qu'il y a sous le curseur**, après un viseur (`pointerGroundAt`, `pointerGroundStore`,
`Floors/AvatarAltitude.ts`) : une montagne puis **l'altitude du sol**, une goutte puis **l'altitude de la surface de
l'eau**, une double flèche puis **la profondeur** (surface affichée moins sol affiché, pour que les trois chiffres
s'accordent). Le sol est lu là où le serveur pose l'eau (`TerrainWater.basin`) : le relief, ou le fond d'une piscine
creusée par son style ; sous un étage ou un pont, le sol et l'eau d'en dessous (l'altitude de l'avatar reste celle de
son palier). L'eau est celle du dernier état reçu du serveur (`settledDepthAt`, sans le glissement entre deux états),
eau peu profonde et piscines comprises, dès le seuil où la carte la dessine (0,5 px) ; sans eau, un tiret. Gelée,
la goutte devient un flocon et l'infobulle dit « Surface de la glace » : la même altitude, celle de l'eau
(`isOnFrozenWater`). Même échelle que « Tenir un niveau » des sources et des puits et que les masses de « Flux
d'eau » (`metresOf`, 0 m = niveau du sol de la carte) : la surface lue sous le curseur se compare au niveau tenu. Le
calcul suit chaque image mais la pastille n'est redessinée que quand un chiffre affiché (au décimètre) change
(`showPointerGround`). **Le sol peint sous le curseur** colore la montagne (la teinte de l'outil Relief,
`SOIL_TINTS` ; l'eau d'une piscine pour une piscine) et se nomme, avec les libellés de l'outil Relief, quand la mise
en page fait au moins 1024 px de large (`@container main-layout`, pastille de 250 px, place du nom le plus long
réservée : `SOIL_NAME_CH`) ; plus étroit, le nom n'est que dans l'infobulle. Il est lu là où l'eau le lit
(`soilAt` de la carte, comme `WaterGrid`) : une case non peinte se dit « Terre (non peint) », car l'eau la traite en
terre nue (même rugosité, même absorption) ; une piscine se dit « Piscine » ; sous l'eau, le sol du fond ; sous un pont
ou un étage, le sol du dessous. L'infobulle ajoute la rugosité de Manning de ce sol (`soilRoughness`, celle que lit
l'eau : argile 0,022, sable 0,025, terre et gravier 0,03, rocher 0,04, prairie 0,045, piscine 0,03). Curseur hors du jeu : la ligne reste, avec des tirets, pour que rien ne bouge. Infobulle et
lecteur d'écran : « Sol sous le curseur −3,6 m · Surface de l'eau −1,2 m · Profondeur 2,4 m ». Sous une Boule posée
dans l'eau, le serveur compte le dessus de la boule comme fond, que le navigateur ne connaît pas : la lecture peut y
être fausse.

**Monts : le relief monte au-dessus du sol.** Une case du relief va de −256 à +256 px (`TERRAIN_MAX_HEIGHT`) :
négative creusée, positive élevée. Le mode « Élever » de l'outil Relief ajoute de la matière au pinceau, comme
« Creuser » en enlève, jusqu'à la « profondeur et hauteur maximales » de la carte (le même réglage vaut pour les
deux sens) ; « Aplanir » vise une altitude, négative ou positive (un plateau). « Remblayer » n'a plus de bouton :
aplanir vers le niveau de la carte fait la même chose. Un mont est éclairci par sa hauteur (`raisedAlpha`) et ses
pentes sont éclairées ou ombrées comme celles d'un creux ; les courbes de niveau de l'éditeur le dessinent comme un
creux de même taille. **L'eau** : un mont est un obstacle et une pente, la crue du sol s'arrête à son pied, l'eau
versée dessus (une source) en redescend. Chaque case a un **niveau de débordement** (`spillLevels`, calculé une fois
par grille, 43 ms pour la plus grande) : le niveau que l'eau doit atteindre pour s'échapper vers le bord, donc le
bord de la cuvette où elle se trouve. Une case sous ce niveau est dans une cuvette, qu'elle soit creusée sous le sol
ou dans le cratère d'un mont : il y pleut, le sol n'y boit rien, et l'eau y monte jusqu'à 18 px au-dessus du bord
(au-delà elle est perdue, comme avant). On fait donc un **lac en altitude** en creusant un cratère au sommet d'un
mont et en y posant une source, ou en attendant la pluie. Hors d'une cuvette (plaine, pente, sommet plat) rien ne
change : pas de pluie, le sol boit la nappe. **Ce que les monts ne font pas** : les avatars, les objets
et les murs restent dessinés à plat, on marche sur un mont sans monter à l'écran et sans ralentir. Une carte avec un
mont n'est lisible que par des `play`, `back` et `map-storage` qui connaissent les hauteurs positives : à déployer
ensemble.

**Le relief et l'eau s'arrêtent aux bords de la carte.** Le sol affiché au-delà des bords d'une carte
(`exteriorTexture`) n'est qu'une image : aucun avatar n'y marche. L'outil Relief y refuse donc le pinceau (rouge,
comme sous un mur), et le serveur n'y simule plus d'eau : la grille d'eau est coupée aux bords de la carte, taille
lue dans la carte Tiled (`cellInMap`, `gridBoundsOf(…, map)`, `GameRoom.mapSizeInCells`). Un relief creusé hors
carte avant ce changement reste dans la carte et se voit toujours, mais à sec : ni eau, ni poissons, ni pêche. Une
source ou un puits posé hors carte ne compte plus. Tant que la taille de la carte n'est pas lue (ou si elle ne peut
pas l'être), rien n'est coupé. `map-storage` ne connaît pas la taille de la carte : un navigateur modifié peut
encore y écrire un relief hors carte, qui restera à sec.

**Les zones aussi s'arrêtent aux bords de la carte.** Objets, sols, murs, dalles et escaliers y étaient déjà
refusés ; l'outil Zones ne l'était pas. Une zone ne se trace, ne se déplace et ne s'étire plus au-delà des bords : le
coin ou la zone revient sur le bord (`Components/MapEditor/AreaMapBounds.ts`, `clampAreaCorner`,
`clampAreaTopLeft`). La zone d'un palier se lit sur le sol sous elle (elle est dessinée son altitude plus au nord).
Une zone déjà posée hors carte ne bouge pas toute seule : elle revient dans la carte dès qu'on la déplace.

**Sources et puits.** N'importe quel objet devient une source ou un puits depuis ses propriétés. Le débit se règle
par un nombre, deux boutons − et + (pas de la taille de la valeur : 1, 2… 10, 20… 100, 200…) et une unité au choix
(m³/h, L/s, L/min, m³/s ; le choix est gardé dans le navigateur, le débit est enregistré en litres par minute). L'eau
d'une source descend la plus grande pente jusqu'au premier creux, en mouillant le lit ; un puits retire d'abord l'eau d'un disque autour de son pied ; s'il demande plus que ce disque ne contient, il fait
baisser le plan d'eau relié à lui en cône (`lowerBasin` : chaque cellule donne en proportion de 1 / (1 + sa distance
au puits), si bien que la surface penche vers le puits dans tout le bassin et que le courant y emporte ce qui flotte ;
sans traverser un mur, un sol sec ni un film de moins de 1 px, jamais sous son propre pied, en laissant 2 px d'eau
dans chaque cellule hors du disque pour rester relié au lac, 16 384 cellules au plus par pas, soit environ 90
cellules autour ; l'eau plus loin doit couler jusqu'à lui). Avant, il attendait que l'eau arrive de cellule en cellule et ne prenait qu'une
fraction d'un débit réglé haut. Ce rayon se règle
par objet, en cases (`radius`, de 0 à 10) : une case et demie par défaut pour un puits ; pour une source, 0 (au pied)
ou un disque sur lequel l'eau est versée. Une entrée de catalogue peut porter
`waterFlow: { kind: "source" | "sink", flow (m³/h), anchor }` : l'objet posé est alors une source ou un puits
aussitôt (catalogue `Infogène Eau` du dépôt d'infra : fontaine de 2 × 2 cases, gouffre rond de 3 cases). Sous chaque
réglage de l'eau, une ligne rappelle ses valeurs réelles (ordres de grandeur).

**Vidange des sols intérieurs.** Une porte n'arrête pas l'eau : une inondation entrait dans les bâtiments et y
restait, le sol plat n'en buvant que l'absorption de la carte (5 mm/h). Les pièces (ce que ferment les murs, portes
fermées : `landWallsOf`, la même règle que le pré) évacuent maintenant leur eau à `water.indoorDrain` mm/h (réglage
de carte « Vidange des sols intérieurs » de l'outil Relief, 0 à 10 000, 300 par défaut : à la vitesse 60, une pièce
noyée à 18 px sèche en deux minutes environ ; 0 garde l'eau). Pour aller plus vite, des grilles d'évacuation se posent
au sol : objets `layer: "floor"` (sous les objets et les avatars), sans collision, avec un `waterFlow` de puits. Un bassin creusé dans le sol d'une pièce garde son
eau. L'eau évacuée compte avec les puits dans le bilan. Tant que la cour reste inondée, l'eau continue d'entrer par
la porte : seul le seuil reste humide. Une pièce que le bord de la grille d'eau coupe compte comme extérieure.

**Puits adaptatifs des bâtiments.** Un puits posé sur un sol de l'outil Carte (collection `Carte Sols`,
`pavedTilesOf`) en est le drain : à chaque pas, une fois l'eau déplacée, il prend toute l'eau arrivée sur ce sol,
quel que soit son débit (`WaterGrid.setFloors`, `floorAreaOf`). Son sol va jusqu'à 12 cases autour de lui ; il
s'arrête aux murs mais pas aux portes, qui font partie du bâtiment. Il ne prend ni le sol nu ni un bassin creusé dans
le sol. S'il tient un niveau, il garde l'eau jusqu'à ce niveau. Couloirs et pièces restent secs même quand une source
ou une crue amène bien plus que la somme des débits réglés. L'eau prise compte avec les puits dans le bilan.
L'interrupteur « Adaptatif » de l'éditeur de puits (`adaptive: false`) lui rend son débit et son disque. Absent,
il est adaptatif. Hors d'un sol, un puits garde toujours son débit.

**Puits sous l'eau, puits tournés.** Un puits que l'eau recouvre d'au moins 1 px à son point d'eau se dessine teinté du
bleu de l'eau et à moitié transparent, vu à travers elle, jusqu'à ce que l'eau soit descendue
(`SubmergedDrains`, `Entity.setSubmerged`, revu quatre fois par seconde). La grille d'évacuation et le caniveau du
catalogue `Infogène Eau` existent dans les quatre directions (bouton ⟳ de l'éditeur). Tourné, un puits reprend le point
d'eau de sa nouvelle image (`rotatedWaterProperties`) et garde son débit, son rayon, son niveau et son réglage adaptatif.

**Eau plus vive autour des puits.** L'eau n'avance que d'une cellule par pas ; sur une carte accélérée, un puits
puissant vidait son disque puis attendait une eau qui arrivait trop lentement. Autour d'un puits qui demande encore
de l'eau (son disque et 16 cellules de plus), l'eau avance de nouveau pendant le même pas, jusqu'à 16 fois : une
fois par tranche de 4 de la vitesse de la carte (`flowSteps`, 15 à la vitesse 60). Le reste de la grille n'avance
qu'une fois par pas : la faire avancer partout aussi souvent coûterait trop au serveur (mesuré : 37 ms par pas pour
15 avancées sur 190 000 cellules mouillées, contre 2,5 ms pour une).

**Eau à grande échelle.** Entre voisines, une cellule ne peut pas donner plus d'un quart de la différence de niveau
sans que le calcul oscille : l'eau n'avance donc que d'une cellule par pas. Sur une carte accélérée (`flowSteps` > 1),
un pas sur deux, chaque cellule échange aussi avec celles situées 4 et 16 cellules plus loin sur sa ligne puis sur sa
colonne (`flowFar`), un quart de leur différence, à condition qu'une étendue d'eau ininterrompue les relie : ni mur,
ni sol sec, ni simple film d'eau (moins de 2 px) entre elles. L'eau ne quitte jamais son étendue ; elle fait plus tôt
ce que plusieurs pas de cellule en cellule auraient fait. Un lac se met à niveau et alimente un puits lointain bien
plus vite. Mesuré sur une grille de 491 × 407 (machine chargée, ordre de grandeur) : environ 4 ms de plus par pas,
et douze puits puissants évacuent 13 fois plus d'eau qu'avant ces deux changements.

**Murs et portes.** Les murs de l'outil Carte arrêtent l'eau : `back` les lit dans les objets de la carte
(`waterWallsOf`, d'après le nom et la place des pièces `Carte Murs` et `Carte Fenêtres` du sol, sans le code de
l'éditeur ; un test du front vérifie que les deux lisent les mêmes murs). Un mur horizontal ou une fenêtre retient
l'eau à son pied, un mur vertical entre les deux colonnes de sa ligne. **Une porte fermée retient l'eau comme le
mur où elle se trouve ; ouverte, elle la laisse passer** : une inondation entre dans un bâtiment par ses portes
ouvertes (`waterDoorsOf`, `WaterGrid.setClosedDoors`, `TerrainWaterManager.swingDoors`). Le serveur ne connaît pas
l'animation des portes : une porte est ouverte pour l'eau tant qu'un avatar au sol se tient dans son passage (ses
cases, élargies d'une demi-case de chaque côté du mur), et une seconde après. Les deux battants d'une porte
s'ouvrent ensemble. Limites : un animal ou un compagnon qui ouvre une porte à l'écran ne l'ouvre pas pour l'eau ;
une porte de zone verrouillée s'ouvre pour l'eau dès qu'un avatar est dans son passage ; la règle des navigateurs
(sens de marche, trajet) est plus fine que celle du serveur, qui ne lit que la position. Un puits ne prend pas
l'eau de l'autre côté d'un mur,
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

**Altitude de l'avion.** L'avion d'Amine (PR #379) décolle seul en avançant jusqu'à l'altitude de croisière
(`AIRPLANE_ALTITUDE`, 1024) et survole tout sans collision. Le pilote règle maintenant l'altitude :
**ESPACE maintenu monte**, **CTRL maintenu descend**, en douceur (pleine vitesse 480 par seconde en 0,4 s, autant pour
s'arrêter), entre 64 (`AIRPLANE_MIN_FLIGHT_ALTITUDE`) et 2048 (`AIRPLANE_MAX_ALTITUDE`) ; relâchée, l'altitude tient
(`AirplaneFlight.cruise`). Le sol ne s'atteint que par un atterrissage, sur un terrain dégagé comme tout atterrissage :
V, ou CTRL tenu au plancher de 64 (l'avion se pose et reste garé). **Lâcher les flèches pose toujours l'avion**, comme
dans la #379, quelle que soit l'altitude réglée (la #401 la tenait sur place, retiré à la demande de l'utilisateur) :
dès qu'aucune touche de vol (flèches, ESPACE, CTRL) n'est tenue, plané et recherche d'un sol dégagé, depuis l'altitude
où se trouve l'avion (environ 1,4 s depuis 1024, 2,3 s depuis 2048 : descente bornée à 900 par seconde, sans saut).
ESPACE seul, flèches lâchées, fait monter tant qu'il est tenu (décollage sur place compris) puis l'avion se pose au
relâcher ; pendant le plané ESPACE et CTRL ne font rien. Reprendre les flèches annule l'atterrissage et l'avion revient
à l'altitude réglée ; ESPACE, flèches tenues, annule un atterrissage commencé seul (CTRL au plancher), pas celui
demandé par V. Chaque vol repart à la croisière.
- **ESPACE** (`spaceClimbs`, `Vehicle/AirplaneAltitudeKeys.ts`) : en vol, il monte toujours (rien du sol n'est à portée,
  comme avant). Au sol dans l'avion garé, il décolle seulement si rien d'autre ne le demande : une invite (siège,
  porte, animal…), un objet sélectionné à côté, le Nerf ou la canne en main gardent la priorité. L'indice de l'avion
  lui-même (« [V] pour descendre ») ne compte pas. Décidé à l'appui de la touche (`GameSceneUserInputHandler`), lu à
  chaque image tant qu'elle est tenue (`UserInputEvent.Climb`) ; le relâchement n'active rien.
- **CTRL** (`UserInputEvent.Descend`) : en vol seulement, hors éditeur, pas dans un champ de saisie, rien quand les
  entrées sont coupées. En vol, les déplacements tenus avec CTRL continuent de diriger (le filtre `ctrlKey` de
  `getEventListForGameTick` les laisse passer) et Ctrl + Z, Q, S, D, A, W ou une flèche ne déclenchent pas le
  raccourci du navigateur quand il peut être empêché. Limites : Chrome ne laisse pas empêcher Ctrl + W (ferme
  l'onglet), Linux quitte parfois sur Ctrl + Q, et macOS garde Ctrl + flèche pour changer de bureau (la page ne la
  reçoit pas). Au sol, CTRL reste un modificateur comme avant.
- **Rendu** : vu de dessus, l'avion grossit en montant, autour de son centre, de 1 au sol à 1,5 à la croisière et 2 à
  2048, par seizièmes (`airplaneScale` : une image de pixel art agrandie à chaque image scintille ; filtre au plus
  proche du jeu, pas de flou). Le pilote, le cockpit et les feux suivent la même échelle ; le nom monte au-dessus des
  ailes. L'avion est dessiné au-dessus de son ombre de 40 px à la croisière, 80 au plus haut (`airplaneLift`).
  L'ombre d'Amine reste telle quelle (plus petite et plus pâle en montant, au sol sous l'avion). Profondeur
  inchangée : au-dessus des toits et du voile de nuit (`AIRPLANE_RENDER_DEPTH`).
- **Partage** : l'altitude voyage déjà dans la variable de véhicule (`_avatarAirVehicle`, `_avatarVehicle`), bornée
  de 0 à 2048 et refusée si elle n'est pas un nombre fini (`readVehicleState`) ; chacun en déduit la taille, donc rien
  de géant ni de NaN. Envoyée au plus toutes les 200 ms tant qu'elle seule change, et lissée par chaque navigateur.
  Aucun changement du protocole ni du `back`. Un client d'avant la borne à 1024 et la dessine sans agrandir.

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
Mis à jour chaque seconde par `back` tant que l'eau bouge. La ligne de pluie dit « Pluie de la carte (Lille) » : la
pluie de l'air du serveur, la seule qui apporte de l'eau, avec le lieu de la carte quand sa météo est réelle (comme la
pastille météo, Paris par défaut) et « conditions réglées à la main » quand la salle est en manuel
(`Terrain/DashboardRain.ts`, relu chaque seconde). Dessous, deux notes au besoin : il neige sur la carte (la neige
reste au sol, seule la part de pluie est comptée, comme `liquidRainRate` du serveur) ; il pleut ou neige sur l'écran du
joueur qui suit une autre ville (`showsChosenPlaceWeather`), « pas sur la carte : cette pluie n'apporte pas d'eau ».
Les multiplicateurs des vagues (frottement, déferlement, élan) et la vitesse d'écoulement s'affichent « × le réel » ;
« En savoir plus » du frottement dit qu'il multiplie les rugosités des sols (lisibles sous le curseur, pastille des
étages).

**En jeu.** `Terrain/TerrainView.ts` dessine le relief (fond assombri avec la profondeur, pentes éclairées du
nord-ouest) et l'eau (bleu clair, plus sombre avec la profondeur, liseré sur la rive) dans un canevas lissé d'un
pixel par cellule, sous les objets et les avatars, redessiné seulement quand le relief, l'eau ou la vue changent
(dix fois par seconde pendant que l'eau glisse d'un état au suivant). On **nage** au-delà d'une demi-case d'eau
(16 px), comme dans une piscine, sans invite ; en dessous on marche. Un avatar sur un palier ne nage pas. Les flaques
de la pluie ne se posent pas sur le relief ; les éclaboussures deviennent des ronds sur l'eau.

**Relief en 3/4 : par le shader du sol, blocs en repli** (2026-11-21, conception et plan dans le dépôt d'infra,
`docs/superpowers/{specs,plans}/2026-11-21-relief-3-4-shader*` ; la fusion d'`infogene` qui a amené là :
`…/2026-11-21-fusion-infogene-deux-moteurs*`). Réglage personnel « Relief en 3/4 » (Paramètres → Graphismes → Effets ;
`pixelReliefStore`, clé `terrainPixelRelief`, coupé par défaut), sans recharger ; jamais dans l'éditeur ni en mode
Basique. Une règle dit qui dessine (`Terrain/GroundEngineChoice.ts` : `groundEngineOf`, et `blocksStateOf` pour les blocs),
lue par `GameScene` :

| Réglage | Éditeur ou Basique | Shader capable | Qui dessine le sol |
|---|---|---|---|
| coupé | — | — | le moteur à plat (`TerrainView`, `GroundSplat`) ; rien en Basique |
| activé | oui | — | le moteur à plat ; rien en Basique |
| activé | non | oui | le même moteur, ses shaders en 3/4 |
| activé | non | non | les blocs en pixel art (`ReliefTiles`), en 3/4 |

**En shader.** Les deux shaders de `GroundSplat` partent de `worldPoint()` (quel point de la carte est sous ce pixel).
En 3/4 cette fonction rend le point du sol **vu** au pixel : le plus au sud dessiné à cette ligne, la surface étant le
sol ou l'eau posée dessus, dessinée plus haut de la moitié de sa hauteur (±128 px au plus). Elle remonte vers le nord
depuis 128 px au sud du pixel, une rangée de centres de cellules à la fois (18 au plus), puis 6 moitiés entre les deux
dernières. `Terrain/ObliqueView.ts` en est le jumeau en TypeScript (`seenPoint`), testé ; le shader a été comparé à lui
au navigateur (3 013 points, tous à 1 px). Les hauteurs exactes vont au shader dans une image à part (deux octets par
cellule : `encodeHeight`, sol à gauche, surface à droite ; `TerrainWater.depthsOver` pour l'eau, sans plafond), envoyée
seulement en 3/4. La zone dessinée dépasse alors l'écran d'au moins 288 px en haut et en bas (`drawnArea`,
`stillCovers`). En 3/4 le shader ajoute : de l'herbe sous un relief sans sol peint (les tuiles de la carte restent à
plat dessous), les **parois** (là où le sol descend vite vers le sud : roche par strates, plus sombre), les **courbes
de niveau** (une par 32 px, sombre côté bas, claire côté haut). Tout le reste est celui du moteur à plat : piscines
peintes, glace, givre, sol mouillé, crête d'une comète, eau animée.

**Où le shader ne peut pas** (`GroundSplat.create` : pas de WebGL, moins de 10 unités de texture, ou pas de nombres
précis dans les fragments), le 3/4 n'est pas compilé du tout (`#define OBLIQUE`) et le réglage activé donne les blocs
des lots A à E, décrits ci-dessous (`Terrain/GroundEngines.ts` ne les crée que là). `GameScene.pixelReliefShown()` dit
« le 3/4 est affiché » (avatar, nom, poissons, bouchon, clic, nage) ; `GameScene.pixelBlocksShown()` et
`Terrain/PixelBlocksShown.ts` disent « les blocs dessinent » (moteur à plat caché, piscines posées en image à leur
image, feuilles au-dessus des blocs, herbe de la carte laissée aux blocs, écume en pixels, pas de traces du givre).

**Ce qui est posé sur le sol suit le relief** (2026-11-22, conception et plan :
`docs/superpowers/{specs,plans}/2026-11-22-relief-3-4-images-posees*`). En 3/4, quel que soit le moteur, seul le
**dessin** d'une chose est décalé : sa place sur la carte, sa collision, sa profondeur (qui est devant qui), ce que le
serveur sait et ce que l'éditeur lit ne changent pas. Réglage coupé, éditeur ouvert ou Basique : rien n'est décalé ni
calculé. La règle (`Terrain/GroundDrop.ts`) : `groundDropOf` = le décalage du **sol** sous le pied
(`GameScene.groundDropAt`) ; ce qui est **sur l'eau** prend celui de la surface (`surfaceDropAt`).

| Suit le relief | Comment |
|---|---|
| Arbres et objets posés au sol (`standsOnGround` : pas les pièces de l'outil Carte, ni ce qui est sur un palier, ni tapis et plafonniers) | `PlacedDrops` garde leur décalage (relu quand le relief ou le mode change, et deux fois par seconde) ; `CharacterDrops` les déplace le temps du dessin ; clic (`hitWhereDrawn`) et tri de la vue suivent le dessin |
| Avatars, leurs compagnons, animaux promeneurs | `CharacterDrops` (`GameScene.drawnLower`) |
| Antilopes, lions, tigres ; mouettes et leur ombre | décalage ajouté à la ligne dessinée (`LandLifeView`, `GullLifeView`) |
| Flammes, fumée, braises de l'herbe et des arbres, sol qui fume | `FireView`, `TreeFireView` |
| Comète, météore, averse, drain, flamme tenue, boule | visée au point **vu** sous le pointeur (`GameScene.seenPointUnder`, règle des shaders) ; dessin posé à la hauteur de leur point (`drawLower`). La boule, qui flotte à la surface de l'eau depuis la fusion du 2026-11-22, est dessinée à la hauteur de son niveau (`BallView`, `dropOf`), pas de ce qui est sous elle : elle chasse l'eau |
| Halo de nuit et lumière de la torche d'un avatar, ombre au sol des avatars et des animaux, ombre portée des objets et des arbres | `halosWhereDrawn`, `TorchManager`, `SkyMovingShadows` (`drop`), `shadowSourceEntities` |
| Traces de pas et de roues, feuilles au sol, feuilles soulevées | `FootprintLayer`, `LeafScatterLayer`, `KickedLeafLayer` (`dropAt`) |
| Écume du courant, remous des puits, ronds des sources | `WaterFlowView` (surface de l'eau) |
| Calotte de neige, tas de feuilles, témoin d'interrupteur d'un objet décalé | `SnowCaps`, `LeafPiles`, `SwitchIndicator` |

**Le construit reste à plat** (2026-11-22, `Terrain/BuiltGround.ts`). Les sols et les murs de l'outil Carte et les
tuiles sont des images de la carte : ils sont dessinés à leur place quel que soit le relief dessous. Sur du bâti posé
sur un relief (la terrasse de la piscine de la carte d'équipe est à +112 px, ses bâtiments à 0), l'avatar et les
meubles décalés ne correspondaient plus aux murs ni à leurs collisions, et l'herbe opaque du shader recouvrait le
dallage. En 3/4, le relief **vu** (`GameScene.reliefSeen`, `SeenRelief`) est donc celui de la carte, mis à plat sous ce
qui est construit : cases dallées par l'outil Carte (`pavedTilesOf`), intérieurs (`OutdoorGrid`), piscines posées en
image ou peintes, plus une cellule autour (le sol est dessiné droit entre les centres des cellules). L'eau y est vue à
sa place aussi (`seenDepthAt`, `depthsSeen`). Tout ce qui lit le décalage lit ce relief : shaders (`TerrainView`,
dépendance `seen`), avatars, objets, animaux, clic, visée, blocs. Le relief de la carte, l'eau du serveur, le mode à
plat et l'éditeur ne changent pas. Relu quand le relief change, et deux fois par seconde pour ce qui est construit.
Conséquence : une terrasse bâtie sur une butte ne paraît plus surélevée, la pelouse autour est dessinée plus haut avec
une paroi au bord.

**Limites.** Ne suivent pas le relief : les tuiles de la carte ; les pièces de l'outil Carte (sols, murs, portes,
fenêtres, paliers, escaliers, ponts : un bâtiment décalé pièce par pièce se déchirerait) ; la lumière des lampes et
des fenêtres ; la vue des courants de « Visualisation » ; la vapeur et les échelles des piscines ; les feuilles qui
tombent d'un arbre ; les reflets des nuages et des lampes sur l'eau, lus au point de la carte. Les flaques n'en ont pas
besoin : il n'y en a que sur un sol sans relief. Une catastrophe a un seul décalage, celui de son centre : un large
rond n'épouse pas le relief autour. Un objet posé sur un autre (une plante sur une table) a son propre décalage : sur
une pente ils glissent l'un par rapport à l'autre. La lumière d'une torche part de là où son porteur est dessiné : sur
un relief contre un mur, elle peut partir du mauvais côté du mur. Un clic pour marcher va au sol (au pied d'une
paroi), et sur l'eau à sa surface, là où l'on nage (`groundPointAt` reçoit la profondeur de l'eau). Une piscine peinte sur un sol plat
garde ses échelles au bon endroit ; peinte sur un relief, non. Le rendu en 3/4 est celui des textures du moteur à plat,
pas le pixel art des blocs. Coût non mesuré sur une carte graphique intégrée. Le thème « Hiver » de la branche avait
disparu avec celui d'`infogene` ; il est revenu le 2026-11-22 (voir « Thème saisonnier ») et blanchit le sol dans les
deux moteurs. Un pont étant fait de paliers, plus de cas particulier d'un pont dans la nage ni le décalage de l'avatar ;
le clic, lui, traite de nouveau le tablier à part.

**Seconde fusion d'`infogene` (2026-11-22, 105 commits : glace du serveur, piscines en eau réelle, écume et moutons
dans le shader, reflets du ciel, flocons, neige de sa propre ville, traces dans la neige).** Le poids des cellules est
passé de 8 à 12 paquets et le shader de l'eau lit deux textures de plus (nuages, lampes) : l'image des hauteurs du 3/4
reste à part, dernière texture de chaque shader (unité 9 pour le sol, 4 pour l'eau ; 10 unités demandées pour le 3/4,
inchangé). `GroundSplat.setWater(wet, strength, foam?, depths?)` ; `TerrainView` reçoit dans l'ordre le vent, « caché »,
« en 3/4 », « tout blanc » (thème Hiver). `TerrainWater.levelsOver` garde les nappes minces qui courent d'`infogene`
et la troncature demandée par les blocs. Les traces dans la neige ne sont pas laissées sur les blocs (ils ont les
leurs). Vérifié au navigateur après la fusion : shaders compilés sans erreur, 3/4 sur un mont de 256 px (décalage de
l'avatar et clic à 1 px près sur 6 points), thème Hiver à plat et en 3/4 ; la comparaison point par point du shader
à `seenPoint` (3 013 points) n'a pas été refaite après cette fusion.

**Les blocs, repli sans shader : relief vu de trois quarts** (conception et plan dans le dépôt d'infra,
`docs/superpowers/{specs,plans}/2026-11-20-relief-3-4*`). Hors de l'éditeur, le sol creusé est dessiné **plus bas de
la moitié de sa profondeur**, comme les étages sont dessinés plus haut de leur altitude : un trou de 8 cases (256 px)
a une paroi de 128 px. Là où le sol descend en allant vers le sud, on voit sa paroi (roche teintée par le sol du bord,
claire à l'arête, sombre au pied, strates) ; le bord sud cache le fond derrière lui ; l'eau est dessinée au niveau de
sa surface. La position vraie reste au sol (serveur, collisions, bulles, eau de `back` inchangés) : seul le dessin
bouge. `Terrain/ReliefProjection.ts` (pur : `dropAt`, `groundPointAt` de l'écran vers le sol, `paintColumn`),
`Terrain/ReliefTiles.ts` (une image par bloc de relief de 16 × 16 cellules, au-dessus du relief plat à 0,66),
`Terrain/ReliefTileSchedule.ts` (un bloc n'est redessiné que si son relief, ses sols peints, celui des 8 rangées au
nord, son eau, ce qui couvre ses cellules ou la saison changent ; jamais en marchant ni en zoomant ; un bloc à la
fois, les visibles d'abord, son dessin étalé sur plusieurs images à 6 ms par image au plus ; 64 blocs gardés).

**En pixel art net** (conception `docs/superpowers/specs/2026-11-20-terrain-pixel-art-design.md` du dépôt d'infra,
lot A) : un pixel du bloc pour un pixel de la carte, jamais lissé. Chaque point du sol prend une **matière**
(`Terrain/Pixel/MaterialField.ts` : neige, braise, cendre, paille, herbe de la prairie, puis sol peint, herbe sinon),
avec une frontière nette et irrégulière entre deux matières et un liseré d'1 px (sombre côté herbe et côté de la
matière la plus sombre, clair côté neige) ; sa **couleur** (`Pixel/GroundPixel.ts`) vient de la texture de la
matière (tables de 512 px), de la lumière de la pente (nord-ouest) et de la profondeur, réduite à une rampe de
4 teintes par une trame 4 × 4 (`Pixel/PixelPalette.ts`, `Pixel/PixelNoise.ts`). Une **paroi** commence là où le
dessin tombe de plus de 2 px pour un pixel de sol (`FACE_JUMP_PX`, sur la chute exacte) : tout ce qui tombe dessus
prend sa couleur (plus de rayures), le haut d'une paroi est cerné de sombre (`RIM_OUTLINE`) ; plus doux, le sol est
étiré, éclairé par sa pente même douce, et une **courbe de niveau** d'1 px plus sombre marque chaque case de
profondeur (`isContour`) : la forme d'une cuvette se lit même sous la neige. Sur un **pont**,
un avatar reste au niveau du tablier et un clic vise le tablier.

**Tout le sol dehors** (lot B) : les mêmes blocs dessinent aussi le sol plat, carte sans relief comprise. Une cellule
prend une matière (`Pixel/MaterialField.ts`) : rien dans une pièce ni sur un sol de l'outil Carte ou le tablier d'un
pont (les tuiles de la carte se voient), neige là où la neige de la carte est tombée, neige des hauteurs (ligne
de neige du calendrier), braise, cendre, paille, herbe de la prairie, **boue** (argile mouillée, règle de la marche),
sol peint, herbe sur les **tuiles d'herbe de la carte** (`Terrain/MapGroundLayout.ts`, même détection que l'ancienne
herbe saisonnière) ou au fond d'un trou ; sinon rien. Les couleurs suivent **la saison du thème, sinon du
calendrier** (`forcedTreeSeason` du thème, sinon `GameScene.getGroundSeason`, selon le lieu de la carte ; `Pixel/PixelPalette.ts` `rampsFor`) ; fleurs d'1 px dans l'herbe
dense au printemps (plus rares en été), feuilles tombées en automne. Dans l'éditeur et réglage coupé, c'est l'autre
moteur qui dessine (`TerrainView`, herbe de la carte par `Weather/SnowGround.ts`) ; rien en mode Basique. **Traces de pas** (`Terrain/Footprints.ts`) : toute
l'année, dans la neige, la boue et le sable, de la couleur du sol, posées au fond d'un trou à son décalage.

**L'eau** (lot C) : dans les mêmes blocs, en pixel art (`Pixel/WaterPixel.ts`) : 4 teintes de la saison (été plus
turquoise, automne plus sombre, hiver plus pâle), plus sombre avec la profondeur, la teinte la plus claire là où l'on marche dans l'eau (sous 16 px, `SWIM_DEPTH_PX`), plus sombre dès qu'on y nage, un liseré d'écume d'1 px au bord (de
glace en hiver) ; pendant l'outil Relief, un pixel sur deux de la trame laisse voir le fond. Un bloc n'est redessiné
que si l'eau d'une de ses cellules change de 2 px (`WATER_STEP_PX`). **Reflets** (`Terrain/WaterGlints.ts`) : quelques
points d'1-2 px qui s'allument et s'éteignent sur l'eau d'au moins 2 px, redessinés 8 fois par seconde au plus sans
toucher aux blocs ; aucun en mouvement réduit, en mode Basique ni très dézoomé. **Écume du courant**, tourbillons et
ronds des sources tracés en pixels entiers (`pixelRun`, `ringPixels`). **Poissons, dauphins, bouchon de pêche et
reflets** sont posés à la surface de l'eau dessinée, au fond d'un trou en 3/4 (`GameScene.surfaceDropAt`) ; rien n'est
décalé sur un pont ni dans l'éditeur. La canne reste à la place vraie de l'avatar. **Avatars** : chacun, le sien et ceux des autres, est dessiné plus bas de la
profondeur du sol (ou de la surface de l'eau où il nage) sous lui (`Terrain/AvatarDrop.ts`), seulement le temps du
dessin (`Terrain/CharacterDrops.ts`, comme les arbres au vent) ; son nom suit (`Character.setGroundDrop`) ; rien sur
un palier. **Clic** et altitude sous le pointeur passent par `groundPointAt` : un clic sur une paroi mène à son pied.
**Éditeur ouvert** : c'est l'autre moteur qui dessine, à plat, pour creuser et poser là où l'on vise (depuis le
2026-11-21 ; avant, les blocs étaient redessinés à plat). Neige du fond : la neige tombée de la carte
(`GroundSource.snowCoverHere`). **Limites (lot 1)** : objets, arbres, animaux, compagnons,
écume et tourbillons de l'eau restent dessinés à leur place (un arbre au fond d'un trou flotte au niveau du bord) ;
le fond est peint aux matières du relief, pas avec les tuiles de la carte ; la
zone cliquable d'un avatar dans un trou reste à sa place ; les éclaboussures de la nage partent de sa place.

**Les monts** (lot D) : un sol élevé est dessiné plus haut de la moitié de sa hauteur (128 px au plus,
`ReliefProjection.shiftAt`, décalage signé : positif dans un trou, négatif sur un mont) et cache le sol derrière lui.
Un bloc lit 8 rangées de cases au sud (un mont du bloc du sud y monte) et 8 colonnes à l'ouest (l'ombre du plus haut
mont, 113 px), une seule fenêtre pour
le dessin et ses signatures (`ReliefTileSchedule.blockCellWindow`). Son **flanc sud** est son sol à l'ombre, en roche
là où c'est une falaise (le dessin y saute de 6 px et plus par pixel de sol, `CLIFF_JUMP_PX`), cerné d'un liseré sombre
à son pied ; la **silhouette** de ce qui cache le sol derrière lui (sommet d'un mont, bord sud d'un trou) est cernée
aussi (`SILHOUETTE_GAP_PX`). **Ombre portée** au sud-est : un point est à l'ombre quand le relief au nord-ouest s'élève
au-dessus d'un rayon de pente 1,6 (`Pixel/GroundPixel.ts` `shadowHorizon`, horizon cumulé le long des diagonales du
bloc), direction fixe ; aussi sous le bord nord-ouest d'un trou. Neige au sommet au-dessus de la ligne de neige.
Avatars, poissons, reflets, bouchon et traces montent avec le mont ; un clic sur le mont donne le mont ; rien ne monte
sur un palier, un pont ni dans l'éditeur. **Limites** : un avatar, un objet ou un animal derrière un mont est dessiné
par-dessus lui (lot 2 du relief). Un clic sur le flanc sud d'un mont donne le mont (son bord quand le flanc est une
falaise), pas le sol à son pied. Courbes de niveau sur les monts comme dans les trous ; neige aux teintes écartées.
**Coût des poissons** : savoir si le bord sud de son trou cache un poisson demande de lire le relief jusqu'à 128 px au
sud de lui ; ce n'est demandé que pour les animaux à portée de la vue (`AquaticLifeView`, `NEAR_PX`), dix fois par
seconde au plus par animal (`HIDDEN_CHECK_MS`). Avant, c'était pour les 300 animaux de la carte à chaque image : 17 à
18 % du fil du jeu sur la carte d'équipe (mont de 256 px), mesuré au profileur.

**Chargement du terrain** : un bloc de la vue jamais dessiné est d'abord dessiné **grossier** (un point sur 4 dans
chaque sens, 16 fois moins cher : `ReliefTileSchedule.COARSE_TEXEL`), puis **net** ; la vue est remplie en quelques
images, puis affinée, les blocs visibles d'abord, du milieu de la vue vers ses bords (`nearestFirst`). Très dézoomé, un bloc n'est pas dessiné plus fin que l'écran ne le
montre (`texelFor` : un point pour 1, 2 ou 4 px de carte selon le zoom de la caméra, un point dessiné au plus un tiers
plus gros qu'un pixel d'écran : net au-dessus du zoom 0,67, 2 px jusqu'à 0,34, 4 px en deçà) ; il est redessiné plus
fin quand on zoome, jamais plus grossier quand on dézoome. **Cache** : les blocs qu'on quitte sont gardés, dans la
limite de 256 blocs nets (`KEPT_WEIGHT`, environ 65 Mo de textures depuis le lot E ; un bloc à 2 px compte un quart, un
grossier ne compte pas),
les moins récemment vus lâchés d'abord, jamais ceux autour de la vue : zoomer, dézoomer ou revenir ne redessine rien.
**Carte dessinée d'avance** : une fois la vue dessinée, le reste de la carte l'est en grossier, du plus proche au plus
loin (`drawAhead`, `ReliefInputs.mapSize`) : dézoomer ou se déplacer montre tout de suite le sol, affiné ensuite. Le
relief des blocs d'une vue immense est lu 48 blocs par image au plus. Plusieurs blocs peu chers par image, dans la limite de 6 ms
(`DRAW_BUDGET_MS`). Mesuré le 2026-11-21 dans Chromium sur la carte d'équipe locale (72 blocs visibles, zoom 1) : vue
remplie en 12 images, tout net en 155 images, 7,6 ms par bloc net (75 ms avant : les boucles tournaient dans le
générateur et les courbes de niveau allouaient un tableau par point).

**Blocs peints hors du fil du jeu** (lot E, `docs/superpowers/specs/2026-11-21-terrain-blocs-worker-design.md` du
dépôt d'infra) : le dessin d'un bloc est un module pur (`Terrain/Pixel/BlockPainter.ts`) qui peint à partir de données
simples (`BlockJob` : hauteurs, eau, matière de chaque case de la fenêtre, herbe dense), lues une fois par bloc par
`ReliefTiles.jobOf` (0,18 ms). Deux **workers** au plus (`Terrain/BlockPaintWorker.ts`, `BlockPaintPool.ts`,
`BlockPaintWorkers.ts`) calculent les pixels ; chacun reçoit ses blocs d'avance (environ deux images de travail,
`WORK_AN_IMAGE`) et les enchaîne seul. Le fil du jeu ne fait que préparer les blocs et envoyer les pixels revenus à la
carte graphique : 6 ms par image tant que la vue n'est pas nette, 3 ms ensuite (`HANDOVER_BUDGET_MS`). Les workers
démarrent par un blob de même origine qui importe leur script (le navigateur refuse un worker dont le script vient du
domaine des ressources). **Repli** : sans `Worker`, ou après une erreur, un message illisible ou 5 s de silence, les
blocs sont peints sur le fil du jeu comme avant (un avertissement dans la console, une fois). Le worker ne charge ni
la bibliothèque des cartes ni Phaser (`Pixel/TerrainUnits.ts` recopie les unités, un test garde l'égalité ;
`Pixel/WorkerImports.test.ts` refuse tout import lourd) : 13,7 ko minifié. **Une seule copie par bloc**
(`Terrain/ReliefSurface.ts`) : en WebGL les pixels vont droit à une texture (`addUint8Array`, mise à jour sur place)
par un tampon partagé par taille, sans canvas par bloc ; au retour d'un contexte WebGL perdu, tous les blocs sont
redessinés. Les blocs à dessiner sont choisis une fois par image (`plan`), un bloc sans relief n'est pas lu case par
case. Mesuré le 2026-11-21 dans Chromium (Apple M4 Max, carte d'équipe locale, 72 blocs visibles et 99 autour, zoom 1,
jeu à 27 images/s au repos), sur le fil du jeu puis avec les workers : vue remplie en grossier 1,05 s → 0,4 s ; vue
nette 11,6 s → 0,9 s ; tout net autour 16 s → 1,3 à 1,4 s ; temps du terrain sur le fil du jeu 1 800 ms → 153 à
169 ms ; 18 → 24 à 25 images/s pendant le chargement ; mêmes pixels (0 octet d'écart sur 4 blocs) ; textures du
terrain après un parcours de zooms 41 Mo, aucun canvas. Cibles de la conception non atteintes : 95 % des images sous
2 ms (4,5 à 5 ms au milieu, 6,5 à 7,5 ms au pire pendant 1,3 s : l'envoi des pixels à la carte graphique reste sur le
fil du jeu) et 110 blocs nets en moins d'une seconde (99 en 1,3 s). Très dézoomé depuis rien : 600 blocs grossiers en
3 s, jusqu'à 15 ms par image pendant ce temps.

**Limites.** L'eau traverse encore les murs (elle devra passer par les portes seulement : `back` ne connaît pas les
murs). Pas de mode Rivière tracée. Relief au sol et dehors seulement. Animaux et compagnons ignorent l'eau.
Pas de courant qui pousse l'avatar. Un geste immense part en plusieurs commandes (autant d'annulations). Les valeurs
par défaut du rythme sont à doser avec le tableau de bord. `play`, `back` et `map-storage` se déploient ensemble.

## Eau à inertie (à l'essai)

Réglage de carte `settings.water.inertia` (interrupteur « Eau à inertie (à l'essai) » du panneau Relief,
`UpdateWaterSettingMessage.inertia`, champ 8, facultatif), **coupé par défaut : sans lui rien ne change**, l'eau
avance de proche en proche (un cinquième de l'écart de niveau par pas, `WaterGrid.flow`).

Activé, chaque passage entre deux cellules garde son **débit** d'un pas à l'autre (`WaterGrid.flowWithInertia`,
`flowEast` et `flowSouth`). Le débit accélère avec l'écart des surfaces et la hauteur d'eau qui passe (gravité à
l'échelle de la carte : une case fait 1,095 m de côté, une cellule 0,55 m, un pixel d'eau 3,4 cm ; une vague court
à 2,4 m/s sous 60 cm d'eau, 4,4 m/s sous 2 m), et une cellule ne donne jamais plus que ce qu'elle a. L'eau a donc
de l'élan : des vagues courent, cassent, rebondissent et noient les rives. Une eau profonde clapote plusieurs
minutes avant de se calmer.

Murs et bord de la grille sont ceux de l'eau d'avant. Sources, puits, pluie, drains et les échanges lointains des
cartes accélérées ne changent pas : ils posent ou retirent de l'eau, l'inertie la fait ensuite courir. Les débits ne
sont pas sauvegardés : l'eau repart immobile après un redémarrage du serveur.

### Ce qui retient l'eau : quatre réglages (`settings.water.waves`)

Une seule équation partout, mais ce qui freine l'eau dépend de la case. Curseurs du panneau Relief quand l'inertie
est activée ; `UpdateWaterSettingMessage.waveRoughness`, `waveDamping`, `waveBreaking`, `waveMomentum`, champs 9 à
12, facultatifs.

- **Frottement du sol** (`roughness`, × 0 à 10, 1 par défaut et en réel ; curseur au pas de 0,05 avec des boutons − et + d'un cran, `Terrain/WaveSteps.ts`, les autres réglages des vagues gardent leur pas) : frottement de Manning. La part de débit
  perdue par seconde vaut le carré de la rugosité du sol × la vitesse de l'eau / sa profondeur à la puissance 4/3 :
  presque rien sous une houle au large, fort sous une lame d'eau rapide sur la terre. La rugosité vient du sol
  peint sur chaque case (`soilRoughness` : argile 0,022, sable 0,025, terre, gravier et case non peinte 0,03,
  rocher 0,04, prairie 0,045).
- **Amorti** (`damping`, 0 à 1 par seconde, 0,02 par défaut, 0 en réel) : perte de débit uniforme, ce qui calme un
  lac dérangé ; 0,02 est le minimum qui garde le calcul calme. Plus haut, les vagues s'éteignent avant la rive.
- **Déferlement** (`breaking`, × 0 à 5, 1 par défaut et en réel) : un front dont la surface tombe de plus d'un
  dixième de l'eau qui passe perd son débit en proportion ; une houle douce n'est pas touchée.
- **Élan emporté** (`momentum`, 0 à 1, 1 par défaut et en réel) : l'eau emporte sa vitesse avec elle (advection
  prise en amont). Mesuré : fronts plus nets, lac dérangé bien plus calme (crête de 31 px au lieu de 39 dans un
  bassin de 30 px), mais vagues qui grossissent moins en approchant du rivage qu'à 0.

**Terre émergée et cuvettes.** Le déferlement et l'élan emporté n'agissent que dans les cuvettes du relief (lac,
étang, mer : cases dont le sol est sous leur niveau de débordement, `WaterGrid.hollow`). Sur la terre émergée, le
front d'une crue est une lame qui avance, pas une vague qui casse : seul le frottement du sol la retient. Mesuré
sur le tsunami d'une comète de 24 cases dans un lac de 120 cellules de rayon : 165 cellules d'inondation (90 m),
sous 28 à 34 px d'eau sur les 60 premières, masse conservée (46 cellules seulement quand ces deux termes
agissaient aussi sur la terre).

**Hauteur d'eau.** Sous inertie, une vague n'est pas coupée à la hauteur maximale de l'eau de la carte (18 px par
défaut) mais à la plus haute qu'une carte puisse régler (256 px) ; sources et pluie restent limitées par le
réglage.

### Vitesse et cadence : trois réglages

- **Vitesse d'écoulement** (`settings.water.flowPace`, × 0,1 à 2, 1 par défaut et en réel, champ 15) : combien de
  fois sa vitesse réelle l'eau s'écoule (le temps que l'eau vit à chaque pas est multiplié d'autant : vagues, crues
  et courants). À 1 : 2,2 cases par seconde sous 60 cm d'eau, 4 sous 2 m. Repère : l'avatar marche à 5,6 cases par
  seconde, soit 6,2 m/s, 4,4 fois plus vite qu'un piéton. Pluie, sources et puits suivent « Vitesse de l'eau »,
  pas ce réglage.
- **Finesse du calcul** (`settings.water.precision`, 1 à 8, 3 par défaut, champ 13) : le plus de mouvements de
  l'eau par pas (10 pas par seconde). L'eau ne franchit jamais plus d'une demi-cellule par mouvement, et une vague
  ne court pas plus vite que ce que ces mouvements supportent : à 3, vague à 5,8 m/s au plus (celle de 100 px de
  fond) et torrent à 8 m/s ; à 8, 15 et 16 m/s. Sans ces bornes, un seul trou profond ou une seule source forte
  alourdissait chaque pas de toute la carte (mesuré : `back` à 100 % d'un cœur). Chaque mouvement de plus coûte
  autant de calcul.
- **Envois aux joueurs** (`settings.water.updates`, 1 à 10 par seconde, 1 par défaut, champ 14,
  `stepsBetweenUpdates`) : quand l'eau bouge ; au moins 5 sous une averse, un drain ou pendant trente secondes
  après une comète. Le fondu du navigateur dure le temps réel entre deux états (`TerrainWater.glideMs`), l'eau y
  est dessinée cinq fois par seconde au plus. Une cellule dont l'eau a bougé de moins d'un quart de pixel n'est pas
  renvoyée (jamais une cellule qui s'assèche ou se mouille) ; un état complet toutes les trente secondes remet tout
  d'aplomb.

### Vitesses envoyées aux joueurs : avatars et canoës emportés

Sur une carte à inertie, le serveur dit à chaque envoi à quelle vitesse l'eau court (`WaterGrid.writeSpeeds`,
`TerrainWaterMessage.speeds`, champ 9) : deux octets signés par bloc de 4 × 4 cellules (vers l'est, vers le sud,
en quarts de cellule par seconde, vitesse vue à l'écran, donc déjà multipliée par la vitesse d'écoulement),
compressés. Le navigateur les garde avec l'état de l'eau (`TerrainWater.speedAt`) et s'en sert à la place de la
pente :

- **Courant senti** (`currentPush`) : qui flotte (assez d'eau pour nager, 16 px) est emporté à la vitesse de l'eau,
  canoë à moitié ; qui a pied l'est selon ce qui renverse un piéton dans une crue, le **produit hauteur × vitesse**
  (`sweptShare`) : rien sous 0,4 m²/s, tout à partir de 1,2 m²/s, en proportion entre les deux (repères
  d'hydraulique des crues pour la stabilité d'un adulte, cités de mémoire). Une lame mince et rapide n'emporte
  personne, la vague d'un tsunami emporte plus vite qu'on ne marche. Le réglage « Force du courant » multiplie le
  tout. Sans inertie, la règle d'avant reste (pente de la surface, un quart de la vitesse de marche au plus, dès un
  quart de case d'eau).
- **Jamais dans un bâtiment** : le courant n'emporte personne à l'intérieur (`getOutdoorGrid().isOutdoorAt`), avec
  ou sans inertie. Ce n'était pas le cas avant : seuls les paliers, le drain et la glace l'arrêtaient.
- **Écume** et **visualisation des flux** : elles suivent la vitesse réelle, une vague qui passe comprise ; la
  légende dit « Vitesses calculées par le serveur ».

Les autres joueurs voient l'avatar emporté par sa position, comme pour tout déplacement.

Coût mesuré hors jeu : 4 Ko de plus par envoi pendant un tsunami (+8 %), 0,05 Ko sur une eau calme ; 1,3 ms pour
les écrire et les compresser.

### Comète, météore brûlant et drain sous inertie

- **Comète : impact physique seul.** Elle ne pose plus son onde anneau par anneau (`ImpactWave`) : l'eau du cratère
  et celle qu'elle apporte sont jetées en bourrelet autour du cratère (jusqu'à une fois et demie son rayon,
  au-dessus du niveau des crues s'il le faut, `strikeWater`), et l'eau fait elle-même la vague. Les cercles
  dessinés par le navigateur ne le sont plus. Sans inertie, la comète est celle d'avant.
- **Météore brûlant et drain** : ils retirent de l'eau comme avant ; le trou se referme par une vraie vague.

### Bouton « Réaliste » et aides du panneau

Le bouton « Réaliste » (en tête des réglages de la carte) remet tous les réglages de l'eau sur leurs valeurs
physiques (`REALISTIC_WATER_SETTINGS` : vitesse 1, inertie activée, vagues par défaut, vitesse d'écoulement 1,
finesse 3, 5 envois par seconde, hauteur d'eau à 256 px, ruissellement 10, évaporation 0,2 mm/h, absorption 5 mm/h,
vidange 300 mm/h). Seul l'amorti (0,02) n'est pas physique.

Chaque réglage a une aide d'une ligne qui finit par sa valeur réelle ; le détail (chiffres, mesures) est replié
dessous, sous « En savoir plus ».

### Limites connues

- **Puits fort plus efficace** : à la vitesse 1, un puits qui demande plus que son disque vide un lac environ
  2,5 fois plus vite (mesuré avant les réglages des vagues).
- **Trop-plein** (puits qui tient un niveau) et puits à grand disque : l'eau converge et forme une bosse, le
  trop-plein fait descendre le lac sous son niveau. Non corrigé.
- La rugosité de la prairie vient du sol peint, pas de l'herbe qui y pousse.
- Rien n'a été jugé à l'écran par un agent : allure des vagues, bourrelet de la comète, rives.

### Coûts mesurés (conteneur Linux sur Mac, hors jeu)

- **Calcul** : 30 à 33 ms par pas sur une grille de 600 × 600 sous l'eau, quelle que soit sa profondeur ; 22 ms
  sur la carte d'équipe locale rejouée (100 000 cellules sous l'eau), contre 4 ms sans inertie ; `back` local vers
  29 % d'un cœur.
- **Réseau** (grille de 480 × 320) : une carte au repos coûte 0,3 Ko par envoi (les cellules inchangées ne pèsent
  rien) ; un lac calme avec une source, 2 Ko/s à 5 envois par seconde ; un tsunami, 45 à 63 Ko par envoi, soit
  258 Ko/s à 5 envois et 450 Ko/s à 10, par joueur. N'envoyer que la zone qui change n'apporterait rien, et un
  autre encodage 25 % au mieux pendant un tsunami : non faits.


## Interface compacte : Catastrophes et Visualisation en pastilles sur la ligne de l'horloge

Constat de l'utilisateur sur l'écran natif d'un MacBook (fenêtre d'environ 1280 × 800) : l'interface prenait près de
40 % de la hauteur (ligne de l'horloge, onglets des catastrophes, une rangée pleine largeur avec un long texte d'aide,
la rangée Visualisation). Les deux rangées deviennent **deux pastilles** de la ligne de l'horloge, à gauche de la
pastille météo (`Components/ClockLine/ClockLineChips.svelte`) ; leurs réglages s'ouvrent dans un **panneau flottant**
ancré sous la pastille (`ClockLine/ChipPopover.svelte`). Rien d'ouvert : barre du haut et ligne de l'horloge seulement
(dans l'aperçu à 1280 × 800, bas de l'interface à 132 px au lieu de 252).

- **Qui les voit** : comme les rangées d'avant, rien de changé. Chaque pastille suit son entrée du menu des
  applications (`catastrophePanelStore`, `visualisationPanelStore`), hors mode Basique ; dans l'éditeur de carte aussi.
  Activée depuis le menu, la pastille ouvre aussitôt son panneau (on vient choisir) : les deux restent montées,
  masquées, tant que le menu ne les montre pas.
- **Panneau Catastrophes** : onglets Catastrophes | Météo, les six tuiles, le curseur de taille, « Toute la carte » de
  l'averse, et l'onglet Météo (conditions manuelles, curseurs et boutons − et +) qui défile à l'intérieur quand la
  place manque. Fermer le panneau **laisse la catastrophe armée** : la pastille le dit (« Boule · 4 cases », teinte
  active, anneau blanc) et un clic dessus rouvre le panneau sur sa taille. Le panneau reste monté avec sa pastille :
  onglet et taille montrée ne se perdent pas à la fermeture.
- **Panneau Visualisation** : les tuiles « Flux d'eau » et « Météo expliquée ». La pastille dit ce qui est affiché
  (« Flux d'eau », « Météo expliquée », ou « 2 affichés »). La légende des flux et le tableau « Météo expliquée »
  restent dans la colonne sous la ligne, comme avant (`VisualisationPanel.svelte`) : fermer le panneau ne les ferme
  pas ; la règle de hauteur du tableau (`WeatherBoardFit`) est inchangée et sa surimpression part toujours du bas de la
  ligne de l'horloge (+ 8 px).
- **Fermeture** : clic sur la pastille ; appui n'importe où ailleurs, sur la carte compris (c'est là qu'on commence à
  viser : l'appui ferme le panneau et lance la catastrophe choisie comme avant) ; Échap. **Échap désarme d'abord**
  (panneau ouvert ou non), puis, rien d'armé, ferme le panneau et rend le focus à sa pastille : un seul écouteur par
  pastille, et une touche prise par l'une (catastrophe désarmée, écoutée en phase de capture) ne ferme pas le panneau
  de l'autre. Un curseur ou une case du panneau resté focalisé est relâché à la fermeture
  (un champ focalisé suspend les entrées du jeu). L'appui dehors est écouté en `pointerdown` (phase de capture) :
  `svelte-outside` écarté, il écoute `click`/`mousedown` et ignore un événement dont le défaut est empêché, ce que fait
  Phaser sur son canevas.
- **Rien ne traverse** : un appui dans un panneau a pour cible le panneau, que Phaser traite comme « hors du canevas »
  (`POINTER_DOWN_OUTSIDE`/`POINTER_UP_OUTSIDE`, jamais le `POINTER_UP` qui fait marcher ou lance) ; la molette n'y
  zoome pas (Phaser ne lit la molette qu'au-dessus de son canevas), le panneau défile (`overscroll-contain`). Vérifié
  par les vrais écouteurs souris de Phaser (`ChipPopoverPhaserInput.test.ts`) et, dans l'aperçu, par
  `elementFromPoint` sur toute la surface des panneaux (seuls les coins arrondis laissent voir la carte).
- **Place** : le panneau s'ouvre sous sa pastille, bord gauche sur le sien, décalé vers la gauche pour ne jamais sortir
  de la fenêtre ; **sous les éléments de la ligne qu'il couvrirait** (la seconde ligne de la pile des étages, plus haute
  que les pastilles) ; hauteur au plus la place jusqu'au bas de la fenêtre (marge 12 px, 120 px au moins), défilement
  dedans. Règle pure `popoverPlacement` (`ClockLine/ClockLineFold.ts`).
- **Aide « i »** (`Input/InfoTip.svelte`) : les longs textes d'aide (celui de la catastrophe choisie, « Choisissez ce
  qu'il faut afficher sur la carte ») sont derrière un bouton « i » au bout de la rangée, mêmes textes i18n ; bulle au
  survol, au focus clavier et au clic ou au toucher (épinglée jusqu'au clic suivant ou un appui ailleurs) ; le texte est
  la description du bouton (`aria-describedby`). `Input/InfoButton.svelte` (survol seul, partagé par les champs) est
  laissé tel quel.
- **Repli par largeur** (`chipsFold`, mesuré sur la largeur du conteneur `main-layout` et les autres éléments de la
  ligne, à chaque changement de taille) : libellés si tout tient ; sinon **icône seule** (le nom en libellé accessible
  et en infobulle ; une catastrophe armée garde sa teinte et le nombre de cases) ; si même les icônes pousseraient
  l'horloge, les pastilles prennent **une rangée à elles** sous la ligne, avec leurs libellés (la ligne passe en
  `flex-wrap`, rien ne sort de la fenêtre). Sous 768 px, colonne comme avant, les pastilles en bas. Aperçu au pire
  contenu (météo de deux lieux, horloge « 20:51 Katmandou 500 km », pile à 250 px, 🌈) : libellés à 1280 et 1024,
  icônes à 820, rangée à part à 768.
- **i18n** `actionbar.catastrophe.{chip, chipArmed, chipHint, infoLabel}` et
  `actionbar.visualisation.{chipShown, chipHint, infoLabel}`, en `fr-FR` et `en-US`.
- **Non vérifié** : rien vu en jeu par un agent (aperçus hors jeu : vrais composants, pastille météo et horloge
  recopiées, onglet Météo et tableau remplacés par des substituts) ; écran tactile ; lecteur d'écran.

## Accélération vraie de l'eau (« Vitesse de l'eau » > 1)

Avant, une carte réglée à ×S faisait aller ses apports (pluie, sources, puits, évaporation, absorption, vidange,
neige, glace) S fois plus vite, mais son écoulement à inertie restait au temps réel : l'eau arrivait plus vite
qu'elle ne pouvait couler, et le modèle était faussé (crues trop hautes, flots qui ne suivaient pas). Désormais
(`WaterSimulation.step`), chaque pas réel de 0,1 s fait vivre à l'eau k pas de 0,1 s de temps de carte
(`grid.step` k fois), à la finesse 1 dès que k > 1 :

- **k** = min(S, ce que le budget tient) (`WaterPace`) : moyenne du coût d'un pas de temps de carte, et k pas doivent
  tenir dans le budget d'accélération, un paramètre du constructeur de `WaterSimulation` : **15 ms par pas réel sur
  le serveur** (`WATER_PACE_SERVER_BUDGET_MS`), sous un sixième d'un pas et loin des 50 ms où `WaterLoad` allège :
  le serveur n'a qu'un fil pour toutes les salles, une carte accélérée ne doit jamais ralentir les autres ; une salle
  dont le pas au temps réel prend déjà ce budget reste au temps réel (la carte d'entrée en eau, environ 13 ms sur le
  VPS). À relever quand chaque salle aura son fil (`GROUND_THREADS`). Dans le worker de la météo locale : 50 ms
  (`WATER_PACE_WORKER_BUDGET_MS`, la moitié d'un cœur). k part de 1, monte jusqu'à ce que le budget tient (au plus ×4
  tous les deux pas calmes, sous la moitié du budget), baisse aussitôt quand les pas coûtent ; jamais au-dessus de S. La finesse adaptative (`WaterLoad`) ne
  voit plus que le coût d'un pas de temps de carte.
- **Règle des apports** (`inflowAt`) : « effective » pour l'eau d'une salle (serveur, la vitesse de la carte en mode
  édition) : les apports vont au facteur atteint k, jamais plus vite que l'écoulement ; « asked » pour l'eau d'un
  joueur pour lui seul (lot « Eau rapide » à venir) : les apports vont au facteur demandé, l'écoulement à k.
- **Un seul facteur lu partout** (`livedTimes`) : les débits du bilan (`ratesOf`, en temps de carte), la neige et la
  glace (`MeadowSimulation.timesWith`, câblé par `GroundSimulation`), et le panneau : `reachedSpeed` (champ 12 de
  `TerrainWaterStatsMessage`) donne le facteur atteint ; sous le facteur demandé, le panneau dit « L'eau va ×k sur ×S
  demandé : le serveur ne la calcule pas plus vite ».
- **Échanges lointains et ruée vers les siphons** (`flowFar`, `flowSteps`) : sous inertie, ils sont coupés à chaque
  pas de temps de carte (`flowSteps` = 1), dans les deux règles : ils rattrapaient des apports trop rapides et
  fausseraient maintenant l'écoulement (constat de l'étude `etude-eau-serveur`). Ils restent pour l'eau sans inertie.
- **Preuve** (`back/tests/WaterAcceleration.test.ts`) : les trois scénarios de l'étude (rapport A de
  `etude-eau-serveur`), vécus au temps réel puis à ×6 et ×20, sondes comparées minute après minute en temps de carte
  (tolérance de l'étude : 1,5 px en transitoire, 0,5 px à la fin) : bassin 30 × 30 de 40 px qui déborde (écart le
  plus grand 0,06 px), vidange par un seuil (0,10 px), rivière de 200 cellules en pente de 0,1 px (0,12 px) ; en
  635 à 3 019 pas réels au lieu de 12 000 à 18 000. Les 19 empreintes de `WaterFingerprints.test.ts` sont
  inchangées (k = 1 au temps réel).
- Le rattrapage d'une salle vide garde la vitesse de la carte en un bloc sans inertie, comme avant.


**Partage du fil** (après #497, `WaterLoads`) : à côté d'autres eaux sur son fil, une salle accélérée compte son pas
réel entier dans la somme du fil. Elle n'accélère que dans ce que les autres lui laissent sous le seuil de retour de
la finesse, soit la moitié du seuil d'allègement (25 ms sur le fil des salles) : `WaterLoad.quietMs() - othersMs()`.
Si les autres tiennent déjà le fil, elle reste au temps réel, et elle ne fait jamais alléger les autres. Seule sur
son fil (une salle seule, le worker du navigateur), elle garde son budget, et sa finesse suit un pas de temps de
carte comme avant. Preuve : `libs/map-editor/tests/WaterPaceThread.test.ts`. Une salle à 20 ms par pas ne laisse
que deux pas de 2 ms à la salle accélérée, et une salle à 40 ms ne lui en laisse aucun ; la première n'est jamais
allégée.
## Écume des vagues sans saccade (`BreakingFoam`)

Mesuré dans le navigateur de test, sur la carte d'Antoine en crue (153 600 cellules, environ 85 000 sous l'eau) : le
calcul de l'écume prenait 100 à 120 ms à chaque état de l'eau (175 ms en eau rapide), en une seule image, chez tous
les joueurs. #498 l'avait rendu environ 60 % plus lourd : 150 → 240 ms sur un banc Node de la même taille.

- **Moins cher** : le lit de chaque cellule et les murs sont lus une fois par carte, dans des tableaux. Avant, chaque
  cellule fabriquait une vingtaine de clés de chaîne (`heightAt`, `closedSidesOf`). Les murs sont lus mur par mur
  (`ClosedSide.walls`). Une cellule n'est recalculée que si son eau, ou celle des cellules que sa vague regarde
  (3 cellules sur sa ligne et sa colonne), a bougé ; sinon elle garde sa vague. La vitesse de l'eau vive est
  relue à chaque état. Sur le banc Node : 240 → 11 à 12 ms par état.
- **Étalé** : `begin` à chaque état, puis `advance` à chaque image, `FOAM_VISITS_PER_FRAME` (120 000) visites de
  cellules au plus. Une cellule pas encore atteinte montre l'écume de l'état d'avant. Atteinte, sa nouvelle écume
  repart de ce qu'elle montrait, à son propre instant (`cellAt`) : rien ne saute. Un état arrivé pendant le calcul
  attend ; seul le dernier attend, et il monte sur le temps écoulé depuis l'état d'avant.
- **Mesures dans le navigateur, avant → après** : aucune image longue sur 30 s (avant, une de 108 à 142 ms par
  seconde, et de 150 à 175 ms en eau rapide). Coût de l'écume par image : 0,7 ms en moyenne, 1,8 ms au plus.
  Un état prend 13 images (eau du serveur), 28 en eau rapide.
- **Preuves** (`BreakingFoam.test.ts`, déterministes) : l'écume est égale cellule par cellule à `foamOfCell`, avec
  les murs et le relief, à l'arrondi 32 bits près. Quand une partie seulement de l'eau bouge, il y a moins de la
  moitié des visites. Chaque image reste sous son budget. La même écume (±10 %), sans bouffées, est tenue à 1, 2
  et 5 états par seconde, calculée sur 13 ou 30 images par état.

## Eau rapide, pour soi seul (« Réglages → Ambiance »)

Un interrupteur personnel, mémorisé dans le navigateur comme Basique (`fastWaterStore`, clé `fastWater`) : l'eau du
relief de ce joueur va 60 fois plus vite, sous la météo de la carte, ou sous celle de la ville qu'il suit.

- **Calcul** : le sol local de la météo personnelle (`LocalTerrainController`, worker `LocalTerrainSimulation`)
  démarre aussi pour l'eau rapide seule, sans ville choisie. Il garde alors la météo de la carte, avec l'air du lieu
  de la carte (Paris par défaut, comme le serveur). Les apports (pluie, sources, neige, et le pré qu'ils mouillent)
  vont ×60 (règle « demandée », `FAST_WATER_SPEED`). L'écoulement va k fois plus vite, k mesuré par `WaterPace` dans
  50 ms par pas (la moitié d'un cœur).
- **Retrait de `LOCAL_MIN_SPEED`** : sans eau rapide, la météo d'une ville suivie fait vivre l'eau au temps de la
  carte. Le tableau « Météo expliquée » propose alors l'eau rapide (« Pour voir l'effet de cette météo en quelques
  minutes, activez l'eau rapide »).
- **Indicateur** dans la barre d'actions : « Eau ×60 », ou « Eau ×60, courants ×k » quand les courants plafonnent
  (`reachedSpeed`). Les réglages disent alors de combien l'eau qui coule est plus haute que dans la réalité :
  (60/k)^0,6, d'après Manning.
- **Rien n'est enregistré** : l'eau locale repart de l'eau du serveur à chaque connexion, au retour d'un onglet caché
  (le worker est arrêté tant qu'il est caché) et avec « Resynchroniser ».
- **Coupure** : l'eau glisse en 1 s vers l'eau du serveur, et la barre affiche « Retour à l'eau partagée ».
  Avec une ville suivie, le sol local continue, au temps de la carte.
- **Serveur** : rien ne lui est envoyé, sauf le symbole de perception (`water`). Les catastrophes de la salle
  agissent aussi sur cette eau (`LocalCatastropheRelay` : la comète frappe et la boule de feu brûle à l'impact, la glace
  se brise et le feu prend aussitôt, averses, siphons et boules tant que le serveur les dit). Les conditions réglées à la main dans la salle (Catastrophe → Météo)
  ne sont pas suivies par l'air local.
- **Non vérifié** : aucun rendu vu, aucune mesure dans un navigateur.

## Défauts de l'eau d'une carte (2026-11-22) et garde-fou réseau

Une carte qui ne règle pas son eau a désormais : vitesse 1 (temps réel, #478), neige et glace à la même horloge
(#480), hauteur des crues jusqu'à 256 px (8,7 m au-dessus du niveau de débordement : aucune crue coupée ; réglable
de 18, `MIN_WATER_MAX_SURFACE`, à 256), cinq envois par seconde (`DEFAULT_WATER_PACE.updates`) et l'eau à inertie
(`DEFAULT_WATER_SETTINGS.inertia`, lue par `waterHasInertia` : un `inertia: false` enregistré est gardé, et le
panneau l'écrit désormais). Le défaut est donc le réel : `REALISTIC_WATER_SETTINGS` en est dérivé (une seule liste),
et le bouton « Réaliste » s'appelle « Remettre les réglages réels ». Une carte qui a enregistré ses réglages les
garde. La météo locale (#473) prend le même défaut : sa carte locale est celle du serveur, sans réglage d'eau elle a
l'inertie aussi (calcul dans son worker, hors du fil d'affichage). Le rattrapage d'une salle vide reste sans inertie.
Coût serveur de l'inertie (carte d'entrée, synthétique) : pas de 2,7 → 6,3 à 7 ms, environ 8 à 9 % du fil par salle
avec l'envoi ; 600² : 15 à 17 ms, environ 20 %.

**Garde-fou réseau** (`Terrain/WaterSendLoad.ts`, par salle, dans `WaterSimulation.tell`) : chaque état envoyé est
pesé (profondeurs, `speeds` et `slowSpeeds` compressés, moyenne sur 5 états). Au-delà de 100 ko par seconde et par
joueur (`WATER_SEND_BUDGET_BYTES_PER_SECOND`, moins d'un mégabit par seconde, de quoi laisser la place à la voix et
à la vidéo sur un réseau lent), la cadence descend aussitôt à ce qui tient sous ce plafond, jusqu'à un état par
seconde au moins (la règle des vagues, cinq par seconde, cède aussi) ; elle remonte d'un cran après 10 s d'états
assez petits pour tenir sous la moitié du plafond au cran suivant. Le réglage de la carte ne change pas ; le panneau
le dit par le champ existant `easedUpdates` (« Serveur ou réseau chargé : envois réduits à N par seconde sur M »).
Mesures avec l'inertie : lac calme sur la carte d'entrée, environ 10 ko par état (47 ko/s à cinq par seconde, 72 sur
mer agitée) : cinq par seconde tenus ; mer de 600² qui court (environ 37 ko) : deux ; carte entièrement inondée
(130 ko et plus) : un, le minimum (encore 130 ko/s : le plafond ne peut pas descendre sous un état par seconde).
**Au plancher, par blocs** (`WaterSendLoad.atFloor`, `holdStillBlocks`) : quand le garde-fou tient la salle à un état
par seconde alors que la carte en demande plus, l'eau est dite par blocs de 8 × 8 cellules. Un bloc n'est dit que
si l'une de ses cellules a bougé d'un pixel au moins, ou a séché, ou s'est mouillée. Il est alors dit en entier : pas
de marche d'un pixel dans la surface d'un lac. Sinon, il garde ce que la salle a reçu. Chaque cellule reste donc à
moins d'un pixel de la vérité, mouillée ou sèche comme elle l'est, et l'état entier, toutes les 30 s, remet tout
d'aplomb. Hors du plancher, la règle d'avant ne change pas (un quart de pixel, cellule par cellule).
Mesure sur une mer de 300² inondée, avec l'inertie et la pluie, à un état par seconde : les profondeurs passent de
60 à 35 ko par état (−42 %), et les vitesses, environ 6 ko, ne changent pas. Non mesuré sur la carte de 600² ni
dans un navigateur.
Autre piste, non codée : espacer au-delà d'une seconde (un état toutes les 2 s) sous le plafond. L'eau que le
navigateur simule pour lui seul (#473) n'a pas de garde-fou : rien n'y voyage (`sendBudget` infini).

Coût de cinq états par seconde sans inertie (carte de 480 × 320, lac, à vitesse 1) : 3,6 → 9 ko/s par joueur
(1,8 ko par état, surtout des changements nuls compressés), envoi 1,5 → 6 ms par seconde au serveur.

## Visualisation des flux d'eau

Entrée « Visualisation » du menu des applications (sous « Catastrophe ») : une pastille sur la ligne de l'horloge
(`VisualisationChip.svelte`, `visualisationPanelStore`) dont le panneau a une tuile « Flux d'eau »
(`waterFlowOverlayStore`) ; la légende reste sous la ligne (`VisualisationPanel.svelte`). Voir « Interface compacte ».
Pour soi seul, pour la session ; l'affichage reste quand le panneau est fermé. Indisponible en mode basique.

Par-dessus la carte (`Terrain/WaterFlowOverlay.ts`, dix dessins par seconde, au-dessus du voile de nuit) :

- **une flèche là où l'eau court** : sens, vitesse par la longueur et la couleur (échelle de 0 à 3 m/s et plus,
  `FLOW_SPEED_SCALE`), point qui file le long de la flèche. Une flèche par bloc de cellules, plus gros vu de loin,
  3 000 au plus ;
- **une teinte là où le niveau change** : bleue quand il monte, magenta quand il baisse, plus soutenue quand il
  change vite (pleine à partir de 0,5 px/s, 1 m par minute). Elle suit la **tendance** du niveau sur quelques
  secondes, pas le clapot (voir ci-dessous) ;
- **une étiquette sur les 8 plus grosses masses d'eau en vue** (`Terrain/WaterMasses.ts`) : volume en m³, surface
  en m², profondeur moyenne en m, puis ce qu'elle gagne ou perd en m³ par minute (somme des tendances de ses
  cellules : elle ne saute presque plus avec les vagues). Ces débits sont en **temps réel**, alors que sources,
  puits et pluie suivent le temps de jeu (« Vitesse de l'eau ») : à 4, une source de 100 m³/h verse 6,7 m³/min. La
  légende le dit en une ligne.

**Tendance plutôt que clapot** (`Terrain/WaterTrend.ts`, alimenté par `TerrainWater.receive`). Le serveur envoie
l'eau une fois par seconde ; les vagues du modèle à inertie durent 2 à 4 s (mesuré : 2,3 à 3,8 s sous 40 px, jusqu'à
5 s sous 12 px). L'écart entre deux états d'affilée est donc la pente de la vague du moment : sur une mer qui
clapote, il changeait de signe une seconde sur deux (26 à 39 fois sur 58) et 80 à 90 % des blocs étaient teintés,
damier bleu et magenta qui clignotait. S'y ajoutait le seuil (0,02 px/s), sous le plus petit écart que le serveur
transmet (il ne redit une cellule qu'à partir d'un quart de pixel). Le lissage doit donc durer plus longtemps
qu'une vague (2 à 4 s), quelle que soit la cadence des états (1 à 10 par seconde, 5 avec le réglage « Réaliste ») :
lisser sur 1 s ne changeait rien à 1 état par seconde, et pas assez à 5. La règle, par cellule de la grille
(indépendante du zoom et de la caméra) :

- l'écart de chaque état, rapporté au temps écoulé, passe dans deux filtres exponentiels de 4 s à la suite (résolus
  exactement, quel que soit l'intervalle entre deux états) : une vague de 3 s n'en garde qu'un soixante-dixième ;
- **zone morte** : aucune teinte sous 0,06 px/s (2 mm/s, 12 cm par minute), ni sous 15 % de l'agitation de l'eau
  (moyenne quadratique, sur 10 s, de sa vitesse de montée mesurée sur environ une seconde, quelle que soit la
  cadence) : une mer forte cache une montée lente, jamais ne la montre à l'envers. Rien n'est teinté avant trois secondes d'observation ;
- **hystérésis** : une teinte reste jusqu'à ce que la tendance retombe sous la moitié de son seuil ;
- **silence du serveur** (rien ne bouge d'un quart de pixel, il n'envoie plus) : après 2 s sans état, la tendance
  s'éteint d'elle-même (`TerrainWater.settled(now)`).
- **à la demande** : la tendance n'est tenue que tant que la visualisation la lit (`TerrainWater.settled(now)`, dix
  fois par seconde quand « Flux d'eau » est affiché ; aucun autre lecteur). Fermée, aucun parcours de la grille et
  aucune mémoire, au premier état reçu après 30 s sans lecture. Rouverte plus tard, elle repart de rien (pas de teinte
  d'avant la fermeture) et ne teinte qu'après 3 s d'observation. Coût mesuré quand elle est tenue
  (Node, Mac M) : 2 ms par état sur une grille de 600 × 600 cellules (0,2 à 0,3 ms sur 200 × 200), soit 2, 10 ou
  18 ms par seconde à 1, 5 ou 10 états par seconde ; aucun tableau alloué par état ; 17 octets par cellule (quatre
  tableaux `Float32Array` et un `Int8Array`), 6,1 Mo pour 600 × 600. Auparavant, ce coût valait pour tout joueur,
  même sans la visualisation.

Mesuré sur le modèle (bassin de 80 × 80 cellules, 40 px, `WaterGrid` avec inertie, bande morte du serveur
reproduite) : 0 à 2 changements de teinte par minute et par cellule sur mer forte (vagues de 30 à 45 cm), 0 à 2
sur mer modérée, au lieu d'un changement de signe toutes les une à deux secondes. Une montée de 0,1 px/s sous un
clapot modéré apparaît en 5 à 11 s, une de 0,5 px/s en 2 à 3 s, une de 1 px/s sur mer forte en 1 à 4 s, puis ne
s'éteint plus tant qu'elle dure. L'étiquette d'une masse atteint 63 % d'un nouveau débit en 8 à 9 s ; sur un
bassin fermé de 2 400 m³ qui clapote, elle reste à « = » sauf 3 secondes sur 120 (1,2 à 1,6 m³/min, au lieu de
±1,5 à ±14 m³/min chaque seconde auparavant). Rien n'a été vu à l'écran par un agent.

Les **flèches** ne sont pas lissées : elles montrent la vitesse que le serveur calcule, une vague qui passe
comprise. Sur mer modérée, cette vitesse reste sous son pas d'envoi (un quart de cellule par seconde) : pas de
flèche. Sur mer forte, une flèche s'inverse d'une seconde à l'autre 15 à 35 % du temps, ce qui est le mouvement réel
de l'eau sous la vague.

**Courants lents** (dès 1 cm/s sur une carte à inertie). Le serveur transmet la vitesse par bloc de 4 × 4 cellules,
par pas d'un quart de cellule par seconde (`speeds`, `SPEED_UNITS`, 0,137 m/s) : plus lente, elle valait zéro et
l'overlay ne traçait rien. Un champ facultatif `slowSpeeds` (champ 10 de `TerrainWaterMessage`, même disposition)
donne, là où `speeds` dit zéro, la vitesse en 250ᵉ de cellule par seconde (2 mm/s), dès 1 cm/s : `SLOW_SPEED_UNITS`,
`SLOWEST_TOLD_METRES` (une seule constante pour le serveur, le plancher de l'overlay et la légende), codage linéaire
(`slowSpeedByte`, `slowSpeedOf` : la plage ne va que de 5 à 31 unités, une loi plus fine n'apporterait rien et peu de
valeurs se compressent bien). Le serveur l'écrit dans le même passage que `speeds` (`WaterGrid.writeSpeedBytes`) et
ne l'envoie pas quand aucun bloc n'est lent ; `speeds` reste identique octet pour octet (test sur une rivière). Plancher
de 1 cm/s choisi par l'utilisateur le 2026-11-22, sur le tableau ci-dessous.

- **Compatibilité** : un `play` ancien ignore le champ ; un `back` ancien ne l'envoie pas et le `play` neuf trace
  alors dès 0,14 m/s, comme avant. Déployer `play` et `back` ensemble reste la règle (même commit, protobuf partagé).
- **Courant des avatars et des canoës inchangé** : `speedAt` lit les vitesses lentes, mais `currentPush` et
  `waterCurrentAt` ne comptent qu'à partir de 0,2 cellule/s (`CURRENT_REST_SPEED`), au-dessus de toute vitesse lente
  (0,124 au plus) : test.
- **Coût mesuré** sur le code réel, octets gzip de `slowSpeeds` ajoutés par message (`speeds` seul entre parenthèses),
  puis octets par seconde au total à 1 / 5 / 10 états par seconde ; temps d'écriture du serveur inchangé (0,9 ms par
  message sur 600 × 600, un seul passage), calcul de l'eau non touché ; la finesse adaptative (#446) réduit la cadence
  sous charge, donc ces débits :

  | Cas | 1 cm/s | 2 cm/s | 3 cm/s |
  |---|---|---|---|
  | Mer 80 × 80 qui se calme (28) | +248 ; 276 / 1 378 / 2 755 | +69 ; 97 / 487 / 974 | +13 ; 41 / 203 / 405 |
  | Mer 600 × 600, 10 s après une tempête (78) | +4 036 ; 4 114 / 20 569 / 41 138 | +1 147 ; 1 225 / 6 123 / 12 247 | +261 ; 339 / 1 695 / 3 389 |
  | Mer 600 × 600, 1 min après (78) | +1 978 ; 2 056 / 10 278 / 20 555 | +90 ; 168 / 840 / 1 681 | +0 ; 78 / 390 / 780 |
  | Eau au repos (28) | +0 | +0 | +0 |
  | Étang avec source (28 à 47) | +30 à 44 ; 62 à 78 par s à 1 état/s | +28 à 39 | +28 à 34 |

- **Ce que montre l'étang de la capture** (simulation : 11 × 11 cellules, 30 cm d'eau, source de 100 m³/h, trop-plein
  par un chenal ; blocs de l'étang ayant une flèche, sur 9, avant / 1 cm / 2 cm / 3 cm) : à « Vitesse de l'eau » 1,
  0 / 4 / 1 / 1 ; à 4, 1 / 8 / 6 / 4 ; à 60, 7 / 8 / 8 / 8. Les flèches lentes sont courtes et pâles (échelle
  existante). La légende dit « transmises à partir de 0,01 m/s ».
- **Pistes non codées** : n'envoyer `slowSpeeds` qu'aux joueurs qui ont « Flux d'eau » ouvert demanderait un message
  du navigateur au serveur (aucun n'existe : la vue est locale) et un envoi par joueur au lieu d'un envoi à la salle ;
  et le rendu de l'eau mince qui court lira ce champ : il reste donc envoyé à tous.
- Écartée : deviner la vitesse d'après la pente quand le serveur dit zéro (3 à 6 cm/s sous 30 cm d'eau demandent une
  pente de 0,001 à 0,002 px par cellule, trente fois sous le bruit des profondeurs reçues).

**La glace ne retient pas l'eau.** La glace du serveur (`Meadow.stepIce`) est une épaisseur à part, posée sur l'eau :
le pré ne lit l'eau que par `depthAt` (`MeadowManager`, `water: () => Pick<WaterGrid, "depthAt">`) et n'y verse que
la neige fondue. `WaterGrid.step` ne connaît pas la glace : une source sous un étang gelé verse tout son débit, l'eau
coule dessous et déborde (test : l'étang garde tout ce que verse la source, puis l'eau sort par le chenal). L'overlay
ignore aussi la glace : un courant sous la glace a ses flèches.

**« … » : mesure en cours.** À l'ouverture de « Flux d'eau », la tendance n'est connue qu'après 3 s d'observation :
les étiquettes affichent « … » au lieu de « = » (qui affirmait « ni gain ni perte »), et la légende le dit. Fermée,
la vue garde sa tendance 30 s (`TREND_UNREAD_MS`) : rouverte dans ce délai, elle n'attend pas de nouveau ; au-delà,
la tendance est lâchée au premier état reçu.

Tout est lu des profondeurs que le navigateur reçoit déjà (`TerrainWater.settled` garde l'état d'avant et le temps
entre les deux) : rien n'est demandé au serveur. Limites : les vitesses sont **estimées** d'après la pente de la
surface (`steadyFlowSpeed`, selon le modèle d'eau, les réglages des vagues, la rugosité du sol et la vitesse
d'écoulement de la carte), pas mesurées : une vague qui passe sous inertie ne s'y lit pas ; les masses ignorent
les murs. Sur une carte à inertie, les vitesses sont celles que le serveur envoie, plus une estimation. Coût non
mesurable en images par seconde dans le navigateur de test.

### Météo expliquée : pourquoi je vois ce temps

Dans le même panneau, une seconde tuile « Météo expliquée » (`weatherExplainedStore`, pour la session) ouvre un
tableau en lecture seule (`WeatherBoard.svelte`) qui dit au joueur, en direct, pourquoi il voit ce qu'il voit. Il
existe en effet deux airs, et chaque phénomène a le sien :

- **l'air de la carte**, le même pour tous : les conditions réglées à la main dans la salle (Catastrophe → Météo),
  sinon l'air réel du quart d'heure en cours au lieu de la carte (Paris sans lieu) ;
- **l'air du joueur** : celui de la ville qu'il suit sur son horloge (« Jour dans le monde »), pour lui seul.

En tête, les deux airs côte à côte (un seul pour qui suit le serveur) : origine, température, humidité, vent, et la
phrase qui dit lequel s'applique. Puis une carte par phénomène, chacune avec son résultat de maintenant, sa raison
avec les chiffres du moment, deux pastilles (« Décidé par l'air de la carte / ton air », « Vu par tout le monde /
tous ceux qui suivent le serveur / toi seul » ; bleu pour la carte, jaune pour le joueur), ce qu'il faudrait pour que
cela change, et la règle dans un « En savoir plus » :

| Carte | Règle du jeu interrogée | Air qui décide | Vu par |
|---|---|---|---|
| Pluie ou neige ? | `snowShareOf(precipitationAirNow)` | ville suivie quand sa météo est dessinée, sinon carte | toi seul, ou ceux qui suivent le serveur |
| Averse de la catastrophe | `snowShareOf(roomPrecipitationAir)` | carte, toujours | tout le monde |
| Givre au sol | `frostOf(frostAirNow)` (`hoarFrost`) | ville suivie, sinon carte | toi seul, ou ceux qui suivent le serveur |
| Glace sur l'eau | `iceOf(frostAirNow)`, `isFrozen` | comme le givre | comme le givre |
| Sol gelé | `soilFrostOf(roomPrecipitationAir)` | carte (serveur) | tout le monde |
| Neige au sol | `MeadowState` reçu du serveur, `snowMeltMmPerHour` | carte (serveur) | ceux qui suivent le serveur |

**Jamais plus bas que la fenêtre.** Le tableau est sous l'horloge, les fiches météo dépliées, le concours de pêche
et les catastrophes, dans une colonne sans borne basse : une hauteur fixe (60 % de la fenêtre) le faisait sortir de
l'écran. `WeatherBoardLive` mesure la place qui reste sous ce qui le précède jusqu'au bas de la fenêtre (marge de
12 px, `weatherBoardFit`) et lui donne cette hauteur, le tableau défilant dedans ; mesure refaite quand la colonne
ou la fenêtre change de taille, pas à chaque seconde. Avec moins de 240 px de place, il s'ouvre **par-dessus** les
panneaux du dessous, juste sous la ligne de l'horloge (et ses fiches), fond opaque, avec une croix de fermeture
(la tuile qui l'a ouvert peut être dessous). La molette au-dessus du tableau le fait défiler, sans zoomer le jeu
(Phaser ne lit que la molette au-dessus du canevas) ; pas de fermeture par Échap (aucun panneau voisin ne le fait,
et Échap désarme déjà une catastrophe).

**L'écran du joueur face à la carte du serveur.** Le sujet du tableau est ce que ce joueur voit. Quand il suit une
ville, la pluie ou la neige, le givre et la glace de son écran sont calculés une seconde fois avec l'air de la carte
(`onMap`, ce que voient ceux qui suivent le serveur ; `mapFrostAirNow` pour le givre et la glace) :

- sous les deux airs, un bandeau « Ton écran et la carte, en ce moment » liste les six phénomènes en une ligne
  chacun (« toi, neige · carte, pluie », pastille « écart », « pareil » ou « serveur ») ;
- une carte dont le résultat diffère (`differs` : forme ou chute de la précipitation, niveau du givre, stade de la
  glace) montre « Chez toi » puis « Sur la carte (serveur) », chacun avec sa raison, puis un encadré « Écart » : ce
  que voient les autres, et ce que le serveur compte réellement (la pluie de la carte remplit l'eau, sa neige
  s'accumule, rien ne tombe ; le givre et la glace ne sont que dessinés, l'eau du serveur reste liquide) ;
- sans écart, une seule ligne (« Comme sur la carte… », ou « C'est la météo de la carte… » pour qui suit le serveur) ;
- les cartes du serveur (averse, sol gelé, neige au sol) disent que l'air du joueur n'y change rien, et ce que le
  serveur applique à tout le monde (sol gelé ou non, neige non montrée).

Aucune physique n'est recopiée : `Weather/WeatherExplained.ts` (`explainWeather`, pur) reçoit les airs que lisent
les lecteurs du rendu (`Weather/WeatherBoardNow.ts` les appelle : `precipitationAirNow`, `roomPrecipitationAir`,
`frostAirNow`, `waterCycleNow`, `fireConditionsStore`, `MeadowState`) et interroge les règles du jeu. Les « il
faudrait » sont trouvés par dichotomie sur ces mêmes règles (`thresholdBetween`), jamais par une formule à côté. Un
test compare, sur une grille d'airs, chaque valeur expliquée à celle que rend la règle du jeu. `Frost.ts` exporte
pour cela `frostAirNow`, `frostOf` et `iceOf`, que `waterCycleNow` utilise lui-même.

Le tableau est recalculé une fois par seconde (horloge du jeu) tant qu'il est ouvert ; fermé, il n'est pas monté.
Ce qui est honnêtement approché : le sol gelé est refait par le navigateur avec le même air que le serveur (les
frises Open-Meteo des deux sont relevées à des moments différents) ; la neige au sol est ce que le serveur a envoyé
(toutes les dix secondes quand elle change), sa tendance (s'épaissit, fond, tient) est déduite de l'air de la carte
et du vent des conditions de la salle. Non couverts : sol mouillé et flaques, eau apportée par la pluie en chiffres,
soleil et lumière, herbe, feu, saison.


### Glace et neige du serveur dans « Météo expliquée », et pipette

**Tableau.** Pour qui suit le serveur, la carte « Glace sur l'eau » ne dit plus ce que l'air du moment formerait
(ancienne règle du navigateur, `Frost.iceAt`) mais la glace que le serveur tient, avec son passé : l'épaisseur la
plus forte de la carte (`MeadowState.peakIceMm`), si elle fond ou épaissit, de combien de millimètres par heure, et
quand elle aura disparu. La neige de même (`peakSnowMm`). Les chiffres viennent de `Weather/KeptCover.ts`
(`explainKeptIce`, `explainKeptSnow`), qui assemble les règles du serveur comme `Meadow.stepIce` et `stepSnow` :
`iceGrowthMmPerDay × ICE_GROWTH_TIMES`, `iceCurrentShare`, `iceThawMmPerHour`, `snowMeltMmPerHour`,
`snowSublimationMmPerHour`, à l'horloge de l'eau de la carte (`waterTimesOf`). Pour qui suit une ville, sa propre
glace (règle du navigateur) est mise en regard de celle du serveur.

À savoir sur la fonte : seul l'air de la carte compte (température, vent, humidité) ; le même nombre de millimètres
est retiré partout, donc la plus mince part d'abord (bords, eau qui courait pendant le gel) ; ni le soleil, ni
l'ombre, ni la profondeur, ni le courant ne la changent ; à vitesse d'eau 1 elle est en temps réel (10 cm à 24 °C,
10 km/h, 49 % : environ 14 h).

**Pipette.** Troisième tuile de la pastille Visualisation (`weatherPipetteStore`). Tant qu'elle est sortie, un
panneau (`WeatherPipette.svelte`, phrases dans `pipetteText.ts` et `coverText.ts`) dit ce qui se passe dans la case
du sol sous la souris : relief et sol ; eau (profondeur, surface, vitesse et sens du courant) ; glace (épaisseur,
fonte ou prise en mm par heure, temps avant disparition, avant de porter ou de céder, seuils de 50 mm pour un
marcheur et 102 mm pour une cabane, eau qui court trop vite pour geler, intérieur) ; neige ; givre et sol gelé ;
herbe, humidité, feu, cendres ; soleil. Pastilles « Décidé par / Vu par » comme le tableau.

`GameScene.stepWeatherPipette` lit la case (`Weather/CellProbeNow.ts`, par les lecteurs du jeu : `groundReadingAt`,
`TerrainWater.settledDepthAt` et `speedAt`, `iceUnderfoot`, `MeadowState`, `waterCycleNow`, `roomPrecipitationAir`)
au point du sol dessiné sous la souris (`groundPointUnder`, donc juste en vue 3/4), quand la souris change de case
et quatre fois par seconde au plus ; `Weather/CellExplained.ts` (pur) en fait l'explication. Rien n'est envoyé au
serveur, aucun clic n'est pris (on marche et on édite comme avant), rien n'est lu pipette rangée. Échap ou la croix
la rangent ; le curseur devient « aide ».

**Suite (#535).** Les durées suivent `freezeThawTimesOf` (vitesse de l'eau de la carte × vitesse du gel et de la
fonte). La pipette dit aussi : l'**air de la case** (section « Air de la case ») : l'air de la carte, celui de la
ville du joueur, ou l'air froid d'un coup de froid posé là (`coldAirOver(scene.coldMasses(), …)`, comme le serveur le
lit case par case), tenu par un joueur ou relâché avec le temps avant qu'il redevienne l'air de la carte
(`coldGoneInMinutes`, à l'horloge du gel et de la fonte) ; la glace et la neige de la case suivent cet air ; une
**piscine chauffée** (elle ne gèle jamais) ; une **piscine posée comme objet** (un décor dont le dessin ne suit pas
l'eau : l'eau lue est celle du sol dessous) ; un **palier** dessiné au-dessus de la case (`FloorSpike.floorsOver`) ;
l'**ombre** ou la pleine lumière de la case, de jour, quand les ombres du ciel sont dessinées
(`SkyShadowManager.shadedAt`) ; plus de Prairie sous l'eau. Le tableau dit « Air froid sur la carte » quand un coup
de froid est posé (`coldLyingStore`).

**Rattrapage du serveur.** Après un redémarrage ou une carte restée vide, le serveur revit le temps manqué avec la
météo de ce temps-là : la glace et la neige changent alors à rebours de l'air du moment. `MeadowMessage.catchingUp`
(champ 10, rempli par `MeadowSimulation` à chaque message du pré, avec un envoi de plus à la fin du rattrapage même
si rien d'autre n'a changé) le dit ; `MeadowState.catchingUp()` le garde ; le tableau et la pipette gardent alors
les épaisseurs et remplacent la tendance par une phrase. Quand le serveur prend du retard il vit moins vite que la
vitesse demandée : les durées affichées s'allongent d'autant (dit dans « En savoir plus », aucun champ).

Limites : pour un joueur qui suit une ville avec son sol local, la tendance de sa glace et de sa neige est calculée
avec l'air de sa ville (température, humidité, vent) : non vérifié contre le calcul du sol local ; l'ombre des arbres
en ombre « réaliste » (image posée au sol) n'est pas comptée ; le temps restant d'un air froid est celui de l'air de
la case, et « tenu » se lit sur la masse la plus froide de la carte.

## Vie aquatique (poissons et dauphins)

Conception et plan dans le dépôt d'infra, `docs/superpowers/{specs,plans}/2026-11-18-vie-aquatique*`.

**En jeu.** Dans l'eau du relief vivent des poissons bleus (mâles) et roses (femelles), et des dauphins. Ils
apparaissent seuls : un couple dans tout corps d'eau d'au moins 40 cellules à 8 px d'eau ou plus, un dauphin dans un
corps qui a au moins 300 cellules profondes (16 px, là où l'avatar nage). Les poissons nagent au hasard sans jamais
quitter leur eau ni traverser un mur. Un mâle prêt va vers la femelle prête la plus proche de son corps d'eau : 2 à 4
petits, de sexe tiré au hasard, puis chacun attend un délai de reproduction. Un poisson vit entre 70 % et 100 % de la
durée de vie maximale. Le dauphin chasse à intervalle régulier le poisson le plus proche en eau profonde, à 1,5 fois
la vitesse des poissons ; l'eau de 8 à 16 px est un refuge, il abandonne après 20 s sans prise. Un animal dont l'eau
baisse fuit vers la cellule voisine la plus profonde et meurt après 5 s à sec. Un corps d'eau vidé de ses poissons en
retrouve après environ un délai de reproduction.

**Dauphins.** Mâles et femelles (la femelle a un gris rosé), ils arrivent par couple. Un mâle et une femelle prêts qui
ont mangé au moins un poisson depuis leur dernier petit ont un petit, puis attendent le délai de reproduction des
dauphins ; un dauphin en chasse ne courtise pas. Ils meurent de vieillesse (70 % à 100 % de leur durée de vie maximale)
et de faim après huit intervalles de chasse sans prise. Un lac dont les dauphins ont disparu en retrouve après environ
un délai de reproduction des dauphins.

**Peur des avatars.** Poissons et dauphins s'écartent d'un avatar qui approche à moins de trois cases (96 px), à leur
vitesse la plus grande, sans quitter leur eau ; tant qu'ils ont peur ils ne se reproduisent pas et ne chassent pas.
Seuls comptent les avatars au sol (`GameRoom.groundAvatarPositions`).

**Plafonds.** Un poisson pour 8 cellules de son corps d'eau (2 au moins), un dauphin pour 150 cellules profondes,
300 animaux et 12 dauphins par salle.

**Outil Vie de l'éditeur** (poisson dans la barre d'outils, chiffre 0, éditeurs de la carte entière). Il réunit le
tableau de bord et les réglages. Tableau de bord, mis à jour chaque seconde : proies (poissons, mâles et femelles),
prédateurs (dauphins), proies par prédateur, remplissage des eaux (poissons sur la capacité des plans d'eau),
plans d'eau peuplés sur ceux qui peuvent l'être, **courbe des proies et des prédateurs dans le temps** (toute la vie
de la carte : `back` garde un échantillon toutes les 5 s, puis un sur deux quand il y en a plus de 360 ; une échelle
par courbe), et naissances, arrivées, morts de vieillesse, mangés, morts à sec, naissances et morts de dauphins sur la
dernière minute et depuis le début. Le panneau défile. Les totaux viennent du serveur (`AquaticLifeStatsMessage`, gardés avec les
animaux) ; couper la vie les remet à zéro.

**Réglages de la carte** (même outil, « Réglages de la simulation ») :
interrupteur (coupé par défaut ; couper vide l'eau), délai de reproduction (10 s à 1 h, 2 min par défaut), durée de
vie maximale (30 s à 24 h, 15 min), vitesse maximale (0,2 à 6 cases/s, 1,5), intervalle de chasse (5 s à 1 h, 1 min),
délai de reproduction des dauphins (30 s à 2 h, 5 min), durée de vie maximale des dauphins (1 min à 48 h, 1 h).
Les durées sont en temps réel : la vitesse de l'eau ne les accélère pas. Enregistrés dans `wam.settings.life`
(`UpdateLifeSettingMessage`).

**Réglage personnel.** Paramètres → Ambiance : « Afficher la vie aquatique » (activé par défaut).

**Comment ça marche.** Les règles sont des fonctions pures de `libs/map-editor/src/Life/` (`WaterBodies`, `Swim`,
`Population`), aléa et heure injectés. `back` seul les fait tourner (`AquaticLifeManager`, deux pas par seconde, sur
la grille de `TerrainWaterManager`), annonce tous les animaux à la salle chaque seconde (`AquaticLifeMessage` : id,
genre, position en pixels de carte) et les garde dans Redis (`aquatic-life:<salle>`). Le navigateur ne décide rien :
`Life/AquaticLife.ts` fait glisser chaque animal vers sa dernière position et fond les naissances et les morts,
`AquaticLifeView.ts` les dessine (images faites en code) juste au-dessus de l'eau. Une erreur dans un pas arrête la
vie de la salle, pas l'eau ni la salle.

**Limites.** Eau du relief du sol seulement (ni piscines d'objets, ni étages). Un animal qui bute sur un obstacle en allant vers sa cible cherche un chemin (voir « Chemin » à la
section des ponts) ; sans chemin, il erre 3 s puis reprend. Les animaux sont dessinés par-dessus l'eau,
sans passer derrière les objets. `play`, `back` et `map-storage` se déploient ensemble.



### Moteur par espèce et chiffres par espèce

Suite : conception `docs/superpowers/specs/2026-11-18-chaine-alimentaire-design.md` du dépôt d'infra (mouettes,
antilopes, lions et tigres viendront sur ce moteur).

- **Table des espèces** : `libs/map-editor/src/Life/Species.ts` décrit chaque espèce (milieu, profondeur d'eau, proies,
  vitesse, portée, repas avant un petit, faim, plafond par salle). `stepPopulation` la lit ; ajouter une espèce, c'est
  ajouter une entrée (et ce qui lui est propre : où elle arrive, ce que les réglages de la carte disent d'elle).
  Le comportement des poissons et des dauphins n'a pas changé : un test (`LifeGolden.test.ts`) compare la vie d'un lac
  sur 2 000 pas à celle d'avant, pour trois graines.
- **Sur le fil** : une espèce a un numéro (0 poisson, 1 dauphin ; 2 antilope, 3 lion, 4 tigre, 5 mouette réservés), et
  le `kind` d'un animal vaut deux fois ce numéro, plus un pour une femelle. `AquaticLifeMessage.species` porte, pour
  chaque espèce, mâles, femelles, plafond, et depuis le début : arrivées, naissances, morts de vieillesse, mangés,
  morts de faim, morts à sec, repas par espèce de proie. Les échantillons de l'historique portent l'effectif de chaque
  espèce. Les anciens champs restent remplis comme avant.
- **Serveur** : `AquaticLifeManager` tient ces totaux et les sauvegarde ; un état sauvegardé avant ce lot repart des
  anciens totaux (poisson : arrivées, naissances, vieillesse, mangés, à sec ; dauphin : naissances, morts).
- **Outil Vie** : sous le tableau de bord, « Par espèce » (`LifeSpeciesDashboard.svelte`, chiffres de
  `LifeSpeciesStats.ts`) : un tableau à une colonne par espèce, sur la dernière minute ou depuis le début ; « Qui mange
  qui » ; une courbe par espèce, à la même échelle, chacune masquable ; un bandeau quand une espèce qui a vécu n'a plus
  d'individu. Un vieux serveur qui ne dit rien des espèces : ce bloc ne s'affiche pas.


### Vie de la terre : antilopes, lions et tigres

Plan : `docs/superpowers/plans/2026-11-18-chaine-alimentaire-lot2a-terre.md` du dépôt d'infra.

**En jeu.** Réglage de la carte « Antilopes, lions et tigres sur la carte » (outil Vie, bloc « Vie de la terre »,
coupé par défaut, indépendant de l'eau). Activé :

- un couple d'**antilopes** arrive sur tout sol de dehors d'au moins 200 cases ; elles se reproduisent (1 ou 2
  petits), fuient un lion ou un tigre à moins de 3 cases et un avatar à moins de 3 cases, n'entrent pas dans l'eau
  (2 px), se noient en 5 s si l'eau monte sur elles ; 1 antilope pour 40 cases, 60 par salle ;
- dès que 5 antilopes vivent sur un sol, un couple de **lions** et un couple de **tigres** y arrivent ; affamés (un
  intervalle de chasse après leur repas), ils courent sur l'antilope la plus proche, ou sur un poisson de l'eau où
  ils ont pied (moins de 16 px) ; un petit pour un couple qui a mangé deux fois ; ils meurent de vieillesse ou de faim
  (huit intervalles de chasse sans prise) ; 6 lions et 6 tigres au plus pour 60 antilopes ;
- les poissons fuient un lion ou un tigre qui s'approche, comme un avatar ;
- **le tirage quotidien de la jungle s'arrête** sur cette carte : les lions et les tigres sont ceux du serveur. Ils
  s'apprivoisent (voir ci-dessous), crient comme ceux de la jungle, ont une ombre et allument les capteurs ;
- le réglage personnel « jungle » les masque.

**Les dauphins attendent trente poissons.** Un couple de dauphins ne vient plus dans un lac qui compte moins de 30
poissons (`FISH_PER_DOLPHIN_COUPLE`) : avec les réglages par défaut ils vidaient le lac à leur arrivée. Les empreintes
de `LifeGolden.test.ts` ont été reprises pour cela, une fois (à seuil 0 ce sont celles d'avant).

**Comment.**

- **Lieux** (`Places`, `Life/WaterBodies.ts`) : ce que les règles demandent d'un habitat (corps, passage, voisinage).
  L'eau en est un ; la terre de dehors un autre (`Life/LandPlaces.ts`) : les cellules de 16 px atteintes depuis le
  bord de la carte sans franchir un mur de l'outil Carte ni une porte (`Terrain/LandWalls.ts`, portes fermées) ni une
  eau de 16 px. Ce que des murs ferment est « dedans » : rien n'y vit.
- **Règles** (`Life/Population.ts`) : `stepPopulation(…, land)` ; un prédateur cherche ses proies dans son propre
  lieu, à son niveau (le dauphin en eau de 16 px, le lion là où il a pied) ; une proie fuit les prédateurs de sa
  liste `flees` ; un chasseur vise au-delà d'une proie qui le fuit. L'eau et la terre ont chacune leur salle (300 et
  100 animaux).
- **Serveur** : `AquaticLifeManager` construit la terre avec la taille de la carte (lue dans la carte Tiled par
  `GameRoom`), les murs et l'eau, au plus toutes les 5 s quand l'eau bouge ; il tourne dès que l'eau ou la terre est
  activée, et retire les animaux d'un habitat coupé.
- **Navigateur** : `Life/LandLifeView.ts` dessine les animaux de `kind` 4 à 9 parmi les avatars, avec les planches
  `lion-sheet.png` et `tigre-sheet.png` du catalogue des animaux quand la carte l'a, sinon une image dessinée en code
  (toujours pour l'antilope).
- **Valeurs par défaut** : choisies par un essai de 24 h simulées sur trois graines, gardées par
  `LifeBalance.test.ts` (2 h simulées).

**Apprivoiser un lion ou un tigre du serveur.** Même geste que pour les animaux promeneurs : à 1,5 case d'un lion ou
d'un tigre libre, « [ESPACE] pour apprivoiser cet animal 🐾 » ; près d'un des siens, « [ESPACE] pour relâcher votre
compagnon 🐾 » ; « Relâcher mes animaux (n) » dans la roue de l'avatar les compte tous. Cinq compagnons par joueur,
animaux promeneurs compris. Les antilopes ne s'apprivoisent pas.

- **Le serveur seul dit à qui est l'animal** (`Animal.tamedBy`, `AquaticAnimalMessage.owner`) : pas de revendication
  par événement de salle comme pour les promeneurs. Le navigateur demande (`TameAnimalMessage`,
  `ReleaseAnimalsMessage`), `AquaticLifeManager.tame` vérifie (lion ou tigre, libre, à 5 cases au plus des pieds du
  joueur pour couvrir la seconde de retard de l'affichage, joueur au sol, cinq au plus, cinq demandes par seconde) et
  l'annonce aussitôt à la salle. Un refus ne dit rien : l'invite revient si l'animal est encore là.
- **Hors de la vie, mais compté** (`Life/Taming.ts`, `stepPopulation`) : apprivoisé, il ne vieillit pas, n'a pas faim,
  ne chasse pas, n'est pas fui, n'a pas de petit ; ses horloges attendent. Il compte toujours dans les plafonds de son
  lieu et de la salle, sinon cinq lions pris en feraient venir cinq autres.
- **Où il est** : pour le serveur, là où se tient son maître tant que celui-ci est au sol sur la terre de dehors ;
  dans une pièce, dans l'eau profonde ou sur un palier, il reste à sa dernière bonne place. À l'écran, il marche
  derrière son maître (`Life/LandCompanions.ts`, le suiveur des promeneurs), après ses chiens et ses chats.
- **Relâché tout seul** : le maître quitte la carte ou recharge la page, `back` redémarre (l'identifiant d'un joueur
  ne vaut que pour une connexion), la terre est coupée, l'éditeur de carte s'ouvre.
- **Pour qu'on puisse l'approcher**, un lion ou un tigre rassasié ne fuit plus les avatars ; celui qui chasse garde
  ses distances (3 cases) comme avant.
- Limites : relâché alors que son maître est dans une pièce, l'animal réapparaît à sa dernière place de dehors ; au
  relâcher il fait un petit saut de l'endroit où on le voyait à celui où le serveur le tient.

**Ce que les animaux du serveur gardent de la jungle.**

- **Cris** (`Life/LandCries.ts`) : un lion ou un tigre immobile crie de temps en temps (une étape de 20 s sur 12,
  portée 12 cases, un cri toutes les 20 s au plus par joueur, rien onglet caché), avec les sons et le volume de la
  jungle. Chaque navigateur les joue pour lui-même, tirés de l'identifiant de l'animal et de l'heure. Un animal
  apprivoisé ne crie pas ; une antilope non plus.
- **Ombres** : ovale sous chaque animal de la terre, dehors, comme sous les promeneurs (`GameScene.shadowAnimals`,
  réglage « animaux » des ombres).
- **Capteurs de présence** : le serveur compte lui-même les antilopes, lions et tigres qu'il simule
  (`AquaticLifeManager.landAnimals`, quatrième paramètre de `SwitchTriggerEvaluator`), au sol, comme un avatar ; pas
  de rapport du navigateur pour eux.

**Soif et arbre d'attache.**

- **Boire** (`stepPopulation`, `Life/LandPlaces.ts` : `shoreNear`, `atShore`) : une fois par « intervalle entre deux
  boissons » (le réglage des animaux promeneurs), un animal de terre marche vers la rive la plus proche de sa terre
  (une cellule sèche à côté d'une cellule d'au moins 2 px d'eau), y boit tête baissée, puis repart. Un lion ou un tigre
  boit 20 s, une antilope 6 s. Pendant ce temps une antilope ne voit un lion ou un tigre qu'à 2 cases au lieu de 3 :
  c'est là qu'elle se fait prendre. Dérangé, l'animal revient plus tôt (un quart d'intervalle). Sans eau trouvée en
  une minute, il attend l'intervalle suivant. La première soif est répartie sur un intervalle d'après son identifiant.
  Sur le fil : `AquaticAnimalMessage.state` = 3 ; à l'écran la pose de boisson des promeneurs (`drinkStance`).
- **Arbre d'attache** (`Terrain/LandTrees.ts`) : le serveur lit les arbres `Nature:tree-…` posés au sol. Un couple de
  lions ou de tigres arrive près d'un arbre de sa terre, qui devient son foyer (`Animal.homeX`, `homeY`) ; ses petits
  en héritent. Hors chasse et hors soif, il se promène à 5 cases au plus de cet arbre, et y revient après une chasse.
  Sans arbre sur la terre, rien ne change. Le serveur ne connaît pas la taille d'une image : le pied de l'arbre est
  pris une case à droite et deux cases sous le coin de l'image, à une case près.
- Durée de 6 s pour les proies choisie sur 4 h simulées et trois graines : à 20 s les antilopes s'éteignaient deux
  fois sur trois (les lions pêchent déjà au bord de l'eau).

**Planche de l'antilope.** Comme le lion et le tigre, l'antilope prend la planche du catalogue des animaux quand la
carte l'a (objet `…:antilope:…` avec une planche `wander`, `landSheetOf` dans `Life/LandSprites.ts`) : marche animée
dans les quatre directions. Sans elle, le petit dessin fait en code reste affiché.

**Mouettes (vie de l'air).** Réglage de carte `life.gullsEnabled` (outil Vie, bloc « Vie de l'air », coupé par
défaut ; sans effet si la vie de l'eau est coupée), trois durées : intervalle de pêche (45 s), délai de reproduction
(5 min), durée de vie (30 min).

- **Règles** (`Life/Gulls.ts`, appelées par `stepPopulation`) : un couple arrive au-dessus de tout plan d'eau qui peut
  porter 20 poissons et en compte 15 ; une mouette pour 25 poissons de capacité, 16 par salle. Son eau est son foyer
  (`homeX`, `homeY`). Affamée, elle vole droit, sans obstacle, vers le poisson le plus proche de son eau et le prend ;
  sans poisson elle tourne au-dessus. Rassasiée, elle se pose sur la rive la plus proche (`perchedAt`). Posée depuis
  3 s, elle s'envole d'un avatar à 3 cases ou d'un lion à 2 cases, et reste en l'air 10 s. Un lion affamé à moins
  d'une cellule d'une mouette posée la mange : seulement si elle vient de se poser. Le tigre n'y touche pas. Un
  couple rassasié (3 repas) posé ensemble a 1 ou 2 petits. Elle meurt de vieillesse ou de faim. Son eau disparue,
  elle prend un autre plan d'eau de la carte. Les poissons ne la fuient pas.
- **Fil** : espèce 5 (`kind` 10 et 11), `state` 1 en vol, 2 posée ; réglages `UpdateLifeSettingMessage` 15 à 18.
- **Serveur** : la terre est lue aussi pour les mouettes (les rives), même terre coupée ; elles partent quand on les
  coupe ou qu'on coupe l'eau ; les capteurs de présence ne les comptent pas.
- **Navigateur** (`Life/GullLifeView.ts`, `GullSprites.ts`) : en vol, dessinée au-dessus de tout, 28 px au-dessus
  d'une petite ombre au sol, ailes qui battent ; posée, au sol parmi les avatars. Masquée avec les poissons.
- **Refuge des antilopes rares** (`SCARCE_PREY_SHARE`) : sur une terre, lions et tigres ne chassent plus les
  antilopes quand il en reste moins d'un dixième de ce que la terre porte ; ils se rabattent sur les poissons. Sans
  cela, des prédateurs qui ne manquent jamais de poissons tenaient les antilopes à zéro deux fois sur trois (4 h
  simulées, trois graines). Une petite terre (moins de dix antilopes de capacité) n'a pas ce refuge.

**Groupes : troupeaux et meutes.** Sans réglage ni changement de carte ou de fil : dès que la vie de la terre est
activée (`Life/Groups.ts`, champ `group` de la table des espèces). Rien d'un groupe n'est gardé : qui mène est relu à
chaque pas parmi les animaux vivants et libres d'une terre, donc un chef mort, apprivoisé ou parti est remplacé
aussitôt.

- **Antilopes, troupeau mené par une matriarche** : la plus vieille femelle d'une terre mène, et une de plus par
  tranche de 8 antilopes (`HERD_SIZE`). Une antilope suit la meneuse la plus proche : à plus de 4 cases d'elle
  (`GROUP_REACH_PX`), elle revient se promener autour. Quand la meneuse part boire, celles qui la suivent ont soif
  aussi.
- **Lions, meute menée par un patriarche** : le plus vieux mâle d'une terre. Lui seul a des petits. Les lions prêts à
  chasser visent la même antilope, celle du premier chasseur ; les lions affamés à moins de 5 cases de la prise
  (`PRIDE_SHARE_PX`) sont nourris, mais c'est un seul repas au tableau de bord, et il ne compte pour un petit que
  pour le lion qui l'a faite. Un poisson ou une mouette ne se partage pas. Un lion sans arbre d'attache se promène
  autour du patriarche ; avec un arbre, autour de l'arbre comme avant.
- **Tigre** : solitaire, rien ne change. Dauphins, poissons, mouettes : rien non plus.
- **Équilibre** mesuré sur 4 h simulées et trois graines, avant puis après : antilopes jamais éteintes dans les deux
  cas, aucun lion mort de faim ; antilopes mangées 1 398 / 1 544 / 1 611 avant, 1 168 / 1 181 / 965 après (les lions
  partagent, et prennent plus de poissons).
- **Limites** : pas de territoires entre groupes, pas de marque à l'écran sur un chef, la fuite reste celle de
  chaque animal (le troupeau se reforme ensuite), un jeune mâle ne quitte pas la meute.

**Limites.** Les animaux de terre traversent les objets et les murs dessinés dans Tiled (le serveur ne connaît que
les murs de l'outil Carte) ; pas de recherche de chemin : un couple séparé par un obstacle met du temps à se
retrouver ; les prédateurs sont limités par leur plafond plus que par la faim (les poissons leur servent de repli).

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

**Pluie au vent réel** (2026-11-22, `Weather/Rain.ts` `rainSlant`, `followWind`). Les gouttes suivent le même vent
que la neige (`groundWind` : vent réel près du sol, ≈ 0,8 du vent à 10 m, ses deux composantes ; nord-ouest à
10 km/h quand il n'est pas connu ; réglage personnel « inclinaison » appliqué). Pour chaque pixel de chute, une goutte
se déplace de vent / vitesse de chute, dans le sens du vent : vers l'est par vent d'ouest, vers le haut de l'écran par
vent du sud (elle y descend alors moins vite, trait plus court), vers le bas par vent du nord, verticale par vent nul.
Vitesses de chute des trois plans : gouttes de 1,4, 3 et 5 mm, 5,2, 7,9 et 9,1 m/s, par l'ajustement d'Atlas,
Srivastava et Sekhon (Rev. Geophys. 11, 1973) aux mesures de Gunn et Kinzer (J. Meteor. 6, 1949),
v = 9,65 − 10,3 e^(−0,6 D) ; les petites gouttes penchent donc plus que les grosses. Ces vitesses sont celles que les
plans avaient déjà à l'écran (150, 230 et 330 px/s, le plan proche vu 1,25 fois plus vite). Par 13 km/h les gouttes
fines penchent de 0,55 px par px, la neige dérive 2 à 4 fois plus : dans un grésil, gouttes et flocons vont dans le
même sens, les flocons plus couchés. Pente bornée à 3 (choix, atteinte vers 90 km/h pour les gouttes fines). Une
goutte rattrape un nouveau vent en environ 0,7 s (sa vitesse sur la gravité) : pas de saut quand le vent change ; en
mouvement réduit, le vent est pris tel quel. Éclaboussures et flaques inchangées. L'averse de la catastrophe garde
ses gouttes, qui penchent un peu, sans vent, vers son disque : le serveur y verse l'eau, le vent les en ferait sortir.

**Pluie selon son intensité.** La pluie et l’orage (météo fixe, automatique ou réelle) sont dessinés par
`Weather/Rain.ts` : gouttes en trois plans (tête claire et traîne), d’autant plus nombreuses que la pluie est forte,
autant à l’écran quel que soit le zoom ; elles suivent le vent réel près du sol (voir « Pluie au vent réel »
ci-dessous) ; il pleut davantage sous l’épaisseur d’un nuage de pluie que dans une trouée ; éclaboussures au sol (aucune
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

### Neige : une pluie par temps froid

Depuis le 2026-11-21 la neige n'est plus une météo : c'est la forme que prend une précipitation quand l'air est assez
froid, décision de l'utilisateur (« la neige est de la pluie en condition de température et d'hygrométrie propice,
donc pas un mode »). Ce qui précède et suit dans ce document sur la tuile Neige, la neige du mode Automatique, la
couverture de neige au sol et les arbres qui blanchissent décrit l'état d'avant.

- **Plus de mode Neige.** La tuile Neige et la case Neige des « Temps possibles » ont disparu. Le mode Automatique ne
  tire plus de neige : la part qu'elle avait est passée à la pluie (`SEASON_WEIGHTS` : pluie 45 % en hiver, 32 % au
  printemps, 12 % en été, 35 % en automne ; autant de précipitations qu'avant). Le programme de toutes les cartes en
  Automatique change une fois (la graine dépend des temps possibles). En mode Réel les codes WMO de neige (71 à 77,
  85, 86) sont une précipitation comme la pluie, avec son intensité (`precipitation` d'Open-Meteo, en eau).
- **Cartes existantes.** `WeatherType.Snow` reste dans l'énumération, dépréciée, pour lire les anciennes cartes et les
  anciens onglets ; `precipitationWeather` la lit comme une pluie partout (ciel, panneau, bureau, serveur). Une neige
  envoyée par un ancien onglet est enregistrée en pluie, `snow` est retiré des temps possibles à l'enregistrement.
  `lastSnow` n'est plus écrit ni lu (champ gardé dans le schéma).
- **Règle** (`libs/map-editor/src/Weather/Precipitation.ts`, pure, commune au serveur et au navigateur) :
  `snowShare(température, humidité)` rend la part de neige, de 0 à 1, d'après la température du thermomètre mouillé
  (ajustement de Stull 2011, J. Appl. Meteor. Climatol. 50, valable de −20 à 50 °C et de 5 à 99 %) : neige à 0,5 °C et
  moins, pluie à 1,5 °C et plus, mélange linéaire entre les deux, moitié-moitié à 1,0 °C (seuil à 50 % sur terre de Sims
  et Liu 2015 et de Behrangi et al. 2018 ; la largeur du mélange est un choix). Au-delà de 4 °C d'air la neige cède,
  plus rien à 6 °C (choix : l'ajustement n'est plus fiable en air très sec). Exemples : 2 °C et 40 % → thermomètre
  mouillé −2,3 °C, neige ; 2 °C et 95 % → 1,45 °C, pluie (5 % de flocons) ; 1 °C et 99 % → 71 % de neige ; 0 °C →
  neige ; 3 °C et 70 % → neige ; 5 °C et 90 % → pluie.
- **D'où viennent la température et l'humidité** (`Weather/PrecipitationAir.ts` `precipitationAirNow`,
  règle pure `drawnPrecipitationAir`) : la forme suit **la source de la précipitation dessinée** (décision de
  l'utilisateur, 2026-11-21 : l'affichage d'un joueur doit être cohérent avec le ciel et la météo qu'il voit).
  Précipitation de la carte (joueur qui suit le serveur, tout mode d'horloge autre que « Jour dans le monde ») : la
  température et l'humidité réglées à la main dans Catastrophe → Météo (pour toute la salle), sinon l'air réel du lieu
  de la carte (Paris sans lieu), **quelle que soit la météo de la carte** : une carte en Pluie fixe ou en Automatique
  neige quand il fait réellement assez froid à son lieu ; la forme est la même pour tous ces joueurs (« forme commune :
  oui ») et ce sont les sources du serveur, dans le même ordre (`FireConditionsManager.air`). Précipitation
  personnelle (joueur en « Jour dans le monde », qui voit la météo de sa ville à la place de celle de la carte, #392,
  `showsChosenPlaceWeather`) : l'air de **sa ville** au même quart d'heure (température et humidité de sa frise), ni
  celui de la carte ni celui réglé à la main dans la salle ; son écran et son bandeau personnel disent donc la même
  chose, et le givre suit la même ville (`Weather/Frost.ts`). Tant que rien n'est connu (frise pas encore reçue,
  humidité absente), il pleut, toujours. Rien ne dépend du calendrier. Les conditions de feu de la salle, elles,
  restent douces hors météo Réelle : elles ne servent plus à la forme de la pluie. Un éditeur qui essaie une météo ou
  un lieu dans le panneau des réglages voit, pour lui seul et le temps de l'essai, la météo de la carte essayée et la
  forme que donne l'air du lieu essayé, même s'il suit une ville.
- **Rendu.** Quand il pleut, la part de neige devient des flocons, le reste des gouttes : pluie et flocons mêlés
  dans le mélange. Depuis le 2026-11-21 les flocons sont dérivés de l'air (`Weather/Snowfall.ts`, voir « Flocons
  dérivés de l'air » ci-dessous). Le voile sombre et les nuages gris de la pluie restent. Son : une chute à moitié neigeuse ou plus a l'ambiance feutrée de la neige, sinon la pluie, moins forte à
  proportion. Bandeau : une pluie dont au moins la moitié tombe en neige est nommée « Neige », d'après la température
  et l'humidité réelles prévues au lieu pour chaque quart d'heure (maintenant, +1 h, +4 h), ou d'après les conditions
  réglées à la main pour « maintenant ».
- **Flocons dérivés de l'air** (`Weather/Snowfall.ts`, même chemin pour la météo de la carte et la météo
  personnelle). Remplace les carrés blancs de 2 px qui rebouclaient dans des cellules de 64 px.
  - **Quantité** : selon le taux d'eau de la part neige (`rainRate × snowShare`, mm/h) : faible sous 1 mm/h, forte à
    partir de 2,5 mm/h (≈ 1 cm de neige fraîche par mm d'eau) ; courbe `snowLevel` (choix) ; taux inconnu : neige
    modérée, orage : forte. Le réglage personnel « quantité » de la pluie s'applique.
  - **Sortes de flocons** à vitesse et taille fixes (Locatelli et Hobbs 1974, J. Geophys. Res. 79, tableau 1) : gros
    agrégats de 8 mm (V = 0,8 D^0,16 ≈ 1,1 m/s), moyens de 3 mm (≈ 0,95 m/s), cristaux fins de 1 mm (V = 0,69 D^0,41
    ≈ 0,7 m/s) ; la pluie tombe à 5-9 m/s. La température du thermomètre mouillé choisit le mélange (`flakeMix`) :
    gros flocons collants près de 0 °C, second maximum des dendrites vers -12 °C (Hobbs, Chang et Locatelli 1974),
    cristaux fins sous -20 °C ; parts intermédiaires choisies. À eau égale, les cristaux fins sont plus nombreux
    (N = R / (M V), montré en racine quatrième : choix).
  - **Chute** : chaque flocon suit le repère de l'air, porté par le vent réel près du sol (profil logarithmique,
    ≈ 0,8 du vent à 10 m) dans ses deux composantes, comme les nuages (un vent du sud fait remonter la neige à
    l'écran ; la pluie suit le même vent depuis le 2026-11-22), et tombe 9 à 15 s, puis se pose 0,8 s sans éclaboussure. Deux
    plans (lointain plus petit et plus lent, proche plus gros et plus rapide), balancement propre à chaque flocon.
    32 px ≈ 1,1 m : 1 m/s ≈ 29 px/s ; 13 km/h dérive ≈ 84 px/s, plus vite que la chute. Champ fixé à la carte.
  - **Dessin** : pixel art de 1 à 5 px, éclairé en haut à gauche, un pixel d'ombre en bas à droite (lisible sur la
    neige au sol, où les cristaux fins restent presque invisibles, comme en vrai) ; de nuit gris bleuté et un peu plus
    pâle (`snowTones`, choix), les lampes ne les éclairent pas. Mouvement réduit : flocons immobiles. Sous abri : rien.
  - **Partagé avec l'averse** de la catastrophe (`Catastrophe/DownpourFall.ts`) : la trajectoire d'un flocon
    (`fallingFlake` : il descend jusqu'à son point d'arrivée, se balance de moins en moins en approchant, puis se pose),
    son apparition en fondu (`flakeFadeIn`) et sa forme (`drawFlake`, taille 3 pour l'averse). Restent propres à
    chacun le placement (l'averse : un point fixe du disque du nuage, chute droite de 96 px en 2,6 s ; la météo : un
    champ fixé à l'air qui couvre la vue et que porte le vent réel), la quantité (l'averse : un nombre de flocons selon
    son disque) et la sorte de flocon (l'averse ne connaît que la part de neige, pas la température : taille 3 fixe,
    couleurs de jour).
  - **Coût** : calcul ≈ 0,8 ms par image pour une forte neige près de 0 °C (≈ 900 flocons), ≈ 1,3 ms au pire (≈ 2 200
    cristaux), contre ≈ 1,1 ms pour les gouttes d'une forte pluie (mesure Node, hors dessin Phaser).
- **Sol et arbres.** La neige qui tombe tient au sol depuis le lot « Neige au sol » (section suivante) : le sol
  blanchit case par case et les arbres avec la couverture moyenne de la carte. Le décor de neige uni (`Christmas/` :
  sol uni, calottes, empreintes) reste débranché. Le givre et le gel de #392 sont inchangés. La neige des hauteurs du relief (`Terrain/SnowLine.ts`)
  est inchangée ; elle suit l'altitude et la saison, pas la température.
- **Serveur.** L'eau du relief et l'humidité du pré ne reçoivent que la part liquide (`liquidRainRate`,
  `fallThrough`, air lu par `FireConditionsManager.air` : réglé à la main, sinon réel au lieu de la carte dans tous
  les modes ; le serveur a sa propre frise Open-Meteo, un léger écart avec celle des navigateurs est possible) : ce qui tombe en neige n'apporte pas d'eau tout de suite : elle tient au sol et rend cette eau en fondant
  (section suivante).
- **Limites.** Rien n'est lissé dans le temps (la forme suit les conditions du quart d'heure) ; le thermomètre mouillé
  au sol ignore une couche chaude en altitude (une pluie verglaçante réelle est dessinée en neige) ; les flaques se
  remplissent encore sous la neige.
  `play`, `back` et `map-storage` se déploient ensemble.

**Sol gelé** (2026-11-21, `Weather/SoilFrost.ts`, champ facultatif `soilFrost` de `MeadowStepInput`). Le gel fige
l'eau du sol, il ne l'enlève pas. Avant, par −10 °C le pré séchait aussi vite que par 15 °C, et pendant une neige
(qui n'apporte pas d'eau) l'herbe mourait de soif. Le serveur lit le gel dans le même air que la forme de la pluie
(`fallThrough`, `FireConditionsManager.air` : réglé à la main, sinon réel au lieu de la carte quelle que soit sa météo,
Paris sans lieu) : `soilFrost(température)` vaut 1 à −1 °C et moins, 0 à +1 °C et plus, et monte en ligne droite
entre les deux (pas de bascule à 0 °C qui clignote). Air inconnu (température ou humidité absente) : pas de gel.
Sur la part gelée du sol :
- l'humidité ne baisse plus (ni évaporation, ni dessèchement par le vent chaud) et ne se répand plus aux voisines ni
  ne descend les pentes ;
- l'herbe dort : elle ne meurt pas de soif et ne pousse pas ; elle ne jaunit ni ne reverdit (`dryness` figée) ;
- rien ne repousse après un feu : le compte à rebours des cendres (braises comprises) reprend au dégel.

Inchangés : la pluie liquide encore absorbée (à −1 °C presque tout tombe en neige), le sol trempé sous l'eau qui
repose, les berges (`drinkFromBanks` ne fait que remonter l'humidité), la noyade, la neige des hauteurs (saison et
altitude), le feu en cours, le départ spontané (le danger est nul par ce froid), le broutage. Pas de manteau neigeux
ni de fonte dans ce lot (voir la #417). Rien côté navigateur. `back` seul change de comportement.

### Neige au sol : elle s'accumule, blanchit, fond et rend son eau

Ce qui tombe en neige (part `snowShare` de l'air de la salle) ne disparaît plus : le serveur le garde case par case.

- **Faire neiger.** Deux gestes : régler le froid dans Catastrophe → Météo (0 °C ou moins, ou quelques degrés par air
  sec), puis lancer l'averse. Il n'y a pas de catastrophe « Neige » : la forme suit l'air, comme pour la pluie de la
  carte. La pluie de la carte par temps froid s'accumule de la même façon, sur toute la carte.
- **Modèle** (`libs/map-editor/src/Terrain/Snow.ts`, champ `snow` de `Meadow`). Une couche par case de 32 px, en
  millimètres d'équivalent en eau, de 0 à 600 mm, dehors seulement. Sol tout blanc à partir de 15 mm.
  - Fonte : `max(0, T) × 0,2 × (1 + vent / 20) × (0,5 + humidité / 100)` mm/h ; la pluie qui tombe dessus en fait
    fondre un dixième de son volume par °C au-dessus de 0.
  - Sublimation : `0,02 × vent × (1 − humidité / 100)` mm/h, à toute température, sans eau.
  - Le temps de la neige est celui de l'eau de la carte (`waterTimesOf`, `MeadowStepInput.snowTimes`, depuis le
    2026-11-22 ; `THAW_SPEED` ×600 retiré) : temps réel par défaut, 60 fois plus vite à « Vitesse de l'eau » 60.
    15 mm fondent en 11 h 30 à +5 °C et 5 h 50 à +10 °C (80 % d'humidité, sans vent) en temps réel ; 11 min 30 et
    5 min 50 à 60 (avant : 69 s et 35 s).
  - **Vitesse du gel et de la fonte** (2026-11-23, demande de l'utilisateur : « un paramètre pour accélérer spécifiquement gel et fonte »). C'est un réglage de la carte, `settings.water.freezeThawSpeed`, absent par défaut ce qui vaut ×1. On le choisit dans les réglages de l'eau de l'outil relief, par crans : ×1, ×10, ×60, ×600 (`FREEZE_THAW_SPEED_STEPS`, borne `MAX_FREEZE_THAW_SPEED` = 600).
    - **Ce qu'il accélère :** la glace qui prend et dégèle, la neige qui fond et part, la fonte de la neige de sa ville en météo personnelle, et le fondu du givre et de la glace dessinés vers l'air du moment. Ce fondu prend une minute pour le givre et deux pour la glace à ×1 ; à ×60, il ne prend plus qu'une et deux secondes. Il suit aussi « Vitesse de l'eau », qu'il ne suivait pas avant. Il se multiplie avec « Vitesse de l'eau » : `freezeThawTimesOf` = `waterTimesOf` × le facteur.
    - **Ce qui garde l'horloge de l'eau :** l'eau, la pluie et la neige qui tombe. Une neige pèse donc toujours ce qu'aurait pesé la même pluie.
    - **Ce qu'il ne touche pas :**
      - le sol gelé, qui se déduit de l'air à l'instant (`soilFrostOf`) ;
      - la casse de la glace, la cabane et l'eau.
    - **Stabilité :** au-delà d'une heure de temps de jeu par pas (`ICE_EXACT_FROM_HOURS`), la glace pousse par la solution exacte de la loi de Stefan (`iceAfterHours`), sans sous-pas : le coût reste le même. En dessous, rien ne change au bit près.
    - **À chaud :** la valeur voyage avec les réglages de la carte et vaut dès le pas suivant de la prairie, dans le fil des salles comme dans le fil de calcul, qui reçoit le WAM. Le rattrapage d'une salle vide l'applique à ses tranches, dans sa limite de durée habituelle.
    - **Déploiement :** il ajoute le champ `freezeThawSpeed` (17) à `UpdateWaterSettingMessage`, donc `play`, `back` et `map-storage` doivent être déployés ensemble.
    - **Dans la barre d'actions** (demande de l'utilisateur : « un widget > >> >>> pour accélérer ces paramètres sans rien casser ») : le widget se trouve juste à gauche du bouton baguette, qui active le mode Basique (`MapClockWidget.svelte`). « > » vaut ×1, « >> » ×60, « >>> » ×600. Il règle le même réglage de la carte que l'outil relief : les deux affichages suivent `mapClockSpeedsStore`, que met à jour toute commande de réglage de l'eau, d'où qu'elle vienne.
      - **Qui le voit :** seulement qui peut éditer la carte (`mapEditorActivated`), et le pusher vérifie `canEdit`. Les autres joueurs voient un badge discret « Gel ×60 » quand la vitesse n'est pas ×1.
      - **Sur une barre étroite :** un bouton passe au cran suivant, et un bouton « ×1 » revient au réel d'un clic.
      - **Une vitesse entre deux crans**, choisie dans l'éditeur (×10), est affichée telle quelle.
      - **Plus tard :** on pourra y ajouter d'autres horloges (`MAP_CLOCKS`, `MapClockId`, dans `Weather/MapClocks.ts`) sans refaire le widget.
  - Le feu fait fondre la neige autour de lui, même par temps de gel (`Meadow.warm`) : une case en feu chauffe sa
    case et les huit voisines (15 mm par seconde à pleine flamme), un arbre en feu deux cases autour de son pied, la
    catastrophe « feu » 60 mm par touche sous son disque. Cette fonte ne mouille pas le sol (le feu le sèche) ; son
    eau va quand même à l'eau du relief. À l'inverse une neige qui tombe plus vite qu'elle ne fond étouffe le feu :
    case en feu éteinte dès qu'il y reste de la neige, arbre éteint sous une couverture pleine (15 mm).
  - Sur une eau libre, la neige fond aussitôt en eau quand l'air est au-dessus de 0 °C (ou inconnu) ; à 0 °C et
    moins elle tient sur l'eau, comme sur une glace. Une case enneigée ne prend pas feu ; l'herbe y dort (elle ne
    meurt pas de soif et ne pousse pas), à la différence de la neige des hauteurs, sous laquelle elle meurt.
- **Eau de fonte.** Ce qui fond humidifie le sol de sa case comme la même pluie le ferait, et est versé dans l'eau du
  relief, millimètre pour millimètre (`PX_PER_MM`, `TerrainWaterManager.pour`), compté avec la pluie dans le bilan. Hors de la grille d'eau, le sol est humidifié et le
  reste est perdu. La neige de la pluie de la carte s'accumule à la vitesse de l'eau de la carte (`water.speed`),
  sans le ruissellement (`runoff`) : elle tient où elle tombe. Depuis que cette vitesse vaut 1 par défaut
  (2026-11-22), une carte qui ne la règle pas blanchit en temps réel (5 mm/h d'eau de neige : 15 mm, sol tout blanc,
  en trois heures). Fonte, sublimation et glace suivent la même horloge : elles ne peuvent plus diverger.
- **Averse à l'écran.** Par temps froid, l'averse tombe en flocons au lieu de gouttes (`downpourFlakes`, mélange des
  deux dans l'entre-deux, nuage plus clair, sol qui pâlit au lieu de s'assombrir), d'après l'air de la salle
  (`roomPrecipitationAir` : réglage manuel, sinon lieu de la carte), le même pour tous les joueurs et pour le serveur,
  même pour qui suit sa propre ville : une catastrophe est celle de la salle.
- **Averse.** `MeadowManager.soak` pose la part de neige à chaque annonce de l'averse (toutes les 200 ms), la part
  liquide seule va à l'eau (`pourDownpours`). Un météore brûlant vaporise la neige de son cratère (perdue).
- **Annonce.** `MeadowMessage.snow` (champ 8) : un octet par case (`snowByte`, racine carrée pour garder de la finesse
  près de zéro), gzip, vide quand aucune neige ne tient. Annoncé toutes les 2 s tant que la neige tombe ou fond.
  Gardé dans Redis avec le pré. Une carte dont l'herbe est coupée garde sa neige (`Meadow.stepSnowAlone`).
- **Navigateur.** `MeadowState` lit la neige ; `TerrainView` l'envoie au canal neige du sol en shader (le plus fort
  de la neige des hauteurs et de la neige tombée), avec un repli en voile blanc sans shader. La marche ralentit
  (`groundPace`, comme la neige des hauteurs) et les arbres blanchissent avec la couverture moyenne de la carte.
- **Deux modes** (`Weather/GroundSource.ts`). Un joueur qui suit le temps du serveur voit la neige du serveur. Un
  joueur qui suit sa propre ville (météo personnelle de #392) n'en voit rien : son monde reste local, avec la neige
  de sa ville (ci-dessous). L'eau, elle, est commune : il peut voir monter une eau de fonte sans avoir vu la neige.
- **Neige de sa propre ville** (`Weather/Frost.ts`, `ownSnowAfter`, champ `snowMm` du cycle local). Pour qui suit
  une ville, ce qui tombe là-bas en neige (taux de précipitation du créneau en cours, part de neige `snowShare` de
  l'air de la ville) s'accumule sur son sol, en millimètres d'eau, à la même horloge que la neige du serveur
  (la vitesse de l'eau de la carte, `waterTimesOf`), et fond ou part au vent sec avec les mêmes formules, d'après l'air de sa ville. Une seule valeur
  pour tout le dehors de la carte : le sol blanchit partout pareil (par vingtièmes, le sol n'est repeint que quand
  elle bouge d'un cran), les arbres et la glace avec, et la marche ralentit dehors. Rien n'est envoyé au serveur et
  cette neige ne donne pas d'eau. Elle repart de zéro à chaque chargement de la carte et quand on revient au temps
  du serveur.
- **Limites.** La neige tient sur l'eau dès 0 °C, avant même que la glace du serveur (section suivante) n'ait pris. Pas
  d'empreintes dans la neige tombée. Sur une carte sans relief ni grille d'eau, l'eau de fonte ne fait qu'humidifier
  le sol. `play` et `back` se déploient ensemble.

### Glace du serveur : l'eau gèle pour tous, et le feu la fait fondre

Le gel de #392 était calculé par chaque navigateur d'après sa température, avec une seule valeur pour toute la carte :
deux joueurs pouvaient ne pas voir la même glace, et rien (feu, météore) ne pouvait la trouer. Pour qui suit le temps
du serveur, la glace est maintenant tenue par le serveur, case par case.

- **Le courant empêche la glace de prendre** (2026-11-23, sur décision de l'utilisateur). Sur une eau qui court, le froid fait du frasil, des cristaux emportés et brassés par le courant, pas une plaque qui grandit sur place.
  - **Source.** Gosink et Osterkamp, 1983, *Annals of Glaciology* 4, p. 79 (https://doi.org/10.3189/S0260305500005279). Ils citent la règle des rivières de Norvège (Carstens 1971) : « moving frazil slush if the water velocity is >0.6 and <1.2 m s-1, and open if the water velocity is >1.2 m s-1 ». Pour le Saint-Laurent (Starosolszky 1971), la surface « usually remains free of ice » au-delà de 1,0 m/s. Ils ajoutent que ces vitesses sont imprécises : elles varient avec la profondeur, la rugosité du fond et la météo.
  - **Règle.** Jusqu'à 0,6 m/s (`ICE_CURRENT_SHEET_MS`), la glace prend comme sur une eau calme. À partir de 1,2 m/s (`ICE_CURRENT_OPEN_MS`), elle ne prend plus. Entre les deux, sa croissance diminue en ligne droite (`iceCurrentShare`). La droite est un choix : les sources donnent les bornes des régimes, pas de loi entre elles. Le courant ne fait ni fondre ni partir une glace déjà prise : la chaleur de l'eau et la débâcle ne sont pas modélisées.
  - **Vitesse.** Elle est lue par tuile de 32 px (`WaterGrid.tileSpeedAt`) : ce que portent ses quatre cellules, rapporté à l'eau qu'elles tiennent, comme un bloc des vitesses envoyées aux navigateurs, mais sur un carré plus fin. Elle est exprimée en m/s du temps de la carte.
  - **Quand la règle ne s'applique pas.** Elle ne vaut qu'avec l'inertie de l'eau. Sans inertie, l'eau ne garde pas de vitesse, et la glace prend comme avant, au bit près. Pendant le rattrapage d'une salle vide, l'eau va sans inertie : la glace prend donc comme avant.
  - **Où elle s'applique.** Le calcul est dans `MeadowSimulation`, qui lit la grille d'eau qu'elle a déjà. Il vaut donc aussi dans le fil de calcul et pour le sol local d'un joueur.
  - **Carte d'entrée.** Mesure hors jeu de son eau après 30 min d'inertie, sur 12 744 tuiles mouillées : 815 tuiles (6,4 %) vont à 1,2 m/s ou plus, et n'ont donc plus de glace ; 722 (5,7 %) sont entre 0,6 et 1,2 m/s, et y ont une glace plus mince. Le reste, lacs et mares, est inchangé.

- **Modèle** (`libs/map-editor/src/Terrain/Ice.ts`, champ `ice` de `Meadow`). Une épaisseur en millimètres sur l'eau
  de chaque case (au moins 0,5 px d'eau), jamais plus épaisse que cette eau : une flaque gèle entièrement.
  - Prise en glace sous 0 °C, loi de Stefan : `365 × (−T) × (1 + vent / 30) / max(épaisseur, 10)` mm par jour,
    divisé par `1 + neige / 50` (la neige isole), × `ICE_GROWTH_TIMES` (2), à l'horloge de la neige (celle de l'eau).
    En temps réel, 5 cm (la glace porte un marcheur) en 14 h à −3 °C, 4 h 20 à −10 °C, 1 h 25 à −30 °C ; 1 m en
    228 jours, 68 jours, 23 jours. À « Vitesse de l'eau » 60 : 14 min, 4 min 20, 1 min 25. Une mer ne gèle donc plus
    en une heure de jeu : c'est voulu, et le mode « Eau rapide » est le moyen de le voir vite.
  - Dégel au-dessus de 0 °C, au rythme de la fonte de la neige. La glace est le dessus de l'eau : geler et dégeler ne
    changent pas le volume d'eau, qui continue de couler dessous.
  - **Porte** quelqu'un à partir de 50 mm (`ICE_BEARS_MM`) : plus mince, sur une eau où l'on nage, elle cède et on
    nage. **Glisse** dès 5 mm (`ICE_SLIPS_MM`) là où l'on marcherait (flaque gelée, verglas sur un sol inondé).
  - La neige se pose sur la glace au lieu d'y fondre, même quand l'air repasse au-dessus de 0 °C.
- **Feu, météore, comète.** La chaleur d'un feu (`Meadow.warm` : case en feu, arbre en feu, catastrophe « feu »)
  fait fondre la neige d'une case puis la glace dessous. Le météore brûlant fait fondre neige et glace de son
  cratère. La comète brise la glace du sien (`MeadowManager.shatter`). Le givre ne tient pas là où le sol brûle ni
  sur ses cendres (shader du sol, dans les deux modes).
- **Annonce.** `MeadowMessage.ice` (champ 9) : un octet par case (`iceByte`), gzip, vide sans glace ; annoncé toutes
  les 2 s tant que la glace bouge ; gardé dans Redis avec le pré ; vit aussi sur une carte dont l'herbe est coupée.
- **Navigateur, même affichage.** La texture de glace, son dessin dans le shader de l'eau, le patin, l'absence de
  nage et de courant, les poissons figés et l'écume arrêtée de #392 sont repris tels quels : seule leur source
  change. En mode serveur (`followsServerGround`), le shader lit la glace par case dans la texture de données
  (9e paquet de `GroundSplat`, 12 paquets au lieu de 8, uniforme `uServerIce`), plus transparente quand elle est
  mince, et la neige posée dessus est celle de la case. `isOnFrozenWater` lit la glace du serveur (`Ice/IceHold.ts`).
  En météo personnelle (pastille 🖥), rien ne change : le gel local de `Frost.ts`.
- **Température manuelle** jusqu'à −30 °C (au lieu de −10), pour geler un lac vite ; aujourd'hui jusqu'à −80 °C (voir « Conditions réglées à la main : les extrêmes »).
- **Piscines.** L'eau d'une piscine peinte est de l'eau du relief (section « Piscines en eau réaliste ») : elle gèle
  comme un lac, sans règle à part, sauf si son eau est chaude (jamais de glace, la neige y fond). Une piscine posée
  comme image (ancien objet) n'est pas connue du serveur : elle garde la règle de #392 (dès −8 °C) ; la convertir en
  piscine peinte la fait suivre le serveur.
- **Limites.** Pas de glace du serveur dessinée sans shader (repli). La pêche n'est pas refusée sur la glace.
  L'eau sous la glace s'évapore encore. La glace est tenue par case de 32 px, l'eau par cellule de 16 px : le bord de
  la glace est lissé par le shader. `play` et `back` se déploient ensemble.

### Piscines en eau réaliste : un bassin que le serveur remplit

L'eau d'une piscine peinte n'est plus un dessin toujours plein : c'est de l'eau du relief, tenue par le serveur.

- **Le bassin** (`Terrain/Pools.ts`, `poolBasins`). Pour l'eau, une piscine (les cases d'un même style qui se
  touchent) est creusée de la profondeur de son style sous son bord, qui est le sol le plus bas le long de ses côtés :
  un fond plat, un seul niveau. Sur une pente ou un sol inégal elle ne se vide donc pas par son côté bas. Le relief de la carte n'est pas modifié (c'est ce que
  l'éditeur édite et ce qui est dessiné) : le serveur et le navigateur lisent ce relief « avec bassins » pour tout
  ce qui dépend du niveau de l'eau (`TerrainWaterManager`, `TerrainWater.basin()`, courant, flèches des flux). Lu une
  fois par carte et par liste de styles.
- **La pompe** (`WaterSimulation.pumpPools`, `poolCells`). Chaque case sous son niveau reçoit de quoi remplir une
  piscine vide en 10 minutes (`POOL_FILL_SECONDS`, 8 secondes avant le 2026-11-22) : une piscine plus grande ou plus
  profonde a une pompe plus forte. Une chaleur, un météore ou un puits laissent ainsi un niveau visiblement plus bas un
  moment. Un puits adaptatif dont le pied est dans l'eau d'une piscine (`poolNumbersOf`) éteint la pompe de cette
  piscine tant qu'il y est : elle se vide à son débit. Un puits non adaptatif laisse la pompe tourner.
  Remplissage jusqu'à 2 px sous le bord (`POOL_FREEBOARD_PX`), jamais au-dessus. Un trop-plein reprend au même débit ce
  qui dépasse le niveau (neige fondue dans la piscine, pluie), compté avec les puits ; une inondation qui apporte plus
  que ce débit passe quand même par-dessus le bord. Après un météore tombé dans l'eau (comète ou météore brûlant),
  les pompes mettent 3 secondes à repartir (`POOL_PUMP_RESTART_SECONDS`) : une piscine vidée se voit vide. Compté avec les sources dans le bilan de l'eau. Le fond ne boit pas (sol de piscine, creux).
  Le bassin est étanche (`WaterGrid.seal`) : il ne reçoit que la pluie qui tombe dessus (`sealedRainPx`), pas le
  ruissellement du terrain autour, que la margelle arrête ; sinon une pluie le ferait déborder onze fois plus vite.
- **Le souffle d'un météore** (`blastWater`, réglage `water.impactReach`, curseur « Souffle d'un météore dans
  l'eau » de l'outil Relief). Un impact déplace bien plus d'eau que le volume de ce qui tombe : le choc chasse l'eau
  autour du cratère, toute près de lui, de moins en moins ensuite (en ligne droite : un choix, le plus simple qui ne
  laisse pas de marche dans l'eau), plus rien à `impactReach` fois le rayon du cratère. L'eau chassée retombe en
  bourrelet juste au-delà ; ce qui n'y trouve pas de place est perdu. Défaut 2,5 (les projections d'un cratère
  couvrent 2 à 3 fois son rayon), de 1 (l'eau du cratère seule, comme avant) à 4. Vaut pour la comète (avant qu'elle
  projette l'eau de son cratère) et pour le météore brûlant (sa vapeur souffle l'eau autour : il n'était suivi
  d'aucune vague avant), sur toute l'eau de la carte, lacs compris. Dans une piscine, l'essentiel de l'eau est jeté
  dehors.
- **Ce qui en découle.** La comète y soulève une vague, le météore brûlant fait bouillir son eau, le drain la vide,
  et elle se remplit. La pluie et la fonte y tombent. Une inondation y entre, elle déborde. Elle gèle comme un lac.
- **À l'écran** (`GroundSplat`, `poolColor`). La margelle et le carrelage restent ; l'eau dessinée suit le niveau du
  serveur : la couleur de l'eau suit son niveau (à moitié vide, l'eau est pâle et le
  carrelage se voit au travers), une piscine vidée montre son carrelage sec, puis l'eau revient à mesure qu'elle se
  remplit. Pas de glace
  dans une piscine vide. Le sol autour d'une piscine ne s'assombrit pas (pas d'anneau de terre mouillée sur une
  terrasse), et l'eau de la piscine ne bave pas sur la terrasse : à côté d'une piscine, le shader lit la profondeur de
  la case elle-même au lieu de la profondeur lissée entre cases voisines, et ne dessine pas d'eau dans le coin d'une
  case de piscine resté hors de sa forme arrondie.
- **Nage** (`WaterZones`). Les rectangles de piscine restent, avec le plongeon et les échelles ; un rectangle ne
  compte comme de l'eau que s'il contient de quoi nager (16 px en son centre) : dans une piscine vidée on marche sur
  le fond. La nage du relief s'applique aussi (c'est la même eau).
- **Limites.** Les piscines-images gardent leur dessin plein. Une carte existante voit ses piscines se remplir au
  premier pas du serveur. Le sol autour d'une piscine devient humide (berges) : de l'herbe peut y pousser sur un sol
  fertile. La profondeur dessinée plafonne à 128 px. `play` et `back` se déploient ensemble.

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

**Brouillard vu de loin** (2026-11-20, signalé en beta sur la carte d'équipe : dézoomé au maximum, les bâtiments
restaient en pleines couleurs dans une carte délavée, lampes et piste de danse comprises). En dézoomant, le brouillard
passe aussi sur les bâtiments (pièces, murs, paliers), aux mêmes zooms que les nuages sur les toits
(`cloudsOverRoofs` : rien au-dessus de 0,7 pixel d'écran par pixel de carte, plein à 0,45, fondu linéaire entre les
deux) ; plein, il a l'épaisseur du dehors (voile 0,6 et plaques, plus léger la nuit). La pièce où se tiennent les pieds
de l'avatar reste nette à tous les zooms (`farFogCells`, option `avatarRoom` : `OutdoorGrid.roomAt`), ses murs non.
Ce voile intérieur est peint dans un second canevas (`DEPTH_FAR_FOG_INDEX`, au-dessus des lumières des lampes, sous les
cadenas, les bulles et les noms) : les lampes RGB, les lampes de Jam, les torches et le feu à l'intérieur ne le percent
plus ; la piste de danse et la lumière des fenêtres, plus bas, sont voilées comme le sol. Vu de près, rien ne change.
Limites : le brouillard du dehors reste sous les lumières (une lampe dehors le perce comme avant) ; pluie et neige
gardent leur voile au dehors seul.

**Thème saisonnier** (« Paramètres → Ambiance → Thème saisonnier ») : Auto, Automne, Hiver, Aucun (Noël retiré puis
remis sous le nom « Hiver », voir plus bas). Réglage perso
(`seasonalTheme` dans le navigateur), appliqué sans recharger. Il remplace « Thème de Noël » (repris une fois :
Toujours → Auto depuis le retrait de Noël, Jamais → Aucun) et « Sol extérieur » (effacé). Auto suit la saison du lieu
de la carte (Paris sans lieu), revérifiée chaque minute : automne du 1er septembre au 30 novembre au nord, du 1er mars
au 31 mai au sud ; tant que l'heure du serveur
n'est pas reçue, Auto n'affiche rien (`Seasonal/SeasonalTheme.ts`). `SeasonalThemeManager` crée le décor du thème
(`SeasonalDecor`), le masque pendant l'édition et le reconstruit quand un mur ou un objet change.

**Thème « Hiver » remis** le 2026-11-22, à la demande du tech lead (« remets le thème hiver si je veux que ça soit
permanent », « en mode hiver, je m'attends à ce qu'il neige »), deux jours après le retrait décrit ci-dessous. Choix
personnel `winter` (`SeasonalThemeMode.Winter`), jamais affiché de lui-même : Auto reste sans hiver, et un `christmas`
enregistré avant vaut toujours Auto (personne ne retrouve l'hiver sans le choisir). Tant qu'il est choisi, pour ce
joueur seul : il **neige** quel que soit le temps de la carte (`Weather/WeatherFrame.ts` `themedFall` : tout en
flocons, à l'intensité de la pluie ou de l'orage de la carte, légère (`WINTER_SNOWFALL` 0,3) sous un ciel d'où rien ne
tombe ; le ciel se couvre comme sous une pluie) ; tout le **sol dehors est blanc**, avec la texture de neige du moteur
du sol (`TerrainView`, dépendance `snowEverywhere` ; en repli, les blocs par `snowCoverAt`) : c'est ce qui manquait
au thème retiré, dont le sol était un blanc uni ; arbres en image d'hiver (`forcedTreeSeason`) et enneigés
(`GameScene.getMapSnowCoverage` vaut 1), décor de neige de `Christmas/` (calottes, empreintes). Un décor : la marche
n'est pas ralentie (`getSnowCoverAt` ne change pas), rien ne se pose sur le sol de la carte, les autres ne voient rien.
Le retrait du 2026-11-20 avait été demandé pour une raison de fond (« la neige est une résultante des conditions
météo, ce n'est pas un script ») : ce retour la contredit pour qui choisit le thème, à dire dans la PR.

**Thème Noël retiré** le 2026-11-20, à la demande de l'utilisateur (« la neige est une résultante des conditions
météo, ce n'est pas un script ») : son sol de neige uni cachait la texture des tuiles. Plus de choix « Noël » (un choix
enregistré, l'ancien réglage « Toujours » et la commande « christmas: always » de l'app de bureau valent Auto), Auto
ne passe plus en hiver, et rien de ce que le thème forçait ne s'affiche : flocons et météo Neige pour soi
(`effectiveWeather` retiré), sol uni, calottes, empreintes, arbres en image d'hiver (`forcedTreeSeason`) et neige sur
les arbres. Le code du décor de neige (`Christmas/` : `ChristmasDecor`, `SnowGround`, calottes, empreintes) reste :
débranché depuis le 2026-11-21 (voir « Neige : une pluie par temps froid ») et modifié par la PR #392 ;
`SeasonalTheme.Christmas` n'y est plus que le nom de ce décor.

- **Noël** (`Christmas/ChristmasDecor.ts`) : la météo affichée pour soi devient Neige (flocons et son de la météo
  existante), le sol extérieur se couvre de neige bleutée, les objets dehors portent une neige épaisse sur leur bord du
  haut, les sols posés dehors sont givrés, et chaque joueur laisse des empreintes (une tous les 16 px en marche, une
  trace en course, fondu en 45 s, 400 au plus). Les arbres saisonniers prennent leur image d'hiver, sans neige ajoutée.
- **Automne** (`Autumn/`) : la météo de la carte est gardée ; l'herbe prend la texture d'automne d'Amine, les arbres
  leur image d'automne ; feuilles au sol venues des arbres (voir ci-dessous), feuilles qui tombent du feuillage
  (`Nature/TreeLeafFall.ts`), tas de feuilles au pied des objets là où le sol porte des feuilles (arbres
  compris), feuilles soulevées par les pas au même endroit (3-4 feuilles de 5×3 px tous les 24 px en marche, 5-6 tous
  les 16 px en course, 120 au plus). Palette `#c8642a`, `#d9a23b`, `#9b3d23`, `#7a5a2e` ; aucune image ajoutée.

**Feuilles au sol venues des arbres** (`Autumn/LeafDensity.ts`, pur ; avant : une feuille par carré de 48 px partout
dehors, lacs, océan et piscines compris, signalé par l'utilisateur). Seuls les arbres qui se balancent et perdent leurs
feuilles en sont la source (`keepsLeavesInAutumn` de `Nature/TreeLeafFall.ts`, même règle que les feuilles qui
tombent : un arbre dont l'image d'automne est celle d'été n'en perd pas, soit les sapins sombres et clairs, cyprès,
saules, palmiers, arbres nus et la famille `winter-auto-`). Écart connu : les « Sapin enneigé » et le « Palmier
enneigé » (`snow-evergreen-`) ont une image d'automne propre et perdent donc des feuilles, comme avant pour celles qui
tombent. Autour du pied de
chaque arbre, un ovale de feuilles le plus dense au pied (90 % des carrés de 16 px en fin d'automne, un quart de cela
le 1er septembre) qui s'éclaircit jusqu'à son bord : 72 px de rayon (ou les trois quarts de la largeur de l'arbre) en
fin d'automne, la moitié au début ; chaque palier de vent l'allonge de 75 % sous le vent et le raccourcit de 12 % au
vent (tempête : quatre fois plus loin sous le vent). Le vent est celui de la carte (vent réel du lieu, brise de
10 km/h du nord-ouest sinon), arrondi à 16 directions et 5 paliers (0 sous 5 km/h, 1 dès 5, 2 dès 15, 3 dès 30, 4 dès
50) pour que les feuilles ne bougent pas à chaque variation du vent réel ; l'avancée de l'automne par trentièmes. Les
arbres se cumulent. Rien sur l'eau du relief à partir de 2 px (dernier état du serveur, le même pour tous), ni dans
les piscines du sol, ni sur le tapis d'un arbre de rive (`isGroundUnderWater` de `Water/WaterZones.ts`) ; pas de
feuilles flottantes. Tas de feuilles dès 15 % de densité au pied de l'objet, feuilles soulevées dès 10 %. Coût : la
densité de la zone dessinée est calculée en un passage où chaque arbre ne visite que les carrés qu'il atteint
(`leafDensityField`), seulement quand la vue sort de sa marge, que les arbres, le vent arrondi ou l'avancée de
l'automne changent ; mesuré hors jeu : 5 à 10 ms pour 400 arbres sur une zone de 1 650 × 930 à 6 000 × 3 400 px (sans
le dessin). Quand l'eau du relief change (chaque seconde), au plus toutes les 5 s, seules les feuilles déjà tirées sont
relues sur leur sol, et la couche n'est redessinée que si l'une d'elles est atteinte ou quittée par l'eau
(`LeafScatterLayer.refreshGround`). Rien de loin (`seenFromFar`). Front seul.

Empreintes et feuilles soulevées sont calculées par chaque navigateur depuis les positions déjà reçues : rien sur le
réseau. « Afficher la météo » coupé retire aussi les flocons de Noël ; le reste suit le thème. Plus aucune feuille ne
tombe du ciel (2026-11-20 : la boucle météo en semait partout dehors, mer et lacs compris, sans rapport avec les
arbres, `leafParticles` retiré) : en automne, toutes les feuilles viennent des arbres.
Sans thème, la neige de la carte tient sur l'herbe pour tout le monde (elle était réservée à « Suivre la saison et la
météo »).

Limites : un mur manquant laisse entrer le décor ; une image d'objet illisible (CORS) reste sans neige ni tas ; un objet
déplacé par une autre personne garde son décor à l'ancien endroit jusqu'au prochain changement de mur ou à la sortie de
l'éditeur.

Recette : thème « Automne » puis « Hiver », marcher puis courir dehors et dans une pièce, poser un objet dehors, ouvrir
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
pluie, en gouttes ou en flocons, et brouillard 30 %, orage 15 %) ; météo
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

**Ombre des ponts et des paliers** (`floorShadowCasters`, `plateShadow`, `slopeShadow`) : le tablier d'un pont, et plus
généralement les dalles de tout palier (terrasse, étage), projette son ombre sur le sol et l'eau qu'il surplombe. Une
dalle est une plaque à la hauteur de son étage (20 px pour un pont bas, 52 pour un haut), épaisse de 8 px : son ombre est
son emprise au sol décalée à l'opposé de l'astre de hauteur / tan(élévation), avec les mêmes bornes de longueur, la même
couleur et la même opacité que les autres ombres ; le jour passe dessous (le sol juste sous le bord éclairé reste au
soleil). Les dalles voisines d'un même étage font une seule ombre. Un escalier ou une rampe est une pente : de son pied,
au sol, jusqu'à son haut décalé de la hauteur de l'étage ; un escalier à flanc plein est plein dessous. Rangées avec les
murs dans « Ce qui projette une ombre ». Calculées avec les autres ombres fixes : relues quand une pièce change, puis
redessinées seulement quand l'astre bouge d'un demi-degré, rien à chaque image. Dessinées sous les dalles (profondeur
0,7) : jamais sur le dessus de leur propre tablier ; sous un tablier, l'ombre est cachée par lui (soleil haut dans l'axe
du pont). Limites : les ombres des arbres, des murs, des objets, des avatars et des animaux tombent toujours au sol et
passent sous un tablier sans se poser dessus ; ce qui se tient sur un palier (objets, murs d'étage, avatars, animaux) ne
projette pas d'ombre ; les garde-corps non plus. Un avatar sous un pont n'est pas assombri (comme à l'ombre d'un mur).
Rendu non vu à l'écran à l'écriture de ce paragraphe.

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
  (`mapLayerShortStairsAvailableStore`, les anciens sinon) : **une case au sol** vers le nord (`stairRun(…, short)`),
  la longueur habituelle vers le sud (l'avatar y descend l'écran : il faut une longueur supérieure à la hauteur).
  Dessin éclairé d'en haut, nez de marche. **Vers l'est et l'ouest, l'éditeur pose les anciens escaliers**
  (`newStairIsShort`) : sur une case, vu de profil, un escalier n'est que quelques piliers raides. Les escaliers déjà
  posés (dont les `-v2` est et ouest d'une case) gardent nom, longueur et dessin.
- **Éditeur** (`MapLayerFloorEditing.ts`, `FloorOperations.ts`) :
  - « Niveau » : choisi à la main ; pipette par Alt+clic, Cmd+clic ou le bouton « Prendre le niveau sous le
    pointeur » ; le nom du niveau suit le pointeur (un même point de l'écran est une case de chaque niveau).
  - « Dalles de palier » : rectangle au niveau choisi (le mode quitte le sol tout seul).
  - « Escalier » : « Part du » (niveau courant), « Monte jusqu'à » (niveaux atteignables ; par défaut un niveau déjà
    posé), direction, largeur, flanc vide. La trémie est découpée dans le palier d'arrivée et rebouchée au retrait.
    Aperçu : rond = première marche, flèche = arrivée, bleu = dalles d'arrivée, orange = pas de dalle à l'arrivée,
    rouge = dalles retirées pour la trémie. Un escalier posé sans arrivée garde ses cases d'arrivée barrées d'orange.
  - Un escalier ou une rampe déjà posé est entouré en blanc au survol, en mode Escalier : le glisser le déplace (même
    forme, même niveau ; trémie quittée rebouchée, nouvelle trémie découpée, une seule annulation). Un clic dessus ne
    fait rien.
  - Plus de « Gomme de palier » : la Gomme de l'outil Carte efface aussi dalles et escaliers (voir « Gommes et
    suppression dans l'éditeur »).
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
  partagé `mapEditorPlacementLevelStore`) : une ligne Auto · pipette · Sol · paliers posés, des flèches vers le
  niveau au-dessus ou en dessous (voir « Éditeur : choisir un niveau »). **Auto** suit le palier dessiné sous le pointeur, le sol ailleurs. Dans l'outil Carte, un
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
  (`Weather/RaisedCover.ts`) : un étage est un morceau de bâtiment, où qu'il se tienne. Seule la partie dessinée
  d'un escalier ou d'une rampe qui monte vers l'est ou l'ouest est épargnée (`floorPieceCover` : la bande en biais,
  et le flanc d'un escalier plein), pas toute son image. Les coins vides de l'image laissent voir le sol, qui reçoit
  la pluie et le voile du ciel comme autour. Avant, la boîte entière de l'image restait claire : un rectangle sans
  voile au-dessus et sous chaque rampe de pont, signalé le 2026-11-22.
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

## Pêche (canne, lancer, prise remise à l'eau)

Conception et plan dans le dépôt d'infra, `docs/superpowers/{specs,plans}/2026-11-18-peche*`. Lot 1 : pêcher. Le
concours de pêche est le lot 2, non fait.

**En jeu.** La **canne à pêche** se prend dans la roue de son avatar (« Équiper la canne à pêche ») : troisième outil
de la main avec le Nerf et la torche, un seul à la fois ; les autres voient la canne. Canne en main, debout ou en
canoë (pas en nageant) et à l'arrêt : **ESPACE maintenu** remplit une jauge (1 à 8 cases en 1,5 s), **relâché** lance
droit devant l'avatar. Le bouchon ne se pose que dans une eau du relief où vivent des poissons (8 px et plus, vie de
la carte activée) ; sinon « Raté ». Un poisson de la carte, libre et à moins de 4 cellules du bouchon, finit par s'y
intéresser et y nage : on le voit venir. Arrivé dessus, **touche** : le bouchon plonge, un « ! » s'affiche, il reste
**2 s pour ferrer avec ESPACE**. Trop tard : le poisson repart et ne mord plus à aucune ligne pendant 60 s. Ferré, il
est ramené en 1 à 4 s selon son poids, puis une carte dit « Poisson rose · 1,24 kg » (vue aussi par les joueurs qui
ont le pêcheur à l'écran) et le poisson est **remis à l'eau** : la pêche ne retire rien à la vie de la carte. Pendant
la remontée le poisson reste un poisson de la carte : un dauphin peut le manger. ESPACE sans touche ramène la ligne ;
marcher, ranger la canne ou quitter la salle aussi. **Depuis un palier** on pêche dans l'eau du sol en contrebas :
le lancer part du point du sol situé sous l'avatar, avec la même portée qu'au sol, et la ligne descend de la canne
jusqu'au bouchon.

ESPACE garde ses autres usages : une invite affichée (siège, porte, animal à apprivoiser) ou un objet à activer à
côté de l'avatar passent avant la canne.

**Les poissons s'écartent des avatars** à moins de trois cases : un bouchon posé au pied de l'avatar n'attire rien,
il faut lancer loin.

**Poids.** Chaque poisson a un poids adulte entre 0,3 et 3 kg, tiré de son identifiant (le même pour tous, rien
n'est enregistré ; les gros sont plus rares) ; il pèse 5 % de ce poids à la naissance et l'atteint à la moitié de sa
vie.

**Qui décide.** Le serveur (`back`, `FishingManager`) : le navigateur n'envoie que « lancer ici » et « ramener », et
dessine ce qu'on lui annonce. Refusés par le serveur : un lancer à plus de 9 cases de l'avatar, hors de l'eau à
poissons, moins d'une seconde après le précédent, ou quand la carte a déjà 20 lignes à l'eau. La distance d'un joueur
sur un palier se compte depuis le sol sous lui (`anglersOf`). Une ligne par joueur. Les lignes ne survivent pas à un redémarrage du serveur ; le nombre de prises depuis le début de
la vie de la carte, si (Redis `fishing:<salle>`).

**Outil Vie.** Le tableau de bord gagne la ligne « Pêchés (remis à l'eau) » : depuis le début (compté par le
serveur) et dernière minute (ce que ce navigateur a vu).

**Technique.** Règles pures dans `libs/map-editor/src/Life/Fishing.ts` (`castLine`, `reelLine`, `stepFishing`) ; le
moteur de vie n'est pas modifié : juste avant chaque pas, la pêche donne au poisson mené sa destination (le bouchon),
et `stepPopulation` l'y fait nager. `AquaticLifeManager` reçoit deux crochets (`beforeStep`, `stopped`). Protocole :
`CastFishingLineMessage`, `ReelFishingLineMessage` (navigateur → serveur), `FishingMessage` (toutes les lignes de la
salle et ce qui vient d'arriver, envoyé seulement quand une ligne change, et à l'entrée dans la salle). Navigateur :
`play/src/front/Phaser/Game/Fishing/`, `Stores/FishingStore.ts`, `Components/Fishing/FishingCards.svelte`, variable
de joueur `_rodEquipped`. `play`, `back` et `map-storage` se déploient ensemble.

**Limites.** Pas de son. Pas d'animation du lancer (la ligne apparaît posée). Le poisson ramené reste dessiné au
bouchon jusqu'à la prise. Eau du relief au sol seulement (ni piscine de la carte, ni piscine d'un palier). Depuis un palier, un lancer vers
le nord part du sol sous l'avatar : à l'écran le bouchon peut tomber plus bas que l'avatar ou derrière le bâtiment
(non vu en jeu). Le serveur ne connaît pas les dalles : il croit l'altitude que le navigateur publie (`_floorZ`). La canne est un trait,
dessinée par-dessus tous les avatars.

### Concours de pêche

**Lancer.** Canne en main, la roue de l'avatar propose « Concours de pêche » ; un petit panneau sous l'horloge demande
la durée : 3, 5 ou 10 minutes. Un seul concours à la fois par carte ; n'importe quel joueur peut en lancer un.

**Pendant.** Tous les présents voient le panneau : temps restant, qui l'a lancé, classement (cinq premiers, et sa
propre ligne si elle est plus bas) avec le poids total et, entre parenthèses, la plus grosse prise. Qui n'a pas la
canne en main a un bouton « Participer » qui l'équipe. Toute prise faite pendant le concours compte pour qui la fait.
Un même poisson ne compte qu'une fois par joueur (il est remis à l'eau et peut être repris). Égalité : la plus grosse
prise, puis le premier arrivé à son score.

**Fin.** À l'heure, même si celui qui l'a lancé est parti : podium (trois premiers, plus gros poisson cité) affiché
vingt secondes ou jusqu'à « Fermer ». Rien n'est gardé du concours. Vie de la carte coupée : le concours finit aussitôt.

**Record de la carte.** Le plus gros poisson jamais pêché sur la carte (en concours ou non), par qui et quand, est
gardé (Redis `fishing:<salle>`, avec le total des prises) et affiché dans l'outil Vie, ligne « Record de pêche ».

**Technique.** Le serveur tient le concours (`FishingManager` de `back`), règles pures dans
`libs/map-editor/src/Life/FishingContest.ts`. Un joueur y est reconnu par son `uuid` : son score survit à une
reconnexion. Protocole : `StartFishingContestMessage {minutes}` (navigateur → serveur) ; `FishingMessage` gagne
`contest` (classement, millisecondes restantes à l'envoi, `finished` une seule fois à la fin) et `record`. Un refus
(concours en cours, durée non permise, pas de vie dans l'eau) n'est dit qu'à qui a demandé. Navigateur :
`Phaser/Game/Fishing/FishingContestView.ts`, `Components/Fishing/FishingContestPanel.svelte`.

**Limites.** Un concours ne survit pas à un redémarrage du serveur. Après une reconnexion, sa propre ligne n'est plus
mise en gras avant sa prise suivante. Pas d'annonce sonore ni de carte d'annonce à part : le panneau apparaît.

### Cabane de pêche sur glace

**Monter.** Debout sur la glace, la roue de l'avatar propose « Monter une cabane de pêche ». L'entrée est grisée, avec
sa raison, quand la glace du serveur ne la porte pas : il faut **102 mm** de glace sous tout le plancher
(`ICE_SHACK_MM`, `libs/map-editor/src/Terrain/Ice.ts`). C'est 4 pouces : selon l'affiche « Recommended Minimum Ice
Thickness » du Minnesota DNR (glace neuve et claire), on reste hors de la glace sous 4 pouces, et 4 pouces suffisent
pour pêcher à pied. Un abri léger tiré à la main avec une personne relève de cette catégorie (https://files.dnr.state.mn.us/education_safety/safety/ice/ice-tickness-guidelines-poster.pdf).
Il faut aussi au moins 16 px d'eau sous le trou, là où l'on nage (une flaque gelée ne suffit pas). Pas de cabane sur
une piscine (pas de poissons), depuis un étage, à moins de trois cases d'une autre, ni à moins d'une case de l'endroit
où un objet de la carte est posé : le serveur ne connaît pas la taille des objets, seulement leur position. Chaque
joueur a une seule cabane, et une carte en compte huit au plus. Le perçage à la tarière dure 2,5 s et laisse un trou
rond entouré d'éclats ; la cabane se monte ensuite en 1,5 s, puis celui qui l'a montée s'assied sur le tabouret.

**Utiliser.** La cabane reste où elle a été montée. N'importe qui peut s'asseoir sur son tabouret, par la roue
(« S'asseoir dans la cabane de … ») ou par la touche d'interaction, comme sur un siège de la carte. Une seule
personne à la fois : l'entrée est grisée tant que quelqu'un y est assis. Une fois assis, la canne passe en main et
ESPACE descend la ligne droit dans le trou, sans jauge. La suite est la pêche ordinaire : la touche, le ferrage, puis
la prise. Les prises sont les poissons de la vie de la carte qui nagent sous la glace. Elles vont dans le même carnet
et comptent au concours. Quand quelqu'un est assis, le poêle est allumé : le tuyau fume, la fumée suit le vent de
l'air de la carte (`groundWind`), et de nuit la lanterne et le poêle éclairent les alentours.

**Partir, démonter.** Se lever (par la roue, ou en marchant) laisse la cabane en place. Seul le joueur qui l'a montée,
reconnu par son `uuid`, peut la démonter, depuis l'intérieur ou à côté. Une cabane disparaît aussi si son propriétaire
n'est pas revenu dans la salle depuis 24 h.

**Dégel.** Toutes les 2 s, le serveur lit la glace la plus mince sous le plancher. Si elle passe sous 102 mm, la glace
craque pendant 5 s : des fissures sont dessinées, l'occupant est averti et se lève, et personne ne peut plus s'asseoir.
La cabane se replie ensuite et disparaît avec son trou. Si la glace fond complètement, la cabane disparaît aussitôt.
Une glace qui s'épaissit de nouveau arrête les fissures. Tant que la salle rattrape le temps passé vide, le serveur ne
juge pas la glace.

**Météo personnelle.** La cabane est un objet de la salle : tout le monde la voit. Un joueur qui suit la météo d'un lieu
à lui ne voit pas la glace du serveur. Pour lui, « Monter » et « S'asseoir » sont grisés avec la raison « suivez la
météo de la carte ».

**Technique.** La cabane n'est pas une modification de la carte : rien n'est écrit dans le WAM. `IceShackManager`
(`back`) la tient en mémoire et l'enregistre dans Redis `ice-shacks:<salle>`. Les cabanes survivent donc à un
redémarrage ; l'occupant n'est pas gardé. Règles pures : `libs/map-editor/src/Life/IceShack.ts`. Glace :
`MeadowManager.iceAt`. Eau : grille du relief. Le tabouret est un siège de `Phaser/Player/Seat.ts` : un joueur assis
se voit assis chez les autres, sans message dédié. Protocole :
- `IceShackActionMessage {action, shackId}`, du client au serveur (81, et 65 du pusher à `back`) ;
- `IceShacksMessage {shacks, events}`, du serveur à la salle (59 et 39) et à l'arrivée d'un joueur (`RoomJoinedMessage` 47).

Il faut déployer `play` et `back` ensemble. Dessin en code : `Phaser/Game/IceShack/IceShackShapes.ts`, en trois
couches triées avec les avatars. La façade et l'avant du toit sont retirés, comme dans une maison de poupée, pour voir
le pêcheur. En relief 3/4, la cabane est dessinée au niveau de la surface de l'eau sous son trou
(`GameScene.surfaceDropAt`), comme le bouchon et l'avatar posé sur la glace : seul le dessin se décale.

**Limites de ce lot.** Le trou est décoratif : ce n'est pas un trou d'eau libre où l'on tombe. La pêche ordinaire
n'est toujours pas refusée à travers la glace hors cabane. La cabane n'a pas de collision. Un seul siège, pas de
concours propre à la glace, et le poêle ne réchauffe pas la glace.

## Feu de végétation : conditions et sécheresse (lot 1)

Premier lot du feu de végétation : la salle a des **conditions de feu**, réelles ou réglées à la main, et l'herbe du
pré **sèche et jaunit** selon elles. Le feu lui-même et ses flammes viennent dans les lots suivants.

**Conditions de la salle.** Température (°C), humidité de l'air (%), vent (km/h et provenance en degrés) et trois
seuils. Le serveur (`back/src/Model/FireConditionsManager.ts`) les tient pour toute la salle :
- **Manuel** quand un joueur l'a activé : ses valeurs valent pour tous.
- Sinon **réel** : le quart d'heure en cours de la météo du lieu, quand la carte est en météo « Réel ». L'humidité de
  l'air est lue chez Open-Meteo (`relative_humidity_2m`, champ facultatif `humidity` du créneau).
- Sinon, ou pour ce que la météo réelle ne donne pas : conditions neutres 20 °C, 60 %, 10 km/h du nord-ouest. Une
  carte en météo fixe ou automatique ne sèche donc qu'en manuel.

Le serveur borne toute valeur (température −80 à +80 °C, humidité 0 à 100 %, vent 0 à 250 km/h depuis le 2026-11-21,
voir « Conditions réglées à la main : les extrêmes » ; seuils 0 à 50 °C, 5 à 100 %, 5 à 120 km/h), refuse plus de 5 changements par seconde et par joueur, annonce les conditions à la salle à
chaque changement (et quand la météo réelle avance) et à l'entrée d'un joueur. Rien n'est enregistré : après un
redémarrage de `back`, la salle revient aux conditions réelles et aux seuils 30-30-30.

**Danger** (`fireDanger`, `libs/map-editor/src/Weather/FireConditions.ts`, la même fonction pour le serveur et le
navigateur) : de 0 à 1. Il vaut 1 à **30 °C, 30 % d'humidité et 30 km/h** (seuils par défaut, réglables), la moitié
sans vent, 0 s'il fait frais (15 °C sous le seuil) ou humide (30 points au-dessus du seuil). La chaleur et la
sécheresse de l'air doivent être là toutes les deux ; le vent double ce qu'elles font.

**Sécheresse de l'herbe.** Par case, dans le pré du serveur (`Meadow.drynessAt`) : elle tend vers
`danger × (1 − humidité du sol)` avec une constante de temps de 90 s, retombe quand le sol se mouille ou que les
conditions s'apaisent, et vaut 0 sous l'eau ou sans herbe. Elle est annoncée avec le pré (`MeadowMessage.dryness`) et
sauvegardée avec lui ; un pré sauvegardé avant ce lot se recharge, vert.

**Berges vertes (correctif du 2026-11-21).** Signalé en beta par une canicule (36 °C, 20 %, 26 km/h) : toute l'herbe
était jaune jusqu'au bord de l'eau. Deux causes : la cible de sécheresse suivait `danger × (1 − humidité)`, si bien
qu'une herbe encore assez humide pour pousser (humidité 0,26 au bord, 0,25 étant le seuil de pousse) était peinte en
paille à 69 % ; et le dessèchement accéléré (×20 au danger maximal) vidait le sol voisin de l'eau dès la deuxième
case. Désormais la sécheresse tend vers `danger × soif`, la soif allant de 0 au seuil de pousse
(`GROWING_MOISTURE[0]`) à 1 au seuil de mort (`DRY_MOISTURE`) : l'air ne sèche que l'herbe que le sol laisse
assoiffée. Et le sol le long de l'eau libre boit par en dessous (nappe, remontée capillaire) : à 1, 2 et 3 cases d'une
eau posée au sol il garde au moins 0,8, 0,5 et 0,17 d'humidité (`BANK_MOISTURE`, `Meadow.drinkFromBanks`, de proche en
proche, dehors). Mesuré par la bibliothèque à 36 °C / 20 % / 26 km/h : sécheresse 0 / 0 / 0,44 aux cases 1 à 3, puis
0,93 dès la 4ᵉ (avant : 0,69 / 0,87 / 0,92 / 0,93). Le guide de séchage du CFA (Victoria) note à 90 % « some green in
wetter areas such as roadside and river valleys ». Au-delà de la bande, le feu court comme avant ; la berge verte le
freine (chance de propagation des herbes vertes). Changement voulu : une herbe humide (sol à 0,25 et plus) ne jaunit
plus sous un danger modéré.

**À l'écran.**
- Le widget « Catastrophe » a deux onglets. L'onglet **« Météo »** : interrupteur « Manuel » (coupé, les curseurs
  montrent les conditions réelles, grisés), curseurs de température, d'humidité, de vent, provenance du vent par les
  huit points de la rose, trois seuils (réglables même hors manuel) et l'indicateur de danger (faible, modéré, fort,
  extrême). Un geste envoie la demande au serveur, quatre fois par seconde au plus pendant un glisser ; l'annonce du
  serveur déplace les curseurs de tous sans rien renvoyer.
- L'herbe sèche est peinte en **paille** par-dessus le vert, d'autant plus qu'elle est sèche. Couleur revue le
  2026-11-21 (avant `#e0c24a`, jaune moutarde saturé à 71 %) : les guides de séchage du CFA (Victoria) et de la FESA
  (Australie-Occidentale) disent « straw » puis « bleached » à 90-100 %, et leurs photos mesurées (moyenne des zones
  au soleil) donnent des blonds gris de 26 à 34 % de saturation (`#bcae8a`, `#c0ad95`, `#c2ae83`). Le shader du sol
  (`GroundSplat`) mêle par grandes plaques un blond délavé `#c0a870` et un kaki sec `#a99b66`, grain de ±7 % ; le
  repli sans shader (`STRAW_COLOR`) prend leur milieu `#b4a16b`. Écart avec le sable (`#e1cd96`) : ΔE ≥ 15 composé
  sur l'herbe (avant 31), avec l'argile ≥ 17.
- En manuel, le **vent de toute la scène** (nuages, arbres, pluie penchée) est celui de la salle.
- Le bandeau météo affiche l'**humidité** pour « Maintenant » et, en manuel, la température et le vent de la salle
  avec la mention « manuel ».

**Protocole.** `SetFireConditionsMessage` (70 du navigateur au pusher, 54 du pusher à `back`),
`FireConditionsMessage` (47 et 27, et `RoomJoinedMessage.fireConditions` = 35), `MeadowMessage.dryness` = 5.
`play` et `back` se déploient ensemble ; `map-storage` n'est pas concerné.

**Limites connues.** Le manuel ne change ni la pluie ni le ciel de la carte. Les conditions manuelles sont perdues
au redémarrage de `back`. Rien n'a été vu à l'écran à l'écriture de cette section : onglet, teinte de l'herbe,
bandeau et vent manuel ne sont validés que par les tests.

## Feu de végétation : les flammes (lot 3)

Le lot 2 fait brûler le sol sec (patch de feu au clic maintenu, propagation au vent, cendres, extinction par l'eau) ;
ce lot dessine le feu. Rien ne change côté serveur ni sur le fil.

- `Fire/FlameShape.ts` (pur, testé) : la boucle d'une flamme en 14 images (`drawnFlame`, `drawnEmbers` : elle
  respire, ondule, ses braises montent), et la pose d'une image sur une case (`flamePose` : laquelle, sa taille selon
  l'intensité du feu, tournée du côté où va le vent ; chaque case entre dans la boucle à son instant et à son allure).
- `Fire/FireView.ts` : les 14 images sont dessinées une fois dans une texture (quatre langues emboîtées, du rouge au
  blanc chaud, braises), puis posées comme des images à la profondeur du pied de chaque case (une flamme passe devant
  ce qui est plus au nord et derrière ce qui est plus au sud) ; fumée sous le voile de nuit ; lueur en fusion
  additive au-dessus des lumières des lampes. Les flammes bougent 12 fois par seconde et la scène n'est redessinée
  qu'à ce rythme.
- 600 flammes au plus à l'écran, au-delà une part des cases en feu, réparties sur toute la vue et dessinées plus
  grosses (`spreadTiles`).
- Mouvement réduit : une image fixe, sans braises. Le scintillement reste doux (pas de flash).
- Chaque navigateur dessine ses flammes : deux joueurs voient le même feu, pas forcément la même image de la boucle.
- **Sol gardé en mémoire** (`TerrainView`, `BlockSurface.snapshot` / `restore`) : sols, herbe, paille, cendres et
  relief sont composés une fois pour un relief, un pré et une vue, puis reposés sous l'eau ; tant que l'eau bouge
  (10 dessins par seconde) seule l'eau est repeinte. Le relief et le pré sont lus à part (`reliefOver`,
  `meadowOver`) : quand le serveur redit l'état du pré (toutes les 10 s, toutes les 2 s pendant un feu), seul le pré
  est relu, tuile par tuile, et le sol repeint ; le relief, long à lire sur une vue large, ne l'est plus. Mesuré
  dézoomé au maximum sur la carte d'équipe (3600 × 1800, navigateur sans écran) : l'image qui suit une annonce du pré
  passe de 66 à 72 ms à 20 à 25 ms.

Limites : pas de son, la lueur n'éclaire pas la nuit comme une lampe (elle ne perce pas le voile). Les arbres
brûlent depuis le lot 4, ci-dessous.

## Feu de végétation : la repousse après le feu

Une case brûlée est verte de nouveau en **5 minutes** au plus (`AFTER_FIRE_SECONDS` de
`libs/map-editor/src/Terrain/Meadow.ts`), quels que soient l'heure, la saison, l'humidité et l'altitude : c'est un
jeu, pas une forêt. Avant, la cendre ne partait qu'avec l'herbe qui repoussait, de jour seulement, à 40 % de sa vitesse
en automne et pas du tout en hiver : en automne de nuit une case restait noire jusqu'au matin.

- La cendre d'une case éteinte reste entière 15 % de ce temps (45 s, le temps des braises que dessine le navigateur),
  puis part régulièrement ; l'herbe revient avec elle jusqu'à un pré plein (`1 − cendre`), même là où il n'y en avait
  qu'une litière sèche. Ensuite l'herbe suit ses règles habituelles (soif, noyade, saison).
- Elle repousse partout où l'herbe peut pousser : pas sous l'eau, sous la neige des hauteurs, sur le sable, le rocher,
  le gravier, un sol de l'outil Carte ni dedans. Là, la cendre part quand même, sans herbe.
- Une case rebrûle dès que la moitié de sa cendre est partie (un peu moins de 3 min après son feu), comme avant à
  mi-repousse : une case en cendres reste un coupe-feu pendant un incendie.
- Une carte dont l'herbe pousse plus vite que 5 min (réglage « pré plein en … min ») repousse aussi vite qu'elle.
- Aucun réglage nouveau, rien sur le fil : bibliothèque et `back` seulement. Le compte à rebours de la cendre entière
  n'est pas gardé : après un redémarrage de `back`, la cendre part aussitôt.

## Feu de végétation : les arbres brûlent, les animaux fuient (lot 4)

Les arbres du catalogue nature (`Nature:tree-…`, ceux qui se balancent au vent) prennent feu, lancent des braises
sous le vent, restent noirs puis reverdissent seuls. Les animaux fuient le feu de l'herbe et celui des arbres. Le
serveur seul décide ; `play` (front et pusher) et `back` se déploient ensemble.

**Règles** (`libs/map-editor/src/Terrain/TreeFire.ts`, pur, testé)

- Chaque arbre a une chaleur, un feu, une part brûlée et une attente. Il chauffe par l'herbe qui brûle à son pied,
  par un arbre voisin en plein feu (le vent porte la chaleur, `fireWindPush`) et par les braises ; il s'embrase,
  brûle 90 s (`TREE_BURN_SECONDS`) et rallume l'herbe sous lui.
- Un arbre en plein feu lance des braises sous le vent (8 par arbre, 40 en vol par salle au plus), qui allument un
  foyer plus loin (`emberReachTiles`). L'eau à son pied et une forte pluie l'éteignent.
- Un arbre entièrement brûlé est vert de nouveau en 5 min au plus (`AFTER_FIRE_SECONDS`, moins si l'herbe de la
  carte pousse plus vite) : noir la première moitié, il reverdit dans la seconde, de jour comme de nuit, en toute
  saison ; éteint avant, il revient d'autant plus vite. Un arbre ni en feu ni brûlé n'est pas regardé.
- La catastrophe « Feu » allume aussitôt les arbres sous le patch (`TreeFire.ignite`).

**Serveur** : `MeadowManager` fait avancer les arbres après le pré, à son pas de 2 s, et les garde dans Redis avec
le pré (champ `trees`). Il annonce les arbres qui changent et les braises parties : `TreeFireMessage`
(`SubMessage` 48, `SubToPusherRoomMessage` 28, `RoomJoinedMessage.treeFire` 36 pour qui entre).

**Navigateur**

- `Fire/TreeFireState.ts` garde ce que le serveur a dit. `Nature/CharredTreeTexture.ts` fabrique l'image calcinée
  d'un arbre en quatre degrés (roussi, brûlé, noir, noir et troué), une fois par image et par degré ; l'objet la
  choisit dans `Entity.showPrefabTexture`, là où il choisit son image enneigée. Un arbre calciné n'a ni neige ni
  feuilles qui tombent. Pendant que la carte est éditée, il montre son image normale.
- `Fire/TreeFlames.ts` (pur) place les flammes dans la couronne, celles du bas d'abord ; `Fire/TreeFireView.ts` les
  pose avec les images de `FireView`, une lueur et une colonne de fumée par arbre, et les braises sur leur arc. Vu de
  loin, une flamme par arbre.

**Les animaux fuient** (`Life/FireFear.ts` : `LifeFire`, `lifeFireOf`)

- Le feu vu par les animaux : la case d'herbe en feu ou l'arbre en feu le plus proche, à 5 cases au plus
  (`FIRE_FEAR_PX`).
- Antilopes, lions et tigres simulés (`stepPopulation`, paramètre facultatif `fire`) : le feu passe avant tout,
  avant l'avatar et le prédateur, y compris pour un lion ou un tigre rassasié. Effrayé, l'animal ne chasse pas, ne
  s'accouple pas, arrête de boire. Il ne court jamais vers une case en feu. Encerclé, il reste sur place ; si sa
  propre case brûle, il court vers la plus proche qui ne brûle pas, à travers les flammes. **Il ne meurt pas.**
  Aucun couple n'arrive sur un sol en feu.
- Mouettes : posée, elle s'envole d'un feu à moins de 3 cases et ne se pose pas sur une rive aussi proche d'un feu.
  Poissons et dauphins : rien, l'eau ne brûle pas. Les animaux apprivoisés suivent leur maître.
- `MeadowManager.lifeFire()` donne le feu à la vie de la salle (`AquaticLifeManager.followFire`), seulement quand
  quelque chose brûle : sans feu, aucun tirage de plus, les empreintes témoins de la vie ne changent pas.
- Animaux promeneurs du navigateur (jungle, chiens, chats, canards ; `Wander/WanderFear.ts` `fearedPoint`,
  `WanderingCharactersManager.runFromThreats`, `GameScene.getLifeFire`) : tous fuient le feu, les braves et les
  animaux posés sur la carte compris, jamais vers un sol en feu, et restent à l'écart tant que le feu est à moins de
  7 cases (`FIRE_CALM_PX`). Un animal mené par un joueur ne fuit pas. Chaque navigateur calcule cette fuite : deux
  joueurs peuvent voir un promeneur à deux endroits voisins pendant un feu.

Limites : un arbre calciné ne fume pas après le feu et n'a pas de points rouges qui s'éteignent (prévus par la
conception, non faits) ; pas de son ; un animal encerclé ne meurt pas ; la fuite des animaux simulés est en ligne
droite, sans recherche de chemin ; un lion ou un tigre revient autour de son arbre, même calciné.

## Catastrophes : le météore

Sur une carte dont l'eau a de l'inertie, la comète ne lance plus l'onde décrite ici : elle jette l'eau de son
cratère en bourrelet et l'eau fait elle-même la vague (voir « Eau à inertie »).

> Depuis le 2026-11-20 la tuile de cette section s'appelle **« Comète »** dans le widget (elle apporte de l'eau et
> lance une onde ; elle est dessinée en bleu glace). Son code garde ses noms (`CATASTROPHE_METEOR`, `Meteor.ts`,
> `MeteorView`). La tuile « Météore » est désormais le météore brûlant décrit plus bas (« Catastrophes : le météore
> brûlant »). Dans le texte qui suit, « météore » désigne donc la comète.

Conception et plan dans le dépôt d'infra, `docs/superpowers/{specs,plans}/2026-11-19-catastrophes-meteore*`. Lot 1 :
le météore, qui ne touche que l'eau du relief.

**En jeu.** Le menu des applications a un bouton « Catastrophe » qui montre ou cache une pastille sur la ligne de
l'horloge, dont le panneau flottant porte les tuiles (fermé à chaque chargement de page ; voir « Interface compacte »). Il reste utilisable quand l'éditeur de carte est ouvert : tant qu'une
catastrophe est armée, l'éditeur met son outil de côté (aucun outil choisi, panneau de l'outil masqué) et le reprend
dès qu'elle est désarmée ; choisir un outil désarme la catastrophe (`CatastropheToolPause.ts`,
`MapEditorModeManager`). Dans le widget, la tuile « Météore » **arme** le tir
(un second clic sur la tuile le désarme ; fermer le widget aussi) : le curseur devient un viseur
et un **clic gauche sur la carte** (ou un toucher bref) lance le météore à cet endroit. **Échap** annule. Le glisser
de la carte reste libre : seul un clic qui n'est pas un glissé tire, et il ne fait alors ni marcher, ni activer, ni
choisir quoi que ce soit. Rien n'est tiré hors de la carte ni quand les commandes sont suspendues. Armé, le tir
reste armé après chaque lancer.

**Ce que tout le monde voit.** Une ombre qui grandit au sol pendant la chute (1,2 s), le météore qui arrive en
diagonale avec sa traîne, un éclair blanc de 120 ms sur tout l'écran (un éclair toutes les 334 ms au plus pour tout l'écran, WCAG 2.3.1 : un impact trop proche du précédent n'en a pas, il garde sa gerbe), puis une gerbe de 0,6 s : **bleue** si le sol
est sous au moins 2 px d'eau à l'impact (d'après ce que ce navigateur sait de l'eau), **brune** (poussière) sinon.
Pour qui a demandé moins de mouvement (`prefers-reduced-motion`) : ni éclair ni météore qui tombe, il reste l'ombre
et la gerbe. Tout est dessiné par le navigateur, en code, dans un seul calque au-dessus du voile de nuit et de la météo (`DEPTH_NIGHT_INDEX + 2`).

**Taille de la comète et du météore.** Le widget a un curseur : rayon du cratère de **1 à 8 cases** (4 par défaut,
gardé pour la session ; de 2 à 24 jusqu'au 2026-11-21). Le navigateur l'envoie avec la demande (`radiusTiles`), le
serveur le ramène dans ces bornes (`meteorShape`, `METEOR_MIN_TILES` et `METEOR_MAX_TILES`, lues aussi par le
curseur : une valeur hors plage, comme le 24 d'un onglet ouvert avant, donne la plus proche ; 0 ou une valeur non
numérique donne 4) et l'annonce à la salle. Tout en découle : volume d'eau déplacé (surface du cratère × profondeur), eau
apportée, portée de l'onde (6 fois le rayon du cratère, jamais moins de 64 cellules : 64 à 96 dans ces bornes),
taille de l'ombre, du météore (jamais dessiné à moins de 4 px de rayon), de la gerbe et des cercles.

**Ce que fait l'eau.** À l'impact, le serveur vide le **cratère** (pour la taille par défaut : rayon 8 cellules de 16 px, soit 4 cases) et confie
cette eau, **plus 8 px apportés par cellule du cratère**, à une **onde** (`Catastrophe/ImpactWave.ts`) dont le front
avance d'une cellule à chaque pas de l'eau (10 par seconde, donc 5 cases par seconde), jusqu'à 64 cellules (32 cases)
de l'impact pour la taille par défaut. En eau profonde (8 px et plus) chaque cellule que le front atteint ne garde qu'une houle de 0,5 px ; le
sol sec ou peu mouillé reçoit le reste, jusqu'au niveau d'eau le plus haut permis : c'est la rive qui est inondée,
même loin de l'impact. L'onde ne traverse aucun mur. À sa fin, l'eau qui n'a trouvé aucune rive retombe dans le
cratère ; ce qui n'y tient pas est perdu. L'eau apportée est comptée dans les **sources** du bilan de l'eau, l'eau
perdue dans les **pertes**. Tant qu'une onde court, la salle reçoit l'eau cinq fois par seconde au lieu d'une. Ensuite
c'est la simulation ordinaire : l'eau des rives redescend vers le lac. Sur une carte sans eau, rien. (Un premier
modèle reposait l'eau du cratère sur l'anneau voisin : dans un lac plein, il n'y avait que 2 px de place sous le
plafond et 93 % de l'eau était perdue, sans vague visible.)

**Hauteur maximale de l'eau (réglage de la carte).** L'eau d'une carte ne monte pas plus haut que 18 px au-dessus de
son niveau de débordement (règle de la #317 contre les dômes d'eau) ; ce qui dépasse est perdu à chaque pas. Le
panneau Relief a un curseur « Hauteur maximale de l'eau au-dessus du sol », de 18 à 256 px
(`settings.water.maxSurface`, 18 par défaut : rien ne change pour une carte qui ne le règle pas ;
`UpdateWaterSettingMessage.maxSurface`, champ 6, facultatif). Le serveur l'applique à la grille à chaque pas
(`WaterGrid.setMaxSurface`) : crue, source, pluie et vague d'un météore montent alors jusque-là. Baissé, ce qui
dépasse est perdu au pas suivant. Au-delà de 52 px l'eau atteint les étages ; sous une forte pluie avec ruissellement
sur une carte accélérée, l'eau peut de nouveau s'empiler (c'est ce que le plafond de 18 px empêchait). `play`, `back`
et `map-storage` se déploient ensemble pour ce réglage.

**Les cercles de la vague.** Quand le météore tombe dans l'eau, trois cercles clairs partent du bord du cratère et
suivent le front de l'onde du serveur (même vitesse, même portée), de plus en plus pâles ; rien sur sol sec ni pour
qui a demandé moins de mouvement. Dessinés par le navigateur (`waveCircles`), seulement là où il y a de l'eau (au moins 2 px, lue tous les 12 px le
long du cercle, `wetStretches`) : sur la terre le cercle s'interrompt.

**Qui décide.** Le serveur (`back`, `CatastropheManager`) : le navigateur n'envoie que « météore ici »
(`LaunchCatastropheMessage`, pixels de la carte). Refusés **sans rien dire** : un point hors de la carte ou non
numérique, plus de **20 météores en vol** dans la salle (aucune cadence par joueur : on tire aussi vite qu'on clique), une taille de
carte pas encore lue. Accepté, le serveur annonce à toute la salle `CatastropheMessage {id, kind, x, y, impactInMs}`
(une fois), et frappe l'eau 1,2 s plus tard ; chaque navigateur dessine la chute à partir de ce temps restant. Valeurs
uniques dans `libs/map-editor/src/Catastrophe/Meteor.ts` (`METEOR_FALL_MS` 1200, `METEOR_MIN_TILES` 2, `METEOR_MAX_TILES` 24,
`METEOR_DEFAULT_TILES` 4, `METEOR_CREST_PX` 0,5, `METEOR_DEEP_PX` 8, `METEOR_ADDED_PX` 8, `METEORS_PER_ROOM` 20). Une erreur à
l'impact est journalisée et n'arrête ni `back` ni l'eau de la salle.

**Ce que ça ne fait pas.** Ni le relief, ni les avatars, ni les animaux, ni les objets ne sont touchés (le météore
ne creuse rien et ne tue personne directement) : seule l'eau bouge. Rien n'est écrit dans la carte (WAM) ni dans Redis, aucun réglage
de carte. `map-storage` n'est pas concerné. Un météore en vol est perdu si `back` redémarre (ses minuteries ne sont
pas gardées) ; le salon détruit les arrête. Un joueur qui entre pendant la chute ne voit que l'eau : l'annonce n'est
envoyée qu'une fois, pas à l'entrée.

**Technique.** `WaterGrid.takeDisc` et `layRing` (`libs/map-editor/src/Terrain/WaterGrid.ts`), `startImpactWave` et
`advanceImpactWave` (`Catastrophe/ImpactWave.ts`) ; `TerrainWaterManager.strike` (lance l'onde, compteurs, annonce
aussitôt de l'eau) et son pas (fait avancer les ondes) ; `back/src/Model/CatastropheManager.ts` (tenu par `GameRoom`,
`launchCatastrophe`, `mapSizeInPixels`) ; `RoomManager.ts` (`launchCatastropheMessage`) ; pusher : `IoSocketController`
transmet, `PusherRoom` relaie `catastropheMessage` à tous les auditeurs. Protocole : `CatastropheKind`,
`LaunchCatastropheMessage` (65 du navigateur au pusher, 49 du pusher à `back`), `CatastropheMessage` (42 des
sous-messages, 22 du back au pusher). Navigateur : `Phaser/Game/Catastrophe/{MeteorFall,MeteorView}.ts`,
`Stores/CatastropheStore.ts`, `Components/Catastrophe/CatastrophePanel.svelte` (monté dans `MainLayout.svelte`),
bouton dans `AppsMenuContent.svelte`, icône `meteor` de `PixelIcons.ts`, tir dans `GameSceneUserInputHandler.ts`
(`launchArmedCatastrophe`), libellés `actionbar.catastrophe` en `fr-FR` et `en-US` seulement. `play` et `back` se
déploient ensemble ; `map-storage` n'est pas concerné.

**Limites connues.** La gerbe bleue ou brune et les cercles sont décidés avec l'eau que le navigateur connaît à
l'annonce du météore. La vague ne monte pas plus haut que la hauteur maximale de l'eau de la carte (18 px par défaut, réglable). Les cercles sont dessinés sur toute eau à leur portée, même derrière un mur que l'onde ne traverse pas. Un poisson dans le cratère vidé peut
mourir à sec après 5 s. N'importe quel joueur peut inonder une carte à la longue (jusqu'à 20 météores en vol à la fois,
avec 8 px apportés par cellule du cratère). Pas de son. Rien n'a été vu à l'écran à l'écriture de
cette section : widget, viseur, chute, éclair et gerbe ne sont validés que par les tests ; l'effet sur l'eau en jeu
n'est pas vu.

## Pont posé en un geste

Outil Carte, groupe des paliers, mode **« Pont »** : presser sur la berge de départ, glisser jusqu'à la berge
d'arrivée, relâcher. Le tablier et une montée à chaque bout sont posés d'un coup, en une seule annulation
(`BridgeBuilder.ts` : `planBridge`, `bridgeFits`, `layBridge` ; aperçu vert, rouge quand c'est refusé).

- **Largeur** 1 à 6 cases, centrée sur la case de départ ; au-delà de 2, les montées sont posées côte à côte.
- **Style** : *Bois* (dalles `dalle-bois`, rampes) ou *Béton* (dalles `dalle-pierre-grise`, escaliers pleins : il
  n'existe pas de rampe en béton).
- **Hauteur** : *Basse* (20 px) ou *Haute* (52 px, le dessus de murs de 2 cases).
- Le pont est **droit**, est-ouest ou nord-sud : il suit le côté le plus long du geste, sur la rangée (ou la colonne)
  du départ. Les deux points sont lus au sol, quel que soit le niveau choisi dans le sélecteur.
- Refusé en entier, avec un message : trop court (il faut au moins une case de tablier entre les deux montées), hors
  de la carte, ou sur un escalier qui part du sol. Les murs ne sont pas regardés.
- Sans les pièces des ponts dans le catalogue de la salle : béton, hauteur haute, sans choix.
- Le pont est fait des pièces ordinaires des paliers : il se retouche et s'efface ensuite pièce par pièce (gomme).
  Un test vérifie que le serveur y lit un pont (cases à sec pour les animaux).

## Éditeur : choisir un niveau

Le sélecteur de niveau de l'éditeur (`FloorLevelPicker.svelte`) propose **tous les niveaux où l'on peut construire**,
avec ou sans dalles : le sol, le niveau 1 des ponts (20 px, quand le catalogue de la salle a leurs pièces), les dessus
des murs de 2, 3 et 4 cases, les dessus des murs posés sur un étage, et tout étage déjà construit. Avant, seuls le sol
et les étages qui avaient des dalles étaient listés : le niveau d'un pont pas encore posé ne se choisissait qu'en
dépliant « Ajuster la hauteur ».

- Chaque niveau porte le nom de sa hauteur, qui ne change pas : « Niveau 1 », « Niveau 2 »… Un niveau qui a des
  dalles porte en plus son nom dans le jeu : « Niveau 2 · Étage 1 ».
- Les flèches (« Niveau au-dessus », « Niveau en dessous ») vont au niveau d'à côté, construit ou non : ceux de la
  liste et, au-dessus des murs de 2 cases, une case de mur à la fois jusqu'à 10 cases plus haut (`steppableLevels`),
  pour commencer un étage ou un pont là où rien n'existe encore ; la flèche du bas finit au sol. Même règle pour un
  objet ou une zone sélectionnés. Le repli « Ajuster la hauteur » et ses boutons « Niveau − / + », qui faisaient la
  même chose, sont retirés. Dans l'outil Carte, Page précédente / Page suivante changent toujours de niveau dans les
  modes des paliers.
- Passer en mode **Escalier** sur un étage qu'aucun étage construit ne surmonte ramène le niveau édité à celui d'où
  un escalier y monte (le sol sous un tablier qu'on vient de poser), et l'escalier vise l'étage quitté
  (`stairBaseBelow`). Pas en « auto ».
- La liste des niveaux offerts est tenue par l'outil Carte : dans un autre outil ouvert sans être passé par lui, elle
  se réduit au sol et aux étages construits.

## Ponts : un palier bas, des traverses et des rampes

Un pont est un **palier en plein air** : des dalles posées au-dessus d'une rivière, avec une rampe ou un escalier à
chaque bout. Il remplace le mode « Pont » et les pièces `Carte Ponts` (PR #377), retirés du jeu : les pièces
`pont-bois-…` déjà posées sur une carte restent des objets ordinaires, sans effet, à effacer avec l'outil Objets.

**Dans l'éditeur** (outil Carte, groupe « Plateformes »).
- **Niveau 1** : un palier bas, à 20 px du sol (le haut d'un mur d'une case, `LOW_FLOOR_ELEVATION`). Proposé dans
  le sélecteur de niveau quand le catalogue de la salle a les pièces des ponts.
- Mode **Dalles**, interrupteur **« Traverses en bois »** : la dalle `dalle-bois`.
- Mode **Escalier**, interrupteur **« Rampe en bois »** : une rampe de planches (`rampe-<n|e|s|o>-l<1|2>-<h1…h4|m1|m2>`),
  qui se pose et se monte comme un escalier de même hauteur ; toujours longue (une case par case montée, une de plus
  vers le sud), flanc toujours ouvert. Les escaliers ordinaires montent aussi au niveau 1 (`escalier-…-h1`).
- Les deux interrupteurs sont grisés tant que le catalogue `Carte Paliers` de la salle n'a pas ces pièces.
- Pour un pont : niveau 1, peindre les dalles au-dessus de l'eau, puis revenir au sol et poser une rampe à chaque
  bout, son haut contre le tablier.

**Visibilité.** Un étage **en plein air** (aucune pièce de la carte sous ses dalles) n'est pas l'étage d'un
bâtiment : il reste toujours affiché, même quand l'avatar est dans une pièce ailleurs, sauf s'il est dessiné
par-dessus la pièce où se trouve l'avatar. Un avatar qui passe dessous se voit à travers les dalles autour de lui.
Un avatar qui marche sur un étage en plein air est dehors comme au sol : pas de voile sombre sur le paysage, les
étages des bâtiments restent affichés (`aboveLevelShows` : `openAir`, `coversRoom` ; `FloorSpike.fade`).
Dans l'éditeur, un étage en plein air reste affiché quel que soit l'étage édité (les étages d'un bâtiment, eux, sont
cachés sauf celui qu'on édite) : à 60 % d'opacité quand il est au-dessus de l'étage édité, pour viser son bord en
posant une rampe au sol et voir ce qu'on peint dessous (`editorLevelAlpha`, `EDITOR_OPEN_AIR_ABOVE_ALPHA`).

**Les animaux.** `libs/map-editor/src/Terrain/Bridges.ts`, `bridgesOf(wam)` : un pont est fait des escaliers et
rampes **posés au sol** et des dalles de l'étage que chacun atteint, de proche en proche. Un étage qu'aucun escalier
du sol n'atteint n'est pas un pont (un toit, l'étage d'un bâtiment sans accès du sol).
- Serveur : sur les cases du sol sous un pont, l'eau vaut 0 pour ce qui marche (`dryOnBridges`,
  `AquaticLifeManager.readLand`) : les deux rives sont une seule terre pour antilopes, lions et tigres, relue quand
  un pont change. Le serveur lit les noms et les places des pièces ; un test du front vérifie qu'il lit un pont là
  où l'éditeur le pose.
- Navigateur, animaux du serveur (antilopes, lions, tigres) : un animal au-dessus d'un pont est dessiné à la hauteur
  du tablier (une part de cette hauteur le long d'une rampe), par-dessus les dalles (`Bridges.elevationAt`,
  `LandLifeView`).
- Navigateur, animaux promeneurs (canards, chiens, chats, jungle) et compagnons : ils marchent vraiment sur le
  tablier, par ses rampes, comme sur tout palier (voir « Animaux sur les étages, les escaliers et les ponts »).
- Avatar : rien de particulier, il marche sur les dalles comme sur tout palier (ni nage ni courant en hauteur) ;
  au sol sous le tablier, il nage comme ailleurs.

**Chemin.** Un animal du serveur arrêté sur sa ligne droite (l'eau, un mur) cherche un chemin jusqu'à sa cible et le
suit : un animal de la terre contourne la rivière par un pont, un poisson contourne une île (`Swim.ts`, `findRoute` :
recherche de proche en proche sur 8 000 cellules au plus, soit environ 45 cellules autour de lui, puis chemin
redressé). Sa cible n'est abandonnée que s'il n'y a pas de chemin ; il ne recherche alors pas avant 4 s. Le chemin
n'est ni sauvegardé ni envoyé aux navigateurs. Un animal qui se promène ne vise jamais plus loin que 6 cellules : il
ne traverse une rivière large que pour une proie, un partenaire, son groupe, l'eau à boire ou une fuite.

**Limites.** Les animaux du serveur vivent à plat : un animal qui arrive par la berge sous le tablier monte dessus
d'un coup, et un lion peut prendre un poisson qui passe dessous. Un lion ou un tigre du serveur apprivoisé qui suit son
maître sur un pont est dessiné sous les dalles.
Les dalles d'un palier ne reçoivent ni pluie ni nuages. Pas de garde-corps propre au pont (ceux des paliers). Bois
seul. L'herbe pousse sous un tablier.

## Animaux sur les étages, les escaliers et les ponts (lot 1 : promeneurs et compagnons)

Conception d'ensemble (toutes les familles d'animaux, lots suivants) dans le dépôt d'infra :
`docs/superpowers/specs/2026-11-20-animaux-altitude-design.md`.

**Pour qui joue.** Les animaux qui se promènent tout seuls (canards, chiens, chats posés sur la carte, lions et
tigres de la jungle) montent et descendent les escaliers et les rampes, marchent sur les dalles des paliers et
traversent une rivière par un pont. Un animal apprivoisé suit son maître à l'étage. On apprivoise et on relâche un
animal depuis son propre étage seulement. Le compagnon d'origine de WorkAdventure (celui du profil) n'est plus
dessiné sous les dalles quand son joueur est à l'étage. Sur une carte sans palier, rien ne change : mêmes promenades.

**Modèle.** Un point d'une promenade (`Point` de `Wander/WanderSchedule.ts`) est l'endroit où sont les pieds **sur le
sol** (`x`, `y`) et, avec `z`, la hauteur à laquelle ils se tiennent (absent au sol). À l'écran, ce qui est à `z` est
dessiné `z` pixels plus au nord, dans la bande de profondeur de son altitude (`floorDepth`), comme un avatar.

- `MapEditor/MapLayer/FloorPath.ts` : le parcours case par case et par les escaliers des avatars (double-clic) est
  sorti en `floorRoute` ; `floorPath` s'en sert, les animaux aussi.
- `Wander/WanderFloors.ts` (`wanderFloorsOf`) : les étages vus par les animaux. `levelsAt(case)` : les altitudes où
  l'on peut se tenir (une dalle, pas sous un escalier de l'étage, pas sur un meuble ni dans une piscine de
  l'étage) ; `route(de, vers)` : les points à suivre, pied puis tête de chaque escalier, à 12 cases au plus autour
  des deux bouts. Ne dépend que de la carte : tous les navigateurs trouvent le même chemin.
- `WanderSchedule` : une destination tirée au sort tombe sur le sol ou sur un des étages au-dessus de sa case
  (tirage supplémentaire seulement quand il y a plusieurs choix : sur une carte sans palier, la suite des tirages est
  celle d'avant) ; l'altitude est interpolée le long du trajet (un escalier monte de son pied à sa tête).
- `WanderingCharactersManager` : lit le modèle des paliers déjà lu pour les avatars (`FloorSpike.walkContext()`),
  et refait les promenades quand il change. Trajet : celui du sol d'abord, comme avant ; s'il n'y en a pas (une
  rivière) ou si un bout est en hauteur, celui des étages. Les cases du sol sous un escalier posé au sol sont
  fermées ; l'eau sous un tablier redevient de l'eau (le tablier se prend par ses rampes) ; un objet posé en hauteur
  n'arrête plus les animaux du sol, il occupe sa case de son étage ; les murs d'un étage arrêtent. Le nid d'un animal
  posé sur un palier est sur ce palier.
- Affichage : un animal sur un étage se montre et s'estompe avec cet étage comme un joueur (`floorOccupants`,
  branché sur `FloorSpike`) ; plus bas que l'avatar, il est sous le voile des étages du dessous (par sa profondeur).
- Portes : au sol il ouvre les portes du sol, sur un étage celles de cet étage (`forEachRaisedDoorOpener`,
  `UpperDoors`).
- Jungle (`outdoorWanderMap`) : un étage au-dessus du dehors est en plein air (le tablier d'un pont), les lions et
  tigres y passent ; jamais l'étage d'un bâtiment.
- Compagnons (`JungleCompanionFollower`, `JungleCompanions`) : la piste du maître garde son altitude, le compagnon a
  à chaque endroit celle que son maître y avait ; invite « apprivoiser / relâcher » seulement à moins de 6 px
  d'altitude d'écart (`SAME_FLOOR_PX`, comme les bulles), rien en vol.

**Un compagnon ne vole pas.** Quand son maître décolle en avion, le compagnon s'arrête où il est, au sol, et se
repose (`JungleCompanionFollower.poseAt(…, flying)` : ni piste ni saut pendant le vol). Quand le maître s'est posé,
le compagnon demande un chemin au sol jusqu'à lui (celui des animaux promeneurs, escaliers et ponts compris,
`seekWayBack`), le parcourt quelle que soit la distance, puis suit comme avant ; sans chemin (une île, un toit) il
attend sur place et redemande toutes les 2 s (`WAY_BACK_RETRY_MS`). Vaut pour les promeneurs apprivoisés
(`JungleCompanions`) et, à l'écran, pour les lions et tigres apprivoisés du serveur (`LandCompanions` ; le serveur
gardait déjà l'animal à sa dernière place au sol, `leadTamed`). Le vol du maître est lu sur le joueur
(`Character.isFlying`, déjà partagé) : aucun protocole. Le compagnon d'origine de WorkAdventure reste aussi au sol
pendant le vol (`Companion.setTarget`) ; à l'atterrissage il marche droit vers son joueur s'il est près, et se
retrouve à côté de lui s'il est loin (règle des téléportations, inchangée). Limite : un joueur qui n'a pas vu où un
compagnon a été laissé (maître sorti de sa vue pendant le vol) ne le voit pas jusqu'à l'atterrissage, puis au pied
du maître ; un lion du serveur est alors montré là où le serveur le garde.

**Limites (lot 1).** Les animaux du serveur (antilopes, lions, tigres de la vie de la terre, apprivoisés compris)
restent au sol, avec le pont « à plat » d'avant : lot 2, avec protocole. Sur un étage ou un pont, un animal ne fuit
ni les avatars ni le feu, et n'est pas vu par les capteurs de présence ; il ne s'assoit que sur les sièges du sol.
Un escalier de deux cases de large se prend par sa file du pied. Un animal passe sous un escalier à flanc vide
seulement par le contour (les cases sous l'escalier lui sont fermées). Les places de côté d'un groupe de compagnons
peuvent dépasser du bord d'un palier. Le chemin par les étages avance case par case (pas de diagonale). Pas d'ombre
vérifiée sur un tablier. Rien de cela n'a été vu à l'écran par un agent.

## Catastrophes : le météore brûlant

Conception et plan dans le dépôt d'infra, `docs/superpowers/{specs,plans}/2026-11-20-meteore-brulant*`.

**Pour qui joue.** Tuile « Météore » du widget des catastrophes, à côté de « Comète ». Elle s'arme comme la comète
(viseur, Échap annule), avec le même curseur de taille (rayon du cratère de 1 à 8 cases, 4 par défaut), et un clic
gauche sur la carte lance le météore. Il tombe en 1,2 s comme la comète.

**Ce qu'il fait à l'impact** (le serveur seul décide) :

- le **cratère prend feu de force** : toute case de dehors dont le sol porte de l'herbe (terre, sol d'origine,
  prairie, argile) est séchée d'un coup (humidité à zéro, sécheresse au maximum) et s'allume, même verte ou
  détrempée, même sous la pluie ; les arbres dont le pied est dans le cratère aussi. Ne prennent pas : sable, rocher,
  gravier, intérieurs, sols de l'outil Carte, cases sous l'eau, cases déjà en feu ou encore en cendres, arbres encore
  noirs. Le feu vit ensuite selon les règles du pré (vent, pluie, eau) ;
- des **braises** sont jetées autour, entre le bord du cratère et 2 fois son rayon : 3 par case de rayon, 48 au
  plus (12 pour un cratère de 4 cases). Chacune allume un patch d'une case de rayon selon les règles normales du
  feu ; le sol y garde son humidité, donc sur du vert ou du mouillé ce feu-là meurt vite ;
- tombé **dans l'eau** : l'eau du cratère est retirée (comptée dans « Perdu » du bilan), sans onde ; les cases sous
  l'eau ne brûlent pas.

**Ce que tout le monde voit.** Boule orange à cœur jaune et longue traînée qui rougit, ombre, éclair (un toutes les
334 ms au plus), gerbe orange, étincelles qui partent jusqu'à 2 fois le rayon du cratère (900 ms), panache de vapeur
blanc pendant 2 s si le point d'impact est dans l'eau. Mouvement réduit : ni chute, ni éclair, ni étincelles, ni
vapeur. L'interrupteur personnel de l'effet « Comètes et météores » masque les deux.

**Qui décide.** `CatastropheManager.launch` accepte les genres `CATASTROPHE_METEOR` (comète) et
`CATASTROPHE_FIREBALL` = 4 (énumération seule, aucun champ nouveau). Même annonce (`CatastropheMessage`), même
plafond de 20 en vol dans la salle, comètes et météores comptés ensemble. À l'échéance : `strike` pour la comète,
`burn` pour le météore, branché par `GameRoom` (`burnWith`) : `TerrainWaterManager.vaporise` d'abord, puis
`MeadowManager.scorch`. Les braises sont tirées de l'identifiant de l'annonce (`fireballEmbers`), donc toujours les
mêmes pour un météore donné.

**Limites.** Pas de son. Rien sur les avatars, les objets, les murs ni le relief. Si le point d'impact est hors de
la grille d'eau (sur la terre, à côté d'un lac), l'eau que le cratère recouvre n'est pas retirée. Le pré lit l'eau
à son dernier pas : une case de rive encore comptée sous l'eau ne s'allume pas. Sur une carte dont l'herbe est
coupée, rien ne brûle. Un navigateur d'avant ce lot dessine une comète à la place. `play` et `back` à déployer
ensemble.

**Fichiers.** `libs/map-editor/src/Catastrophe/Fireball.ts`, `Terrain/Meadow.ts` (`scorch`),
`messages/protos/messages.proto`, `back/src/Model/{CatastropheManager,MeadowManager,TerrainWaterManager,GameRoom}.ts`,
`play/src/front/Phaser/Game/Catastrophe/{MeteorFall,MeteorView}.ts`, `Stores/CatastropheStore.ts`,
`Phaser/UserInput/GameSceneUserInputHandler.ts`, `Components/Catastrophe/CatastrophePanel.svelte`, icône `comet` de
`PixelIcons.ts`, i18n `actionbar` et `menu` (fr, en).

## Catastrophes : la flamme du feu qu'on tient

La catastrophe « feu » ne montrait rien quand rien ne prenait sous le pointeur (herbe verte ou mouillée, neige, sol
nu). Le serveur annonce maintenant chaque touche de feu à la salle (`CatastropheMessage`, genre `CATASTROPHE_FIRE`,
un identifiant par joueur, 500 ms de vie : `FIRE_PATCH_LASTS_MS`), et chaque navigateur dessine des flammes qui
vacillent sur le disque, au-dessus d'une lueur, tant que le joueur garde le clic (`Catastrophe/FireTorch.ts` pour
les flammes, `FireTorchView.ts` pour le dessin, lumière ajoutée). La flamme suit le pointeur et s'éteint au relâchement.
Ce qui prend feu reste le feu du pré, dessiné ailleurs. Coupée avec l'effet « feu » ; mouvement réduit : flammes fixes.
Un navigateur d'avant ce lot dessine une comète pour chaque touche : `play` et `back` se déploient ensemble.

## Catastrophes : le drain

Quatrième catastrophe du widget : l'inverse de l'averse. Elle **retire l'eau, fort, d'un disque** sous le pointeur,
dessiné comme un tourbillon vu du dessus. Depuis le 2026-11-20 le drain est un disque à taille réglable (avant : un
carré fixe de 5 × 5 cases).

**En jeu.** La tuile « Drain » s'arme comme l'averse (viseur, Échap annule). Un curseur règle le **rayon du disque,
de 1 à 16 cases** (3 par défaut, gardé pour la session). Tant que le **clic gauche est maintenu** sur la carte (ou
le doigt posé), l'eau du disque centré sur le pointeur est aspirée, et le disque suit le pointeur ; relâcher arrête.
Pendant ce temps le glisser ne déplace pas la carte.

**Le serveur décide.** Le navigateur redit où est le pointeur toutes les 200 ms (`LaunchCatastropheMessage`, genre
`CATASTROPHE_DRAIN` = 3, `radiusTiles` = le rayon du curseur ; `wholeMap` ne sert pas). Le serveur ramène le rayon
dans ses bornes (`drainTiles` ; 0 ou une valeur non numérique, ce qu'envoie un navigateur d'avant, donne 3).
`CatastropheManager.drain` tient **un drain par joueur**, qui dure 1 s après son dernier message, 8 drains à la fois
par salle, messages plus rapprochés que 100 ms ignorés, point dans la carte. Chaque message accepté est annoncé à la
salle avec son rayon (`CatastropheMessage`, même `id` tant que le drain dure). Le drain et l'averse d'un même joueur
vivent chacun leur vie.

**Ce qu'il fait.** À chaque pas de l'eau (10 par seconde), chaque cellule du disque perd de l'eau
(`WaterGrid.drainDisc`) : **256 px par seconde au centre, 128 au bord**, en ligne droite entre les deux ; rien d'un
mur, seulement les cellules de la grille (un disque qui dépasse de la grille, ou dont le centre est dehors, prend ce
qu'il recouvre). L'eau prise est comptée avec les **puits** du bilan ; la salle reçoit l'eau cinq fois par seconde
tant qu'un drain prend de l'eau. Le disque est vide en moins d'une seconde ; ensuite il prend ce qui coule depuis les
cellules voisines.

**Aucun effet sur les avatars.** Un drain tire l'eau, pas ceux qui sont dedans : le navigateur ne pousse pas un
avatar (à la nage ou en canoë) qui se trouve dans le disque d'un drain ouvert ni à moins d'une fois et demie son
rayon (`drainCalms`, `DRAIN_CALM_REACH` ; `GameScene.isDrainCalm`, lu par `Character.waterCurrentPush`). Plus loin,
le courant de l'eau qui afflue vers le drain porte comme d'habitude. L'écume, elle, suit le courant partout.

**Ce que tout le monde voit** (`Catastrophe/DrainView.ts`, règles pures dans `DrainSwirl.ts`) : un entonnoir d'eau
sombre sans bord, de plus en plus profond jusqu'à un œil noir (`drainRings`), et par-dessus des mèches d'eau
lumineuses qui s'enroulent autour de l'œil (`drainStrands` : 9 par case de rayon, de 36 à 120 ; quatre tons du bleu
profond au blanc d'écume ; dessinées en fusion additive, elles brillent où elles se croisent ; longues, larges et
pâles au bord, courtes, fines et vives près de l'œil). L'eau du bord fait un tour en 2,4 s, celle près de l'œil
tourne quatre fois plus vite. En mouvement réduit rien ne tourne.

**Limites.** L'humidité du sol ne change pas ; les poissons du disque mis à sec meurent après 5 s (règle de la vie
aquatique) ; les animaux ne sont pas aspirés ; pas de son ; tout joueur peut vider un lac ; le dessin est fait de
traits, sans flou ; le disque est dessiné aussi là où il n'y a pas d'eau. `play` et `back` se déploient ensemble.

## Catastrophes : le coup de froid

Septième catastrophe du widget : une **masse d'air très froid** posée sur un disque sous le pointeur, pour geler un
morceau de carte. Demandée pour essayer le gel : « un refroidissement intense de la zone, genre à moins 80 ».

**En jeu.** La tuile « Coup de froid » s'arme comme l'averse (clic maintenu, Échap annule). Deux curseurs : le
**rayon, de 1 à 16 cases** (3 par défaut), et la **température de son air, de −120 à −5 °C** (−80 par défaut, par
pas de 5). Tant que le clic est maintenu la masse suit le pointeur ; relâchée, elle **reste où elle était et se
réchauffe** jusqu'à redevenir l'air de la carte.

**Le serveur décide, par le modèle du froid qui existe.** Aucun dessin ne fait la glace : le pré du serveur
(`Meadow.step`) lisait un seul air pour toute la carte ; il lit maintenant, sur les seules cases qu'une masse
atteint, **l'air de la carte ramené vers celui de la masse** (`MeadowStepInput.cold`, `Meadow.readCold`) : celui de
la masse dans son cœur (la moitié de son rayon), puis un bord progressif jusqu'à son rayon (`coldShare`), le plus
froid là où deux masses se croisent. Trois règles lisent cet air par case, et rien d'autre ne change :

- **la glace** : loi de Stefan (`iceGrowthMmPerDay`) et dégel (`iceThawMmPerHour`) ; elle reste bornée par l'eau
  dessous, et l'eau qui court ne prend pas (`iceCurrentShare`, #508) ;
- **la neige** : elle ne fond plus et tient sur l'eau (`snowMeltMmPerHour`, la règle du gel) ;
- **le sol** : il gèle (`soilFrost`) : son eau reste, son herbe est en dormance.

La glace et la neige sont celles du serveur, envoyées à tous par le message du pré.

**Ce qui gèle, mesuré** (−80 °C, sans vent), en temps de la carte : une glace où l'on glisse (5 mm) en 2 min, qui
porte un marcheur (50 mm) en 32 min, une cabane de pêche (102 mm) en 2 h 8 min ; une mare de 10 cm est prise en
masse en 2 h ; au large la glace croît comme la racine du temps : 30 cm en 18 h 30. Avec 30 km/h de vent, deux fois
plus vite. Un ruisseau à 1,5 m/s ne prend pas. **À la vitesse par défaut (1, le temps réel), ce sont ces durées à
l'écran** ; à 60 (une minute pour une heure) elles se lisent en secondes et en minutes : 2 s, 32 s, 2 min 8 s. Le
froid suit l'horloge de la glace et de la neige (`snowTimes`), sans horloge à lui : un réglage qui accélère le gel
accélère le coup de froid d'autant.

**Quand on relâche.** La masse n'est plus tenue par personne : `MeadowSimulation` la garde et la réchauffe à chaque
pas (`warmedCold`) : ce qui la sépare de l'air de la carte est divisé par e **toutes les minutes du temps de la
carte par temps calme**, deux fois plus vite sous 10 km/h de vent (`coldWarmsMinutes`) ; à moins de 0,5 °C de cet
air, elle est oubliée. De −80 °C sous un air à 24 °C : 5 min 20 s du temps de la carte par temps calme
(`coldGoneInMinutes`). Une mare d'air froid que rien n'alimente ne tient pas : plus lourde que l'air autour, elle
s'écoule au sol à quelques mètres par seconde et se mélange à l'air chaud ; des minutes, pas des heures (un ordre de
grandeur, pas une loi mesurée ; la première version, 15 minutes, laissait la masse 80 minutes sur la carte). Ce
temps est celui de l'horloge du gel et de la fonte (`snowTimes` côté serveur, `freezeThawTimesOf` côté navigateur) :
réel à la vitesse 1, soixante fois plus court à 60, et accéléré d'autant par « Vitesse du gel et de la fonte ». La
glace, elle, **fond par la règle de dégel**, pas d'un coup : à 10 °C, 60 mm mettent une trentaine d'heures de la
carte à partir.

**L'arrêter.** Relâcher le clic arrête la source : la masse se dissipe seule en quelques minutes de la carte. Tant
qu'un air froid est posé sur la carte, le panneau Catastrophes dit sa température et le temps qu'il lui reste
(« Air froid sur la carte : −37 °C, encore 2 min 5 s », `coldLyingStore`) et offre **« Arrêter le coup de froid »** :
le serveur dissipe alors tout l'air froid de la salle, de qui qu'il vienne (`LaunchCatastropheMessage.release`,
`CatastropheManager.calm`, `RoomGround.calm`, `MeadowSimulation.calm`), et l'annonce (`impactInMs` = 0). La glace
déjà prise reste et fond d'elle-même. Tout joueur peut l'arrêter, comme tout joueur peut le poser.

**Protocole.** `CatastropheKind.CATASTROPHE_COLD = 7` ; `LaunchCatastropheMessage.temperature = 7` et
`CatastropheMessage.temperature = 13` (facultatifs). `CatastropheManager.cold` borne le rayon (`coldTiles`) et la
température (`coldCelsius` ; aucune, ou 0, donne −80), refuse un point hors de la carte ou non fini et les messages à
moins de 100 ms, tient **une masse par joueur**, une seconde après son dernier message, **8 au plus par salle**. Les
masses tenues voyagent par valeur dans l'état de la salle donné au sol (`RoomGroundInputs.colds`,
`GroundRoomState.colds`) : le même calcul sur le fil des salles, sur un fil de calcul, en une ou plusieurs bandes
(le scénario commun des essais d'identité pose une masse, la traîne et la lâche). Le sol d'un joueur qui suit sa
propre météo les reçoit par `LocalCatastropheRelay`. `play` et `back` se déploient ensemble.

**L'air d'une case, lisible partout.** `coldAirOver(masses, x, y, air)` (`Catastrophe/Cold.ts`, pure) rend l'air
d'un point sous les masses : l'air de la carte ramené à la température de la case (`coldAirAt`), avec l'humidité
relative de la même vapeur à cette température, 100 % au plus (`airBroughtTo`), et le même vent. Le navigateur lit
les masses dans `GameScene.coldMasses()` (celles que le serveur a annoncées, les relâchées réchauffées par sa règle).
C'est ce que lisent le givre du coup de froid et la pipette de « Visualisation ».

**Ce que tout le monde voit** (`Catastrophe/ColdView.ts`, règles pures dans `ColdShape.ts`) : sur le disque même que
le serveur gèle, le **givre qui gagne le sol** depuis le cœur. Ce givre est celui de la règle du givre, pas un
dessin à part : chaque bande du disque est blanche comme le dit `hoarFrost` de l'air de la case (`coldFrostAt`) :
épais là où l'air est à quelques degrés sous zéro et tient encore de la vapeur, plus mince dans le froid extrême du
cœur, absent au bord où l'air est encore au-dessus de zéro ; il reste tant que l'air de la masse relâchée est sous
zéro. S'y ajoutent une **brume qui rampe** vers l'extérieur (l'air froid est lourd) et des **cristaux qui
scintillent** dans l'air, qui pâlissent à mesure que la masse se réchauffe, par la règle du serveur. Sous
l'interrupteur des averses ; rien n'est dessiné ni calculé quand aucune masse n'existe ; immobile en mouvement
réduit.

**Coût.** Sans masse : rien (la liste est absente, aucun tableau touché). Avec : une passe sur les cases des disques
à chaque pas du pré (toutes les 2 s) ; sur un pré de 300 × 300 cases, 8 masses de 16 cases ne changent pas le coût
du pas à la mesure près (5,6 à 6,1 ms sur le Mac, bruit compris).

**Où la glace prend.** Les règles d'avant, inchangées sous une masse : la glace ne prend que **dehors** (`outdoor`
dans `Meadow.stepIce`) : l'eau à l'intérieur d'un bâtiment reste liquide sous le coup de froid ; l'eau qui court à
plus de 1,2 m/s reste ouverte, entre 0,6 et 1,2 m/s il en prend moins (`iceCurrentShare`), à l'horloge rapide aussi
(`iceAfterHours`, testé dans `MeadowCold.test.ts`). Sur la terre sèche rien ne change dans le pré : seul le rendu
se voit.

**Essais en jeu** (2026-11-23, dev local, carte d'Antoine, air 18 °C, vent 6 km/h, masse à −80 °C de 4 cases, deux
navigateurs sans écran) :

| Où | Horloge | Durée | Glace |
|---|---|---|---|
| Mare | ×1 | 150 s | 1,5 → 12,9 mm, même valeur chez le second joueur |
| Large, eau calme | ×60 | 12 s | 0 → 35,4 mm |
| Eau à 0,80 m/s, stable | ×60 | 12 s | 0 → 28,4 mm |
| Eau à 1,84 à 2,14 m/s | ×60 | 12 s | 0 mm |
| Eau à 7,1 m/s | ×60 | 12 s | 0 mm |
| Eau à l'intérieur d'un bâtiment | ×60 | 12 s | 0 mm |
| Herbe sèche dehors | ×60 | 12 s | glace, herbe, humidité, neige inchangées |

**Ce que ça ne modélise pas.** La pluie et l'averse ne tombent pas en neige dans la zone (elles lisent l'air de la
carte) ; le givre du sol que le navigateur dessine pour toute la carte (un seul réglage du shader du sol) ne suit
pas la masse : dans la zone c'est la vue de la catastrophe qui pose le givre, par la même règle et le même air ; le
sol gelé de la zone n'a pas de dessin ; la masse ne se déplace pas avec le vent et ne refroidit pas l'eau
elle-même ; la repousse après un feu et le séchage de l'herbe morte restent ceux de l'air de la carte ; les animaux,
le feu et les joueurs ne sentent pas ce froid ; pendant qu'une salle revit le temps où elle était vide, aucune masse
n'agit. Un navigateur d'avant dessine une comète à chaque message.

## Catastrophes : la boule

Sixième catastrophe du widget, et la seule qui ait un corps : une **boule solide** tenue sous le pointeur, dont le
**centre est à la surface de l'eau où elle se trouve** : elle est à moitié immergée, sur un lac en altitude comme
sur une mer plus basse que le niveau 0 (jusqu'au 2026-11-22 son centre était à l'altitude 0 du relief). Là où il n'y
a pas d'eau, son centre est au niveau du sol sous le pointeur : une demi-sphère posée. Elle prend la place de l'eau,
qui est chassée, monte autour et fait une vague ; quand la boule s'en va l'eau revient. C'est un instrument pour
éprouver le modèle d'écoulement.

**À quel niveau.** Le serveur décide (`TerrainWaterManager.ballLevelAt`), parce que lui seul connaît l'eau. Le
niveau est celui de **l'eau autour de la boule, pas sous elle** (`WaterGrid.restLevelAt`) : la médiane de la surface
de l'eau reliée au point, sur les 4 096 cellules les plus proches, en traversant les colonnes que la boule ferme et
les cellules à sec à moins de 20 cellules du point (le fond qu'elle vient de balayer est encore dans son lac). La
médiane ignore le bourrelet que la boule pousse et le creux qu'elle laisse. Une eau plus basse que le sol du point
n'est pas l'eau où il se trouve : sur une rive, c'est le sol. **Tenue immobile, la boule garde son niveau** quelle
que soit la vague qu'elle fait : le niveau n'est relu que lorsqu'elle a bougé, et ne change que s'il s'écarte de
plus de 6 px (`BALL_LEVEL_SLACK_PX`) : d'un lac à un autre, de la terre à l'eau, ou quand elle a elle-même fait
monter un petit lac. Ce changement est **balayé comme un déplacement** (`sweepBalls`, une cellule d'altitude à la
fois) : le volume chassé ne saute pas. Le niveau est annoncé à la salle (`CatastropheMessage.ballLevel` = 12).

**En jeu.** La tuile « Boule » s'arme comme l'averse et le drain. Un curseur règle le **diamètre, de 1 à 16 cases**
(4 par défaut ; 1,1 m à 17,5 m à l'échelle de la carte). **Dès le clic, la boule est là, entière**, à moitié dans
l'eau : elle ne monte pas, ne descend pas, n'enfle pas. Tant que le clic est maintenu elle **suit le pointeur
sans retard** (souris ou pavé tactile) ; au relâchement elle **disparaît d'un coup**. Pendant ce temps le glisser ne
déplace pas la carte.

**Sous le pointeur sans attendre le serveur.** Le joueur qui tient la boule la voit sous son propre pointeur à chaque
mouvement (`heldBallStore`, écrit par `GameSceneUserInputHandler`) : sa boule n'est jamais dessinée d'après les
messages du serveur, qui arrivent un aller-retour plus tard, sauf pour son niveau : au clic elle est montrée à la
surface de l'eau que ce navigateur connaît sous le pointeur (`ballLevelUnder`), puis au niveau que dit le serveur
(sous la boule le navigateur ne voit plus d'eau). L'eau, elle, reste celle du serveur. Les autres joueurs voient la
boule là où le serveur la dit, en glissant d'un message au suivant (50 ms).

**Le serveur décide.** Le navigateur dit où est la boule toutes les 50 ms quand elle a bougé, toutes les 200 ms
quand elle est tenue immobile (`LaunchCatastropheMessage`, genre `CATASTROPHE_BALL` = 5, `radiusTiles` = le
**diamètre**), et dit qu'il la lâche (`release` = 6). Le serveur ramène le diamètre dans ses bornes (`ballTiles` ;
0 ou une valeur non numérique donne 4), refuse un point hors de la carte ou non fini et les messages plus rapprochés
que 20 ms. `CatastropheManager.ball` tient **une boule par joueur**, à l'endroit du dernier message ; elle disparaît
au `release`, ou 600 ms après le dernier message d'un joueur parti sans rien dire. **8 boules au plus par salle.**
Chaque message accepté est annoncé à la salle (`CatastropheMessage`, même `id` tant que la boule est tenue, `userId`
= 11 pour que chacun reconnaisse la sienne, `impactInMs` = 0 quand elle est lâchée).

**Une boule qui a bougé a balayé son trajet.** L'eau avance par pas de 100 ms ; une souris fait plusieurs cases
entre deux pas. La boule n'a pas sauté : `sweepBalls` (`Catastrophe/Ball.ts`) la fait passer par le segment entre
sa place d'avant et sa place de maintenant, **une cellule à la fois** (32 enjambées au plus par pas ; au-delà de 32
cases par seconde les enjambées s'allongent), et `TerrainWaterManager.placeBalls` pose la boule à chaque enjambée :
l'eau de tout le trajet est poussée devant elle. Une boule qui apparaît ou disparaît le fait en une fois.

**Ce que ça donne, mesuré** (lac de 60 px de fond, environ 2 m, creusé dans une plaine, eau à inertie, boule apparue
d'un coup puis traînée 6 s) : boule de 4 cases, crête de 19 à 29 px à la pose, 42 à 52 px traînée à 20 ou 40 cases
par seconde, rien de perdu ; boule de 16 cases, 24 à 34 px à la pose, 60 à 89 px ensuite, et le lac déborde sur la
plaine (crue de 33 à 75 px, jusqu'à 11 % de l'eau quitte la carte par le bord, comptée « perdue »). Aucune valeur non
finie, bilan `eau + perdue` égal au volume de départ à 1e-6 près dans tous les cas : aucune borne de vitesse n'a été
nécessaire.

**Tenue à la surface, mesuré** (lacs de 60 px de fond, l'un à +40 px sur un plateau, l'autre à −40 px dans une
plaine, eau à inertie) : boule de 4 cases, son niveau reste à +40 ou −40 au dixième de pixel, immobile comme traînée
à 20 ou 40 cases par seconde ; crête de 33 à 40 px à la pose, 59 à 83 px traînée, rien de perdu. Boule de 16 cases
(aussi large que 40 % du lac) : niveau constant immobile, crête de 80 à 105 px ; traînée, elle met à sec la moitié
du lac et l'eau restante monte de 20 à 35 px : la boule suit ce niveau réel, 1 à 4,5 % de l'eau quitte la carte.
Aucune valeur non finie, bilan exact à 1e-6 près.

**La boule dans le modèle d'eau** (`WaterGrid.setBalls`, géométrie pure dans `Terrain/WaterBall.ts`). Le modèle est
en colonnes d'eau. Dans chaque colonne qu'elle atteint, la boule occupe les hauteurs entre son dessous et son
dessus (`±` sa demi-hauteur autour de son niveau, moyennée sur la cellule : les cellules d'une boule portent
exactement le volume de la sphère, à 1 % près), moins ce qui est dans le sol (`ballColumn`).

- **Une eau plus basse que le dessous de la boule n'est pas touchée** : elle continue de couler dessous.
- **Là où l'eau atteint la boule, la colonne est fermée** : l'eau qui tient sous la boule y reste, mise de côté
  (`under`), et le sol de la colonne devient, pour l'eau, le dessus de la boule (`ground` et `spill` relevés d'autant).
  Tout le reste du modèle (les deux écoulements, les sources, les puits, la pluie, les drains, les impacts) lit ce
  sol sans rien savoir de la boule : la boule est un obstacle, l'eau qui la recouvre (une crue plus haute qu'elle)
  coule dessus, la pluie ruisselle dessus.
- **L'eau à qui la boule ne laisse plus de place est remise à la première colonne ouverte en s'éloignant du centre
  de la boule** (`pushAway`), jamais à travers un mur ni hors de la grille, sans dépasser la hauteur maximale de la
  carte (le reste va à la colonne suivante ; ce qui ne trouve aucune place reste sur la boule et en ruisselle).
  L'eau est poussée de côté, pas vers le haut : le chemin s'arrête à un sol plus haut que le niveau où elle se
  tenait (une berge, une falaise). C'est la condition d'une paroi qui avance : le volume qu'elle balaie passe à
  l'eau devant elle.
- Une colonne dont la boule touche le sol est fermée même à sec : la boule barre le chemin d'une eau qui arrive.
- **Au retrait rien n'est rempli** : les colonnes se rouvrent, l'eau mise de côté est rendue, et le creux laissé se
  comble par l'écoulement du modèle.

Ainsi le volume chassé est exactement celui de la partie de la boule qui est dans l'eau (**Archimède**), et **aucune
eau n'est créée ni perdue** : `totalPx` (le stock du tableau de bord) compte l'eau mise de côté, la sauvegarde aussi
(`writeDepths(true)`), et une grille refaite après une édition de la carte la reprend (`takeFrom`).

**Pourquoi pas « relever le fond » ni « poser l'eau sur la boule ».** Relever le fond sous toute l'empreinte chasse
aussi l'eau qui passe sous la moitié basse de la boule dans un lac profond : trois fois trop de volume pour une boule
de 2 cases dans 2 m d'eau. Poser toute l'eau chassée sur le dessus de la boule et la laisser retomber respecte
Archimède mais la hisse jusqu'au sommet du solide : la vague ne dépend plus du volume balayé.

**Ce que tout le monde voit** (`Catastrophe/BallView.ts`, règles pures dans `BallShape.ts`) : une sphère rouge en
blocs, éclairée du haut à gauche en six tons, avec son reflet ; les blocs grossissent avec la boule (24 par rayon).
Ce qui est dans le sol n'est pas dessiné (sur un mont plus haut que son rayon : rien que l'anneau) ; ce que l'eau
recouvre est dessiné sous la teinte de l'eau. **Dans l'eau, elle est dans l'eau** : là où de l'eau borde la boule
(`ballWaterline`, lu une cellule au-delà de son bord, au niveau réel de l'eau), une bande d'eau sombre contre elle et
un liseré d'écume suivent la ligne de flottaison, rentrée vers le centre quand l'eau est plus haute que son milieu ;
entourée d'eau, elle ne jette pas d'ombre (une ombre sur un lac disait une bille suspendue au-dessus) ; à terre elle
garde son ombre. La boule est à la profondeur d'affichage de son milieu, comme un avatar qui s'y tiendrait ; un
anneau fin et le reflet sont redessinés au-dessus du voile de la nuit. Elle n'est redessinée que lorsqu'elle a bougé
ou que l'eau a changé. « Flux d'eau » (Visualisation) montre les courants qu'elle provoque sans rien de plus : il lit
les vitesses et les profondeurs du modèle.

**Voisinage.** Aucune collision : les avatars, les animaux et les véhicules la traversent, et sous elle les colonnes
fermées sont à sec pour eux (un poisson mis à sec meurt après 5 s, comme sous un drain). L'herbe et l'humidité du
sol ne changent pas. La glace du serveur ne tient pas la boule : sous elle il n'y a plus d'eau à geler, la glace y
disparaît (elle n'est jamais plus épaisse que l'eau), et l'eau liquide est chassée comme sans glace ; la glace qui
craque sous les pas (#458) ne connaît que les joueurs, pas la boule. Une pompe de piscine ne remplit pas une case où se tient
une boule (`ballAt`). Une porte étanche ou un mur arrête l'eau poussée. Si la carte est éditée pendant qu'une boule
est posée, la nouvelle grille reprend toute l'eau et la boule y est remise au pas suivant. Joueur parti sans lâcher :
la boule disparaît 600 ms après son dernier message.

**Coût.** Sans boule : rien (retour immédiat). Avec, sur une grille de 200 × 200 : 0,1 à 0,3 ms par pas pour une
boule immobile ou de 4 cases, jusqu'à 1,3 ms pour une boule de 16 cases traînée à 40 cases par seconde (une pose par
enjambée). La salle reçoit l'eau cinq fois par seconde tant qu'une boule existe, et la place de chaque boule jusqu'à
vingt fois par seconde pendant qu'elle bouge.

**Limites.** L'eau enfermée sous une boule immobile y reste même si le lac baisse autour ; aucun courant ne passe
sous la boule là où elle touche l'eau (en vrai il en passerait sous pression) ; l'eau qui rampe, sans inertie, ne
fait pas de vague : l'eau poussée s'entasse près de la boule avant de s'étaler ; une boule qui fait déborder un lac
envoie l'eau sur la plaine, d'où elle peut quitter la carte par le bord comme toute crue (comptée « perdue ») ; un
navigateur d'avant dessine une comète à chaque message ; la boule apparue d'un coup n'a pas de vitesse : la vague de
sa pose vient du volume chassé, pas d'un élan ; traînée plus vite qu'une vague ne court, elle entasse l'eau devant
elle ; pas de son. `play` et `back` se déploient ensemble.

## Catastrophes : l'ouragan

Huitième catastrophe du widget (tuile « Ouragan »), demandée le 2026-11-23 : « une catastrophe de type ouragan : ça
couvre sûrement toute la map, ça override le système de nuages », puis « tu en fais un qui couvre la carte, soyons
créatifs ».

**Réduit à la taille de la carte : un choix créatif, comme la comète.** Un vrai ouragan fait des centaines de
kilomètres ; ici :
- le rayon des vents maximaux est de 30 m (`HURRICANE_RMAX_M`) et l'œil fait environ 36 m de diamètre ;
- le système, jusqu'à 12 Rmax, est un peu plus grand que la carte d'Antoine (263 × 175 m) ;
- l'œil entre par le bord dès le lancement et traverse la carte en ligne droite, au-dessus du centre de la carte,
  dans la durée choisie : 5 min par défaut, de 1 à 30 (`hurricaneCrossing`) ;
- le cap se règle : 290° par défaut, vers l'ouest-nord-ouest.

L'aide du panneau dit que la taille est réduite. La cohérence interne du phénomène est gardée à cette échelle (modèle
pur, `libs/map-editor/src/Catastrophe/Hurricane.ts`, même fonction côté serveur et navigateur) :
- **vent par position** (`hurricaneHere(hurricane, instant, x, y)`) : il n'est plus le même sur toute la carte.
  - Profil de Holland (1980, *Monthly Weather Review* 108), cyclostrophique : à cette taille, la force de Coriolis
    n'est rien. B = 1,5.
  - Maximum au mur = moyenne sur 10 min de la catégorie, soit le milieu de la plage Saffir-Simpson × 0,93 (OMM
    TD-1555) : 126, 153, 179, 214 et 250 km/h.
  - Calme dans l'œil. À 5 Rmax, environ 40 % du maximum ; à 12 Rmax, un quart.
  - Le vent tourne autour de l'œil dans le sens antihoraire au nord et horaire au sud (latitude du lieu de la carte,
    Paris sans lieu), et rentre de 22,6° vers le centre (Zhang et Uhlhorn 2012, MWR 140). 55 % de la vitesse de
    l'œil s'y ajoutent (asymétrie, presque nulle à quelques km/h).
  - Quand l'œil passe sur un point, le vent y tourne de 180°. Les rafales valent 1,23 fois la moyenne (TD-1555, en
    mer [Gemini]) : elles sont seulement affichées.
- **pluie** : les moyennes de Lonfat, Marks et Chen (2004, MWR 132) à leurs **débits réels**, sans compression :
  - 7 mm/h au mur en catégories 1 et 2, 12 mm/h en catégories 3 à 5 ;
  - rien dans l'œil ; décroissance sur 4 Rmax (un choix) ;
  - deux bras de spirale logarithmique de 15° qui modulent la pluie de ±80 % sans changer sa moyenne sur un cercle.
  Au centre de la carte, un passage de 5 min verse environ 0,5 mm.
- **foudre** : seulement dans les bandes extérieures, de 7 à 10 Rmax (Molinari et al. 1999 : maximum de foudre de 210
  à 290 km pour des ouragans réels [Gemini, à vérifier]). Il pleut sans foudre dans le mur.

**La spirale de nuages** (`Catastrophe/HurricaneView.ts`) est un shader à part, au-dessus du voile de nuit, qui
**remplace les nuages du ciel** pendant l'ouragan (`MapSnowSettings.hurricaneSky` : `WeatherManager` ne dessine plus
ses nuages et ne module plus la pluie par eux). Elle se compose ainsi :
- une couverture centrale dense, effrangée ;
- deux bras de spirale logarithmique de 15° ;
- l'œil ouvert sur le sol, son bord irrégulier et la face intérieure du mur dans l'ombre ;
- une texture de bruit sans sinus qui tourne avec elle.

L'ensemble tourne d'un tour en 90 s (un choix : à la vitesse de ses vents, un tourbillon de cette taille tournerait
en quelques secondes) et suit l'œil. Vue de haut, elle est presque opaque (92 %), comme sur une photo satellite. En
zoom proche, elle descend à 18 % pour qu'on voie l'eau et les avatars sous l'orage (`cloudZoomFade`). La nuit, elle prend le
gris-bleu des nuages de nuit. Elle est immobile en mouvement réduit. Rendu vérifié par le vrai shader dans un
Chromium sans écran, sur la carte entière ; pas encore vu en jeu.

**Le serveur décide** (`CatastropheManager.startHurricane`).
- Il garde un seul ouragan par salle et refuse un second tant que le premier dure.
- Il borne les réglages et calcule la traversée à partir de la taille de la carte.
- Il annonce l'ouragan chaque seconde : `CATASTROPHE_HURRICANE = 8` et `HurricaneTrackMessage` (catégorie, minutes,
  cap, hémisphère, départ à l'heure du serveur, entrée et sortie de l'œil, point survolé). `impactInMs` donne le temps
  restant, et vaut 0 à la fin et à l'arrêt (`release`).
- Tout joueur peut le lancer ou l'arrêter.
- Le sol de la salle (eau et pré, sur le fil des salles ou sur un fil de calcul, `GroundRoomState.hurricane`)
  calcule à chaque pas, à partir de l'ouragan et de l'heure, le vent, l'humidité (95 % au moins) et la pluie **au point
  que l'œil survole** :
  - c'est **une valeur pour toute la salle**, pour le feu, le pré et la pluie sur l'eau ;
  - la pluie de l'ouragan **remplace** celle de la carte, divisée par la vitesse de l'eau pour ne pas être comptée
    deux fois ;
  - la température de la salle est gardée.
- Les essais d'identité, avec et sans fil de calcul et en trois bandes, rejouent un ouragan dans leur scénario commun.

**La mer, l'écume et les arbres suivent le vent de chaque point.**
- Le shader de l'eau et la passe de mémoire d'écume évaluent le vent de l'ouragan **par pixel** : `seaWindHere`, jumeau
  GLSL de `hurricaneHere`. Comparé à TypeScript sur 288 points dans un Chromium sans écran : au plus 1,4 km/h et 0,8°.
- La hauteur des vagues suit le carré du vent local, rapporté au vent maximal pour lequel elles sont dessinées : la mer
  est lisse dans l'œil.
- Les traînées d'écume, les lignes laissées par les crêtes, la découpe des crêtes et les groupes de vagues sont posés
  dans le repère de l'écoulement (`seaFlowHere`) : des spirales logarithmiques qui rentrent de 22,6° vers l'œil
  (ln r + sens × tan(22,6°) × θ y est constant), calculées avec deux angles, l'un dans ]−π, π] et l'autre dans
  [0, 2π[, mêlés loin de leurs coupures, sans couture. L'écume dérive avec le vent local.
- Mesure sur un œil fixe, en 8 points à r = Rmax (tenseur de structure de l'image sur 160 px) : écart entre
  l'orientation des traînées et le vent théorique de 0,1 à 13,8°, 6,7° en moyenne.
- Limite : les 12 composantes de vagues gardent une direction globale, celle du centre de la caméra. Leur relief ne
  tourne pas avec la spirale (les rendre locales coûterait environ 4 fois le shader).
- Sans ouragan, l'image de la mer est identique à l'octet (60, 90 et 107 km/h). Coût avec ouragan : de +0,07 à
  +0,2 ms par image sur 1920 × 1080 (M4 Max).
- Chaque arbre se balance dans le vent de l'ouragan à sa place (`TreeSway.windAt`) : immobile dans l'œil. La pluie
  lit le point au centre de la caméra.

**Le widget « > >> >>> » accélère aussi l'ouragan** (`hurricaneTimesOf`, `hurricaneSpedUp`).
- C'est le même réglage que la vitesse du gel et de la fonte, avec une correspondance propre à l'ouragan :
  ×1, ×5 au cran ×60, ×10 au cran ×600 (×2 à ×10). Un passage de 5 min dure ainsi 5 min, 1 min ou 30 s, jamais
  moins de 30 s.
- Le serveur relit le cran chaque seconde et ré-ancre le départ : l'œil continue d'où il est. La pluie tombe d'autant
  plus fort, et le cumul reste le même.
- Le message porte la durée en cours et l'accélération (`HurricaneTrackMessage.durationMs = 13`, `times = 14`).

**Ce que tout le monde voit.**
- Le navigateur calcule la météo **du point au centre de sa caméra** (`withHurricane`, appliqué en dernier dans
  `shownWeatherSettings`) : pluie, vent pour les arbres, la pluie penchée, la mer du vent et les embruns, ciel dégagé
  dans l'œil, orage dans les bandes extérieures.
- Cette météo est recalculée chaque seconde et à chaque case parcourue par la caméra.
- Le panneau affiche la phase, le vent, les rafales et la pluie à cet endroit, ainsi que le temps restant, et propose
  « Arrêter l'ouragan ».

**La mer blanche d'embruns, brique à part pour tout vent très fort** (`Whitecaps.spumeShare`,
`WindSeaShader.seaSpume`, `seaSpray`). Elle ne lit que le vent de la mer du vent, quelle qu'en soit la source : ouragan,
vent manuel ou météo réelle. Holthuijsen, Powell et Pietrzak (2012, *JGR* 117, C09003) ont observé ceci :
- au-delà d'environ 30 m/s (108 km/h), les moutons cessent de croître et des traînées d'écume et d'embruns alignées
  sur le vent prennent le relais ;
- vers 40 m/s (144 km/h), elles couvrent les vagues d'une nappe blanche (« white out » ; les seuils viennent de
  [Gemini], le phénomène de l'article) ;
- l'OMM, pour la force 12 : « Sea completely white with driving spray; visibility very seriously affected ».

Rendu :
- de longues traînées BLANCHES parallèles au vent (8 px de large, 360 px de long, des choix), de largeur, longueur et
  blancheur variables, par plaques, qui dérivent avec l'écume laissée ; entre elles, un film laiteux (30 % au plus) ;
  la nappe ne dépasse pas 72 % : l'eau et son relief restent visibles dessous (retour de l'utilisateur : un aplat
  opaque à rayures sombres cachait l'eau) ;
- un voile d'embruns gris-blanc (30 % au plus, atteint à 55 m/s), en bouffées qui courent sous le vent à 420 px/s ;
- rien sur l'eau peu profonde : nappe et embruns montent de 12 à 45 px de fond (0,4 à 1,5 m) ;
- sous l'ouragan, les groupes de vagues sont des plaques rondes (posés le long de l'écoulement, leurs bandes se
  lisaient comme des arcs sombres réguliers).

Banc GPU de l'étude de la houle (vrai shader de l'eau, M4 Max, avant/après avec la mer du vent des deux côtés) :
- l'image est **identique à l'octet** à 60, 90 et 107 km/h : rien ne change sous le seuil, et l'écume validée par
  l'utilisateur reste telle quelle ;
- part blanchie (moutons et nappe, sans l'écume laissée) : 12 % à 110 km/h, 54 % à 130, 90 % à 140, 95 % de 150 à
  250 ;
- les shaders compilent sur Metal et sur SwiftShader.

Rien ne change en qualité Basse, ni sans le shader. Le plafond de 45 % de `whitecapWhite` ne vaut que pour les moutons.

**Coût du serveur** (mesuré le 2026-11-23 avec l'ancienne version à l'échelle réelle, sous une pluie compressée
d'environ 850 mm/h) : de 11,3-13,0 à 12,2-19,8 ms par pas de 100 ms de l'eau, sur la carte d'Antoine, sur un fil de
calcul, dans un conteneur Linux sur le Mac. La version à l'échelle de la carte verse 100 fois moins. Le coût de
`hurricaneHere` est de quelques dizaines d'opérations par appel : une fois par pas pour le sol, une fois par seconde
pour la météo du navigateur. Le coût de la spirale (un shader plein écran, deux fbm de trois octaves) n'a pas été
mesuré.

**La pression sur l'eau : le baromètre inversé** (`Terrain/AirPressure.ts`, `Hurricane.hurricanePressure`,
demandé le 2026-11-23 : « la pression dans un ouragan diffère selon la position : faible (très) dans l'œil, donc ça
attire l'eau vers le haut »). Sous une basse pression la mer monte d'environ 1 cm par hPa (100 Pa / (ρ g), 1,02 cm en
eau douce ; Pugh, *Tides, Surges and Mean Sea-Level*, 1987, ch. 7). Profil de Holland, le même que le vent :
p(r) − p_loin = −Δp (1 − exp(−(R/r)^B)), R = 30 m, B = 1,5 ; Δp tiré du vent maximal par la relation de Holland
(V² = B Δp / (ρ_air e), ρ_air = 1,15) : 26 hPa en catégorie 1, 74 en 4, 100 en 5 (cohérent avec les pressions
centrales de Saffir-Simpson), soit 0,26, 0,75 et 1,0 m d'eau sous l'œil par rapport au loin, au fondu de l'ouragan
près. Dans le modèle d'eau du serveur, l'eau à inertie coule selon la pente de sa surface **plus** cette hauteur
(`WaterKernel.fluxPass`, et le même calcul dans le noyau C `kernel/water_kernel.c`, identique au bit ; `Move` gagne
un pointeur `head` et un drapeau `pressed` en fin de structure) : à l'équilibre, surface + hauteur de pression est
de niveau. Dans un bassin fermé l'eau se redistribue : un dôme sous l'œil, la mer qui baisse loin de lui, les rives
que l'œil approche qui se couvrent, et le dôme qui suit l'œil (0,9 m/s, bien moins vite que les ondes : pas de
résonance) puis retombe en vagues quand il s'en va. Un bassin de 110 m ballotte environ deux minutes avant de se
poser (amortissement existant, aucun ajout). Sans ouragan le calcul est exactement l'ancien (empreintes de l'eau
inchangées). Coût : la hauteur de pression de chaque cellule est refaite quand l'œil a bougé d'une demi-cellule
(environ un pas sur trois, 1,5 ms sur 480 × 320 cellules sur le Mac, une table au lieu d'une exponentielle par
cellule), une addition de plus par face sous ouragan. La grille reste éveillée tant que l'ouragan passe. Le
protobuf ne change pas.

**Le vent sur l'eau : son frottement** (`AirPressure.windPush`, `Hurricane.hurricaneWind`). Le vent de l'ouragan (le
même calcul que `hurricaneHere`, extrait dans `hurricaneWind`) tire sur la surface : τ = ρ_air C_d U², C_d de Large et
Pond (1981 : 1,2·10⁻³ jusqu'à 11 m/s, puis (0,49 + 0,065 U)·10⁻³) plafonné à 2,5·10⁻³ au-delà de 31 m/s (Powell,
Vickery et Reinhold, *Nature* 2003 : l'écume et les embruns empêchent la surface de devenir plus rugueuse) : environ
9 Pa dans le mur d'une catégorie 4. Dans les deux noyaux, chaque face reçoit dt × la poussée moyenne de ses deux
cellules (dq/dt = τ / ρ_w), lue sur une grille de 4 × 4 cellules et interpolée, refaite avec la hauteur de pression
(1,2 ms sur 480 × 320 cellules). Au repos dans un canal fermé, la surface penche de τ / (ρ_w g h) (test à 15 % près) :
quelques centimètres sur une centaine de mètres, la carte étant réduite (une vraie surcote se forme sur des dizaines
de kilomètres de plateau). Ce qui se voit surtout, ce sont les **courants** : l'eau des lacs se met à tourner autour
de l'œil, comme le vent, et prend de l'ordre de 0,2 m/s en une minute au rayon des vents maximaux (test contre
τ t / (ρ_w h)), jusqu'à environ 1 m/s sur la planche de l'étude ; sur un lac étroit le courant longe les rives. Mêmes
garanties que la pression : rien sans ouragan, TypeScript et C identiques au bit (`Move` : 168 octets).

**Effet sur l'eau exagéré, à la demande** (réglage du panneau de l'ouragan, « Effet sur l'eau (pression et vent) » :
Réaliste, Exagéré ×2, ×4, ×6, ×8 ; `HurricaneTrackMessage.waterEffect`, champ 15, **le protobuf change**). Multiplie la
hauteur de pression et la poussée du vent sur l'eau, rien d'autre (le vent, la pluie, le ciel restent ceux d'un vrai
ouragan). Choisi par le joueur qui lance l'ouragan, gardé par le serveur parmi les cinq valeurs, le même pour tous. À ×8
une catégorie 4 creuse un dôme de 6 m (pentes d'un dixième) : le modèle tient (test : volume conservé dans un bassin
qui le contient, vitesses bornées, au repos ensuite, dôme conforme à 10 % près) ; sur la carte, un tel dôme déborde des
rives et inonde les terres basses, ce qui est voulu par l'exagération.

**Ce que ça ne modélise pas, ou pas encore.**
- **La pluie par position sur l'eau, le feu par position** : le sol du serveur lit une seule valeur pour la salle, au
  point survolé par l'œil. L'eau ne reçoit donc pas plus de pluie sous le mur qu'ailleurs, et le feu ne sent pas le
  vent du point où il brûle.
- **La mer du vent par position** : un seul vent pour toute la vue, celui du centre de la caméra.
- La surcote de tempête d'une vraie côte : le modèle d'eau n'a pas de bord ouvert sur une mer.
- Le feu : sous la pluie réelle du mur, il ralentit (test : 20 % de cases en feu en moins au plus fort sur un pré
  sec) et l'air humide (95 %) n'en allume plus de nouveau. Un feu déjà pris dans une herbe sèche brûle toutefois
  jusqu'au bout.
- Les dégâts aux arbres, aux objets et aux bâtiments, la fuite des animaux, la baisse du vent sur la terre.
- La pluie dessinée sature au-delà de 20 mm/h (`rainIntensity`, non touchée).
- Le danger d'incendie de l'onglet Météo et le vent du bandeau ignorent l'ouragan.
- Le sol local d'un joueur lit l'heure de son ordinateur, pas celle du serveur.
- Un navigateur d'avant reçoit un genre inconnu et dessine une comète à chaque annonce (chaque seconde).
- Poser l'œil à la souris : non fait, l'œil passe au-dessus du centre de la carte.

**Arbres couchés par le vent** (demandés le 2026-11-23). Un arbre qui reste 4 s (`TREE_FALL_SECONDS`, deux pas du
pré) dans des rafales de 130 km/h ou plus (`TREE_FALL_GUST_KMH`) **à son pied** est couché : la rafale du vent de
l'ouragan en ce point (`hurricaneHere`, vent moyen × 1,23), sinon celle du vent de la salle. Seuil physique choisi par
l'utilisateur (d'abord 250 km/h) : entre les rafales de 3 s qui déracinent un arbre au plus tôt et en général dans
l'échelle de Fujita améliorée, 117 à 140 km/h pour un résineux, 122 à 151 km/h pour un feuillu (Texas Tech, « A
Recommendation for an Enhanced Fujita Scale », 2006, annexe A, DI 27 et 28, lue) ; une seule valeur, les arbres du
catalogue ne disant pas leur essence. Conséquences : le mur d'un ouragan de catégorie 1 (rafale 155 km/h) en couche,
et un vent de salle réglé à 106 km/h (moyen) ou plus en couche sur toute la carte. Il reste couché le temps qu'un arbre
brûlé reste noir, puis repousse depuis son pied dans le même temps : la même horloge et la même branche de `TreeFire`
que la repousse après un feu (`damage`, `wait`, en temps réel : 150 s puis 150 s par défaut, 30 s puis 30 s sur une
carte réglée à une minute de pousse), et il ne brûle pas tant qu'il est couché. **Pas de repousse pendant un
ouragan** (règle de l'utilisateur, 2026-11-23) : tant qu'un ouragan traverse la salle (`hurricaneAt` à l'heure du pas
de la simulation), le temps d'un arbre couché par le vent ne s'écoule pas, même pendant sa repousse ; il démarre à la
fin de l'ouragan (fin naturelle ou arrêt par un joueur), avec les durées de la carte (`TreeFireStepInput.stormy`). Un
arbre brûlé n'est pas retenu. Pendant le rattrapage d'une salle restée vide, aucun ouragan n'est rejoué. Tenu par le serveur dans `TreeFire`
(champ `fallenFrom`, sauvegardé avec le pré), identique avec ou sans fil de calcul (tests `RoomGround` et
`RemoteRoomGround`, arbres ajoutés au scénario du sol), dit aux navigateurs par `TreeFireStateMessage.fallen`
(direction d'où venait le vent, plus 1). Autour de l'œil, ils tombent en travers du rayon, dans le sens où tourne la
tempête (test). Dessin (refait le 2026-11-23 après « pas terrible » de l'utilisateur) : le pied est lu dans l'image de
chaque arbre (bas du tronc, l'ombre peinte retirée : `treeBodyOf`) et non plus un point fixe (32, 64), faux pour les
arbres de la carte. Couché (`lyingTreeTexture`, `lyingLayout`) : déraciné, pas cassé (130 km/h déracine selon l'échelle
de Fujita améliorée), une motte de racines soulevée au pied (2,3 fois la largeur du tronc, terre claire dessus, racines,
trou à côté), un bout de tronc, puis la **moitié du houppier tournée vers le ciel** (demande de l'utilisateur : « des
moitiés d'arbre ») : son contour debout couché dans le sens de la chute, élargi de 15 %, aplati, dessiné en touffes à
ses couleurs, éclairé d'en haut ; sur le côté de l'écran la moitié au-dessus du tronc, vers le haut ou le bas toute la
largeur ; raccourci à 0,7 vers le haut et le bas de l'écran (`LYING_DEPTH`, la même géométrie pour l'ombre du soleil
et les feuilles). L'objet de la carte ne montre rien pendant ce temps (`uprootedTexture`). La chute : l'image debout,
sans son ombre peinte, tourne sur son pied, puis le dessin couché la remplace pendant le rebond (avant qu'elle ne se
retourne pour une chute vers le joueur). Il repousse en 8 tailles depuis son vrai pied (`growingTreeTexture`). Deux
autres dessins, choisis par la forme de l'image et non par son nom : un **arbre nu** (moins de 35 % de pixels de
feuillage vert, d'automne vif ou de neige) se couche en branches, une maîtresse et sept de biais avec un rameau chacune ;
un **palmier** (`isPalm` : feuillu, son tronc visible depuis le pied jusqu'à 60 % de sa hauteur ou plus, 0,64 pour `nature-4` contre 0,57 au plus pour les autres arbres feuillus de la carte, ses palmes
seulement en haut) se couche en palmes arquées depuis le bout du tronc, nervure claire et folioles en dents, la moitié
tournée vers le ciel. L'ombre du soleil de ces deux-là suit leurs branches ou leurs palmes et leur tronc
(`ShadowTree.limbs`), pas l'ovale d'un houppier.

**Débris emportés** (même demande). Des feuilles, brindilles et éclats sombres, 150 au plus, arrachés dans la vue là où
la rafale dépasse 120 km/h (force 12 de Beaufort), d'autant plus que la rafale est forte : ils vont au vent de
l'ouragan à l'endroit où chacun se trouve (1,2 px/s par km/h, l'ouragan étant réduit à la carte), tournent donc autour
de l'œil, plus denses et plus rapides au mur, et disparaissent dans l'œil (`DebrisField`, `HurricaneDebris`). Un vent
de la carte réglé à plus de 98 km/h (rafale de 120) en emporte aussi, en ligne droite. Dessinés par chaque navigateur,
rien d'envoyé ; masqués avec les effets de météo, en mode Basique et dans l'éditeur.

**Compatibilité.** `play` et `back` se déploient ensemble (protobuf). Le PNJ du dépôt d'infra doit être réaligné sur
`messages.proto`.

## Catastrophes : l'averse

Deuxième catastrophe du widget (bouton « Catastrophe » du menu des applications) : une **grosse pluie sous le
pointeur**, pensée pour éteindre des incendies. **Rien ne brûle encore dans le jeu** : aujourd'hui l'averse apporte de
l'eau et trempe le sol.

**En jeu.** La tuile « Averse » s'arme comme le météore (viseur, Échap annule). Tant que le **clic gauche est
maintenu** sur la carte (ou le doigt posé), il pleut sous le pointeur, et le nuage le suit ; relâcher arrête la pluie.
Pendant ce temps le glisser ne déplace pas la carte (molette et deux doigts restent libres). Le widget montre, pour
l'averse, un curseur de taille (rayon de **1 à 16 cases**, 3 par défaut) et une case **« Toute la carte »** : cochée,
il pleut partout tant que le clic est maintenu, où que soit le pointeur.

**Le serveur décide.** Le navigateur redit où est le pointeur toutes les 200 ms (`LaunchCatastropheMessage`, genre
`CATASTROPHE_DOWNPOUR`, champ `wholeMap`). `CatastropheManager.rain` tient **une averse par joueur**, qui dure 1 s
après son dernier message (un onglet fermé n'arrose donc pas sans fin), 8 averses à la fois par salle, messages plus
rapprochés que 100 ms ignorés, point dans la carte, taille ramenée dans ses bornes (`downpourTiles`). Chaque message
accepté est annoncé à la salle (`CatastropheMessage`, même `id` tant que l'averse dure, `impactInMs` = temps restant
sans autre message).

**Ce qu'elle fait.** À chaque pas de l'eau (10 par seconde), chaque cellule sous l'averse reçoit de l'eau
(`WaterGrid.rainOn`, **4 px par seconde**, jamais au-dessus de la hauteur maximale de l'eau, rien dans un mur ; la
pluie tombe du ciel, aucun mur ne l'arrête), comptée dans la **pluie** du bilan ; la salle reçoit l'eau cinq fois par
seconde tant qu'il pleut. Le sol des cases arrosées est **trempé** aussitôt (`Meadow.soak`, dehors seulement, pas un
sol qui ne retient rien), ce que la salle voit à l'annonce suivante du pré. L'eau n'existe que là où la carte a une
grille d'eau (un relief ou un objet d'eau) ; ailleurs l'averse se voit et trempe le sol, sans flaque.

**Ce que tout le monde voit** (`Catastrophe/DownpourView.ts`, règles pures dans `DownpourFall.ts`) : un nuage sombre
au-dessus du disque, des gouttes qui tombent toujours aux mêmes endroits du disque et y éclaboussent, le sol assombri ;
sur toute la carte, un voile et des gouttes sur toute la vue. En mouvement réduit les gouttes sont immobiles.

**Limites.** Il pleut aussi dans les bâtiments (le serveur d'eau ne connaît pas les toits) ; tout joueur peut inonder
une carte ; pas de son ; l'averse des autres suit leur pointeur avec le retard du réseau. `play` et `back` se
déploient ensemble.


## Sol en shader, météo personnelle et gel de l'eau

**Sol.** Les sols du relief, l'herbe, la neige des hauteurs, l'ombrage du relief, la paille, les cendres, la lueur
du feu et l'eau sont dessinés par deux shaders (`Terrain/GroundSplat.ts`) au lieu de couches empilées. Une seule
petite texture de données (un pixel par case, cinq paquets RVB : six sols ; herbe, neige, eau ; creusé, surélevé,
cendre ; paille, feu, dehors) est envoyée à la carte graphique ; les textures des sols ne sont jamais redessinées.
Les sols se mélangent par leur hauteur (la luminosité de leur texture), leurs bords sont courbés par un bruit fixé à
la carte puis coupés net au pixel (pixel art, aucun fondu) ; les poids sont lissés 1-2-1 avant l'envoi pour que les
bords ne suivent pas l'escalier des cases. L'herbe pousse en touffes (seuil sur la texture et un bruit), les cendres
s'effacent par plaques. L'eau a sa couleur de sa profondeur, une surface animée en continu, une écume de rive et le
sol mouillé autour. **Eau mince visible** (2026-11-21, `fix/eau-invisible`) : le rivage du shader se calculait
de la seule profondeur lissée (`profondeur × 12`, seuil 0,5), si bien qu'une nappe de moins de ~5 px (1 px d'eau =
3,4 cm, soit ~18 cm) n'était pas dessinée au centre de sa case, et seulement par taches jusqu'à ~9 px (~30 cm) :
un pré inondé par une source paraissait sec avec quelques points bleus, alors que le serveur y comptait l'eau (les
animaux y boivent dès 2 px). Une présence d'eau par case (bleu du paquet 8, 255 dès qu'une case a de l'eau, au-dessus
de `SHOWN_PX` de `TerrainWater`) est désormais lue à part de la profondeur : toute eau atteint au moins le bord de sa
case, l'eau profonde garde son rivage d'avant (`waterShoreLevel`, jumeau TypeScript de la règle du GLSL, testé dans
`WaterCover.test.ts`). Sous `SHORE_PX` (3 px, ~10 cm), un film est un sol luisant : opacité réduite jusqu'à 60 %,
sans écume. Les deux replis (`TexturedGround`, canevas) dessinaient déjà toute case mouillée. **Nappe qui ruisselle** :
une source qui déborde d'un lac court sur un pré en pente en nappe de 6 à 110 mm à 0,2-2 m/s (Manning, `steadyFlowSpeed`,
pour 28 à 110 L/s sur 1 à 9 m de large), en partie sous `SHOWN_PX` (0,5 px, 17 mm) que `levelsOver` taisait, alors que
« Flux d'eau » y trace ses flèches (toute profondeur > 0). Une eau qui court (vitesse du bloc non nulle, eau à inertie) est
dessinée dès `RUNNING_SHOWN_PX` (1/8 px, 4 mm, le pas des profondeurs du serveur), en sol luisant ; une pellicule immobile
sous 0,5 px (reste d'une crue) reste cachée. **Sol mouillé** (2026-11-21, `fix/sol-mouille-fonce`) : un sol mouillé
est plus sombre, l'eau des pores abaissant sa réflectance (Twomey, Bohren et Mergenthaler 1986, *Applied Optics* 25:431).
Le shader du sol l'assombrit selon le plus fort de trois états, jamais leur somme : la pluie de l'air du joueur
(`uWet`, sur les sols peints comme avant), l'**humidité du sol tenue par le serveur** (`Meadow`, par tuile, déjà envoyée
au navigateur : pluie, eau posée, remontée capillaire près de l'eau `BANK_MOISTURE`, séchage selon le sol, dont le
sable en 120 s ; paquet 9, rouge) et la présence d'eau du relief (paquet 8, bleu). Courbe `groundWetness` : rapide avec
la première eau puis plate (forme de Lobell et Asner 2002, *SSSAJ* 66:722 ; pente 3 : choix). Réflectance mouillée sur
sèche (`WET_REFLECTANCE`, linéaire, appliquée en sRGB à la puissance 1/2,2) : terre et prairie 0,54, argile 0,48, sable
0,55 (sols poreux 0,4 à 0,6, Lobell et Asner ; limon de 0,30 sec à 0,14 mouillé, Idso et al. 1975, *J. Appl.
Meteorol.* 14:109 ; chiffres de ces deux articles relus par un résumé, pas sur l'article), roche 0,8, gravier 0,65,
herbe 0,9 (**choix, non sourcés** : la pierre ne boit pas, les brins ne sont pas poreux). Mesure sur le shader : sable
mouillé à 76 % de sa luminance sèche, roche 90 %, herbe 96 % ; la pluie fonce donc moins qu'avant (70 % partout). Sous
un film, l'eau est claire (opacité de 20 % au plus mince) sur le sol foncé ; l'eau profonde et le rivage d'un lac ne
changent pas. La couronne sombre du shader de l'eau n'ajoute que ce que l'humidité du modèle n'a pas déjà foncé.
Limites : les tuiles de la carte non peintes comptent comme de la terre (le modèle les traite ainsi), pavés dehors
compris ; l'humidité est par tuile de 32 px. **Couleur et contour** (2026-11-21, `fix/sol-mouille-couleur`, après un essai en
dev local : tache terne, bords en marches de tuiles, teinte verte) : la couleur d'un sol peint n'est plus voilée mais
**approfondie** (`wetColor` / `wetColour`) : luminance réduite selon `WET_REFLECTANCE`, et chaque canal assombri en
puissance de sa clarté (la lumière traverse plus de grains absorbants dans un sol mouillé, Lekner et Dorf 1988,
*Applied Optics* 27:1278 ; l'ampleur `WET_DEEPENING` = 0,5 est un choix, les sources ne la chiffrent pas) : la teinte est
gardée, la saturation monte (sable : 0,33 sec, 0,41 mouillé, mesuré sur le shader). L'humidité, tenue par tuile, est lue
sur une tuile autour (quatre points) sans paliers, et son bord est courbé par le bruit des bords des sols. Le reflet
d'un sol trempé est blanc, plus bleu-gris. Sous un film de moins de 1 px, l'eau n'a presque plus de couleur (opacité 5 %
au plus mince, sa teinte vient avec la profondeur jusqu'à `SHORE_PX`) : on voit le sable mouillé, plus un lavis vert.
**Canal** : l'humidité est dans le **vert** du paquet 9, dont le rouge est l'écume des vagues (#439) ; les deux
partageaient le rouge depuis la fusion de #439 et #444 (l'écume effaçait l'humidité, l'humidité moussait les rives).
**Piscines** : leur bassin est étanche (`Meadow`, `poolTile`) : leur eau ne mouille pas la terrasse par remontée
capillaire et leurs tuiles ne tiennent pas d'humidité de sol à répandre. **Ligne de mouillage** (2026-11-21, `fix/sable-mouille-net`, après un essai : sable
mouillé « presque imperceptible ») : la surface d'un sol est mouillée dès une humidité de `SURFACE_WET_MOISTURE` (0,25,
un choix : le serveur tient l'eau du sol, l'œil voit ses premiers millimètres, qui sèchent d'abord) ; en deçà elle est
sèche. La limite est nette, lissée entre tuiles et courbée par le bruit des bords des sols (`WET_LINE_GAIN`) ; au-delà, la
pleine teinte mouillée vient vite (`MOISTURE_CURVE` 6). Sable : réflectance mouillée 0,45 (bas de la fourchette 0,4 à 0,6
des sols). **Frange capillaire par sol** (`Meadow`, `SOIL_LIFE`) : `fringeTiles` 3 tuiles pour terre, prairie et argile
(inchangé), 1 pour sable et gravier (une frange de quelques décimètres, moins qu'une tuile de 1,1 m), 0 pour la roche ;
`wicking` 0,15 pour sable et gravier (la diffusion latérale de `MOISTURE_SPREAD` y est faible). Humidité d'une plage
de sable à l'équilibre, à 1, 2, 3 tuiles de l'eau : 0,80, 0,14, 0,03 (avant 0,80, 0,50, 0,17 ; la terre garde 0,80,
0,58, 0,43). Contraste mouillé/sec mesuré sur le shader (îlot de 10 × 8 tuiles), ΔL* : jour 13,8 → 20,4, soir (voile
0,3) 10,2 → 15,0, nuit (0,6) 6,4 → 9,4. **Filet qui court** (2026-11-22, `fix/filet-qui-court`, après une capture « Flux d'eau »
avec des flèches sur une terre qui paraissait sèche entre deux flaques) : la flèche n'était pas en cause (à fort zoom,
`flowOverBlock` ne la trace que si la cellule du milieu de son bloc a de l'eau, au moins 1/8 px) ; l'eau était bien
transmise et dessinée, mais sous 1 px comme une terre mouillée à 5 % de teinte, indiscernable d'une terre humide
(ΔL* 1,4). Toute eau que le serveur transmet (dès 1/8 px, 4 mm) est maintenant dessinée, qu'elle coure ou non (le rendu
ne dépend plus des vitesses à 0,25 cellule/s du serveur) ; `WATER_SHOWN_PX` (0,5 px) ne sert plus qu'à ce que les pieds
lisent (`AvatarAltitude`). Le courant de chaque cellule (`TerrainWater.speedAt`, eau à inertie) est donné au shader
(paquet 10, rouge et vert, `FLOW_UNITS` 32 par cellule/s autour de 128) : un film qui court prend une teinte légère
(`filmCover`, de 5 % immobile à 35 % dès 0,27 m/s) et des ridules étirées dans le sens du courant qui glissent à sa
vitesse ; dès `SHORE_PX` (3 px), l'eau est la même qu'avant. Terre sous un film qui court contre terre mouillée sans
eau : ΔL* 1,4 → 10,1. Sous 1 px, le rendu ne distingue pas 4 mm de 3 cm (niveaux entiers). Repli : sans WebGL ou avec moins de 9 unités de texture, les sols masqués d'avant
(`TexturedGround`). Textures : `resources/terrain/ground-*.png` (générées, 4 tons nets ; `ground-ice.png` dans le
style des patinoires).

**Météo personnelle.** Le bandeau météo devient une pastille : la ville du serveur (globe) avec l'icône du temps et
une flèche du vent ; un clic ouvre le bulletin, sous la pastille. Dès 768 px de large, la pastille météo et la pile des
étages sont sur la ligne de l'horloge, à sa gauche (météo, étages, horloge) ; en dessous, empilées sous l'horloge. Un joueur qui suit un lieu du monde sur son horloge (mode « monde »,
`worldCityStore`, nommé d'après la ville la plus proche, ou par ses coordonnées loin de toute ville) voit aussi sa ville (ordinateur), et le jeu dessine pour lui
seul la météo de ce lieu (`ChosenPlaceWeather`, route `real-weather` du pusher) ; les autres gardent celle du
serveur.

**Appliquer sa météo à la carte** (2026-11-22). La fiche personnelle (ordinateur) a un bouton « Appliquer à la
carte » : la carte suit alors, pour tout le monde, le lieu que ce joueur suit sur son horloge, **comme s'il l'avait
choisi dans les réglages de la météo de la carte** (Paramètres → Ambiance, `WeatherSettings`, avec « Réel ») : les
deux passent par la même fonction, `saveMapWeather` (`Weather/MapWeatherSave.ts` : droits `canEditMapWeather`,
commande de l'éditeur `updateWeatherSettingMessage` gardée dans le WAM, relecture de la carte, puis **accusé du
serveur** attendu 10 s au plus, `MapEditorModeManager.whenCommandsSettled`). Le panneau ne dit donc plus
« Enregistré » avant que le serveur ait accepté. Le bouton envoie le lieu (latitude, longitude, nom, fuseau) **et la
météo « Réel »** : une carte en Automatique ou en temps fixe ne lit pas la pluie réelle de son lieu
(`TerrainWaterManager`, `FireConditionsManager.real()` ne valent qu'en Réel). Aucun changement de serveur : `back`
relit le lieu du WAM à chaque pas (`RainTimelineService` demande la météo du nouveau lieu à Open-Meteo, cache par lieu
arrondi), sans redémarrer la salle ; neige, glace, eau, feu et herbe repartent de l'air du nouveau lieu. Le jour, la
nuit, les saisons et le fuseau de la carte suivent ce lieu : la confirmation le dit.
- **Point libre comme lieu de la carte.** Le schéma du lieu (`WeatherLocation`) acceptait déjà toute latitude et
  longitude : pas de changement de WAM, de protocole ni de `map-storage`. Un point loin de toute ville est enregistré
  par ses **coordonnées** (« 24° N 122° E », `WorldPlace.coordinates`), partagées par tous, sans virgule ni distance
  écrite dans une langue (seul l'ouest dépend de la langue de celui qui l'enregistre : « O » ou « W »). À l'affichage,
  un lieu de la carte nommé ainsi (`isPointName`) est nommé comme un point de l'horloge, dans la langue du lecteur
  (`mapPlaceNames`, `placeOfPoint` réutilisé) : court dans la pastille (« Hong Kong 770 km »), long dans la fiche de
  la carte, « Météo expliquée », la pluie du tableau de l'eau et le panneau des réglages (« 24° N 122° E · Hong Kong
  à 770 km »). Une ville trouvée par la recherche garde son nom (sans région ni pays dans la pastille) : les cartes
  déjà enregistrées ne changent pas.
- **Droits** : ceux des réglages de la météo de la carte ; sinon le bouton est grisé avec la raison. Grisé aussi
  pendant la lecture de la météo du lieu, et quand elle est indisponible (« pas de météo réelle pour ce lieu ») ;
  « La carte suit déjà ce lieu » quand la carte est en Réel au même lieu arrondi.
- **Confirmation** (`PlaceToMapModal`, `Popup` du jeu, Échap) : la carte change pour tous, passe en météo réelle si
  elle ne l'était pas, son jour, sa nuit et ses saisons suivent le lieu, et « tu repasseras sur l'heure du serveur ».
  Salle en conditions réglées à la main (Catastrophe → Météo) : elles resteraient prioritaires sur le lieu ; une case
  cochée par défaut, « Revenir aux conditions réelles », les quitte (n'importe quel joueur le peut déjà). **Une fois
  le serveur d'accord**, le joueur repasse automatiquement en « Heure du serveur »
  (`NightMode.Server`) : même ciel, même heure, même monde que tout le monde ; son point reste mémorisé, inactif. Sinon
  (refus, pas de réponse, droits) il reste sur sa météo personnelle et la confirmation le dit. Repasser en « Heure du
  serveur » fait perdre le mode du ciel d'avant, quel qu'il soit.
- **Retour arrière** : pour la session de celui qui a appliqué, la fiche de la carte (globe) propose « Revenir à
  Lille » tant que la carte suit encore le lieu appliqué ; il remet la météo et le lieu d'avant (le lieu par défaut
  s'il n'y en avait pas), par la même fonction. Sinon : les réglages de la météo de la carte.

**Choisir un lieu par son nom ou sur la carte du monde** (2026-11-22). Deux composants partagés : le champ de
recherche de ville (`Components/Menu/PlaceSearch.svelte`, recherche de l'Open-Meteo par le pusher, seul le texte
tapé est envoyé, après 300 ms de pause ; Entrée prend la première ville, Échap ferme la liste seulement ; les
touches ne vont pas au jeu pendant la frappe, `inputFormFocusStore`) et la carte du monde cliquable
(`Components/WorldMap/WorldMapPicker.svelte`, marqueur du lieu courant, jour et nuit du jeu, image préchargée).
- **Menu de l'horloge**, « Jour dans le monde » : le champ au-dessus du texte d'aide et de la carte. Une ville choisie
  devient le lieu suivi, nommée par elle-même (« Hong Kong », pas « point choisi sur la carte ») à son fuseau, même
  loin des villes de la liste : `WorldPoint.name` et `.timezone`, gardés dans le navigateur ; un clic sur la carte
  remplit le champ avec le nom du point. Le menu défile s'il dépasse la fenêtre (`max-h`).
- **Réglages de la météo de la carte** (Paramètres → Ambiance, `MapLocationPicker`) : la carte sous le champ. Un clic
  choisit un point comme lieu de la carte, enregistré comme le bouton « Appliquer à la carte » l'enregistre
  (`mapLocationOf(placeOfPoint(…))` : une ville de la liste à 150 km au plus, sinon les coordonnées), avec le bouton
  « Enregistrer » existant ; le champ et la carte montrent le même lieu.

**Pays et région d'un lieu** (2026-11-22, « il y a plusieurs Nice dans le monde »). La fiche météo dépliée (carte et
personnelle) dit où est le lieu, sur une ligne discrète sous son nom (coupée si trop longue) : la région et le pays
d'une ville trouvée par la recherche (le géocodage les donnait déjà, gardés dans le nom enregistré « Nice,
Provence-Alpes-Côte d'Azur, France » que la pastille coupait à la virgule : ils ne sont plus jetés), le pays d'une
ville de la liste `WORLD_CITIES` (code ISO ajouté à chacune dans `common/WorldCities.ts`, nommé dans la langue du
joueur par `Intl.DisplayNames`, `PointWords.country`), rien pour un lieu enregistré sans eux (anciennes cartes : rien
n'est inventé) ni pour un point loin de toute ville (son nom long dit déjà où il est). `WorldPlace.where`,
`mapPlaceNames(…).where`, `cityPlace`. Pastille et horloge : nom court inchangé, le lieu complet dans leur infobulle.
Propositions de la recherche : déjà « Nice, Provence-Alpes-Côte d'Azur, France » et « Nice, California, United
States ». Tableau « Météo expliquée », bilan de l'eau et confirmation « Appliquer à la carte » : nom court inchangé.

**Gel.** À partir de l'air du lieu affiché (`Weather/Frost.ts`), pour ce joueur seul, rien n'est envoyé :
givre au sol d'après la vapeur de l'air (voir « Givre » ci-dessous) ; l'eau gèle des hauts-fonds vers le fond entre 0 et -15 °C (toute gelée au-delà), en glace de
patinoire ; le sol se mouille sous la pluie et sèche en cinq minutes ; tout avance en deux minutes environ, rien ne
saute. La neige au sol reste celle d'avant : seulement quand il neige. **Dehors seulement** : `OutdoorGrid` (ce qui
est fermé par des murs) ne gèle jamais. Sur l'eau gelée on patine (logique des patinoires), on n'y nage plus et le
courant ne porte plus ; les poissons s'y figent, l'écume et les tourbillons s'arrêtent. Les **piscines** dehors
gèlent comme des hauts-fonds et deviennent des patinoires, sauf si leur **eau chaude** est allumée : nouvelle clé
d'état d'objet `hot` (`ENTITY_STATE_KEYS`, défaut « non », `entityStateDefault`), commandée par un interrupteur
(« Il agit sur : l'eau chaude des piscines », cibles choisies pour une piscine dehors) ; chauffée, elle fume dans le
froid et ne gèle jamais.

**Givre** (2026-11-21, `libs/map-editor/src/Weather/HoarFrost.ts` `hoarFrost`, remplace la rampe « blanc à −10 °C »
de #392). La gelée blanche est un dépôt de la vapeur de l'air sur une surface plus froide que le point de givrage de
cet air : il faut un sol sous 0 °C **et** un air saturé par rapport à la glace de ce sol ; par air plus sec il gèle sans
blanchir (gelée noire). Calcul : pression de vapeur de l'air d'après son humidité relative à l'eau (celle d'Open-Meteo
et de la salle), rapportée à la saturation sur la glace à la température du sol (formes de Magnus de l'OMM, WMO-No. 8
annexe 4.B : eau 17,62 / 243,12, glace 22,46 / 272,62, 6,112 hPa ; `iceSaturationRatio`). **Corrigé le 2026-11-21
(grand froid)** : la première version (#424) blanchissait selon un excès **absolu** de vapeur (sol blanc à 0,25 hPa),
qu'un air à −34 °C ne peut presque pas atteindre (saturation de 0,35 hPa sur l'eau) : par grand froid il ne givrait
plus jamais, même saturé par rapport à la glace. Le dépôt se décide sur le rapport `e / e_i(sol)` ≥ 1 (sol au point de
givrage ou dessous : glossaire AMS « hoarfrost », UBC ATSC 113 « surface hoar ») ; sa vitesse, elle, suit l'excès
absolu (Hachikubo et Akitaya 1997, lu en résumé seulement). D'où : blancheur = sursaturation sur la glace `e/e_i − 1`
ramenée sur 0 à 5 % (`FULL_FROST_SUPERSATURATION`, choix), multipliée par un dépôt plus mince quand l'excès est sous
0,1 hPa (`FULL_FROST_EXCESS_HPA`, qui change de sens : excès d'un dépôt à pleine épaisseur, choix), sans descendre
sous la moitié (`COLD_FROST_SHARE`, choix) : jamais nul quand l'air est sursaturé sur la glace. Sol plus froid que
l'air de 0,8 °C par vent calme (choix, sous
les 1 à 3 °C de l'herbe par nuit claire et calme, FAO Snyder et de Melo-Abreu 2005, ch. 2), de jour comme de nuit et
par tout ciel : ni la nuit ni la nébulosité ne sont lues (les conditions réglées à la main n'en ont pas) ; le vent
ramène le sol à la température de l'air, en entier jusqu'à 7 km/h, plus rien à 18 km/h (choix). Vent inconnu = calme ;
**humidité inconnue = pas de givre**. Exemples (avant → après la correction) : −2 °C et 95 % → 0,70 → 0,73 ;
−2 °C et 40 % → 0 ; −15 °C et 70 % → 0 (81 % sur la glace) ; +1 °C et 100 % → 0 (sol à +0,2 °C) ; −2 °C, 95 % et
40 km/h → 0 (sol à −2 °C, 97 % sur la glace) ; −30 °C et 95 % → 0,54 → 1 ; −34 °C, 80 % et 15 km/h → 0,14 → 0,68 ;
−34 °C et 60 % → 0 (86 % sur la glace). L'humidité de la ville suivie s'affiche aussi dans la fiche météo personnelle
du bandeau (quart d'heure en cours de sa frise), comme celle du serveur dans la sienne. Sources, dans le même ordre
que la température : ville suivie par le joueur (« Jour dans le monde » : température, humidité et vent de sa frise),
sinon conditions réglées à la main dans la salle, sinon air réel du lieu de la carte. Limites : un vrai givre de nuit
claire sous un air à +1 °C n'est pas rendu, et le givre se forme aussi de jour au soleil ; le shader le pose sur tout
le sol dehors du relief, quel que soit le sol (l'eau a son propre shader).

**Piscines codées.** Une piscine est peinte au sol avec l'outil **Relief**, mode **Piscine** : ses cases gardent un sol
de piscine (codes 7 à 14, `libs/map-editor/src/Terrain/Pools.ts`), un par style. Jusqu'à 8 styles par carte, dans
`settings.pools` (message `UpdatePoolSettingMessage`) : couleur de l'eau, couleur de la margelle, profondeur, 0 à 2
échelles, eau chaude. Le shader de l'eau les dessine (`poolColor`) : margelle par érosion de la forme
(`poolAround`), carrelage vu à travers l'eau, couleur selon la profondeur. On y nage (`WaterZones.paintedPoolRectangles`,
la profondeur du style), les échelles se posent sur le bord haut (`Terrain/PoolLadders.ts`). Les anciennes
piscines-images (objets avec eau) sont redessinées de la même façon, image cachée (`Terrain/ImagePools.ts` ;
`?classicPools` ou `localStorage.classicPools = "1"` pour revoir l'image), et retirées du catalogue ; « Convertir en
piscine modifiable » dans l'éditeur d'objets la remplace par une piscine peinte (`MapEditor/PoolConversion.ts`).
**Gel** : une piscine gèle en surface comme une eau calme de 32 px, quelle que soit sa profondeur
(`POOL_ICE_DEPTH_PX`), soit vers -8 °C ; jamais dedans (`OutdoorGrid`) ni chauffée.

## Rendu : pixels lissés, ciel par la carte graphique, reflets, arcs-en-ciel (PR #458)

**Pixels lissés** (`Phaser/Services/SharpUpscale.ts`). Le jeu est calculé en pixels de jeu (`HdpiManager`) puis
agrandi par le navigateur en `image-rendering: pixelated` : à un facteur non entier (2,53 sur un Retina au zoom par
défaut), des pixels de jeu font 2 pixels d'écran et d'autres 3 (escaliers irréguliers, scintillement au défilement).
Un second canvas WebGL, à la définition de l'écran, montre le canvas du jeu avec un filtre « sharp bilinear » : chaque
pixel plat en son milieu, seul le pixel d'écran de son bord mélangé au voisin. Le bilinéaire interpole entre les
**centres** des texels : la formule part de `floor(texel - 0,5) + 0,5` (sinon flou). Lu sur `POST_RENDER`, dans la même
tâche que le dessin du jeu (`preserveDrawingBuffer` est faux). Le canvas est placé en tête de son parent : au-dessus du
canvas du jeu (non positionné), sous les calques positionnés (pseudos, interface). Écarté : `smoothPixelArt` de
Phaser 4, qui demande de tout dessiner en pleine définition (~6 fois plus de pixels dans chaque shader). Mesure
(M4 Max) : 120 i/s avec ou sans.

**Ciel par la carte graphique** (`Weather/CloudLayer.ts`). Avant : un canvas CPU d'un pixel par bloc de 4 à 64 px
(`BlockSurface`), repeint 6 à 10 fois par seconde, des nuages qui sautaient d'un bloc (~40 px d'écran toutes les
0,5 s). Maintenant, à chaque dessin de la météo (30 i/s quand il y a des nuages, 15 avant) : les bouffées
(`cloudPatches`) sont additionnées dans une texture d'épaisseur de 8 px de carte par texel (fixe : un texel qui suivait
le zoom changeait la forme des nuages à chaque palier) avec le mélange ADD de Phaser (`src + dst × alpha_dst`, d'où un
fond **noir opaque**) ; un shader lit cette épaisseur lissée, la découpe en bosses (bruit fractal fixé au nuage :
calculé en `monde - dérive du ciel`), éclaire les bosses depuis le nord-ouest par la pente de la densité, dessine les
ombres (même forme, décalées à l'opposé du soleil), les voiles gris de la pluie et du ciel couvert, découpés par un
masque « dehors » tracé depuis les rectangles d'extérieur (`veil`) tous les 4 px. Une RenderTexture Phaser se lit
avec `1 - y`, comme un canvas (sans quoi : miroir vertical, visible seulement quand la texture dépasse la zone).
Nuages de pluie et d'orage : `cumulonimbusPalette` (sommets éclairés bien plus clairs que `rainPalette`). Le
brouillard reste en blocs. Réglage « Nuages fluides (carte graphique) » ; décoché ou sans WebGL : l'ancien chemin.
« Réduire les animations » fige les bosses. Mesure en régime (M4 Max) : 4,9 à 5,5 ms de calcul, 4 ms de rendu.

**Reflets dans l'eau** (`Terrain/WaterReflection.ts`, shader de l'eau de `GroundSplat`). L'eau mêle la couleur du
ciel (bleu, gris sous un ciel couvert ou la pluie, rien la nuit), les nuages qui passent (la texture d'épaisseur de
`CloudLayer`, relue décalée par les vagues : zoomé, quand la caméra est sous les nuages, on les voit dans l'eau),
l'éclat du soleil sur les vagues tournées vers lui (plus fort soleil haut et ciel clair) et, la nuit, la lumière des
lampes : le voile de nuit (`NightOverlay`, un texel par pixel d'écran, percé par les lampes, murs compris) relu sous
la lampe, étiré vers le bas et ondulé. Rien n'est dessiné deux fois : l'eau relit ce qui est déjà calculé.
`GameScene` passe le reflet à chaque image (`TerrainView.setWaterReflection`, comme les ondes des comètes). Réglage
« Reflets dans l'eau ».

**Arcs-en-ciel** (`Weather/Rainbow.ts`). Un vrai arc-en-ciel se voit à 42° du point opposé au soleil : seulement s'il
pleut avec un soleil entre 0 et 42° (fondu de 0 à 3° et de 36 à 42°), plus pâle par orage (× 0,5) et sous un ciel
couvert. Le jeu est plus généreux, pour le plaisir : toute pluie sous un soleil levé et visible a son arc, d'une force
d'au moins 0,5 (au coucher, par orage, sous un soleil au-dessus de 42°). Aucun la nuit, sous la neige, ni sous un ciel
couvert à 85 % ou plus (le soleil est caché). Fixé à la carte (centre, rayon 0,35 × le petit côté, 50 tuiles au plus),
ouvert à l'opposé du soleil (sens des ombres), sa demi-ouverture `90° × (42 - hauteur) / 42`, la hauteur plafonnée à 30° :
un demi-cercle au soleil couchant, un arc plus court quand il monte.
Arc secondaire pâle aux couleurs inversées, ciel plus clair dedans. Bouton 🌈 à côté de l'horloge
(`RainbowButton.svelte`, `rainbowSpotStore` = sommet de l'arc, publié seulement quand il change) : téléporte sur la case
libre la plus proche (`teleportNextTo`). Réglage « Afficher les arcs-en-ciel ».

**Préréglages et Basique.** Les quatre effets font partie de `GraphicsProfile` : coupés en Basse, actifs au-dessus ; une
case modifiée à la main donne « Personnalisée ». Le mode Basique les coupe tous.

**Piscines en Basique** (`Terrain/BasicPools.ts`). Basique ne dessine pas l'eau du relief, et les piscines tracées
dans l'éditeur (qui n'existent que dans le shader) disparaissaient, comme les piscines-images cachées pour lui. En
Basique : eau fixe de la couleur du style dans ses cases, margelle sur les bords qui ne touchent pas une autre case de
piscine, dans un `Graphics` dessiné une fois (de nouveau si le relief ou les styles changent) ; les piscines-images
sont remontrées.

**Écran noir et saccades au zoom** (corrigés dans la même PR). Écran noir : une texture d'épaisseur détruite
(remplacée en dézoomant) restait liée au shader de l'eau, `ShaderQuad.setupTextures` levait une exception à chaque
rendu. Le reflet est maintenant passé après la météo, et l'eau ne lie jamais une texture absente. La couche lissée
s'efface si le contexte WebGL du jeu est perdu. Saccades (profil CPU pendant un zoom) : `gl.getError()` après chaque
copie de la couche lissée faisait attendre le GPU (41 % du fil principal, retiré) ; `SnowGround` redessinait et
redimensionnait sa texture à chaque image (clé de dessin au zoom exact : 14,5 % en création de framebuffers), zoom
désormais par demi-octave et texture qui ne grandit que par pas de 256 px ; le masque « dehors » des nuages n'est plus
recréé à chaque image ; la couche lissée attend que le canvas du jeu garde sa taille 150 ms avant de se recréer.
Restent, d'origine : le redimensionnement du canvas par `WaScaleManager` et `smoothWeights` du sol quand la zone change.

**Carte du monde de l'horloge** préchargée avec l'horloge (elle apparaissait d'un coup à la première ouverture).

**La glace qui casse** (`Ice/IceBreaks.ts`, `Ice/FrozenWater.ts`, `Ice/IceHold.ts`, `CatastropheManager.iceBreak`).
La glace a trois états sous un point (`IceState`) : aucune, fine, solide. Glace du serveur : solide dès 50 mm sur une
eau où l'on nage (`ICE_BEARS_MM`), fine de 5 à 50 mm (avant : elle ne portait pas du tout, on passait à la nage sans
rien voir). Météo personnelle : épaisseur lue du froid du moment (`ownIceMm`, pas d'historique : elle porte dès
-7,5 °C). Sur une glace fine, des fissures s'étendent sous l'avatar (1,2 s au même endroit), puis elle cède : un trou
d'eau libre de 24 px (bord irrégulier, éclats de glace), qui regèle en 2 minutes. Glace du serveur : le client
envoie `CATASTROPHE_ICE_BREAK` (une valeur de plus de `CatastropheKind`, même message que les catastrophes, une casse
par seconde par joueur), le serveur casse la glace d'une tuile autour par `meadow.shatter` (comme une comète) et le
dit à la salle, qui ouvre le même trou. Météo personnelle : trou local. Les piscines gèlent en surface dès -3 °C
(`POOL_ICE_DEPTH_PX` 8 px au lieu de 32, qui attendait -8,25 °C). La glace du serveur épaissit deux fois plus vite que
l'horloge de la neige (`ICE_GROWTH_TIMES` = 2). Sur l'horloge ×600 d'alors, elle portait le woka en 1 min 30 environ
à -3 °C ; depuis le 2026-11-22, l'horloge est celle de l'eau de la carte, temps réel par défaut : 14 h à -3 °C
(14 min à « Vitesse de l'eau » 60). **Depuis le 2026-11-22, le trou de la glace du serveur n'a plus d'horloge à lui**
(demande de l'utilisateur : « se referme en 2 minutes, c'est un peu rapide, on peut pas faire réaliste ? »).
Quand la glace casse, le serveur remet à 0 la glace des tuiles du trou (`Meadow.breakIce`, déjà le cas avant). Le trou
regèle ensuite par la loi de la glace de la carte, à la vitesse de son eau et selon son air. En temps réel à −10 °C,
cela fait un voile en deux minutes, la glace où l'on glisse (5 mm) en une dizaine de minutes environ, et une glace qui
porte un marcheur au bout de quelques heures. Le trou ne regèle jamais pendant un dégel.

Côté navigateur, le trou rond reste de l'eau libre tant que le serveur ne garde pas de glace en son centre. Il se
referme à mesure que cette glace revient, et disparaît à 5 mm (`ICE_SLIPS_MM`) : à partir de là, c'est le dessin de la
glace mince du serveur qui prend le relais. On retombe dans un trou encore ouvert. Entre 5 et 50 mm, la glace fine
craque de nouveau sous l'avatar ; elle porte de nouveau à 50 mm. Pendant les 10 premières secondes, le temps que la
salle reçoive la glace cassée, le trou reste ouvert quoi que dise la glace qu'elle connaissait
(`HOLE_CONFIRM_MS`). La scène ne se redessine que si les fissures ou les trous changent, pas à chaque image : un trou
peut rester ouvert des heures. La comète passe par le même chemin, `shatter`. En météo personnelle ou en sol local, le
trou garde son horloge de deux minutes (`HOLE_OPEN_MS`) : il n'y a pas de glace du serveur.

**Herbe dès l'arrivée** (`back/src/Model/MeadowManager.ts`, `GameScene.groundStatesOfJoinApplied`). Le premier joueur
d'une salle recréée recevait un sol nu : `snapshot()` ne rendait que l'état déjà diffusé, vide jusqu'au premier pas de
la prairie. Mesuré : entrée à 4,0 s sans prairie, herbe à 13,2 s (premier message périodique, toutes les 10 s). Le
snapshot écrit désormais l'état courant si rien n'a été diffusé (toujours rien pour une carte nue et sèche) ; la carte
attend la prairie et l'eau reçues à l'entrée (décompression) avant de s'afficher, 2 s au plus. Après : herbe à 4,4 s.

## Conditions réglées à la main : les extrêmes

Depuis le 2026-11-21, les conditions réglées à la main dans la salle (Catastrophe → Météo) vont de **−80 à +80 °C**
pour la température et de **0 à 250 km/h** pour le vent (avant −10 à 50 °C et 0 à 120 km/h) ; l'humidité reste de 0
à 100 %, les seuils du feu ne changent pas. Les bornes ne vivent qu'à un endroit, `FIRE_CONDITION_BOUNDS`
(`libs/map-editor/src/Weather/FireConditions.ts`) : le curseur, le serveur (`boundedFireConditions`, une valeur
au-delà est ramenée à la borne) et le tableau « Météo expliquée » (bornes de ses recherches de seuil) les lisent.
Chaque curseur de condition a deux boutons − et + qui la déplacent d'un cran (un degré, un point, un km/h), le
curseur gardant un cran par pixel environ. Le protocole ne change pas (champs `double`).

Ce que donne chaque règle aux extrêmes, figé par `libs/map-editor/tests/WeatherExtremes.test.ts` et
`play/tests/front/Phaser/Game/Weather/WeatherExtremes.test.ts` :

- **neige ou pluie** : toute précipitation est de la neige par −20 °C et en dessous, de la pluie dès 6 °C. Le
  thermomètre mouillé (`wetBulbTemperature`) suit l'ajustement de Stull de −20 à 50 °C ; au-delà il est tiré des
  formules psychrométriques de l'OMM (WMO-No. 8, 2018, annexe 4.B, éq. 4.B.8 et 4.B.9, au niveau de la mer) : Stull
  donnait −48 °C pour un air à −80 °C et 5 %, l'équation donne −80 °C. Le passage à −20 °C saute de moins de 4 °C
  (l'erreur de Stull dans un air froid et sec), sans effet sur la neige ;
- **givre** : les formes de Magnus de l'OMM sont gardées hors de leur domaine annoncé (eau −45 à 60 °C, glace −65 à
  0 °C) : elles restent à moins de 2,5 % des pressions de vapeur de Murphy et Koop (2005) de −80 à +80 °C, et à 1,5 %
  des tables de vapeur à 80 °C (474,2 hPa, Wagner et Pruss 2002). Par −80 °C le sol ne blanchit que si l'air est saturé sur la glace ; jamais par +80 °C.
  Le vent retient le givre en ôtant le refroidissement du sol ; au-delà de 120 km/h (l'ancienne borne, rien ne change
  en dessous), une tempête l'arrache : il s'efface jusqu'à disparaître à 250 km/h (`FROST_SWEPT_FROM_KMH`,
  `FROST_SWEPT_KMH`, un choix : le givre de surface est un dépôt fragile d'air calme, UBC « Surface hoar ») ;
- **sol** gelé tout entier dès −1 °C, **eau** gelée tout entière dès −15 °C (glace du navigateur) ; la glace du
  serveur (#429) prend le lac jusqu'au fond en quelques pas par −80 °C et 250 km/h sans dépasser son eau, et fond
  d'environ 108 mm par pas par +80 °C (loi de Stefan intégrée pas à pas : par grand froid et grand vent, le premier
  pas surestime l'épaisseur, bornée par l'eau et par 1 m) ;
- **neige au sol** : par +80 °C, un air humide et 250 km/h, elle fond à 324 mm d'eau par heure réelle, environ
  108 mm par pas de 2 s du jeu (une neige de 600 mm part en une vingtaine de secondes) ; aucune fonte sous 0 °C ;
- **feu** : danger nul par grand froid, maximal par +80 °C, air sec et grand vent. La tête du feu plafonne toujours à
  dix cases par pas de 2 s (atteint dès 125 km/h, environ 20 km/h de course, Cheney et Cruz), les braises des arbres
  à quarante cases (dès 120 km/h) : à 250 km/h le feu ne va pas plus vite qu'à 125 et ne traverse jamais la carte en
  un pas ; flancs et arrière presque immobiles ;
- **navigateur** : nuages à 180 px/s au plus (dès 60 km/h), arbres couchés et feuilles au plus fort dès 80 km/h
  (`TreePoses`, `TreeLeafFall`), feuilles au sol au palier le plus fort dès 50 km/h, pluie penchée d'un pixel par
  pixel au plus (dès 60 km/h), flammes couchées dès 60 km/h, fumée portée au plus dès 60 km/h : tous plafonnés, rien ne déborde.

Le schéma de la météo réelle (`RealWeatherSlot`) ne borne pas la température et accepte un vent jusqu'à 500 km/h :
un lieu réel extrême n'est pas rejeté. Rien de ces conditions n'est enregistré ; un ancien `back` ramènerait la
valeur à ses anciennes bornes (le curseur revient alors sur ce que le serveur annonce) : `play` et `back` vont
ensemble.
