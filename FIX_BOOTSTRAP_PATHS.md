# FIX: Paths da Reestruturação (resources/ → app/)

## Arquivos Corrigidos

### 1. `app/Games/services/game-launcher/play/python.ts`
**Problema**: Ambos os paths do `getCliPath()` estão errados
- **Packaged**: `resources/python/cli.py` → `app/_resources/python/cli.py`
- **Dev**: `tools/container/makai_time/engine/python/cli.py` → `app/_main/container/makai_time/engine/python/cli.py`

### 2. `src/main/services/local-sources-handler.ts` (linha 27)
**Problema**: Path packaged aponta para `process.resourcesPath + "data/sources"`
- **Correção**: `path.join(process.resourcesPath, "app", "_data", "sources")`

### 3. `src/main/events/misc/get-local-resource.ts` (linha 22)
**Problema**: Path packaged aponta para `process.resourcesPath + "data"`
- **Correção**: `path.join(process.resourcesPath, "app", "_data")`

### 4. `src/main/services/currency.ts` (linha 54)
**Problema**: Path packaged aponta para `process.resourcesPath + "data"`
- **Correção**: `path.join(process.resourcesPath, "app", "_data")`

### 5. `src/main/services/price-lookup.ts` (linha 69)
**Problema**: Path packaged aponta para `process.resourcesPath + "data/price-cache"`
- **Correção**: `path.join(process.resourcesPath, "app", "_data", "price-cache")`

### 6. `app/ProtonTools/main/events/get-proton-db.ts` (linha 22)
**Problema**: Path packaged aponta para `process.resourcesPath + "data"`
- **Correção**: `path.join(process.resourcesPath, "app", "_data")`

### 7. `app/_main/container/activity-logger.ts` (linha 15)
**Problema**: Path dev aponta para `tools/prefix/activity.log` (deletado)
- **Correção**: `path.join(app.getAppPath(), "app", "_data", "activity.log")`

### 8. `app/Catalogo/GameMod/services/launch-service.ts` (linha 160)
**Problema**: Fallback `tools/prefix/umu-run` (deletado)
- **Correção**: `path.join(app.getAppPath(), "app", "_resources", "binaries", "umu-run")`

### 9. `app/Catalogo/GameMod/games/_shared/launch.ts` (linha 116-117)
**Problema**: `bundledUmu` aponta para `tools/prefix/umu-run` (deletado)
- **Correção**: `path.join(app.getAppPath(), "app", "_resources", "binaries", "umu-run")`

### 10. Python imports — `installer-api/` shims
**Arquivos**:
- `app/_main/installer-api/proton_recommended/python/api/services/prefix/__init__.py`
- `app/_main/installer-api/proton_recommended/python/Utils/prefix/__init__.py`

**Problema**: sys.path.insert aponta para `tools/prefix/python` (deletado)
- **Correção**: Apontar para `app/_main/container/makai_time/engine/python`

### 11. `config/vitest.config.ts` (linha 13)
**Problema**: Alias `@resources` aponta para `resources/` (deletado)
- **Correção**: `"@resources": resolve("app/_resources")`

### 12. `.gitignore` (linhas 12, 50)
**Problema**: Entradas `resources/catalogo/` e `resources/chrome/` (deletados)
- **Correção**: Remover as duas linhas

### 13. Duplicata `venv.ts`
**Arquivos**: `app/_main/bootstrap/venv.ts` vs `app/_main/container/core/venv.ts`
- **Dev**: Um aponta `tools/venv/`, outro aponta `app/_venv/`
- Ambos existem no disco. Manter como está (cada consumer usa seu path).
