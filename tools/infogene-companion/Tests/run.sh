#!/bin/bash
# Compiles the companion's logic with the test runner and runs it (no Xcode project needed).
set -euo pipefail
cd "$(dirname "$0")/.."
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
swiftc -O Sources/TeamsLink.swift Sources/Meetings.swift Tests/main.swift -o "$out/tests"
"$out/tests"
