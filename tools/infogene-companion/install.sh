#!/bin/bash
# Installs the Infogene WorkAdventure companion for the current macOS user.
# Usage: bash <(curl -fsSL <raw url>/install.sh) --url https://wa-beta.goyan.fr
# The token created in the game is typed when asked (never on the command line).
set -euo pipefail

RAW_BASE="https://raw.githubusercontent.com/goyan/workadventure/infogene/tools/infogene-companion"
LABEL="fr.infogene.wa-companion"
SUPPORT="$HOME/Library/Application Support/InfogeneCompanion"
APP="$SUPPORT/InfogeneCompanion.app"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

url=""
while [ $# -gt 0 ]; do
    case "$1" in
        --url) url="${2:-}"; shift 2 ;;
        *) echo "Option inconnue : $1" >&2; exit 2 ;;
    esac
done
case "$url" in
    https://*) url="${url%/}" ;;
    *) echo "Indiquez l'adresse du jeu : --url https://wa-beta.goyan.fr" >&2; exit 2 ;;
esac
command -v swiftc >/dev/null || { echo "Installez les outils en ligne de commande : xcode-select --install" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
for file in Sources/TeamsLink.swift Sources/Meetings.swift Sources/main.swift Info.plist; do
    mkdir -p "$work/$(dirname "$file")"
    if [ -n "$here" ] && [ -f "$here/$file" ]; then
        cp "$here/$file" "$work/$file"
    else
        curl -fsSL "$RAW_BASE/$file" -o "$work/$file"
    fi
done

printf "Jeton du compagnon (créé dans le jeu, panneau Agenda > Gérer) : "
read -rs token < /dev/tty
echo
case "$token" in wac_*) ;; *) echo "Ce n'est pas un jeton du compagnon (wac_…)." >&2; exit 1 ;; esac

echo "Compilation…"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$HOME/Library/LaunchAgents"
cp "$work/Info.plist" "$APP/Contents/Info.plist"
swiftc -O "$work/Sources/TeamsLink.swift" "$work/Sources/Meetings.swift" "$work/Sources/main.swift" \
    -o "$APP/Contents/MacOS/InfogeneCompanion"
codesign --force --sign - "$APP" >/dev/null

security add-generic-password -U -s infogene-wa-companion -a "$USER" -w "$token"
printf '{"url":"%s"}\n' "$url" > "$SUPPORT/config.json"

echo "macOS va demander l'accès à vos calendriers : acceptez."
open -W -a "$APP" --args authorize || true
"$APP/Contents/MacOS/InfogeneCompanion" status

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array><string>$APP/Contents/MacOS/InfogeneCompanion</string><string>run</string></array>
    <key>StartInterval</key><integer>120</integer>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>$SUPPORT/companion.log</string>
    <key>StandardErrorPath</key><string>$SUPPORT/companion.log</string>
</dict>
</plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installé : vos réunions arrivent dans le jeu d'ici deux minutes. Journal : $SUPPORT/companion.log"
