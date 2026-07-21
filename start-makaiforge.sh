#!/bin/bash
# Makai Forge Launcher

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "=== Makai Forge ==="
echo "1 - Dev (npm run dev)"
echo "2 - Build (electron-vite build)"
echo "3 - Instalar CompactFlow (copiar do CompactFlow original)"
echo ""
read -p "Escolha: " opt

case "$opt" in
  1)
    exec npm run dev
    ;;
  2)
    exec npm run build
    ;;
  3)
    echo "Instalando CompactFlow..."
    node scripts/install-compactflow.cjs
    echo ""
    echo "Deseja instalar a integração com o gerenciador de arquivos?"
    echo "Isso permite: clique direito em .exe → Abrir com CompactFlow"
    read -p "Instalar? (s/N): " answer
    if [ "$answer" = "s" ] || [ "$answer" = "S" ]; then
      bash app/_resources/compact-flow/scripts/install-integration.sh --dev
    fi
    echo ""
    echo "Use a opção 1 para abrir o Makai Forger com CompactFlow."
    ;;
  *)
    echo "Opção inválida"
    exit 1
    ;;
esac
