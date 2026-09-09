#!/bin/bash
# Makai Forge Launcher

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

BUILD_DIR="${APP_DIR}/bild"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
print_info() { echo -e "${CYAN}[INFO]${NC} $1"; }
print_err()  { echo -e "${RED}[ERRO]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }

# ── Build helpers ──────────────────────────────────────────────
build_common() {
    print_info "Rodando check:paths..."
    npm run check:paths || return 1
    print_info "Compilando TypeScript + Vite..."
    npx electron-vite build || return 1
    print_ok "Build base concluído"
}

build_target() {
    local target="$1"
    local output_dir="${BUILD_DIR}/${target}"
    mkdir -p "$output_dir"
    print_info "Gerando ${target} em: ${output_dir}"
    npx electron-builder --linux "$target" --config.directories.output="$output_dir" 2>&1
    if [ $? -eq 0 ]; then
        print_ok "${target} gerado em: ${output_dir}"
        ls -lh "$output_dir"/*.${target}* 2>/dev/null || ls -lh "$output_dir"/ 2>/dev/null
    else
        print_err "Falha ao gerar ${target}"
        return 1
    fi
}

build_aur() {
    local aur_dir="${BUILD_DIR}/aur"
    mkdir -p "$aur_dir"

    if [ ! -f "${APP_DIR}/PKGBUILD" ]; then
        print_err "PKGBUILD não encontrado."
        return 1
    fi

    # Gerar linux-unpacked se não existir
    if [ ! -d "${BUILD_DIR}/linux-unpacked" ]; then
        print_info "Gerando linux-unpacked..."
        npx electron-builder --linux --dir --config.directories.output="${BUILD_DIR}" 2>&1
        if [ $? -ne 0 ]; then
            print_err "Falha ao gerar linux-unpacked"
            return 1
        fi
    fi

    print_info "Copiando linux-unpacked para ${aur_dir}..."
    rm -rf "${aur_dir}/linux-unpacked"
    cp -r "${BUILD_DIR}/linux-unpacked" "${aur_dir}/"
    cp "${APP_DIR}/app/_assets/assets/icons/app/icon.png" "${aur_dir}/icon.png"
    cp PKGBUILD "$aur_dir/"

    print_info "Gerando pacote AUR..."
    local makepkg_user="${SUDO_USER:-$USER}"
    cd "$aur_dir"
    if [ "$(id -u)" -eq 0 ] && [ -n "$SUDO_USER" ]; then
        sudo -u "$SUDO_USER" makepkg -sf --noconfirm 2>&1
    else
        makepkg -sf --noconfirm 2>&1
    fi
    if [ $? -eq 0 ]; then
        print_ok "Pacote AUR gerado em: ${aur_dir}"
        ls -lh "$aur_dir"/*.pkg.tar.* 2>/dev/null
    else
        print_err "Falha ao gerar pacote AUR"
        cd "$APP_DIR"
        return 1
    fi
    cd "$APP_DIR"
}

# ── Verificar ferramentas ─────────────────────────────────────
check_tool() {
    command -v "$1" &>/dev/null
}

# ── Menu builds ────────────────────────────────────────────────
show_build_menu() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Builds - Gerar pacotes${NC}"
    echo -e "${CYAN}════════════════════════════════════════════${NC}"
    echo ""
    echo "  1) AppImage"
    echo "  2) DEB (Debian/Ubuntu)"
    echo "  3) RPM (Fedora/openSUSE)"
    echo "  4) Flatpak"
    echo "  5) AUR (Arch Linux)"
    echo "  6) Todos (AppImage + DEB + RPM)"
    echo "  7) Todos Linux (AppImage + DEB + RPM + Flatpak)"
    echo "  8) Voltar"
    echo ""
    read -p "  Escolha: " build_opt

    case "$build_opt" in
        1) build_appimage ;;
        2) build_deb ;;
        3) build_rpm ;;
        4) build_flatpak ;;
        5) build_aur_only ;;
        6) build_all_basic ;;
        7) build_all_linux ;;
        8) return ;;
        *) print_err "Opção inválida"; show_build_menu ;;
    esac
}

build_appimage() {
    echo ""
    print_info "=== AppImage ==="
    build_common || return 1
    build_target "AppImage"
}

build_deb() {
    echo ""
    print_info "=== DEB ==="
    build_common || return 1
    build_target "deb"
}

build_rpm() {
    echo ""
    print_info "=== RPM ==="
    build_common || return 1
    build_target "rpm"
}

build_flatpak() {
    echo ""
    print_info "=== Flatpak ==="
    if ! check_tool flatpak-builder; then
        print_err "flatpak-builder não encontrado."
        print_info "Instale:"
        print_info "  Arch:   sudo pacman -S flatpak flatpak-builder"
        print_info "  Debian: sudo apt install flatpak flatpak-builder"
        return 1
    fi
    build_common || return 1
    build_target "flatpak"
}

build_aur_only() {
    echo ""
    print_info "=== AUR ==="
    if ! check_tool makepkg; then
        print_err "makepkg não encontrado. Instale base-devel."
        return 1
    fi
    build_common || return 1
    build_aur
}

build_all_basic() {
    echo ""
    print_info "=== Todos (AppImage + DEB + RPM) ==="
    build_common || return 1
    build_target "AppImage"
    build_target "deb"
    build_target "rpm"
    echo ""
    print_ok "Builds concluídos! Verifique bild/"
}

build_all_linux() {
    echo ""
    print_info "=== Todos Linux ==="
    build_common || return 1
    build_target "AppImage"
    build_target "deb"
    build_target "rpm"
    build_target "flatpak"
    echo ""
    print_ok "Builds concluídos! Verifique bild/"
}

# ── Desinstaladores ──────────────────────────────────────────
uninstall_appimage() {
    echo ""
    print_info "Desinstalando AppImage..."
    rm -f "$HOME/.local/bin/makai-forger.AppImage" && print_ok "Removido: ~/.local/bin/makai-forger.AppImage" || print_warn "AppImage não encontrado"
    rm -f "$HOME/.local/share/applications/makai-forger.desktop" && print_ok "Removido: desktop entry" || true
    rm -f "$HOME/.local/share/icons/hicolor/256x256/apps/makai-forger.png" && print_ok "Removido: ícone" || true
    rm -rf "$HOME/.config/makai-forge" && print_ok "Removido: ~/.config/makai-forge" || true
    print_ok "AppImage desinstalado!"
}

uninstall_deb() {
    echo ""
    print_info "Desinstalando pacote DEB..."
    echo "cas" | sudo -S dpkg --remove makai-forger 2>/dev/null && print_ok "Pacote removido" || print_warn "Não instalado via dpkg"
    rm -rf "$HOME/.config/makai-forge" && print_ok "Removido: ~/.config/makai-forge" || true
    print_ok "DEB desinstalado!"
}

uninstall_rpm() {
    echo ""
    print_info "Desinstalando pacote RPM..."
    echo "cas" | sudo -S rpm -e makai-forger 2>/dev/null && print_ok "Pacote removido" || print_warn "Não instalado via rpm"
    rm -rf "$HOME/.config/makai-forge" && print_ok "Removido: ~/.config/makai-forge" || true
    print_ok "RPM desinstalado!"
}

uninstall_flatpak() {
    echo ""
    print_info "Desinstalando Flatpak..."
    flatpak uninstall -y com.makai.forge 2>/dev/null && print_ok "Flatpak removido" || print_warn "Não instalado via flatpak"
    rm -rf "$HOME/.var/app/com.makai.forge" && print_ok "Removido: ~/.var/app/com.makai.forge" || true
    print_ok "Flatpak desinstalado!"
}

uninstall_aur() {
    echo ""
    print_info "Desinstalando pacote AUR..."
    echo "cas" | sudo -S pacman -Rns makai-forger 2>/dev/null && print_ok "Pacote removido" || print_warn "Não instalado via pacman"
    rm -rf "$HOME/.config/makai-forge" && print_ok "Removido: ~/.config/makai-forge" || true
    print_ok "AUR desinstalado!"
}

show_uninstall_menu() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Desinstalar Makai Forge${NC}"
    echo -e "${CYAN}════════════════════════════════════════════${NC}"
    echo ""
    echo "  1) AppImage"
    echo "  2) DEB (Debian/Ubuntu)"
    echo "  3) RPM (Fedora/RHEL)"
    echo "  4) Flatpak"
    echo "  5) AUR (Arch/Manjaro)"
    echo "  0) Voltar"
    echo ""
    read -p "  Opção: " opt
    case "$opt" in
        1) uninstall_appimage ;;
        2) uninstall_deb ;;
        3) uninstall_rpm ;;
        4) uninstall_flatpak ;;
        5) uninstall_aur ;;
        0) show_menu; return ;;
        *) print_err "Opção inválida"; show_uninstall_menu ;;
    esac
    echo ""
    read -p "  Pressione Enter para continuar..."
    show_menu
}

# ── Menu principal ─────────────────────────────────────────────
show_menu() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Makai Forge${NC}"
    echo -e "${CYAN}════════════════════════════════════════════${NC}"
    echo ""
    echo "  1) Dev (npm run dev)"
    echo "  2) Build (electron-vite build)"
    echo "  3) Builds (AppImage, DEB, RPM, Flatpak, AUR)"
    echo "  4) Desinstalar"
    echo "  5) Sair"
    echo ""
    read -p "  Escolha: " opt

    case "$opt" in
        1) exec npm run dev ;;
        2) exec npm run build ;;
        3) show_build_menu ;;
        4) show_uninstall_menu ;;
        5) exit 0 ;;
        *) print_err "Opção inválida"; show_menu ;;
    esac
}

# ── Ponto de entrada ───────────────────────────────────────────
case "${1:-}" in
    dev)          exec npm run dev ;;
    build)        exec npm run build ;;
    appimage)     build_appimage ;;
    deb)          build_deb ;;
    rpm)          build_rpm ;;
    flatpak)      build_flatpak ;;
    aur)          build_aur_only ;;
    build-all)    build_all_basic ;;
    build-linux)  build_all_linux ;;
    uninstall)    show_uninstall_menu ;;
    -h|--help)
        echo "Uso: $0 [dev|build|appimage|deb|rpm|flatpak|aur|build-all|build-linux|uninstall]"
        echo ""
        echo "  Sem argumentos: menu interativo"
        ;;
    "")  show_menu ;;
    *)   print_err "Opção inválida: $1"; exit 1 ;;
esac
