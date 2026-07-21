# Plano de Correção — Makai Forge

## Status: ✅ 3 corrigidos | 🟡 1 resto (circular dep inevitável)

---

### 🔴 1. ModuleNotFoundError: game_launcher.rpc — ✅ CORRIGIDO

**Causa:** Diretório `game-launcher` (com hífen) em `app/Games/services/`. Python não aceita hífen em nomes de módulo.

**Correção (2 arquivos alterados):**
- Criado symlink: `app/Games/services/game_launcher` → `game-launcher`
- `app/Catalogo/GameMod/core/server.py` — adicionado `_GAME_LAUNCHER_DIR` ao `sys.path`

**Verificação:**
```
python3 -c "import game_launcher.rpc"  # ✅ OK
```

---

### 🔴 2. Display Wayland — Erros de Color Management — ✅ CORRIGIDO

**Causa:** Compositor Wayland não implementa `wp_color_manager` completamente.

**Correção (1 arquivo alterado):**
- `src/main/index.ts:26` — adicionado `app.commandLine.appendSwitch("--ozone-platform-hint", "x11")`

**Efeito:** Electron força X11 via XWayland. Compatível com Wayland e X11.

---

### 🟡 3. Vite Warnings — Import Dinâmico + Estático Duais

**Status:** ✅ 15 de 16 corrigidos. **1 resto inevitável** (circular dep).

**O que são:** Quando um módulo é importado tanto via `import()` (dinâmico) quanto via `import ... from` (estático), o Vite avisa que não consegue criar chunks separados.

**Impacto real:** Apenas performance de build. **Nenhum impacto funcional.**

**Arquivos convertidos (estáticos):**
| Arquivo (renderer) | Dynamic | Static |
|---|---|---|
| `setup-proton-environment.ts` | 11 imports | ✅ |
| `init.ts` | 4 imports | 1 resto |
| `info.ts` | 6 imports | ✅ |
| `health-check/index.ts` | 2 imports | ✅ |
| `bethesda-deploy.ts` | 2 imports | ✅ |
| `scanfix-game.ts` | 1 import | ✅ |
| `mod-deploy/core.ts` | 1 import | ✅ |
| **Arquivo (main)** | | |
| `main.ts` | 2 imports | ✅ |
| `forger-api-call.ts` | 1 import | ✅ |

**1 resto — `prefix-setup.ts` em `init.ts`:**
- `init.ts` importa dinamicamente `prefix-setup.ts` para `getUmuBinaryPath`
- `prefix-setup.ts` importa estaticamente `createPrefix` de `init.ts`
- **Circular dep:** precisa ficar dinâmico para não quebrar

---

### 📝 Resumo

| Erro | Tipo | Status | Arquivos alterados |
|------|------|--------|-------------------|
| ModuleNotFoundError: game_launcher | 🔴 Runtime | ✅ Corrigido | server.py, symlink criado |
| Wayland color management | 🔴 Console | ✅ Corrigido | index.ts |
| Vite dual imports (15/16) | 🟡 Warning | ✅ Corrigido | 9 arquivos |
| Vite prefix-setup circular dep | 🟡 Warning | ⏸️ Inevitável | 0 |

`tsc --noEmit` ✅ | `npm run build` ✅ | Warnings: 1 (cosmético)
