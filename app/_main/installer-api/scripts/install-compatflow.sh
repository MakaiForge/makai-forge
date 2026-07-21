#!/bin/bash
# ============================================
# CompatFlow - Instalador Completo
# Suporta: Dolphin, Nautilus, Thunar, Files
# ============================================

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║    🔍 CompatFlow - Instalador          ║"
echo "╚═══════════════════════════════════════╝"
echo ""

if [ "$EUID" -ne 0 ]; then
    echo "Execute como root: sudo $0"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[1/6] Copiando aplicativo..."
mkdir -p /opt/compatflow
cp "$SCRIPT_DIR/compatflow.py" /opt/compatflow/

cat > /usr/bin/compatflow << 'EOF'
#!/bin/bash
cd /opt/compatflow
python3 compatflow.py "$@"
EOF
chmod +x /usr/bin/compatflow
echo "✓ Aplicativo instalado"

echo ""
echo "[2/6] Instalando ícone..."
mkdir -p /usr/share/icons/hicolor/scalable/apps
cp "$SCRIPT_DIR/compatflow.svg" /usr/share/icons/hicolor/scalable/apps/compatflow.svg 2>/dev/null || true
cp "$SCRIPT_DIR/compatflow.svg" ~/.local/share/icons/compatflow.svg 2>/dev/null || true
gtk-update-icon-cache ~/.local/share/icons/ 2>/dev/null || true

mkdir -p ~/.local/share/applications
cat > ~/.local/share/applications/compatflow.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=CompatFlow
Comment=Verificar compatibilidade Windows → Linux
Exec=/usr/bin/compatflow %f
Icon=compatflow
MimeType=application/x-executable;application/x-ms-executable;application/x-msi;application/vnd.microsoft.portable-executable;application/x-ms-dos-executable;application/octet-stream;application/x-ms-shortcut;
Terminal=false
NoDisplay=true
EOF
chmod +x ~/.local/share/applications/compatflow.desktop

update-desktop-database ~/.local/share/applications 2>/dev/null || true
echo "✓ Ícone instalado"

echo ""
echo "[2.5/6] Associando MIME types (universal)..."
for mime in application/x-executable application/x-ms-executable application/x-msi application/vnd.microsoft.portable-executable application/x-ms-dos-executable application/octet-stream; do
    xdg-mime default compatflow.desktop "$mime" 2>/dev/null || true
done

mkdir -p /usr/share/applications
cat > /usr/share/applications/compatflow.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=CompatFlow
Comment=Verificar compatibilidade Windows → Linux
Exec=/usr/bin/compatflow "%f"
Icon=compatflow
MimeType=application/x-executable;application/x-ms-executable;application/x-msi;application/vnd.microsoft.portable-executable;application/x-ms-dos-executable;application/octet-stream;application/x-ms-shortcut;
Terminal=false
NoDisplay=true
EOF
chmod +x /usr/share/applications/compatflow.desktop
update-desktop-database /usr/share/applications 2>/dev/null || true
echo "✓ MIME types associados"

echo ""
echo "[3/6] Configurando KDE Dolphin..."
mkdir -p ~/.local/share/kservices5
cat > ~/.local/share/kservices5/compatflow.desktop << 'EOF'
[Desktop Entry]
Type=Service
ServiceTypes=KonqPopupMenu/Plugin
MimeType=application/x-executable;application/x-ms-executable;application/x-msi;application/vnd.microsoft.portable-executable;
Actions=verifyCompatFlow

[Desktop Action verifyCompatFlow]
Name=🔍 Verificar com CompatFlow
Exec=/usr/bin/compatflow %f
Icon=compatflow
EOF
chmod +x ~/.local/share/kservices5/compatflow.desktop

kbuildsycoca6 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null || true
echo "✓ Dolphin configurado"

echo ""
echo "[4/6] Configurando GNOME Nautilus..."
mkdir -p ~/.local/share/nautilus/scripts
cat > ~/.local/share/nautilus/scripts/"🔍 Verificar com CompatFlow" << 'EOF'
#!/bin/bash
/usr/bin/compatflow "$@"
EOF
chmod +x ~/.local/share/nautilus/scripts/"🔍 Verificar com CompatFlow"
echo "✓ Nautilus configurado"

echo ""
echo "[5/6] Configurando XFCE Thunar..."
mkdir -p ~/.config/Thunar
if [ -f ~/.config/Thunar/uca.xml ]; then
    if ! grep -q "CompatFlow" ~/.config/Thunar/uca.xml; then
        sed -i 's|</actions>||' ~/.config/Thunar/uca.xml
        cat >> ~/.config/Thunar/uca.xml << 'EOF'
  <action>
    <icon>compatflow</icon>
    <name>🔍 Verificar com CompatFlow</name>
    <command>/usr/bin/compatflow %f</command>
    <patterns>*.exe;*.msi</patterns>
    <other-files/>
  </action>
</actions>
EOF
    fi
else
    cat > ~/.config/Thunar/uca.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<actions>
  <action>
    <icon>compatflow</icon>
    <name>🔍 Verificar com CompatFlow</name>
    <command>/usr/bin/compatflow %f</command>
    <patterns>*.exe;*.msi</patterns>
    <other-files/>
  </action>
</actions>
EOF
fi
echo "✓ Thunar configurado"

echo ""
echo "[6/6] Configurando Files (GTK)..."
mkdir -p ~/.local/share/file-manager/actions
cat > ~/.local/share/file-manager/actions/compatflow-verify.ini << 'EOF'
[Desktop Entry]
Type=Action
Icon=compatflow
Name=🔍 Verificar com CompatFlow
Tooltip=Verificar compatibilidade Windows → Linux
MimeType=application/octet-stream;application/x-executable;application/x-ms-executable;application/vnd.microsoft.portable-executable;application/x-msi;
Exec=/usr/bin/compatflow %f
EOF
echo "✓ Files (GTK) configurado"

echo ""
echo "[7/7] Configurando banco de dados..."
mkdir -p ~/.config/compatflow
# Token não é mais necessário - usando Supabase

echo "✓ Banco de dados configurado"

echo ""
echo "════════════════════════════════════════"
echo "  ✅ CompatFlow INSTALADO!"
echo "════════════════════════════════════════"
echo ""
echo "Ambientes suportados:"
echo "  • KDE Dolphin ✓"
echo "  • GNOME Nautilus ✓"
echo "  • XFCE Thunar ✓"
echo "  • Files (GTK) ✓"
echo ""
echo "Como usar:"
echo "  • Clique com botão direito em .exe ou .msi"
echo "  • Selecione '🔍 Verificar com CompatFlow'"
echo ""
echo "⚠️  Reinicie o gerenciador de arquivos:"
echo "  Dolphin:  killall dolphin; dolphin &"
echo "  Nautilus:  nautilus -q"
echo "  Thunar:    thunar -q"
echo ""
echo "Para desinstalar: sudo ./uninstall-compatflow.sh"

