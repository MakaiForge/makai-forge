#!/bin/bash
# install-local.sh — Instala Makai Forger localmente para teste
# Uso: sudo ./install-local.sh
set -euo pipefail

APP_NAME="makai-forger"
INSTALL_DIR="/opt/${APP_NAME}"
BIN_DIR="/usr/bin"
BUILD_DIR="/mnt/926f111f-fdf6-4067-ac31-32f732441bac/Makai_forge"
UNPACKED="${BUILD_DIR}/dist/linux-unpacked"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

info()  { echo -e "${CYAN}[*]${RESET} $1"; }
ok()    { echo -e "${GREEN}[✓]${RESET} $1"; }
warn()  { echo -e "${YELLOW}[!]${RESET} $1"; }
error() { echo -e "${RED}[✗]${RESET} $1"; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  error "Execute como root: sudo $0"
fi

echo -e "${CYAN}"
echo "════════════════════════════════════════════"
echo "  Instalação Local do Makai Forger"
echo "════════════════════════════════════════════"
echo -e "${RESET}"

info "Verificando build..."
if [ ! -d "$UNPACKED" ]; then
  warn "Build não encontrado em $UNPACKED"
  info "Executando build..."
  cd "$BUILD_DIR"
  sudo -u "$SUDO_USER" yarn build:linux 2>&1 || error "Build falhou"
fi

if [ ! -f "${UNPACKED}/makai-forger" ]; then
  error "Binário não encontrado em ${UNPACKED}/makai-forger"
fi

info "Copiando para ${INSTALL_DIR}..."
rm -rf "$INSTALL_DIR"
cp -r "$UNPACKED" "$INSTALL_DIR"
chmod -R 755 "$INSTALL_DIR"
ok "Aplicação instalada em ${INSTALL_DIR}"

info "Criando atalho em ${BIN_DIR}/makai-forger..."
cat > "${BIN_DIR}/${APP_NAME}" << 'LAUNCHER'
#!/bin/bash
exec /opt/makai-forger/makai-forger "$@"
LAUNCHER
chmod 755 "${BIN_DIR}/${APP_NAME}"
ok "Atalho criado"

info "Instalando ícone..."
ICON_SRC="${INSTALL_DIR}/resources/app/_assets/icons/icon.png"
if [ -f "$ICON_SRC" ]; then
  install -Dm644 "$ICON_SRC" /usr/share/icons/hicolor/256x256/apps/${APP_NAME}.png
  ok "Ícone instalado"
else
  warn "Ícone não encontrado, pulando"
fi

info "Instalando .desktop..."
cat > /usr/share/applications/${APP_NAME}.desktop << EOF
[Desktop Entry]
Name=Makai Forger
Comment=Game launcher and compatibility tool
Exec=/usr/bin/${APP_NAME} %f
Icon=${APP_NAME}
Type=Application
Categories=Game;
MimeType=application/vnd.microsoft.portable-executable;application/x-msi;application/x-dosexec;application/x-msdownload;
StartupWMClass=${APP_NAME}
EOF
ok "Desktop entry criado"

info "Registrando MIME types..."
cat > /usr/share/mime/packages/${APP_NAME}.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/vnd.microsoft.portable-executable">
    <comment>Makai Forger executable</comment>
    <glob pattern="*.exe"/>
  </mime-type>
  <mime-type type="application/x-msi">
    <comment>Makai Forger installer</comment>
    <glob pattern="*.msi"/>
  </mime-type>
</mime-info>
EOF
ok "MIME types registrados"

info "Atualizando caches..."
update-desktop-database /usr/share/applications 2>/dev/null || true
gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
ok "Caches atualizados"

echo ""
echo -e "${GREEN}════════════════════════════════════════════${RESET}"
echo -e "${GREEN}  Instalação concluída!${RESET}"
echo -e "${GREEN}════════════════════════════════════════════${RESET}"
echo ""
echo "  Executar:  makai-forger"
echo "  Menu:      Procure por 'Makai Forger'"
echo "  Remover:   sudo /opt/makai-forger/uninstall.sh"
echo ""
