#!/bin/bash
# Makai Forge Launcher

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "=== Makai Forge ==="
echo "1 - Dev (npm run dev)"
echo "2 - Build (electron-vite build)"
echo ""
read -p "Escolha: " opt

case "$opt" in
  1)
    exec npm run dev
    ;;
  2)
    exec npm run build
    ;;
  *)
    echo "Opção inválida"
    exit 1
    ;;
esac
