#!/bin/bash
# CompactFlow Desktop Integration Installer
# Instala atalhos, associações MIME e integração com gestores de arquivos
#
# Uso:
#   install-integration.sh --dev       (modo dev, só copia pro projeto)
#   install-integration.sh --deb       (instala em /usr/local - Deb/RPM)
#   install-integration.sh --appimage  (instala em ~/.local - AppImage)
#   install-integration.sh --flatpak   (usa flatpak-spawn --host)
#   install-integration.sh --snap      (usa snapctl + xdg-mime)
#   install-integration.sh --user      (legado, instala em ~/.local)
#   install-integration.sh --system    (legado, instala em /usr/local)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
CF_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:---dev}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}===> CompactFlow Desktop Integration${NC}"
echo -e "Modo: ${MODE}"

# ── Resolver paths por modo ───────────────────────────────────────

case "$MODE" in
  --dev)
    APP_DIR="$CF_DIR"
    BIN_DIR="$CF_DIR/../../scripts"
    DESKTOP_DIR="$HOME/.local/share/applications"
    ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
    UCA_DIR="$HOME/.config/Thunar"
    WRAPPER_SRC="$SCRIPT_DIR/compatflow-wrapper"
    WRAPPER_DST="$BIN_DIR/compatflow"
    ;;
  --deb|--system)
    APP_DIR="/opt/makai-forger"
    BIN_DIR="/usr/local/bin"
    DESKTOP_DIR="/usr/local/share/applications"
    ICON_DIR="/usr/local/share/icons/hicolor/256x256/apps"
    UCA_DIR="/etc/xdg/xfce4/Thunar"
    WRAPPER_SRC="$SCRIPT_DIR/compatflow-wrapper"
    WRAPPER_DST="$BIN_DIR/compatflow"
    ;;
  --appimage|--user)
    APP_DIR="$HOME/.local/opt/makai-forger"
    BIN_DIR="$HOME/.local/bin"
    DESKTOP_DIR="$HOME/.local/share/applications"
    ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
    UCA_DIR="$HOME/.config/Thunar"
    WRAPPER_SRC="$SCRIPT_DIR/compatflow-wrapper"
    WRAPPER_DST="$BIN_DIR/compatflow"
    ;;
  --flatpak)
    # Flatpak: só registrar no HOST via flatpak-spawn
    echo -e "${YELLOW}Flatpak: usando flatpak-spawn --host para instalar no sistema${NC}"
    exec flatpak-spawn --host bash "$SCRIPT_DIR/install-integration.sh" --deb
    ;;
  --snap)
    # Snap: conectar interfaces + registrar MIME no host
    echo -e "${YELLOW}Snap: conectando interfaces e registrando MIME${NC}"
    snapctl set compact-flow-installed=true
    # Registrar MIME via xdg-mime no host
    for mt in \
      application/vnd.microsoft.portable-executable \
      application/x-ms-dos-executable \
      application/x-dosexec \
      application/x-msdownload \
      application/x-msi; do
      xdg-mime default makaiforge_compactflow.desktop "$mt" 2>/dev/null || true
    done
    echo -e "${GREEN}Snap integration done${NC}"
    exit 0
    ;;
  *)
    echo -e "${RED}Modo inválido: $MODE${NC}"
    echo "Use: --dev, --deb, --appimage, --flatpak, --snap"
    exit 1
    ;;
esac

echo -e "App dir: ${APP_DIR}"
echo -e "Bin dir: ${BIN_DIR}"
echo ""

# ── 1. Instalar wrapper ──────────────────────────────────────────
echo -e "${CYAN}[1/5]${NC} Instalando wrapper"
mkdir -p "$BIN_DIR"
cp "$WRAPPER_SRC" "$WRAPPER_DST"
chmod +x "$WRAPPER_DST"
echo -e "  ${GREEN}OK${NC} → $WRAPPER_DST"

# ── 2. Instalar arquivo .desktop ────────────────────────────────
echo -e "${CYAN}[2/5]${NC} Instalando atalho"
mkdir -p "$DESKTOP_DIR"
sed "s|Exec=compatflow |Exec=$WRAPPER_DST |g" \
  "$SCRIPT_DIR/compatflow.desktop" > "$DESKTOP_DIR/compatflow.desktop"
chmod 644 "$DESKTOP_DIR/compatflow.desktop"
echo -e "  ${GREEN}OK${NC} → $DESKTOP_DIR/compatflow.desktop"

# ── 3. Instalar ícone ──────────────────────────────────────────
echo -e "${CYAN}[3/5]${NC} Instalando ícone"
ICON_SRC="$CF_DIR/assets/compatflow.svg"
ICON_PNG="$CF_DIR/assets/compatflow.png"
if [ -f "$ICON_SRC" ]; then
  mkdir -p "$ICON_DIR"
  cp "$ICON_SRC" "$ICON_DIR/compatflow.svg"
  chmod 644 "$ICON_DIR/compatflow.svg"
  echo -e "  ${GREEN}OK${NC} (SVG)"
elif [ -f "$ICON_PNG" ]; then
  mkdir -p "$ICON_DIR"
  cp "$ICON_PNG" "$ICON_DIR/compatflow.png"
  chmod 644 "$ICON_DIR/compatflow.png"
  echo -e "  ${GREEN}OK${NC} (PNG)"
else
  echo -e "  ${YELLOW}AVISO${NC}: Nenhum ícone encontrado"
fi

# ── 4. Registrar associações MIME ──────────────────────────────
echo -e "${CYAN}[4/5]${NC} Registrando MIME types"
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  echo -e "  update-desktop-database ${GREEN}OK${NC}"
fi

export XDG_DATA_DIRS="$DESKTOP_DIR:$XDG_DATA_DIRS"
for mt in \
  application/vnd.microsoft.portable-executable \
  application/x-ms-dos-executable \
  application/x-dosexec \
  application/x-msdownload \
  application/x-msi; do
  xdg-mime default compatflow.desktop "$mt" 2>/dev/null || true
done
echo -e "  xdg-mime ${GREEN}OK${NC}"

# ── 5. Integração específica por DE ────────────────────────────
echo -e "${CYAN}[5/5]${NC} Integração com desktop environment"

detected_de=""
if [ -n "${XDG_CURRENT_DESKTOP:-}" ]; then
  case "$XDG_CURRENT_DESKTOP" in
    *GNOME*) detected_de="gnome" ;;
    *KDE*)   detected_de="kde" ;;
    *XFCE*)  detected_de="xfce" ;;
    *i3*|*sway*) detected_de="wm" ;;
    *)       detected_de="other" ;;
  esac
fi
echo -e "  Detectado: ${detected_de:-$XDG_CURRENT_DESKTOP}"

case "$detected_de" in
  gnome)
    echo "  GNOME: suporte nativo via .desktop Actions"
    ;;
  kde)
    SERVICEMENU_DIR="$HOME/.local/share/kio/servicemenus"
    mkdir -p "$SERVICEMENU_DIR"
    sed "s|__WRAPPER__|$WRAPPER_DST|g" \
      "$SCRIPT_DIR/compatflow-dolphin-servicemenu.desktop" \
      > "$SERVICEMENU_DIR/compatflow.desktop"
    chmod 644 "$SERVICEMENU_DIR/compatflow.desktop"
    echo -e "  Dolphin Service Menu: ${GREEN}OK${NC}"

    if command -v kwriteconfig6 &>/dev/null; then
      kwriteconfig6 --file mimeapps.list \
        --group "Default Applications" \
        --key "application/vnd.microsoft.portable-executable" \
        "compatflow.desktop" 2>/dev/null || true
      kwriteconfig6 --file mimeapps.list \
        --group "Default Applications" \
        --key "application/x-ms-dos-executable" \
        "compatflow.desktop" 2>/dev/null || true
    fi

    if command -v kbuildsycoca6 &>/dev/null; then
      kbuildsycoca6 --noincremental 2>/dev/null || true
    elif command -v kbuildsycoca5 &>/dev/null; then
      kbuildsycoca5 --noincremental 2>/dev/null || true
    fi
    ;;
  xfce)
    mkdir -p "$UCA_DIR"
    UCA_FILE="$UCA_DIR/uca.xml"
    if [ -f "$UCA_FILE" ]; then
      cp "$UCA_FILE" "${UCA_FILE}.bak.$(date +%s)"
      for action_id in "1700000000-cf-open" "1700000001-cf-test"; do
        if ! grep -q "$action_id" "$UCA_FILE" 2>/dev/null; then
          sed -i "/<\/actions>/i\\
  <action>\\
    <icon>compatflow<\/icon>\\
    <name>Open with CompactFlow<\/name>\\
    <submenu>CompactFlow<\/submenu>\\
    <unique-id>$action_id<\/unique-id>\\
    <command>$WRAPPER_DST %f<\/command>\\
    <description>Open with CompactFlow<\/description>\\
    <patterns>*.exe;*.msi;*.msu;*.com;*.bat<\/patterns>\\
    <other-files\/>\\
  <\/action>" "$UCA_FILE"
        fi
      done
      echo -e "  Thunar UCA merge: ${GREEN}OK${NC}"
    else
      cp "$SCRIPT_DIR/compatflow-thunar-uca.xml" "$UCA_FILE"
      echo -e "  Thunar UCA novo: ${GREEN}OK${NC}"
    fi
    ;;
  wm|other|'')
    echo "  WM/Generic: xdg-mime é suficiente"
    ;;
esac

echo ""
echo -e "${GREEN}=== Instalação concluída ===${NC}"
echo ""
case "$MODE" in
  --dev)
    echo "Modo Dev: CompactFlow disponível via start-makaiforge.sh"
    echo "Para testar a integração com arquivos:"
    echo "  npm run dev -- --compact-flow ~/Downloads/meu-jogo.exe"
    ;;
  --deb|--system)
    echo "Instalação system-wide concluída."
    echo "Faça logout e login para ver as mudanças."
    ;;
  --appimage|--user)
    echo "Instalação user-space concluída."
    echo "Adicione ao ~/.bashrc: export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac
echo ""
echo "Para remover:"
echo "  rm -f $WRAPPER_DST $DESKTOP_DIR/compatflow.desktop"
echo "  xdg-mime default wine.desktop application/x-ms-dos-executable"
echo "  update-desktop-database $DESKTOP_DIR"
