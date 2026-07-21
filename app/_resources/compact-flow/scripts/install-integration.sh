#!/bin/bash
# CompactFlow Desktop Integration Installer
# Instala atalhos, associações MIME e integração com gestores de arquivos
#
# Uso:
#   install-integration.sh --dev       (instala em ~/.local para desenvolvimento)
#   install-integration.sh --deb       (instala em /usr/local - Deb/RPM)
#   install-integration.sh --appimage  (instala em ~/.local - AppImage)
#   install-integration.sh --flatpak   (usa flatpak-spawn --host)
#   install-integration.sh --snap      (usa snapctl + xdg-mime)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
CF_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:---dev}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}===> CompactFlow Desktop Integration${NC}"
echo -e "Modo: ${MODE}"

case "$MODE" in
  --dev|--appimage|--user)
    BIN_DIR="$HOME/.local/bin"
    DESKTOP_DIR="$HOME/.local/share/applications"
    ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
    UCA_DIR="$HOME/.config/Thunar"
    ;;
  --deb|--system)
    BIN_DIR="/usr/local/bin"
    DESKTOP_DIR="/usr/local/share/applications"
    ICON_DIR="/usr/local/share/icons/hicolor/256x256/apps"
    UCA_DIR="/etc/xdg/xfce4/Thunar"
    ;;
  --flatpak)
    echo -e "${YELLOW}Flatpak: instalando no host via flatpak-spawn${NC}"
    exec flatpak-spawn --host bash "$SCRIPT_DIR/install-integration.sh" --deb
    ;;
  --snap)
    echo -e "${YELLOW}Snap: conectando interfaces${NC}"
    snapctl set compact-flow-installed=true
    for mt in application/vnd.microsoft.portable-executable application/x-ms-dos-executable application/x-dosexec application/x-msdownload application/x-msi; do
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

WRAPPER_DST="$BIN_DIR/compatflow"

# ── 1. Instalar wrapper ──────────────────────────────────────────
echo -e "${CYAN}[1/5]${NC} Instalando wrapper"
mkdir -p "$BIN_DIR"
cp "$SCRIPT_DIR/compatflow-wrapper" "$WRAPPER_DST"
chmod +x "$WRAPPER_DST"
echo -e "  ${GREEN}OK${NC} → $WRAPPER_DST"

# ── 2. Instalar .desktop ────────────────────────────────────────
echo -e "${CYAN}[2/5]${NC} Instalando atalho"
mkdir -p "$DESKTOP_DIR"
sed "s|Exec=compatflow |Exec=$WRAPPER_DST |g" \
  "$SCRIPT_DIR/compatflow.desktop" > "$DESKTOP_DIR/compatflow.desktop"
chmod 644 "$DESKTOP_DIR/compatflow.desktop"
echo -e "  ${GREEN}OK${NC} → $DESKTOP_DIR/compatflow.desktop"

# ── 3. Instalar ícone ──────────────────────────────────────────
echo -e "${CYAN}[3/5]${NC} Instalando ícone"
for icon in "$CF_DIR/assets/compatflow.svg" "$CF_DIR/assets/compatflow.png"; do
  if [ -f "$icon" ]; then
    mkdir -p "$ICON_DIR"
    cp "$icon" "$ICON_DIR/"
    chmod 644 "$ICON_DIR/$(basename "$icon")"
    echo -e "  ${GREEN}OK${NC} → $ICON_DIR/$(basename "$icon")"
    break
  fi
done

# ── 4. MIME types ──────────────────────────────────────────────
echo -e "${CYAN}[4/5]${NC} Registrando MIME types"
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi
export XDG_DATA_DIRS="$DESKTOP_DIR:$XDG_DATA_DIRS"
for mt in application/vnd.microsoft.portable-executable application/x-ms-dos-executable application/x-dosexec application/x-msdownload application/x-msi; do
  xdg-mime default compatflow.desktop "$mt" 2>/dev/null || true
done
echo -e "  ${GREEN}OK${NC}"

# ── 5. Integração Dolphin + Thunar ─────────────────────────────
echo -e "${CYAN}[5/5]${NC} Integração com file manager"

detected_de=""
if [ -n "${XDG_CURRENT_DESKTOP:-}" ]; then
  case "$XDG_CURRENT_DESKTOP" in
    *GNOME*) detected_de="gnome" ;;
    *KDE*)   detected_de="kde" ;;
    *XFCE*)  detected_de="xfce" ;;
    *)       detected_de="other" ;;
  esac
fi
echo -e "  DE detectado: ${detected_de:-$XDG_CURRENT_DESKTOP}"

case "$detected_de" in
  kde)
    SERVICEMENU_DIR="$HOME/.local/share/kio/servicemenus"
    mkdir -p "$SERVICEMENU_DIR"
    sed "s|__WRAPPER__|$WRAPPER_DST|g" \
      "$SCRIPT_DIR/compatflow-dolphin-servicemenu.desktop" \
      > "$SERVICEMENU_DIR/compatflow.desktop"
    chmod 644 "$SERVICEMENU_DIR/compatflow.desktop"
    echo -e "  Dolphin service menu: ${GREEN}OK${NC}"
    if command -v kwriteconfig6 &>/dev/null; then
      kwriteconfig6 --file mimeapps.list --group "Default Applications" \
        --key "application/vnd.microsoft.portable-executable" "compatflow.desktop" 2>/dev/null || true
    fi
    if command -v kbuildsycoca6 &>/dev/null; then kbuildsycoca6 --noincremental 2>/dev/null || true
    elif command -v kbuildsycoca5 &>/dev/null; then kbuildsycoca5 --noincremental 2>/dev/null || true
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
    <unique-id>$action_id<\/unique-id>\\
    <command>$WRAPPER_DST %f<\/command>\\
    <description>Open with CompactFlow<\/description>\\
    <patterns>*.exe;*.msi;*.msu;*.com;*.bat<\/patterns>\\
    <other-files\/>\\
  <\/action>" "$UCA_FILE"
        fi
      done
      echo -e "  Thunar UCA: ${GREEN}OK${NC}"
    else
      cp "$SCRIPT_DIR/compatflow-thunar-uca.xml" "$UCA_FILE"
      echo -e "  Thunar UCA novo: ${GREEN}OK${NC}"
    fi
    ;;
  gnome|other|'')
    echo -e "  ${GREEN}OK${NC} (via .desktop actions)"
    ;;
esac

echo ""
echo -e "${GREEN}=== Concluído ===${NC}"
echo ""
echo "Agora .exe/.msi vão abrir com CompactFlow (via Makai Forger)."
echo "Faça logout/login ou rode:"
echo "  source $WRAPPER_DST --compact-flow"
echo ""
echo "Para remover:"
echo "  rm -f $WRAPPER_DST $DESKTOP_DIR/compatflow.desktop $SERVICEMENU_DIR/compatflow.desktop"
echo "  update-desktop-database $DESKTOP_DIR"
