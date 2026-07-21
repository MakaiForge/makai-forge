#!/bin/bash
# compactflow-postinst.sh
# After-install script para Deb/RPM via electron-builder
# Instala a integração do CompactFlow com o sistema de arquivos
#
# Recebe o diretório de instalação como $1 (quando disponível)

set -e

# Tenta descobrir o diretório do app
if [ -n "${1:-}" ] && [ -d "$1" ]; then
  APP_DIR="$1"
elif [ -d "/opt/makai-forger" ]; then
  APP_DIR="/opt/makai-forger"
elif [ -d "/opt/Makai forger" ]; then
  APP_DIR="/opt/Makai forger"
elif [ -d "/usr/lib/makai-forger" ]; then
  APP_DIR="/usr/lib/makai-forger"
else
  echo "[CompactFlow] App directory not found, skipping integration"
  exit 0
fi

CF_SCRIPTS="$APP_DIR/resources/app/_resources/compact-flow/scripts"
CF_INSTALL="$CF_SCRIPTS/install-integration.sh"

if [ -f "$CF_INSTALL" ]; then
  echo "[CompactFlow] Installing desktop integration..."
  bash "$CF_INSTALL" --deb
  echo "[CompactFlow] Done"
else
  echo "[CompactFlow] Integration script not found at $CF_INSTALL"
fi
