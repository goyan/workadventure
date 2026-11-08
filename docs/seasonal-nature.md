# Nature et saisons

Dans **Outils → Éditer la carte → Objets → Nature**, les deux « Arbre saisonnier » suivent automatiquement la date du serveur. Les autres objets de la planche restent disponibles avec leur apparence fixe : arbres, feuillages, sapins, cyprès, saules, palmiers, buissons, fleurs, rochers et souche.

Les saisons météorologiques de l’hémisphère nord commencent le 1er mars, juin, septembre et décembre, à minuit en Europe/Paris. Le réglage personnel jour/nuit ne change pas les arbres. Sans première synchronisation du serveur, le feuillage d’été sert de repli ; une coupure ultérieure conserve la dernière heure serveur connue.

Les quatre images de chaque arbre saisonnier gardent un canevas de 192 × 288 pixels et le pied du tronc à (96, 248). La collision de 16 × 10 pixels et le tri de profondeur restent fixes lorsque le feuillage change. La date est vérifiée une fois par minute ; les sprites sont actualisés seulement au changement de saison. Les textures sont partagées entre les arbres d’un même modèle, et leur chargement utilise le chargeur annulable existant de la scène.

## Assets

Les 47 objets viennent de la planche `tree_nature.png` fournie pour cette fonctionnalité. Les PNG conservent la résolution native et les pixels RGBA, sans redimensionnement ni compression avec perte. Le découpage peut être reproduit avec Pillow :

```sh
python3 play/scripts/import-seasonal-nature.py /chemin/tree_nature.png
```

Les catalogues peuvent déclarer `seasonal` avec les quatre chemins `spring`, `summer`, `autumn`, `winter`, relatifs au catalogue. Les images doivent avoir des dimensions et un ancrage identiques. Une définition incomplète ou invalide est ignorée et conserve l’image ordinaire ; les anciens catalogues restent compatibles.

## Vérification locale

Placer un « Arbre saisonnier » et un sapin dans Nature. En novembre, le premier devient orange et le sapin reste vert. Changer son réglage personnel jour/nuit ne doit pas modifier ces arbres. Recharger la carte doit conserver les arbres placés et leur position. Les tests couvrent les frontières des quatre saisons, le fuseau Paris, les chemins du catalogue, les dimensions des PNG, la collision fixe et le repli pendant le chargement.
