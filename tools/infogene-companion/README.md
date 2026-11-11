# Compagnon WorkAdventure (macOS)

Lit vos réunions dans le Calendrier de votre Mac (compte Exchange ajouté dans Réglages Système → Comptes Internet)
et les envoie au jeu toutes les deux minutes : titres et bouton **Rejoindre** dans le panneau Agenda, rappel
**Y aller** qui ouvre Teams et vous emmène dans la salle de la réunion, où vous retrouvez les autres invités.

## Installer

1. Dans le jeu : panneau **Agenda** → **Gérer** → **Compagnon Mac** → **Créer un jeton** ; copiez le jeton.
2. Dans le Terminal, lancez la commande affichée sous le jeton, par exemple :
   `bash <(curl -fsSL https://raw.githubusercontent.com/goyan/workadventure/infogene/tools/infogene-companion/install.sh) --url https://wa-beta.goyan.fr`
3. Collez le jeton quand il est demandé (il ne s'affiche pas), puis acceptez l'accès aux calendriers.

Il faut les outils en ligne de commande d'Apple (`xcode-select --install`).

## Ce qui est envoyé

Pour les réunions des **agendas Exchange** (iCloud, abonnements et anniversaires restent sur le Mac) de l'heure
écoulée et des 36 heures à venir, invitations déclinées exclues : titre, début, fin, journée entière, libre ou occupé,
lien Teams et avance de l'alarme. macOS 14 ou plus récent. Rien d'autre (ni participants, ni description). Le jeton est gardé dans le Trousseau ; aucun
identifiant Exchange ne quitte le Mac. Le titre d'une réunion s'affiche sur sa salle pour tous les joueurs quand un
invité y va par « Y aller ».

## Vérifier, désinstaller

- État : `~/Library/Application\ Support/InfogeneCompanion/InfogeneCompanion.app/Contents/MacOS/InfogeneCompanion status`
- Journal (sans titres) : `~/Library/Application Support/InfogeneCompanion/companion.log`
- Désinstaller : `bash <(curl -fsSL …/tools/infogene-companion/uninstall.sh)`, puis révoquer le jeton dans le jeu.

## Développer

`Tests/run.sh` compile la logique (`Sources/TeamsLink.swift`, `Sources/Meetings.swift`) avec les tests et les exécute.
