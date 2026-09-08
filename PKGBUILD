# Maintainer: MakaiForge <lucasgertke11-bot@proton.me>
pkgname=makai-forger
pkgver=1.0.0
pkgrel=1
pkgdesc="Game launcher and compatibility tool for Linux"
arch=('x86_64')
url="https://github.com/lucasgertke11-bot/Proton_Forge"
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
    'protontricks'
)
makedepends=(
    'nodejs'
    'npm'
    'rust'
    'cargo'
    'python-cx_Freeze'
)
optdepends=(
    'qbittorrent: Download manager'
    'ludusavi: Backup tool'
    'flatpak: Flatpak support'
)
source=("${url}/archive/v${pkgver}.tar.gz")
sha256sums=('SKIP')

build() {
    cd "Proton_Forge-${pkgver}"

    # Instalar dependências npm
    npm install --legacy-peer-deps

    # Compilar addon nativo Rust
    npm run build:native

    # Compilar RPC Python
    npm run build:torrent-rpc 2>/dev/null || true

    # Compilar aplicativo
    npm run build:linux
}

package() {
    cd "Proton_Forge-${pkgver}"

    # Copiar build descompactado
    install -dm755 "${pkgdir}/opt/${pkgname}"
    cp -r dist/linux-unpacked/* "${pkgdir}/opt/${pkgname}/"

    # Criar binário
    install -dm755 "${pkgdir}/usr/bin"
    cat > "${pkgdir}/usr/bin/${pkgname}" << EOF
#!/bin/bash
exec /opt/${pkgname}/${pkgname} "\$@"
EOF
    chmod 755 "${pkgdir}/usr/bin/${pkgname}"

    # Ícone
    install -Dm644 "${pkgdir}/opt/${pkgname}/resources/app/_assets/icons/icon.png" \
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
    install -Dm644 /dev/stdin "${pkgdir}/usr/share/mime/packages/${pkgname}.xml" << 'EOF'
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
}
