# Nature et saisons

Dans **Outils → Éditer la carte → Objets → Nature**, les 58 arbres suivent automatiquement la date et la météo du serveur, y compris les anciens arbres verts et les modèles nommés « enneigés ». Le sélecteur Nature propose uniquement les arbres. Les anciens sols et décors restent résolvables pour les cartes qui les utilisent déjà.

Les saisons météorologiques de l’hémisphère nord commencent le 1er mars, juin, septembre et décembre, à minuit en Europe/Paris. Le réglage personnel jour/nuit ne change pas les arbres. Sans première synchronisation du serveur, le feuillage d’été sert de repli ; une coupure ultérieure conserve la dernière heure serveur connue.

Les quatre images de chaque arbre saisonnier gardent les mêmes dimensions et le même ancrage du tronc. Les arbres mesurent environ 68 % de leur taille initiale, et les arbres nus environ 51 %. Leurs collisions et décalages de profondeur suivent la réduction et restent fixes lorsque le feuillage change. La date et la météo sont vérifiées aux minutes du serveur ; un changement manuel de météo est appliqué immédiatement. Les sprites sont actualisés seulement quand leur variante change. Les textures sont partagées entre les arbres d’un même modèle, et leur chargement utilise le chargeur annulable existant de la scène.

## Assets

Les 47 objets viennent de la planche `tree_nature.png` fournie pour cette fonctionnalité. Les PNG sont réduits au voisin le plus proche pour conserver des pixels nets et la transparence RGBA. Le découpage initial, avant la réduction des arbres, peut être reproduit avec Pillow :

```sh
python3 play/scripts/import-seasonal-nature.py /chemin/tree_nature.png
```

Les catalogues peuvent déclarer `seasonal` avec les quatre chemins `spring`, `summer`, `autumn`, `winter`, relatifs au catalogue. Les images doivent avoir des dimensions et un ancrage identiques. Une définition incomplète ou invalide est ignorée et conserve l’image ordinaire ; les anciens catalogues restent compatibles.

## Vérification locale

Placer un « Arbre saisonnier » et un sapin dans Nature. En novembre sans neige, le premier devient orange et le sapin reste vert, même sous la pluie. Activer la neige les fait passer aux variantes blanches fournies ; revenir à la pluie retire la neige des arbres. Les arbres nus gardent leurs branches, les sapins et palmiers gardent leur feuillage. Changer son réglage personnel jour/nuit ne doit pas modifier ces arbres. Recharger la carte doit conserver les arbres placés et leur position. Les tests couvrent les frontières des quatre saisons, le fuseau Paris, les chemins du catalogue, les dimensions des PNG, la collision fixe et le repli pendant le chargement.

## Herbe et neige progressive

Le catalogue conserve 114 définitions, dont 58 arbres proposés dans le sélecteur, tous automatiques, des arbres et décors enneigés, et des sols issus des trois planches supplémentaires. Les PNG conservent leur transparence. `play/scripts/import-snow-nature.py /chemin/Downloads` complète le premier import.

Le réglage personnel « Sol extérieur » propose une herbe verte permanente (par défaut), ou un sol suivant la saison et la météo, avec un automne orangé. Trois textures raccordables, herbe verte, automne et neige, sont extraites des portions sans décoration de la planche fournie par `play/scripts/import-ground-textures.py /chemin/terrain.png`. Leurs bords opposés sont identiques et vérifiés lors de l’import. Les textures de sol sont masquées dans le sélecteur Nature.

Le fond extérieur déclaré `exteriorTexture` comme herbe est aussi remplacé hors de la map. Les zones entièrement herbeuses sont dessinées par blocs ; seuls les blocs qui touchent des sols intérieurs sont découpés en cellules. La neige s’accumule uniformément en dix minutes, sans plaques carrées. Le cycle automatique la fait fondre en dix minutes pendant la phase claire suivante. Les anciennes cartes configurées en neige sans date conservent leur couverture complète jusqu’au prochain changement de météo, uniquement pendant les mois froids.

La neige est autorisée de novembre à mars, selon le calendrier Paris. D’avril à octobre, une phase automatique de neige ou un réglage manuel « Neige » produit de la pluie : ni particules de neige, ni couverture du sol, ni arbre enneigé. En hiver sans neige, les arbres utilisent leur variante sans neige ; le calendrier seul ne les rend plus blancs. Pendant la fonte d’une phase automatique, les arbres restent enneigés jusqu’à disparition de la couverture.

`play/scripts/link-tree-weather.py` relie les IDs existants aux images vertes, orange et blanches fournies. Les variantes sont préparées sur des PNG de mêmes dimensions, avec le même ancrage du tronc ; aucune image orange enneigée n’est inventée. Après réimport des planches, relancer ce script. Il ne génère aucune texture par utilisateur ou par frame dans le navigateur.

Seuls les tilesets `grass`/`herbe`, les tuiles explicitement marquées `footstepSound: grass`, et les sols d’entités marqués herbe reçoivent le rendu. Les sols bois, pierre, moquette et carrelage restent dégagés. Les sols personnalisés sans métadonnées doivent déclarer `footstepSound`.

Le rendu utilise une texture de la zone visible, plafonnée à 2048 × 2048 pixels, sous les objets et personnages. Il ne crée aucun objet ni timer par cellule. Une marge autour de la caméra permet de réutiliser le rendu pendant les petits déplacements. Tout déplacement ou dézoom qui dépasse cette marge déclenche un redessin immédiat ; les sols sont revérifiés toutes les deux secondes. La texture est détruite avec le gestionnaire météo. Le réglage personnel des effets météo permet de désactiver le rendu.
