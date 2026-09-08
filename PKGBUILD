# Maintainer: MakaiForge <lucasgertke11-bot@proton.me>
pkgname=makai-forger
pkgver=1.0.0
pkgrel=3
pkgdesc="Game launcher and compatibility tool for Linux"
arch=('x86_64')
url="https://github.com/MakaiForge/makai-forge"
license=('MIT')
depends=(
    'electron'
    'gtk3'
    'libxss'
    'nss'
    'alsa-lib'
    'libnotify'
    'xdg-utils'
    'python'
    'wine'
)
makedepends=(
    'nodejs'
    'npm'
    'rust'
    'cargo'
)
optdepends=(
    'protontricks: Runtime compatibility tool'
    'qbittorrent: Download manager'
    'ludusavi: Backup tool'
    'flatpak: Flatpak support'
)
source=()
sha256sums=()

package() {
    # Copiar build descompactado (já compilado pelo start-makaiforge.sh)
    local unpacked="${startdir}/linux-unpacked"
    if [ ! -d "$unpacked" ]; then
        echo "ERRO: linux-unpacked não encontrado. Execute o build primeiro."
        return 1
    fi

    install -dm755 "${pkgdir}/opt/${pkgname}"
    cp -r "$unpacked"/* "${pkgdir}/opt/${pkgname}/"

    # Binário
    install -dm755 "${pkgdir}/usr/bin"
    cat > "${pkgdir}/usr/bin/${pkgname}" << 'EOF'
#!/bin/bash
exec /opt/makai-forger/makai-forger "$@"
EOF
    chmod 755 "${pkgdir}/usr/bin/${pkgname}"

    # Ícone
    install -Dm644 "${startdir}/icon.png" \
        "${pkgdir}/usr/share/icons/hicolor/256x256/apps/${pkgname}.png"

    # Desktop entry
    install -Dm644 /dev/stdin "${pkgdir}/usr/share/applications/${pkgname}.desktop" << EOF
[Desktop Entry]
Name=Makai Forger
Comment=Game launcher and compatibility tool
Exec=/usr/bin/${pkgname} %f
Icon=${pkgname}
Type=Application
Categories=Game;
MimeType=application/vnd.microsoft.portable-executable;application/x-msi;application/x-dosexec;application/x-msdownload;
StartupWMClass=${pkgname}
EOF

    # MIME types
    install -Dm644 /dev/stdin "${pkgdir}/usr/share/mime/packages/${pkgname}.xml" << 'MIMEEOF'
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
MIMEEOF
}
