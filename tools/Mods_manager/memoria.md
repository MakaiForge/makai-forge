# Memoria de Investigacao - Mods_manager

> Data: 2026-07-13 | Status: Atualizado com analise completa

---

## 1. Visao Geral do Projeto

**Nome:** Makai Forge - Mods Manager
**Localizacao:** `/home/cas/Documentos/Makai-forge/tools/Mods_manager`
**Linguagens:** TypeScript (React + Node.js) + Python (backend CLI)
**Plataforma:** Linux (jogos Windows via Proton/Wine)

Gerenciador de mods para jogos Windows rodando no Linux via Proton. Suporta 36+ jogos incluindo Skyrim, Fallout, Witcher 3, Cyberpunk 2077, Factorio, etc.

**Comparacao:** Amethyst Mod Manager (referencia) esta em `/home/cas/Desktop/Amethyst-Mod-Manager-1.3.12`

---

## 2. Registro (Registry) - CRITICO

### O que e
O registro Windows e essencial para jogos Bethesda. Sem ele, o jogo nao encontra seus proprios arquivos. E como o Windows sabe onde o Skyrim esta instalado.

### Onde esta implementado

**12 jogos Bethesda TEM seedRegistry:**
- skyrim, skyrim-se, skyrim-vr
- fallout3, falloutnv, fallout4, fallout4-vr
- oblivion, morrowind, starfield
- enderal, enderal-se

**24 jogos NAO-Bethesda NAO precisam de registro** (nao usam Bethesda Softworks registry).

### Como funciona

O registro e escrito DIRETAMENTE no `system.reg` do prefixo Wine/Proton:

```
[Software\\Bethesda Softworks\\Skyrim]
"Installed Path"="Z:\\home\\cas\\Games\\skyrim"

[Software\\Wow6432Node\\Bethesda Softworks\\Skyrim]
"Installed Path"="Z:\\home\\cas\\Games\\skyrim"
```

### Fluxo no Play (Step 4: 04-configs.ts)

```
1. Verifica DLL Overrides (user.reg)
2. Instala dependencias (vcredist, d3dcompiler_47 via winetricks)
3. Chama mod.seedRegistry() → escreve no system.reg
4. Verifica se o registro foi gravado (verifyBethesdaRegistry)
5. Cria dxvk.conf se nao existe
6. Cria diretorio My Games no prefixo
7. Copia INIs do prefixo Steam se existirem
```

### Arquivos de implementacao

| Arquivo | Funcao |
|---------|--------|
| `games/_shared/prefix.ts:27-101` | `seedBethesdaRegistryWithProton()` - escreve direto no system.reg |
| `prefix/core/bethesda-registry.ts:19-101` | `seedBethesdaRegistry()` + `verifyBethesdaRegistry()` |
| `play/steps/04-configs.ts:85-117` | Chama seedRegistry e verifica resultado |
| `games/skyrim/prefix.ts:21-29` | `seedSkyrimRegistry()` - delega para shared |

### O que o Amethyst faz diferente

O Amethyst usa `reg add` via subprocess (proton run reg add):
- `src/Utils/bethesda_registry.py`
- Escreve em `HKCU\Software\WOW6432Node\...` E `HKCU\Software\...`
- Usa marker file `.v2.done` pra evitar reescrita
- **Nosso projeto escreve direto no system.r** - mais rapido e confiavel

### Jogos SEM registro (nao precisam)

Todos os 24 jogos nao-Bethesda (witcher3, cyberpunk2077, valheim, stardewvalley, etc.) nao precisam de seedRegistry pois nao usam a estrutura de registro Bethesda Softworks.

---

## 3. Prefixo Wine/Proton

### O que e
O prefixo e a "simulacao" de um diretorio Windows dentro do Linux. Contem:
- `user.reg` - registro do usuario
- `system.reg` - registro do sistema (onde fica o registro Bethesda)
- `drive_c/` - disco C: simulado
- `drive_c/windows/system32/` - sistema Windows

### Onde esta implementado

| Componente | Caminho | Funcao |
|------------|---------|--------|
| Criacao do prefixo | `prefix/python/prefix/core.py:112-244` | `create_prefix()` - 4 estrategias de criacao |
| Validacao | `events/mod-config.ts` | `prefixHealthCheck` - verifica se e valido |
| Auto-fix | `events/mod-config.ts` | `prefixAutoFix` - corrige problemas |
| Bridge p/ Steam | `services/steam-prefix-bridge.ts` | Symlink compatdata + config.vdf |

### Estrategias de criacao (prefix/core.py)

1. `system wineboot -u` (mais confiavel)
2. `umu-run wineboot -u` (se disponivel)
3. `proton wineboot -u` (direto do Proton)
4. `proton run wineboot -u` (fallback)

### O que o Amethyst faz

- 3 modos: Isolated (1 prefixo por jogo), Shared (varios jogos), Game (dentro do jogo)
- Usa `setup proton` do proprio Steam
- Salva `launch_env.json` com ambiente resolvido
- Auto-instala VC++ runtime e d3dcompiler_47

---

## 4. Deteccao de Jogos

### Steam (funciona bem)
- `services/detection/index.ts:20-31` → busca em TODAS as libs Steam
- Le `libraryfolders.vdf` pra achar todas as pastas
- Para cada lib, procura `appmanifest_{appId}.acf`
- Le "installdir" do manifesto

### GOG (funciona, sem Heroic)
- `services/gog-detection.ts` → scan em `~/GOG Games/`, `~/GOG/`, `~/Games/`
- Scan profundo em `/mnt`, `/media` (2 niveis)
- Para cada dir, procura o `detectExe` do jogo

### Manual/Pirata
- Usuario seleciona pasta do jogo manualmente
- App verifica se o exe existe (`detectGameManual`)
- Salva config com gamePath

### O que o Amethyst faz
- Steam: mesmo metodo (libraryfolders.vdf)
- GOG: usa Heroic Games Launcher (que nos NAO usamos)
- Custom: JSON definition em `~/.config/AmethystModManager/custom_games/`
- 3 deploy types: standard, root, ue5

---

## 5. Instalacao de Mod

### Fluxo completo

```
1. Usuario clica "Instalar Mod"
   → showOpenDialog seleciona .zip/.7z/.rar

2. InstallOrchestrator (install-orchestrator.ts)
   → Extrai pra ~/Games/Mods/{slug}/staging/{modName}/
   → Analisa tipo (plugins, FOMOD, SKSE)
   → Salva no modlist (StorageService)

3. Arquivos ficam NO STAGING (nao no jogo)

4. Usuario clica "Play"
   → Step 7: Deploy cria symlinks staging → gamePath
```

### Deploy (criacao de symlinks)

| Tipo de Jogo | Deploy Function | Destino |
|--------------|-----------------|---------|
| Bethesda | `deploySkyrim()` etc | `gamePath/Data/` |
| BepInEx | `deployGeneric()` | `gamePath/BepInEx/plugins/` |
| Root | `deployGeneric()` | `gamePath/` (raiz) |

### O que o Amethyst faz

- **Data/ Core**: backup → hardlink/symlink → core fill → plugins.txt → INIs → saves → archive invalidation
- **Root Folder**: arquivos direto na raiz (Cyberpunk, Witcher 3)
- **UE5 Manifest**: para Oblivion Remastered e jogos UE5
- LinkMode: hardlink (default), symlink, copy

---

## 6. Lanca

### Caminhos de lancamento (07-launch.ts)

| Cenario | Prefixo | SteamAppId | Metodo |
|---------|---------|------------|--------|
| Steam + prefix Steam | `compatdata/` | Sim | `steam steam://rungameid/{id}` |
| Steam/GOG + prefix custom | Qualquer | Sim ou Nao | `umu-run` ou `proton run` |
| Pirata/ manual | Qualquer | Nao | `umu-run` ou `proton run` |

### Comando umu-run (tutorial do usuario)

```bash
# Steam
umu-run --prefix "$CUSTOM_PREFIX" --appid "$GAME_ID" --proton "$PROTON" "$GAME_EXE"

# GOG/Pirata (sem appid)
umu-run --prefix "$CUSTOM_PREFIX" "$GAME_EXE"
```

### O que o Amethyst faz

- 5 modos: Native (proton run), Steam (steam://launch/), umu-run, Heroic, WB Games
- Scan de .exe/.bat no diretorio do jogo
- Per-exe environment config
- Wrapper scripts pra Wrye Bash (.bat)

---

## 7. Proton API (Python RPC)

### Metodos disponiveis

| Metodo | Funcao | Arquivo |
|--------|--------|---------|
| `recommend_proton` | Recomenda Proton pra um jogo | `recommendation/` |
| `create_prefix` | Cria/configura prefixo Wine | `prefix/core.py` |
| `get_launch_command` | Monta comando de lancamento | `launch_args/core.py` |
| `get_recommended_dlls` | DLLs recomendadas | `dlls.py` |
| `install_game_dlls` | Instala DLLs/verbs | `prefix/winetricks.py` |
| `get_installed_protons` | Lista Protons instalados | `proton_versions.py` |
| `analyze_exe` | Analisa .exe pra compatibilidade | `compatflow_bridge.py` |
| `delete_prefix` | Deleta prefixo | `prefix/core.py` |
| `clean_prefix` | Limpa prefixo | `prefix/core.py` |

### O que falta integrar

1. **`get_launch_command`** - nostro 07-launch.ts monta comando manualmente
2. **`recommend_proton`** - nosso 02-proton.ts tem logica propria
3. **`install_game_dlls`** - nosso 04-configs.ts usa runPythonCommand

---

## 8. Tabelas de Implementacao por Jogo

### Bethesda (12 jogos) - TODOS tem:

| Componente | skyrim | skyrim-se | skyrim-vr | fallout3 | falloutnv | fallout4 | fallout4-vr | oblivion | morrowind | starfield | enderal | enderal-se |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| seedRegistry | custom | shared | shared | shared | shared | shared | shared | shared | shared | shared | shared | shared |
| DLL Overrides | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES |
| frameworks.ts | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES |
| launch.ts | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES |
| routing.ts | YES | YES | YES | inline | inline | inline | inline | inline | YES | YES | YES | YES |
| tools.ts | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES |

### Nao-Bethesda (24 jogos) - NENHUM tem seedRegistry:

| Componente | witcher3 | cyberpunk | valheim | stardew | factorio | rimworld | terraria | bannerlord | 7days | subnautica | zomboid | masseffect | xcom2 |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| DLL Overrides | YES | YES | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| frameworks.ts | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| launch.ts | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| routing.ts | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES |
| tools.ts | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES | YES |

---

## 9. Bugs Conhecidos

| Bug | Descricao | Status |
|-----|-----------|--------|
| BUG-1 | core/ sem fontes Python (só .pyc) | Verificar |
| BUG-2 | Prefixo invalido recorrente | Investigar |
| BUG-3 | Falha instalacao offline | Conhecido |
| BUG-4 | Step 4 varia 140ms ~ 31s | Investigar |
| BUG-5 | useCustomPrefix inconsistente | Investigar |

---

## 10. O Que Precisa Ser Feito

### Prioridade Alta

1. **Integrar `get_launch_command` da Proton API** no 07-launch.ts
   - Hoje: codigo manual funcional mas duplica logica
   - Meta: usar RPC `get_launch_command` com fallback

2. **Auto-configuration no Play** - quando usuario clica Play sem configurar
   - Hoje: retorna erro
   - Meta: abrir wizard automaticamente

3. **Popup de prefixo** - quando nao tem prefixo, perguntar se quer criar
   - Hoje: botao manual no GameConfigPanel
   - Meta: popup automatico

4. **Auto-download SKSE** - quando nao encontrado, baixar automaticamente
   - Hoje: botao manual no GameConfigPanel
   - Meta: baixar no Play automaticamente

5. **Fluxo Steam vs GOG vs Pirata** - organizar em 3 caminhos claros
   - Hoje: tudo junto com condicoes
   - Meta: 3 funcoes separadas

### Prioridade Media

6. **Completar registries** - verificar se todos os 12 Bethesda estao funcionando
7. **Adicionar routing.ts** pros jogos Bethesda que estao inline (fallout3, falloutnv, etc)
8. **Testar GOG** - fluxo de deteccao e lancamento
9. **Testar pirata** - fluxo manual completo

---

## 11. URLs de Download por Jogo

### Script Extenders (12 jogos Bethesda)

| Jogo | SE | URL | Status |
|------|-----|-----|--------|
| skyrim | SKSE | `skse.silverlock.org/beta/skse_1_07_03.7z` | OK |
| skyrim_se | SKSE64 | `skse.silverlock.org/beta/skse64_2_02_06.7z` | OK (+ GOG URL) |
| skyrim_vr | SKSEVR | `skse.silverlock.org/beta/sksevr_2_00_12.7z` | CORRIGIDO (usava URL do SE) |
| enderal | SKSE | `skse.silverlock.org/beta/skse_1_07_03.7z` | OK |
| enderal_se | SKSE64 | `skse.silverlock.org/beta/skse64_2_02_06.7z` | OK (+ GOG URL) |
| fallout3 | FOSE | `github.com/llde/FOSE/.../fose_4_2_2.7z` | OK |
| falloutnv | xNVSE | `github.com/xNVSE/NVSE/.../nvse_6_4_8.7z` | OK |
| fallout4 | F4SE | `f4se.silverlock.org/beta/f4se_0_06_23.7z` | CORRIGIDO (usava URL do VR) |
| fallout4_vr | F4SEVR | `github.com/llde/F4SEVR/.../f4sevr_0_2_0.7z` | OK |
| oblivion | OBSE | `github.com/llde/OBSE/.../obse_21_0.7z` | OK |
| morrowind | MWSE | `github.com/MWSE/MWSE/.../MWSE-2.1.7z` | OK |
| starfield | SFSE | `sfse.silverlock.org/beta/sfse_0_2_6.7z` | OK |

### Mudancas Recentes (2026-07-13)

- **skse-downloader.ts**: Expandido de 3 para 12 jogos (todos Bethesda)
- **skyrim-vr/index.ts**: Corrigido URL (era skse64, agora sksevr)
- **fallout4/index.ts**: Corrigido URL (era 0_6_21/VR, agora 0_06_23/desktop)
- **game-dlls.json**: Preenchidas URLs vazias (skyrim, starfield)
- **morrowind/tools.ts**: Adicionadas URLs (TES3Edit, LOOT, MWSE)
- **enderal/tools.ts**: Adicionadas URLs (EnderalEdit, LOOT, Wrye Bash)
- **enderal-se/tools.ts**: Adicionadas URLs (EnderalEdit, SSEEdit, LOOT, Wrye Bash)
- **cyberpunk2077/index.ts**: Adicionada URL do WolvenKit em getExternalTools

---

## 12. Comandos Uteis

```bash
# Verificar registro do Skyrim no prefixo
cat ~/Games/Prefix/skyrim/system.reg | grep -A2 "Bethesda Softworks"

# Verificar se prefixo existe
ls -la ~/Games/Prefix/skyrim/user.reg 2>/dev/null || echo "Prefixo nao existe"

# Verificar Proton
ls ~/.config/makai-forger/compat-tools/compatibilitytools.d/

# Verificar activity.log
grep '"play_completed"' tools/Mods_manager/play/activity.log | wc -l
grep '"play_failed"' tools/Mods_manager/play/activity.log | wc -l
```
