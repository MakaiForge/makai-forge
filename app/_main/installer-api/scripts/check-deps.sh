#!/bin/bash
# Verifica dependências do sistema para Makai Forge + CompactFlow
echo "=== Verificando dependências ==="
echo ""

missing=0

check() {
  local pkg="$1" cmd="$2" install_hint="$3"
  if command -v "$cmd" &>/dev/null; then
    echo "  ✓ $pkg ($(command -v $cmd))"
  else
    echo "  ✗ $pkg — NÃO ENCONTRADO"
    echo "    Instale: $install_hint"
    missing=$((missing + 1))
  fi
}

check "Node.js" "node" "sudo apt install nodejs npm"
check "npm" "npm" "sudo apt install npm"
check "Python 3" "python3" "sudo apt install python3"
check "sqlite3" "sqlite3" "sudo apt install sqlite3"
check "git" "git" "sudo apt install git"
check "tar" "tar" "sudo apt install tar"
check "xdg-mime" "xdg-mime" "sudo apt install xdg-utils"
check "update-desktop-database" "update-desktop-database" "sudo apt install desktop-file-utils"

echo ""
echo "=== Dependências do Electron (runtime) ==="
for lib in libgtk-3-0 libnss3 libxss1 libatk-bridge2.0-0 libdrm2 libgbm1 libasound2t64 libxkbcommon0; do
  dpkg -l "$lib" &>/dev/null && echo "  ✓ $lib" || { echo "  ✗ $lib — NÃO INSTALADO"; missing=$((missing + 1)); }
done

echo ""
echo "=== Dependências do Electron Builder (build) ==="
for lib in libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev; do
  dpkg -l "$lib" &>/dev/null && echo "  ✓ $lib" || { echo "  ✗ $lib — NÃO INSTALADO"; missing=$((missing + 1)); }
done

echo ""
echo "=== Dependências opcionais ==="
check "exe-thumbnailer" "exe-thumbnailer" "sudo apt install exe-thumbnailer"
check "electron-builder" "npx electron-builder" "npm install -g electron-builder"

echo ""
if [ "$missing" -gt 0 ]; then
  echo "⚠️  $missing dependência(s) faltando."
  echo ""
  echo "Para instalar tudo de uma vez no Pop!_OS / Ubuntu:"
  echo "  sudo apt update"
  echo "  sudo apt install -y nodejs npm python3 sqlite3 git tar xdg-utils desktop-file-utils \\"
  echo "    libgtk-3-0 libnss3 libxss1 libatk-bridge2.0-0 libdrm2 libgbm1 libasound2t64 libxkbcommon0 \\"
  echo "    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev exe-thumbnailer"
else
  echo "✅ Todas as dependências encontradas!"
fi
