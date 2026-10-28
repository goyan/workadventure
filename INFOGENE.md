# Contribuer au fork Infogène de WorkAdventure

Ce dépôt est un fork de [workadventure/workadventure](https://github.com/workadventure/workadventure) (base `v1.32.6`)
qui alimente notre WorkAdventure interne. Seul le service **`play`** (front + pusher) est notre image ; le reste est officiel.
Les conventions de code de WorkAdventure sont dans `AGENTS.md` / `play/AGENTS.md`.

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
Tenir cette liste à jour à chaque patch.

### Valider la notification en beta

Ouvrir une session après le déploiement du patch, puis garder l'onglet ouvert pendant le déploiement beta suivant.
Le bandeau doit apparaître sans interrompre le jeu ; « Plus tard » le masque et « Rafraîchir » recharge la page.
Un onglet resté en arrière-plan doit détecter la mise à jour à son retour. Une panne réseau ou une réponse
invalide de `/build-version` ne doit pas annoncer de nouvelle version.
