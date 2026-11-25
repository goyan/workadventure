# Zombies

`zombie-homme-veste.png`, `zombie-femme-torse.png` et `zombie-femme-jupe.png` ont été dessinées par l'utilisateur du fork
pour ce projet. Elles sont extraites de ses planches : chaque case est découpée, la grille de pixels d'origine retrouvée,
puis la case est réduite au plus proche voisin.

Chaque feuille a une rangée par animation : IDLE, WALK, ATTACK, HURT, DEAD. Les personnages sont vus de profil et
regardent à droite ; leurs pieds sont centrés sur le bas de leur case. Les tailles de case et les nombres d'images sont
dans `play/src/front/Phaser/Game/Catastrophe/ZombieSheets.ts`.
