#!/bin/bash
# Makai Forge Launcher

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

echo "=== Makai Forge ==="
echo "1 - Dev (npm run dev)"
echo "2 - Build (electron-vite build)"
echo "3 - Instalar CompactFlow (sincronizar standalone → Makai Forge + integração)"
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
    echo "Sincronizando CompactFlow (standalone → Makai Forge)..."
    node scripts/install-compactflow.cjs
    echo ""
    echo "Deseja instalar a integração com o gerenciador de arquivos?"
    echo "Isso permite: clique direito em .exe → Abrir com CompactFlow"
    read -p "Instalar? (s/N): " answer
    if [ "$answer" = "s" ] || [ "$answer" = "S" ]; then
      bash app/_resources/compact-flow/scripts/install-integration.sh --dev
    fi
    echo ""
    echo "Deseja abrir o CompactFlow agora?"
    read -p "Abrir? (s/N): " openanswer
    if [ "$openanswer" = "s" ] || [ "$openanswer" = "S" ]; then
      CF_SRC="/mnt/926f111f-fdf6-4067-ac31-32f732441bac/MAKAI/compact-flow"
      if [ -f "$CF_SRC/run.sh" ]; then
        bash "$CF_SRC/run.sh"
      else
        echo "CompactFlow não encontrado em $CF_SRC"
      fi
    fi
    ;;
  *)
    echo "Opção inválida"
    exit 1
    ;;
esac
