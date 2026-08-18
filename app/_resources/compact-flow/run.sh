#!/bin/bash
# CompactFlow standalone — launcher de desenvolvimento
# Usa o electron local se existir; senão, o electron do Makai Forge (fallback).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ -x "$DIR/node_modules/.bin/electron" ]; then
  exec "$DIR/node_modules/.bin/electron" . "$@"
fi

MF_CANDIDATES=(
  "${MAKAI_FORGE_DIR:-}"
  "$HOME/Documentos/Makai_forge"
  "$HOME/Documents/Makai_forge"
  "/opt/makai-forger"
  "/usr/lib/makai-forger"
)
for mf in "${MF_CANDIDATES[@]}"; do
  [ -z "$mf" ] && continue
  if [ -x "$mf/node_modules/.bin/electron" ]; then
    exec "$mf/node_modules/.bin/electron" . "$@"
  fi
done

echo "CompactFlow: Electron não encontrado." >&2
echo "Rode 'npm install' nesta pasta (instala o electron) ou aponte MAKAI_FORGE_DIR." >&2
exit 1
