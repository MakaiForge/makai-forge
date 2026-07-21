#!/bin/bash
# ============================================
# CompatFlow - Desinstalador
# ============================================

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║    🗑️ CompatFlow - Desinstalador       ║"
echo "╚═══════════════════════════════════════╝"
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "Execute como root: sudo $0"
    exit 1
fi

echo "Removendo aplicativo..."
rm -rf /opt/compatflow
rm -f /usr/bin/compatflow

echo "Removendo menus KDE..."
rm -f ~/.local/share/kio/servicemenus/compatflow.desktop
rm -f ~/.local/share/applications/compatflow.desktop
rm -f ~/.local/share/kservices5/CompatFlow.desktop

echo "Removendo menus GNOME..."
rm -f ~/.local/share/nautilus/scripts/"🔍 Verificar Disponibilidade"

echo "Removendo menus XFCE..."
if [ -f ~/.config/Thunar/uca.xml ]; then
    sed -i '/Verificar Disponibilidade/d' ~/.config/Thunar/uca.xml
fi

echo "Removendo associações..."
rm -f /usr/share/applications/compatflow.desktop
rm -f /usr/share/applications/crypt.desktop

echo ""
echo "════════════════════════════════════════"
echo "  ✅ CompatFlow DESINSTALADO!"
echo "════════════════════════════════════════"
