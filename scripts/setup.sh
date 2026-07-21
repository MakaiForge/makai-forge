#!/bin/bash
# Makai forger Setup & Restore
# ============================
# 1. Salva sua interface num cofre separado (fora do projeto)
# 2. Reinstala node_modules do zero (electron, tudo)
# 3. Restaura sua interface por cima
# 4. Builda
#
# Uso: bash makai-forger-setup.sh

set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")/.."
APP_DIR="$(pwd)"
BACKUP_DIR="$(dirname "$APP_DIR")/makai-forger-interface-backup"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}   Makai forger Setup & Restore${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# -----------------------------------------------------------
# PASSO 1: Salvar interface num cofre separado
# -----------------------------------------------------------
echo -e "${YELLOW}[1/5] Salvando sua interface no cofre...${NC}"

mkdir -p "$BACKUP_DIR" 2>/dev/null

tar -c \
  --exclude='node_modules' \
  --exclude='out' \
  --exclude='dist' \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
 --exclude='app/_data/games-data' \
 --exclude='games-with-downloads' \
  --exclude='cache' \
 --exclude='app/_data/releases' \
 --exclude='app/_data/sources' \
  --exclude='logs' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.log' \
  --exclude='proton_data.db' \
   --exclude='scripts/setup.sh' \
  -C "$APP_DIR" . | tar -xC "$BACKUP_DIR"

echo -e "  ${GREEN}✓ Interface salva em: $BACKUP_DIR${NC}"

# -----------------------------------------------------------
# PASSO 2: Verificar node_modules e reinstalar se necessário
# -----------------------------------------------------------
echo -e "${YELLOW}[2/5] Verificando node_modules...${NC}"

if [ ! -f "node_modules/electron/dist/electron" ]; then
  echo -e "  ${YELLOW}Electron não encontrado. Tentando reinstalar...${NC}"
  if command -v npm &>/dev/null; then
    npm install --legacy-peer-deps 2>&1 | tail -5
    echo -e "  ${GREEN}✓ Dependências reinstaladas${NC}"
  elif command -v yarn &>/dev/null; then
    yarn install --ignore-scripts 2>&1 | tail -5
    yarn install 2>&1 | tail -5
    echo -e "  ${GREEN}✓ Dependências reinstaladas${NC}"
  else
    echo -e "  ${RED}ERRO: yarn/npm não encontrado${NC}"
    exit 1
  fi
else
  echo -e "  ${GREEN}✓ node_modules OK${NC}"
fi

# -----------------------------------------------------------
# PASSO 3: Restaurar interface do cofre
# -----------------------------------------------------------
echo -e "${YELLOW}[3/5] Restaurando sua interface do cofre...${NC}"

tar -c \
  --exclude='node_modules' \
  --exclude='out' \
  --exclude='dist' \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
 --exclude='app/_data/games-data' \
 --exclude='games-with-downloads' \
  --exclude='cache' \
 --exclude='app/_data/releases' \
 --exclude='app/_data/sources' \
  --exclude='logs' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.log' \
  --exclude='proton_data.db' \
  -C "$BACKUP_DIR" . | tar -xC "$APP_DIR"

echo -e "  ${GREEN}✓ Interface restaurada${NC}"

# -----------------------------------------------------------
# PASSO 4: Consertar symlinks do electron-vite
# -----------------------------------------------------------
echo -e "${YELLOW}[4/5] Reparando symlinks...${NC}"

fix_symlink() {
  local bin_name="$1"
  local target="$2"
  local binpath="node_modules/.bin/$bin_name"
  # target deve ser relativo a node_modules/, ex: electron-vite/bin/electron-vite.js
  # symlink de .bin/ -> ../target
  if [ ! -L "$binpath" ] || [ "$(readlink "$binpath")" != "../$target" ]; then
    rm -f "$binpath"
    ln -s "../$target" "$binpath"
  fi
}

fix_symlink "electron-vite" "electron-vite/bin/electron-vite.js"
echo -e "  ${GREEN}✓ Symlinks OK${NC}"

# -----------------------------------------------------------
# PASSO 5: Buildar
# -----------------------------------------------------------
echo -e "${YELLOW}[5/5] Compilando...${NC}"
echo ""

if npm run build 2>&1; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}   Makai forger pronto!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "  Para iniciar: ${CYAN}bash start-makaiforger.sh${NC}"
  echo -e "  Cofre da interface: ${CYAN}$BACKUP_DIR${NC}"
  echo ""
else
  echo -e "${RED}Falha na compilação. Verifique os erros acima.${NC}"
  exit 1
fi
