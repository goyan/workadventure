#!/bin/bash
# Removes the Infogene WorkAdventure companion: background task, program, token and settings.
set -uo pipefail
LABEL="fr.infogene.wa-companion"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
security delete-generic-password -s infogene-wa-companion >/dev/null 2>&1
rm -rf "$HOME/Library/Application Support/InfogeneCompanion"
echo "Compagnon désinstallé. Pensez à révoquer son jeton dans le jeu (panneau Agenda > Gérer)."
