# Audit mémoire WorkAdventure — 7 novembre 2026

Audit ciblé du code courant et de la pile Docker locale. Il ne remplace pas un profil de charge en production. Une consommation élevée ou un cache conservé n’est pas automatiquement une fuite.

## Coûts corrigés dans cette modification

- **Ambiances météo décodées au démarrage.** `GameScene.preload` chargeait toutes les ambiances avec Phaser, qui les conserve comme AudioBuffers avec WebAudio. Le nouveau `night_rain.mp3` dure **899,134688 s**, en stéréo **44 100 Hz** (`afinfo`). Son décodage Float32 seul représente environ **302,5 Mio** (durée × fréquence × 2 canaux × 4 octets), avant les autres ambiances et les copies temporaires. Les longues ambiances sont maintenant lues avec HTMLAudio, une seule active ; l’ancienne source est arrêtée puis libérée lors du changement/destroy. Seul le court tonnerre reste préchargé. Les fichiers MP3 sont inchangés : aucune baisse de qualité ni de durée.
- **Textures par couleur de véhicule évitées.** Le skateboard utilise cinq petites textures partagées (contour, bordure, centre, roues, détails), chacune de 512 × 256 pixels : environ **2,5 Mio de pixels RGBA au total** pour tous les utilisateurs, hors overhead/GPU. Les couleurs sont appliquées par tint ; ajouter un utilisateur ou changer sa couleur ne crée aucun atlas. Les sprites sont détruits avec le personnage. La moto et ses grands atlas sont retirés.

## Rétentions présentes dans le code à traiter ensuite

| Priorité | Emplacement | Preuve et limite | Correction proposée sans dégrader le rendu |
|---|---|---|---|
| P1 | `back/src/Model/GameRoom.ts`, `logMeetingInvitationRequest` / `isMeetingInvitationRequestTooHigh` | Le journal ajoute chaque invitation. Le contrôle filtre les dix dernières minutes **sans retirer les anciennes entrées**. La seule purge appelée dans `SocketManager` est celle d’une invitation acceptée. Dans un salon qui reste actif, les invitations non acceptées s’accumulent ; coût CPU du contrôle également croissant. Rétention démontrée par lecture du code, impact RAM sous charge non mesuré. | Purger les entrées expirées avant ajout/contrôle, supprimer les journaux vides et vérifier le départ de l’émetteur. Conserver exactement les limites anti-spam et leur fenêtre. |
| P2 | `play/src/front/Phaser/Entity/Swimwear.ts`, `getSwimwearTexture` | Clé composée de style + couleur + toutes les couches d’avatar. Chaque combinaison génère un canvas 96 × 128 (**48 Kio de pixels**, hors copies/GPU). `SwimwearEffect.destroy` détruit le sprite mais pas la texture globale ; aucune éviction trouvée pour ces clés. Les variations restent dans le TextureManager au-delà du départ de leur utilisateur. | Références par texture active et retrait après la dernière référence, ou cache LRU borné qui ne touche jamais aux textures encore utilisées. Tester recoloration, arrivée/départ et changement de carte avant application. |
| P3 | `SeatedPose.ts` / `MusicHeadphonesEffect.ts` | Textures dérivées conservées globalement : 16 Kio pour une pose assise, jusqu’à 48 Kio pour un casque, hors overhead. Cache borné par le catalogue standard mais davantage de clés avec avatars externes/composites. Ce cache est utile : une recréation par frame serait pire. | Mesurer les clés réellement créées lors de changements répétés de carte/avatar, puis borner les variantes externes seulement. |

## Mesures locales

Avant relance, `docker stats --no-stream` :

- `play` : **5,382 Gio**, CPU **111,34 %** à cet instant.
- `back` : **203,6 Mio**, CPU **0,59 %**.
- `map-storage` : **156,2 Mio**, CPU **0,16 %**.
- `redis` : **6,641 Mio**, CPU **0,11 %**.

`ps` dans `play` attribue environ **2,26 Gio à Vite**, **1,96 Gio au watcher Svelte/TypeScript**, **489 Mio au build iframe surveillé**, **222 Mio au pusher Node**. Le conteneur lance plusieurs outils de développement simultanément. Ces valeurs ne prouvent pas une fuite serveur et ne représentent pas un déploiement de production. La relance conserve encore de lourds watchers : redémarrer ne remplace pas l’analyse.

## Nettoyages vérifiés

- `NightManager` retire ses abonnements ; `ServerNightClock.destroy` annule requêtes et intervalle.
- `CoffeeManager.destroy` annule son intervalle et son abonnement.
- `WeatherManager.destroy` détruit les sons et les graphiques.
- `Character.destroy` retire le callback POST_UPDATE et détruit les effets du personnage.
- Le backend détruit et retire les salons vides de ses deux caches ; le pusher ferme le flux de salon et retire son cache. Le verrou des créations concurrentes est libéré dans `finally`.

Aucune fuite globale de salons n’est démontrée par cette lecture. Il reste à mesurer sous charge les reconnexions, les appels LiveKit et les changements de carte pendant plusieurs heures, avec snapshots de heap avant/après GC, nombres de salons/utilisateurs/abonnements, mémoire GPU et décodage vidéo. Pas de réduction de résolution, d’effets, de fréquence audio ou de qualité des appels proposée sans profil préalable.
