# Audit mémoire serveur — 8 novembre 2026

Audit du backend, du pusher et de map-storage, sur la base `infogene` `379bdc19`.
La PR est ensuite rebasée sur `c9fcde73`, après fusion du travail saisonnier.
Les défauts ci-dessous sont vérifiés dans le code et par des régressions automatisées.
Les mesures portent sur une pile locale et un scénario synthétique ; aucun profil de production n'a été collecté.

## Rétentions corrigées

| Composant                                     | Déclencheur et cause                                                                                                                                                                             | Correction et preuve                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back : invitations                            | Les invitations non acceptées restent dans le journal. Le contrôle filtre les dates sans retirer les anciennes entrées. Les expéditeurs qui ne reviennent pas restent aussi conservés.           | Purge des entrées de plus de dix minutes et balayage des expéditeurs expirés, au plus une fois par minute d'activité. Le scénario de 1 000 anciens expéditeurs et deux actifs conservait 1 002 journaux ; il en conserve maintenant deux. Les seuils existants, la fenêtre et l'effacement après acceptation sont testés. Les déconnexions ne réinitialisent pas les quotas. |
| Pusher : quotas de création et de modèles     | Les historiques ne sont filtrés que lorsque leur utilisateur revient. La création réinscrit même les historiques vides.                                                                          | Purge des identifiants expirés au plus une fois par minute d'activité. Les tests passent de 1 001/1 002 identifiants à 1/2 actifs. Les quotas horaires, les réservations concurrentes et la restitution d'une réservation après échec restent couverts.                                                                                                                      |
| Back : statistiques des espaces               | `worldStats` est enregistré avec `space.name` et supprimé avec `space.world`. Les labels Prometheus survivent aux espaces. Deux espaces du même monde écrasent aussi leurs compteurs respectifs. | Deltas par espace, total par monde en O(1), retrait des statistiques et labels quand ils deviennent vides. Après 1 000 créations/suppressions : zéro entrée et zéro label résiduel. Deux espaces de 2 et 3 émetteurs donnent 5 ; supprimer le premier conserve 3. Les noms des métriques restent identiques.                                                                 |
| Map-storage : catalogue                       | Le nettoyage du limiteur est exécuté à l'intérieur de sa tâche, alors que `p-limit.activeCount` vaut encore 1.                                                                                   | Nettoyage après résolution/rejet du limiteur. Après 100 domaines : zéro limiteur au lieu de 100. Échec d'écriture et sérialisation de deux requêtes sur le même domaine sont testés.                                                                                                                                                                                         |
| Map-storage : uploads                         | PUT/PATCH lisent le limiteur sous le chemin brut mais l'enregistrent sous le chemin du domaine. Un rejet saute le nettoyage après `await`.                                                       | Une même clé de stockage pour lecture/écriture et une finalisation partagée entre ZIP, PUT et PATCH. Tests de 100 clés, d'un échec et de deux tâches concurrentes : aucun limiteur inactif résiduel, tâches du même stockage sérialisées.                                                                                                                                    |
| Map-storage : cartes chargées par une édition | Une édition refusée, ou sans changement, charge une WAM sans programmer l'éviction associée aux commandes. La carte reste alors en cache.                                                        | Libération à la fin de l'opération sous verrou, seulement sans sauvegarde ni historique de commandes en attente. Les opérations encore actives sont comptées car un timeout du verrou ne les annule pas. Tests de refus, absence de modification, sauvegarde en attente et chevauchement après timeout.                                                                      |

Les balayages sont déclenchés par l'activité : en période totalement inactive, les dernières entrées expirées peuvent rester jusqu'à la prochaine requête. Aucun intervalle global ni nouvelle dépendance n'est ajouté.

## Réduction de la mémoire transitoire du catalogue

`Promise.allSettled` conservait chaque WAM complète jusqu'à la fin de toutes les lectures.
Le catalogue n'utilise que `mapUrl`, `metadata` et `vendor` : les résultats des lectures conservent maintenant ces trois champs.
La migration, la validation complète des WAM, la limite des lectures parallèles, les erreurs par fichier et les webhooks restent en place.

Mesure Node **24.20.0**, deux processus indépendants, **80 cartes de 2 000 zones** avec un nom de zone de 1 000 espaces supplémentaires. La dernière lecture est suspendue pendant un tour de boucle ; un GC forcé mesure les objets des lectures déjà terminées. Ce cas volontairement lourd mesure une rétention, pas le pic total de parsing ni la latence utilisateur.

| Heap JavaScript                                 |      Avant |     Après |
| ----------------------------------------------- | ---------: | --------: |
| Avant les lectures                              |  39,54 Mio | 39,36 Mio |
| Pendant la dernière lecture suspendue, après GC | 219,43 Mio | 39,59 Mio |
| Surplus retenu                                  | 179,89 Mio |  0,24 Mio |

Pour comparer l'ancien code, un module temporaire reprenait sa méthode de génération ; seul `listFiles` utilisait le système de fichiers injecté, afin de lui donner exactement les mêmes données synthétiques. Les modules temporaires ont été retirés.

Le scénario de la version corrigée est conservé dans [`benchmark/server-map-catalogue-memory.mjs`](../../benchmark/server-map-catalogue-memory.mjs). Il ne contacte aucun serveur et vérifie que les 80 cartes apparaissent dans le catalogue. Depuis la racine, après installation des workspaces npm :

```sh
API_URL=http://admin.test MAP_STORAGE_API_TOKEN=test PUSHER_URL=http://play.test \
TSX_TSCONFIG_PATH=map-storage/tsconfig-node.json \
node --expose-gc --import tsx benchmark/server-map-catalogue-memory.mjs
```

Le gain varie avec la taille et le nombre des cartes. Il n'implique aucune réduction de contenu, de résolution ou de qualité audio/vidéo.

## Observations locales et limites

À l'instant du relevé Docker : `play` **3,47 Gio**, `back` **241,2 Mio**, `map-storage` **294,5 Mio**.
`play` lance aussi Vite, les vérifications Svelte/TypeScript et le build iframe surveillé. La somme du conteneur ne représente donc pas la RAM du seul pusher de production. Un relevé isolé ne prouve aucune fuite.

Les chemins de fermeture des salons, des espaces, des flux et des abonnements ont été relus avec leurs tests existants. Aucune fuite globale de salons n'est démontrée par cet audit. Les caches de textures du navigateur signalés dans [l'audit précédent](2026-11-07-memory-audit.md) sont hors de ce périmètre serveur ; le défaut des invitations P1 de ce rapport est corrigé ici.

La sécurité de persistance reste une limite distincte : le mécanisme préexistant de timeout de verrou n'annule pas une commande lente, et les timers de sauvegarde/éviction existants ne remplacent pas une transaction. Cette PR protège sa nouvelle libération du chevauchement après timeout ; elle ne refond pas le protocole d'édition ou de sauvegarde.

## Validation

- Front/pusher : 2 471 tests réussis, 10 ignorés ; types, Svelte, traductions, lint et formatage.
- Back : 364 tests réussis, 2 ignorés ; types, lint et formatage des fichiers modifiés.
- Map-storage : 81 tests réussis ; types, lint complet et formatage des fichiers modifiés.
- Contrats partagés : vérification TypeScript.
- Tests ajoutés : churn des espaces/domaines/identifiants, conservation des quotas, sérialisation, erreurs, conservation des sauvegardes et timeout concurrent.

## Vérification à prévoir sur une charge représentative

Utiliser un environnement de test, les mêmes cartes et la même charge pour comparer les deux versions. Faire plusieurs cycles de connexions/déconnexions et d'éditions, puis laisser expirer les fenêtres d'une minute, dix minutes et une heure. Tester aussi les écritures lentes et les échecs de stockage.

Pour back et pusher, les collecteurs Prometheus existants exposent déjà la mémoire du processus, le heap et le GC via `/metrics`, sous leur authentification actuelle. Comparer notamment `process_resident_memory_bytes` et `nodejs_heap_size_used_bytes` avec les nombres de salons, sockets et espaces actifs. La RSS peut rester haute malgré des objets libérés : vérifier le heap après GC et les objets retenus avant de conclure à une fuite.

Pour map-storage, relever la mémoire du processus et profiler les chargements WAM/catalogues dans cet environnement de test. Faire des snapshots avant/après plusieurs cycles lorsque la charge revient au même niveau ; rechercher les `Map`, WAM et callbacks dont le nombre augmente à chaque cycle. Les snapshots peuvent contenir des données de session : conserver ces artefacts en accès restreint. Aucun dump de données de production n'a été créé pour cet audit.
