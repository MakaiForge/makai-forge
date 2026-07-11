#!/bin/bash
# Makai Forge Launcher

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

ELECTRON_FLAGS="--no-sandbox --ozone-platform=x11"
COMPATFLOW_SRC="$APP_DIR/data/install-api/CompactFlow"
COMPATFLOW_INSTALL="/opt/compatflow"

echo "=== Makai Forge ==="
echo "1 - Iniciar (sem compilar)"
echo "2 - Compilar e iniciar"
echo "3 - Setup completo (reinstalar + restaurar interface)"
echo "4 - Reinstalar CompatFlow (build + instalar no sistema)"
echo ""
read -p "Escolha uma opção: " opt

case "$opt" in
  1)
    echo "Iniciando Makai Forge..."
    exec node ./node_modules/electron/cli.js . $ELECTRON_FLAGS
    ;;
  2)
    echo "Compilando Makai Forge..."
    npm run build 2>&1 || { echo "Falha na compilação"; exit 1; }
    echo "Iniciando Makai Forge..."
    exec node ./node_modules/electron/cli.js . $ELECTRON_FLAGS
    ;;
  3)
    exec bash scripts/setup.sh
    ;;
  4)
    echo ""
    echo "╔═══════════════════════════════════════╗"
    echo "║   Reinstalando CompatFlow             ║"
    echo "╚═══════════════════════════════════════╝"
    echo ""

    # Verifica se é root
    if [ "$EUID" -ne 0 ]; then
      echo "⚠️  Esta opção requer privilégios root para instalar em /opt/compatflow."
      echo "   Execute novamente como: sudo $0"
      exit 1
    fi

    cd "$COMPATFLOW_SRC" || { echo "❌ Pasta $COMPATFLOW_SRC não encontrada"; exit 1; }

    # ── Passo 1: Instalar dependências se necessário ──
    echo "[1/5] Verificando dependências..."
    if [ ! -d "node_modules" ] || [ ! -d "node_modules/electron" ]; then
      echo "  → Instalando dependências (npm install)..."
      npm install --ignore-scripts 2>&1 | tail -5
      echo "  ✓ Dependências instaladas"
    else
      echo "  ✓ node_modules OK"
    fi
    echo ""

    # ── Passo 2: Fazer backup do CompatFlow atual ──
    echo "[2/5] Fazendo backup do CompatFlow atual..."
    BACKUP_DIR="/tmp/compatflow-backup-$(date +%Y%m%d-%H%M%S)"
    if [ -d "$COMPATFLOW_INSTALL" ]; then
      cp -a "$COMPATFLOW_INSTALL" "$BACKUP_DIR"
      echo "  ✓ Backup salvo em: $BACKUP_DIR"
    else
      echo "  ⚠ Nenhuma instalação anterior encontrada"
    fi
    echo ""

    # ── Passo 3: Compilar ──
    echo "[3/5] Compilando CompatFlow..."
    BUILD_DIR="/tmp/compatflow-build-$$"
    mkdir -p "$BUILD_DIR"
    # Copia fonte para diretório temporário, excluindo node_modules
    tar -c --exclude='node_modules' -C "$COMPATFLOW_SRC" . | tar -xC "$BUILD_DIR"
    cp -a "$COMPATFLOW_SRC/node_modules" "$BUILD_DIR/"

    cd "$BUILD_DIR" || { echo "❌ Falha ao acessar $BUILD_DIR"; exit 1; }

    # Garantir que core/ existe (main.js require('./core/analyzer'))
    mkdir -p core
    [ ! -f core/analyzer.js ] && cp analyzer.js core/ 2>/dev/null
    [ ! -f core/database.js ] && cp database.js core/ 2>/dev/null

    BUILD_LOG="/tmp/compatflow-build-log-$$.txt"
    npx electron-builder --linux dir &> "$BUILD_LOG"
    BUILD_EXIT=$?
    tail -20 "$BUILD_LOG"
    if [ $BUILD_EXIT -ne 0 ]; then
      echo ""
      echo "❌ Falha na compilação! Log completo: $BUILD_LOG"
      rm -rf "$BUILD_DIR"
      exit 1
    fi
    echo "  ✓ Compilação concluída"
    echo ""

    # ── Passo 4: Instalar no sistema ──
    echo "[4/5] Instalando em $COMPATFLOW_INSTALL..."
    rm -rf "$COMPATFLOW_INSTALL"
    mkdir -p "$COMPATFLOW_INSTALL"

    # O electron-builder --linux dir produz dist/linux-unpacked/ ou dist/<name>-linux-x64/
    BUILT_DIR=$(find "$BUILD_DIR/dist" -maxdepth 2 -type d -name "*-unpacked" 2>/dev/null | head -1)
    if [ -z "$BUILT_DIR" ] || [ ! -d "$BUILT_DIR" ]; then
      BUILT_DIR=$(find "$BUILD_DIR/dist" -maxdepth 2 -type d ! -name "dist" | head -1)
    fi

    if [ -n "$BUILT_DIR" ] && [ -d "$BUILT_DIR" ]; then
      cp -a "$BUILT_DIR"/* "$COMPATFLOW_INSTALL/"
      echo "  ✓ Aplicativo copiado de: $BUILT_DIR"
    else
      echo "  ⚠ Pasta build não encontrada em dist/ (conteúdo: $(ls $BUILD_DIR/dist/ 2>/dev/null || echo 'vazio'))"
      echo "  → Tentando encontrar a build manualmente..."
      BUILT_DIR=$(find "$BUILD_DIR" -maxdepth 4 -type f -name "compatflow" -executable 2>/dev/null | head -1)
      if [ -n "$BUILT_DIR" ]; then
        BUILT_DIR=$(dirname "$BUILT_DIR")
        cp -a "$BUILT_DIR"/* "$COMPATFLOW_INSTALL/"
        echo "  ✓ Aplicativo copiado de: $BUILT_DIR"
      else
        echo "  ❌ Não foi possível encontrar o binário compilado."
        echo "  Backup disponível em: $BACKUP_DIR"
        rm -rf "$BUILD_DIR"
        exit 1
      fi
    fi

    # Garantir que o launcher script existe
    cat > "$COMPATFLOW_INSTALL/compatflow.sh" << 'LAUNCHER'
#!/bin/bash
exec /opt/compatflow/compatflow "$@"
LAUNCHER
    chmod +x "$COMPATFLOW_INSTALL/compatflow.sh"
    chmod +x "$COMPATFLOW_INSTALL/compatflow" 2>/dev/null || true

    # Copiar bridge para o sistema de arquivos real
    # (necessário para execFile que não funciona com asar://)
    echo "  → Copiando bridge scripts (runtime)..."
    rm -rf "$COMPATFLOW_INSTALL/bridge"
    cp -a "$COMPATFLOW_SRC/bridge" "$COMPATFLOW_INSTALL/bridge"
    # Wrappers flat para compatibilidade com o main.js
    if [ -f "$COMPATFLOW_SRC/bridge/proton-tools.js" ]; then
      cp "$COMPATFLOW_SRC/bridge/proton-tools.js" "$COMPATFLOW_INSTALL/bridge/proton-tools.js"
    fi
    if [ -f "$COMPATFLOW_SRC/bridge/install-game.js" ]; then
      cp "$COMPATFLOW_SRC/bridge/install-game.js" "$COMPATFLOW_INSTALL/bridge/install-game.js"
    fi

    # Bridge fica ao lado do binário (main.js usa '..' pra sair de resources/)
    # Os wrappers bridge/proton-tools.js e bridge/install-game.js
    # redirecionam pros subdiretórios (bridge/proton/, bridge/install-game/)

    echo "  ✓ Instalação concluída"
    echo ""

    # ── Passo 5: Atualizar associações de arquivo ──
    echo "[5/5] Atualizando associações de arquivo..."
    update-desktop-database /usr/share/applications 2>/dev/null || true
    update-mime-database /usr/share/mime 2>/dev/null || true
    kbuildsycoca6 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null || true
    echo "  ✓ Associações atualizadas"

    # Limpeza
    rm -rf "$BUILD_DIR"

    echo ""
    echo "════════════════════════════════════════"
    echo "  ✅ CompatFlow reinstalado!"
    echo "════════════════════════════════════════"
    echo ""
    echo "  O que foi feito:"
    echo "  • Código compilado de: data/install-api/CompactFlow/"
    echo "  • Instalado em: $COMPATFLOW_INSTALL"
    echo "  • CompatFlow é o handler padrão de .exe e .msi"
    echo ""
    echo "  Para testar, abra um .exe no Dolphin ou execute:"
    echo "    compatflow.sh /caminho/para/arquivo.exe"
    echo ""

    # ── Pergunta se quer reiniciar o Plasma ──
    read -p "Reiniciar a interface Plasma agora? (s/N): " restart
    if [ "$restart" = "s" ] || [ "$restart" = "S" ]; then
      echo "  → Reiniciando Plasma..."
      kquitapp6 plasmashell 2>/dev/null
      sleep 2
      kstart6 plasmashell &>/dev/null &
      disown
      echo "  ✓ Plasma reiniciado"
    fi
    ;;

  *)
    echo "Opção inválida"
    exit 1
    ;;
esac
