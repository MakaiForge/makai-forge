#!/bin/bash
# Makai Forge Launcher

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

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
    electron-vite build || return 1
    print_ok "Build base concluído"
}

build_target() {
    local target="$1"
    local output_dir="${APP_DIR}/dist/${target}"
    mkdir -p "$output_dir"
    print_info "Gerando ${target}..."
    electron-builder --linux "$target" --config.directories.output="$output_dir" 2>&1
    if [ $? -eq 0 ]; then
        print_ok "${target} gerado em: ${output_dir}"
        ls -lh "$output_dir"/*.${target}* 2>/dev/null || ls -lh "$output_dir"/ 2>/dev/null
    else
        print_err "Falha ao gerar ${target}"
        return 1
    fi
}

build_aur() {
    print_info "Gerando pacote AUR..."
    local aur_dir="${APP_DIR}/dist/aur"
    mkdir -p "$aur_dir"

    if [ ! -f "${APP_DIR}/PKGBUILD" ]; then
        print_err "PKGBUILD não encontrado. Crie o PKGBUILD primeiro."
        return 1
    fi

    cp PKGBUILD "$aur_dir/"
    cd "$aur_dir"
    makepkg -s --noconfirm 2>&1
    if [ $? -eq 0 ]; then
        print_ok "Pacote AUR gerado em: ${aur_dir}"
        ls -lh "$aur_dir"/*.pkg.tar.* 2>/dev/null
    else
        print_err "Falha ao gerar pacote AUR"
        return 1
    fi
    cd "$APP_DIR"
}

# ── Verificar ferramentas ─────────────────────────────────────
check_tool() {
    if command -v "$1" &>/dev/null; then
        return 0
    fi
    return 1
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
    echo "  4) Snap"
    echo "  5) Flatpak"
    echo "  6) AUR (Arch Linux)"
    echo "  7) Todos (AppImage + DEB + RPM)"
    echo "  8) Todos Linux (AppImage + DEB + RPM + Snap)"
    echo "  9) Voltar"
    echo ""
    read -p "  Escolha: " build_opt

    case "$build_opt" in
        1) build_appimage ;;
        2) build_deb ;;
        3) build_rpm ;;
        4) build_snap ;;
        5) build_flatpak ;;
        6) build_aur_only ;;
        7) build_all_basic ;;
        8) build_all_linux ;;
        9) return ;;
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

build_snap() {
    echo ""
    print_info "=== Snap ==="
    if ! check_tool snapcraft; then
        print_err "snapcraft não encontrado. Instale: sudo snap install snapcraft --classic"
        return 1
    fi
    build_common || return 1
    build_target "snap"
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
    print_ok "Builds concluídos! Verifique dist/"
}

build_all_linux() {
    echo ""
    print_info "=== Todos Linux ==="
    build_common || return 1
    build_target "AppImage"
    build_target "deb"
    build_target "rpm"
    if check_tool snapcraft; then
        build_target "snap"
    else
        print_warn "snapcraft não encontrado, pulando Snap"
    fi
    echo ""
    print_ok "Builds concluídos! Verifique dist/"
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
    echo "  3) Builds (AppImage, DEB, RPM, Snap, Flatpak, AUR)"
    echo "  4) Sair"
    echo ""
    read -p "  Escolha: " opt

    case "$opt" in
        1) exec npm run dev ;;
        2) exec npm run build ;;
        3) show_build_menu ;;
        4) exit 0 ;;
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
    snap)         build_snap ;;
    flatpak)      build_flatpak ;;
    aur)          build_aur_only ;;
    build-all)    build_all_basic ;;
    build-linux)  build_all_linux ;;
    -h|--help)
        echo "Uso: $0 [dev|build|appimage|deb|rpm|snap|flatpak|aur|build-all|build-linux]"
        echo ""
        echo "  Sem argumentos: menu interativo"
        ;;
    "")  show_menu ;;
    *)   print_err "Opção inválida: $1"; exit 1 ;;
esac
