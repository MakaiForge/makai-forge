# Plano de Implementação — Refatoração Games Flow

## Fases

---

### Fase 1: Python — Métodos Utilitários no RPC

Criar os 4 métodos RPC que hoje estão em TypeScript e viram operações puras em Python.

| # | Método | Origem TS | Descrição |
|---|---|---|---|
| 1 | `detect_installer_type` | `download-installer.ts:66-89` | Detecta se source é instalador (.exe com setup/install/msi) ou portátil |
| 2 | `copy_to_prefix` | `prefix-copier.ts:73-155` | Copia pasta p/ prefixo com SHA256 pré e pós + verificação |
| 3 | `scan_prefix_for_exes` | `prefix-scanner.ts:5-28` | Escaneia prefixo/drive_c por .exe jogáveis |
| 4 | `snapshot_prefix` + `find_new_executables` | `snapshot.ts` + `change-detector.ts` | Tira snapshot do prefixo, compara e retorna .exe novos |

**Arquivo destino**: `tools/Mods_manager/core/game_install.py` (novo)
**Registro**: 4 métodos `@register()` em `server.py`

**Teste**: `echo '{"id":1,"method":"detect_installer_type","params":{"source_path":"/tmp/game"}}' | tools/venv/bin/python3 tools/Mods_manager/core/server.py`

---

### Fase 2: Python — Método Orquestrador `install_game`

Criar o método principal que o Electron chama com UMA chamada RPC.

```python
@register("install_game")
def handle_install_game(params):
    """
    Fluxo completo. Electron chama 1x, Python faz tudo.
    
    Input:  { source_path, prefix_path, proton_path, game_id }
    Output: { success, candidates: [{path, name, size}],
              suggested_dir, method: "portable"|"installer" }
    
    Eventos emitidos (progresso para UI):
      {"event": "install_progress", "step": "detecting", "percent": 10}
      {"event": "install_progress", "step": "copying", "percent": 30}
      {"event": "install_progress", "step": "scanning", "percent": 80}
      {"event": "install_progress", "step": "complete", "percent": 100}
    """
```

**Arquivo**: `tools/Mods_manager/core/game_install.py`
**Registro**: `@register("install_game")` em `server.py`

**Fluxo interno**:
```
install_game()
  ├─ 1. detect_installer_type(source) → installer ou portátil
  ├─ 2. Se portátil:
  │     ├─ copy_to_prefix(source, prefix)
  │     └─ scan_prefix_for_exes(prefix) → candidatos
  ├─ 3. Se installer:
  │     ├─ snapshot_prefix(prefix) → before
  │     ├─ container_run_installer(installer, prefix, proton)
  │     ├─ snapshot_prefix(prefix) → after
  │     ├─ find_new_executables(before, after) → candidatos
  │     └─ Se 0 candidatos:
  │         ├─ copy_to_prefix(source, prefix)
  │         └─ scan_prefix_for_exes(prefix) → candidatos
  └─ 4. Retorna candidatos
```

---

### Fase 3: Electron — Adaptar IPC + MakaiRPC

Ajustar o `openGame` para usar `install_game` via RPC.

**Arquivos para modificar**:

| Arquivo | O que fazer |
|---|---|
| `data/install-api/ForgePipeline/services/makai-time.ts` | Adicionar método `installGame()` que chama `MakaiRPC.call("install_game", params)` |
| `data/install-api/ForgePipeline/events/open-game/open-game.ts` | Simplificar: depois de garantir Proton + prefixo + source, chamar `MakaiTime.installGame()` em vez de `handlePortableGame`/`executeInstaller` |
| `data/install-api/ForgePipeline/events/open-game/handle-portable.ts` | **Remover** (lógica vai pro Python) |
| `data/install-api/ForgePipeline/events/open-game/execute-installer.ts` | **Remover** (lógica vai pro Python) |
| `data/install-api/ForgePipeline/orchestrator/orchestrator.ts` | **Remover** (lógica vai pro Python) |
| `data/install-api/ForgePipeline/orchestrator/prefix-copier.ts` | **Remover** (lógica vai pro Python) |
| `data/install-api/ForgePipeline/orchestrator/prefix-scanner.ts` | **Remover** (lógica vai pro Python) |
| `data/install-api/ForgePipeline/orchestrator/snapshot.ts` | **Remover** (lógica vai pro Python) |
| `data/install-api/ForgePipeline/orchestrator/change-detector.ts` | **Remover** (lógica vai pro Python) |
| `data/install-api/ForgePipeline/events/open-game/handle-prefix.ts` | **Manter** (`showExecutableSelect` e `createPrefixWithDlls` — UI + orquestração fina) |
| `data/install-api/ForgePipeline/events/open-game/ensure-proton.ts` | **Manter** (download de Proton é UI) |
| `data/install-api/ForgePipeline/events/open-game/download-installer.ts` | **Manter** (download é UI, mas detecção vai pra Python) |

**Novo fluxo** em `open-game.ts`:
```
openGame()
  ├─ Verifica repair
  ├─ ensureProtonAvailable()        # UI: baixar Proton
  ├─ createPrefixWithDlls()         # RPC: create_prefix + DLLs
  ├─ downloadFromCatalog/dialog     # UI: obter source
  ├─ MakaiRPC.call("install_game", {source, prefix, proton, gameId})
  │   └─ escuta eventos "install_progress" → atualiza UI
  └─ showExecutableSelect()         # UI: selecionar .exe
```

---

### Fase 4: Electron — Eventos de Progresso

Fazer o Electron escutar e exibir eventos de progresso do Python.

**Python emite** via `write_event()`:
```python
write_event("install_progress", step="detecting", percent=10, message="Analisando instalador...")
write_event("install_progress", step="copying", percent=30, message="Copiando arquivos...")
write_event("install_progress", step="verifying", percent=70, message="Verificando SHA256...")
write_event("install_progress", step="scanning", percent=80, message="Procurando executáveis...")
write_event("install_progress", step="complete", percent=100, message="Instalação concluída")
```

**Electron recebe** via `MakaiRPC.onEvent()`:
```typescript
MakaiRPC.onEvent((event) => {
  if (event.event === "install_progress") {
    sendProgress(event.step, event.message);
  }
});
```

---

### Fase 5: Limpeza

Após validar que tudo funciona:

1. Remover arquivos TS mortos (Fase 3)
2. Remover importações antigas em `src/main/events/library/index.ts`
3. Rodar `npx tsc --noEmit` e garantir zero erros
4. Rodar `npm run dev` e testar fluxo completo:
   - Adicionar jogo custom com .exe
   - Adicionar jogo do catálogo
   - Clicar "Play" em jogo com prefixo vazio
   - Clicar "Play" em jogo já configurado

---

### Fase 6 (futuro): Integrar Makai Time

Depois que o fluxo de instalação estiver funcionando com Proton direto (sem container), integrar o Makai Time (bwrap) como camada opcional.

---

## Resumo do que vai ser criado vs removido

**Criar**:
- `tools/Mods_manager/core/game_install.py` — Novos métodos + orquestrador

**Modificar**:
- `tools/Mods_manager/core/server.py` — Adicionar 5 `@register()`
- `data/install-api/ForgePipeline/services/makai-time.ts` — Adicionar `installGame()`
- `data/install-api/ForgePipeline/events/open-game/open-game.ts` — Simplificar

**Remover** (após validação):
- `handle-portable.ts`
- `execute-installer.ts`
- `orchestrator.ts`
- `prefix-copier.ts`
- `prefix-scanner.ts`
- `snapshot.ts`
- `change-detector.ts`
