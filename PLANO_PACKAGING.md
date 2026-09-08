# Plano de Packaging — CompactFlow + Makai Forger

## Como a integração do CompactFlow funciona em cada formato

O CompactFlow precisa de 3 coisas no sistema do usuário:

1. **Wrapper** (`compatflow`) — executável que redireciona pro Makai Forger com `--compact-flow`
2. **Arquivo .desktop** — associa MIME types `.exe`/`.msi` ao wrapper
3. **Integração com file manager** — Dolphin (KDE), Thunar (XFCE), Nautilus (GNOME)

Cada formato de pacote lida com isso de forma diferente. Abaixo, o plano completo.

---

## 1. DEB (Debian/Ubuntu) ✅ Pré-pronto

**Ferramenta**: electron-builder (geração automática)

**O que acontece na instalação**:

```
dpkg -i makai-forger_1.0.0_amd64.deb
  ↓
Extrai para /opt/makai-forger/
  ↓
Roda DEBIAN/postinst (definido por afterInstall no electron-builder.yml)
  ↓
scripts/compactflow-postinst.sh:
  1. Descobre /opt/makai-forger/
  2. Chama app/_resources/compact-flow/scripts/install-integration.sh --deb
     ↓
     - Instala wrapper em /usr/local/bin/compatflow
     - Instala .desktop em /usr/local/share/applications/
     - Registra MIME types via xdg-mime
     - Atualiza banco de dados de desktop com update-desktop-database
```

**Arquivos envolvidos**:
- `electron-builder.yml` → `afterInstall: scripts/compactflow-postinst.sh`
- `scripts/compactflow-postinst.sh` → script post-installation
- `app/_resources/compact-flow/scripts/install-integration.sh` → modo `--deb`

**Pré-requisito**: Nenhum. Funciona out-of-the-box.

---

## 2. RPM (Fedora/RHEL/openSUSE) ✅ Pré-pronto

**Ferramenta**: electron-builder (geração automática)

**Funciona igual ao DEB.** O electron-builder usa o mesmo `afterInstall` para RPM (`%post` scriptlet).

```
rpm -i makai-forger-1.0.0.x86_64.rpm
  ↓
Extrai para /opt/makai-forger/
  ↓
Roda %post → scripts/compactflow-postinst.sh → install-integration.sh --deb
```

**Diferenças**: Nenhuma. O `install-integration.sh --deb` funciona para ambos porque a estrutura de diretórios (`/opt/makai-forger/`) é a mesma.

---

## 3. PKGBUILD / .pkg.tar.zst (Arch Linux / AUR) ⚠️ Documentado

**Ferramenta**: Manual (PKGBUILD + AUR)

O electron-builder **não gera** pacotes Arch nativamente. É necessário criar um PKGBUILD manual.

**PKGBUILD padrão**:

```bash
# Maintainer: Seu Nome <email>
pkgname=makai-forger-bin
pkgver=1.0.0
pkgrel=1
pkgdesc="Makai Forger — Game launcher with CompactFlow integration"
arch=('x86_64')
url="https://github.com/lucasgertke11-bot/Proton_Forge"
license=('MIT')
depends=('electron' 'nodejs' 'wget' 'p7zip' 'innoextract' 'imagemagick' 'python' 'sqlite3')
source=("https://github.com/lucasgertke11-bot/Proton_Forge/releases/download/v$pkgver/makai-forger-$pkgver.AppImage")
sha256sums=('SKIP')

package() {
  # Extrair AppImage para /opt/makai-forger/
  mkdir -p "$pkgdir/opt/makai-forger"
  cd "$pkgdir/opt/makai-forger"
  "$srcdir/makai-forger-$pkgver.AppImage" --appimage-extract
  mv squashfs-root/* .
  rm -rf squashfs-root

  # Symlink do binário
  mkdir -p "$pkgdir/usr/bin"
  ln -s "/opt/makai-forger/makaiforge" "$pkgdir/usr/bin/makaiforge"

  # Ícone
  mkdir -p "$pkgdir/usr/share/icons/hicolor/256x256/apps"
  cp "$pkgdir/opt/makai-forger/resources/app/app/_assets/assets/icons/app/icon.png" \
     "$pkgdir/usr/share/icons/hicolor/256x256/apps/makaiforge.png"

  # .desktop do CompactFlow (necessário para MIME)
  install -Dm644 \
    "$pkgdir/opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/compatflow.desktop" \
    "$pkgdir/usr/share/applications/compatflow.desktop"

  # Wrapper
  install -Dm755 \
    "$pkgdir/opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/compatflow-wrapper" \
    "$pkgdir/usr/bin/compatflow"
}

post_install() {
  # Instalar integração desktop
  /opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/install-integration.sh --deb
}
```

**Como publicar no AUR**:
1. Criar repositório `makai-forger-bin` no AUR
2. O PKGBUILD acima baixa o AppImage da release do GitHub e extrai
3. O `post_install()` chama a integração

---

## 4. EBUILD (Gentoo Linux) ⚠️ Documentado

**Ferramenta**: Manual (ebuild + portage)

**Ebuild mínimo**:

```bash
# Copyright 2026 Gentoo Authors
EAPI=8

inherit desktop

DESCRIPTION="Makai Forger — Game launcher with CompactFlow"
HOMEPAGE="https://github.com/lucasgertke11-bot/Proton_Forge"
SRC_URI="https://github.com/lucasgertke11-bot/Proton_Forge/releases/download/v${PV}/makai-forger-${PV}.AppImage"

LICENSE="MIT"
SLOT="0"
KEYWORDS="~amd64"

RDEPEND="
  dev-util/electron
  net-misc/wget
  app-arch/p7zip
  app-arch/innoextract
  media-gfx/imagemagick
  dev-lang/python
  dev-db/sqlite
"

src_unpack() {
  default
  ./${P}.AppImage --appimage-extract
  mv squashfs-root ${P}
}

src_install() {
  insinto /opt/makai-forger
  doins -r ${P}/*

  dosym /opt/makai-forger/makaiforge /usr/bin/makaiforge
  dosym /opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/compatflow-wrapper \
        /usr/bin/compatflow

  doicon /opt/makai-forger/resources/app/app/_assets/assets/icons/app/icon.png
  make_desktop_entry /usr/bin/compatflow "CompactFlow" "icon" "Utility" \
    "MimeType=application/vnd.microsoft.portable-executable;application/x-ms-dos-executable"
}

pkg_postinst() {
  /opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/install-integration.sh --deb
}
```

---

## 5. TXZ (Slackware Linux) ⚠️ Documentado

**Ferramenta**: Manual (SlackBuild)

**Abordagem**: Similar ao PKGBUILD. O `doinst.sh` (pós-instalação do Slackware) chama a integração.

```
makai-forger/
├── makai-forger.SlackBuild   ← Script de build
├── doinst.sh                 ← Pós-instalação (roda install-integration.sh --deb)
└── slack-desc                ← Descrição do pacote
```

**doinst.sh simplificado**:
```bash
if [ -x /opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/install-integration.sh ]; then
  chroot . /opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/install-integration.sh --deb
fi
```

---

## 6. APK (Alpine Linux) ⚠️ Baixa prioridade

**Problema**: Alpine é usado principalmente em servidores/containers, não em desktop. O CompactFlow depende de X11/Wayland.

**Solução**: Se for necessário, o Alpine tem suporte a `post-install` scripts no APK. O script chamaria `install-integration.sh --deb` com paths ajustados para `/usr/lib/makai-forger/`.

---

## 7. NixOS / Nix Expressions ⚠️ Documentado

**Ferramenta**: Nixpkgs

**Abordagem**: Diferente dos outros formatos, no NixOS a integração desktop é declarativa.

**Exemplo de derivation**:

```nix
{ pkgs, lib, stdenv, fetchurl, electron, makeDesktopItem, copyDesktopItems }:

let
  compatflow-desktop = makeDesktopItem {
    name = "compatflow";
    exec = "compatflow %f";
    icon = "makaiforge";
    desktopName = "CompactFlow";
    categories = [ "Utility" ];
    mimeTypes = [
      "application/vnd.microsoft.portable-executable"
      "application/x-ms-dos-executable"
      "application/x-dosexec"
      "application/x-msdownload"
      "application/x-msi"
    ];
  };
in stdenv.mkDerivation {
  pname = "makai-forger";
  version = "1.0.0";

  src = fetchurl {
    url = "https://github.com/lucasgertke11-bot/Proton_Forge/releases/download/v1.0.0/makai-forger-1.0.0.AppImage";
    sha256 = "...";
  };

  nativeBuildInputs = [ copyDesktopItems ];

  installPhase = ''
    # Extrair AppImage
    ./makai-forger-*.AppImage --appimage-extract
    mv squashfs-root $out/opt/makai-forger

    # Wrapper
    mkdir -p $out/bin
    cp $out/opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/compatflow-wrapper $out/bin/compatflow

    # Ícone
    mkdir -p $out/share/icons/hicolor/256x256/apps
    cp $out/opt/makai-forger/resources/app/app/_assets/assets/icons/app/icon.png \
       $out/share/icons/hicolor/256x256/apps/makaiforge.png
  '';

  desktopItems = [ compatflow-desktop ];
}
```

**No NixOS, o usuário ativa com**:
```nix
environment.systemPackages = [ pkgs.makai-forger ];
xdg.mime.defaultApplications = {
  "application/vnd.microsoft.portable-executable" = "compatflow.desktop";
  "application/x-ms-dos-executable" = "compatflow.desktop";
};
```

---

## 8. XBPS (Void Linux) ⚠️ Documentado

**Ferramenta**: xbps-src + template

**Template XBPS**:

```bash
# Template file for 'makai-forger'
pkgname=makai-forger
version=1.0.0
revision=1
archs="x86_64"
hostmakedepends="tar"
depends="electron nodejs wget p7zip innoextract imagemagick python3 sqlite"
short_desc="Makai Forger with CompactFlow integration"
maintainer="Seu Nome <email>"
license="MIT"
homepage="https://github.com/lucasgertke11-bot/Proton_Forge"
distfiles="https://github.com/lucasgertke11-bot/Proton_Forge/releases/download/v${version}/makai-forger-${version}.AppImage"

post_extract() {
  ./makai-forger-*.AppImage --appimage-extract
  mv squashfs-root ${wrksrc}
}

do_install() {
  vcopy . /opt/makai-forger
  vbin /opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/compatflow-wrapper compatflow
}

post_install() {
  # Integração desktop
  /opt/makai-forger/resources/app/app/_resources/compact-flow/scripts/install-integration.sh --deb
}
```

---

## 9. AppImage ✅ Pré-pronto

**Ferramenta**: electron-builder (geração automática)

**Característica**: O AppImage é auto-contido. Não modifica o sistema durante a instalação.

**Fluxo de integração na primeira execução**:

```
Usuário baixa MakaiForger-1.0.0.AppImage
  ↓
Torna executável: chmod +x MakaiForger-1.0.0.AppImage
  ↓
Executa: ./MakaiForger-1.0.0.AppImage
  ↓
App inicia → detecta que é AppImage (via $APPIMAGE)
  ↓
Na primeira execução, o app pergunta:
  "Deseja integrar o CompactFlow ao sistema?
   (clique direito em .exe → Abrir com CompactFlow)"
  ↓
Se sim: chama install-integration.sh --appimage
  ↓
Instala wrapper + .desktop + MIME em ~/.local/
```

**O wrapper `compatflow` já sabe detectar AppImage**:
```bash
appimage_path=$(find /opt ~/.local/bin ~/Desktop -name "MakaiForge-*.AppImage" 2>/dev/null | head -1)
if [ -n "$appimage_path" ] && [ -x "$appimage_path" ]; then
  exec "$appimage_path" --compact-flow "$@"
fi
```

**SO**: O AppImage pode ser usado em qualquer distro. A integração desktop depende de `~/.local/` estar no PATH.

---

## 10. Flatpak ✅ Configurado (precisa de teste)

**Ferramenta**: electron-builder (com `@malept/flatpak-bundler`)

**Desafio**: Flatpak roda em sandbox. Não pode modificar o sistema diretamente.

**Solução: `flatpak-spawn --host`**

```
Flatpak instalado: flatpak install makai-forger.flatpak
  ↓
Usuário executa: flatpak run com.makaiforge.app
  ↓
App detecta $COMPACTFLOW_IN_FLATPAK=1
  ↓
Primeira execução: pergunta se quer integrar
  ↓
Se sim: chama install-integration.sh --flatpak
  ↓
install-integration.sh --flatpak:
  exec flatpak-spawn --host bash install-integration.sh --deb
  ↓
Isso roda FORA do sandbox, no sistema hospedeiro:
  - Instala wrapper em /usr/local/bin/compatflow
  - Instala .desktop em /usr/local/share/applications/
  - Registra MIME types
```

**Pré-requisitos no Flatpak (já configurados no electron-builder.yml)**:
```yaml
flatpak:
  finishArgs:
    - --socket=x11
    - --socket=wayland
    - --share=network
    - --filesystem=host
    - --talk-name=org.freedesktop.Flatpak    # ← necessário para flatpak-spawn --host
```

> ⚠️ `--filesystem=host` e `--talk-name=org.freedesktop.Flatpak` podem ser considerados permissivos demais para alguns repositórios Flatpak (como Flathub). Caso o publish seja no Flathub, pode ser necessário usar `--filesystem=home` e um portal-based approach.

**Alternativa para Flathub** (mais restritiva):
```bash
# Em vez de flatpak-spawn --host, usar xdg-open via portal:
xdg-open "compatflow:$FILE"
# O portal redireciona para o .desktop registrado no Flatpak
```

---

## 11. Snap ✅ Configurado (precisa de teste)

**Ferramenta**: electron-builder

**Desafio**: Similar ao Flatpak — sandbox. Mas snaps têm `snapctl` para comunicação com o host.

**Solução: `snapctl` + interfaces clássicas**

```
Snap instalado: snap install makai-forger.snap --dangerous
  ↓
App detecta $COMPACTFLOW_IN_SNAP=1
  ↓
Primeira execução: chama install-integration.sh --snap
  ↓
install-integration.sh --snap:
  snapctl set compact-flow-installed=true
  ↓
  (opcional) Registra MIME no host via interface de desktop
```

**Plugs necessários (já configurados)**:
```yaml
snap:
  plugs:
    - desktop
    - desktop-legacy
    - home
    - network
    - opengl
    - wayland
    - x11
    - pulseaudio
    - removable-media
```

> ⚠️ Snaps confinados têm limitações. Para integração total, pode ser necessário `classic: true` ou usar o `snapd` desktop interface.

---

## Resumo do que já está pronto vs precisa de trabalho

| Formato | Status | O que falta |
|---------|--------|-------------|
| **Dev** (modo 3) | ✅ Testado | Nada |
| **Deb** | ✅ `afterInstall` configurado | Testar build real |
| **RPM** | ✅ mesmo `afterInstall` do Deb | Testar build real |
| **AppImage** | ✅ `--appimage` mode | Testar primeira execução |
| **Flatpak** | ✅ finish-args configurados + `--flatpak` mode | Testar build + permissões Flathub |
| **Snap** | ✅ plugs configurados + `--snap` mode | Testar build + confinamento |
| **Arch/AUR** | ⚠️ PKGBUILD documentado | Criar e publicar no AUR |
| **Gentoo** | ⚠️ ebuild documentado | Criar e publicar no Gentoo overlay |
| **NixOS** | ⚠️ Nix expression documentada | Criar e publicar no nixpkgs |
| **Void** | ⚠️ template XBPS documentado | Criar e publicar |
| **Slackware** | ⚠️ SlackBuild documentado | Baixa prioridade |
| **Alpine** | ⚠️ Documentado | Baixa prioridade (não-desktop) |

---

## Como compilar cada formato

```bash
# Todos os formatos de uma vez (exceto Arch/Gentoo/Nix):
npm run build:linux
# ou
electron-builder --linux

# Formato específico:
electron-builder --linux deb
electron-builder --linux rpm
electron-builder --linux appimage
electron-builder --linux flatpak
electron-builder --linux snap

# Arch: manual (PKGBUILD)
# Gentoo: manual (ebuild)
# NixOS: manual (default.nix)
# Void: manual (xbps-src)
```

> O `afterInstall` do Deb/RPM e a first-run integration do AppImage/Flatpak/Snap já chamam `install-integration.sh` com o modo correto. O usuário final não precisa fazer nada adicional.
