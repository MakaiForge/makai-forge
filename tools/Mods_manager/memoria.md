# Memoria de Investigacao - Mods_manager

> Data: 2026-07-12 | Status: Em investigacao

---

## 1. Visao Geral do Projeto

**Nome:** Makai Forge - Mods Manager
**Localizacao:** `/home/cas/Documentos/Makai-forge/tools/Mods_manager`
**Linguagens:** TypeScript (React + Node.js) + Python (backend CLI)
**Plataforma:** Linux (jogos Windows via Proton/Wine)

Gerenciador de mods para jogos Windows rodando no Linux via Proton. Suporta 36+ jogos incluindo Skyrim, Fallout, Witcher 3, Cyberpunk 2077, Factorio, etc.

---

## 2. Arquitetura (3 Camadas)

```
┌─────────────────────────────────────────────┐
│  UI (React)  - ui/ModManager.tsx            │
│  11 hooks, 36 componentes                   │
├─────────────────────────────────────────────┤
│  IPC Events  - events/*.ts                  │
│  14+ handlers (bridge para Python)          │
├─────────────────────────────────────────────┤
│  Python CLI  - core/ (server.py, cli.py)    │
│  Deploy, FOMOD, ProtonTricks, BSA, etc      │
└─────────────────────────────────────────────┘
```

---

## 3. Estrutura de Diretorios

```
Mods_manager/
├── core/                  # Python backend (APENAS __pycache__!)
├── data/                  # game-dlls.json (catalogo de DLLs)
├── docs/                  # Documentacao (conflict-resolution)
├── events/                # Handlers IPC (15 arquivos .ts)
├── games/                 # Config per-game (36 jogos + shared)
├── play/                  # Pipeline de execucao do jogo (8 steps)
│   ├── steps/             # 01-detect → 07-launch
│   ├── activity.log       # Log JSON-lines (estruturado)
│   └── play.log           # Log texto plano
├── presets/               # Perfis de configuracao
├── services/              # Servicos compartilhados
├── types/                 # Tipos TypeScript
└── ui/                    # Interface React
    ├── components/        # Componentes (36+)
    ├── hooks/             # Hooks React (11)
    ├── utils/             # Helpers
    ├── _layout/           # SCSS (10 arquivos)
    └── types/             # Tipos UI
```

---

## 4. Pipeline de Execucao (play/)

O fluxo principal esta em `play/play-game.ts` (217 linhas):

```
Step 1: detectGame    → Localiza o jogo (Steam/GOG/manual)
Step 2: ensureProton  → Encontra/instala versao Proton compativel
Step 3: ensurePrefix  → Valida/cria prefixo Wine
Step 3b: bridgePrefix → Symlink compatdata + config.vdf
Step 4: applyGameConfigs → DLL overrides + winetricks + registro
Step 5: ensureFrameworks → BepInEx, SMAPI, CET, etc
Step 5.5: ensureExternalTools → LOOT, xEdit, etc
Step 6: ensureSkse    → Script Extender (SKSE, F4SE, etc)
Step 7: deployMods    → Deploy dos mods no staging
Step 8: launchGame    → Inicia via umu-run/proton/steam
```

---

## 5. Fluxo de Deteccao de Origem do Jogo

### Como o projeto sabe se e Steam, GOG ou pirata?

O projeto NAO detecta automaticamente a origem. A decisao segue esta cascata:

```
detectGame() em play/steps/01-detect.ts
│
├─ 1. Le config salva: ModStorageService.get(`game:${gameId}:config`)
│     → Se gamePath ja existe e valido, USA DIRETO (sem perguntar origem)
│
├─ 2. SE NAO tem config salva, tenta detectar automaticamente:
│     │
│     ├─ Tenta STEAM primeiro:
│     │   → getGameInfo(gameId).steamAppId (hardcoded no registry)
│     │   → findAllSteamLibraries() busca TODAS libs Steam no sistema
│     │   → Para cada lib, procura appmanifest_{appId}.acf
│     │   → Le "installdir" do manifesto
│     │   → Verifica se o diretorio existe
│     │   → SE ACHOU: salva config e retorna com steamAppId
│     │
│     ├─ Tenta GOG (Heroic Launcher):
│     │   → detectThroughHeroic() le ~/.config/heroic/gog_store/installed.json
│     │   → Busca por match de titulo do jogo
│     │   → SE ACHOU: salva config sem steamAppId
│     │
│     ├─ Tenta GOG (caminhos comuns):
│     │   → detectCommonPaths() busca ~/GOG Games/, ~/GOG/, ~/Games/
│     │   → hardcoded para Skyrim (ERRO: so detecta Skyrim!)
│     │
│     └─ SE NENHUM: retorna erro "Jogo nao encontrado no Steam nem GOG"
│
└─ 3. SE TEM CONFIG (gamePath salvo):
      → Verifica se o diretorio existe
      → Chama mod.detect(gamePath) - checa se os EXEs do jogo existem
      → USA O CAMINHO INDEPENDENTE da origem
```

### Onde fica a informacao de origem?

| Dado | Onde esta | Exemplo |
|------|-----------|---------|
| Steam App ID | `games/registry.ts` hardcoded | `"72850"` para Skyrim |
| GameModule detect() | `games/skyrim/index.ts` | Checa `SkyrimLauncher.exe` |
| Config salva | `ModStorageService` (JSON) | `game:skyrim:config` |
| Heroic/GOG | `~/.config/heroic/gog_store/installed.json` | Lista de jogos GOG |

### O QUE FALTA (problemas):

1. **Nao existe deteccao de jogo "pirata"/customizado**
   - Se o jogo nao esta no Steam nem no Heroic, so funciona com caminho manual
   - Nao ha scan de diretorios comuns (`~/Games/`, `~/Downloads/`, etc.)

2. **GOG hardcoded para Skyrim**
   - `detectCommonPaths()` so procura Skyrim SE em ~/GOG Games/
   - Para outros jogos GOG, so funciona via Heroic

3. **Steam e a unica fonte com scan robusto**
   - Usa `findAllSteamLibraries()` que le `libraryfolders.vdf`
   - Scan automatico funciona bem so para Steam

4. **Apos primeira config, a origem e ignorada**
   - Uma vez salvo `gamePath`, o sistema usa sempre esse caminho
   - Nao re-verifica se o jogo continua la

---

## 6. Analise: Fluxo de Deteccao vs Implementacao Real

### O que voce descreveu vs o que existe:

| Etapa do fluxo | Status | Onde |
|----------------|--------|------|
| 1. Usuario seleciona jogo e clica Play | ✅ Existe | `play/play-game.ts` |
| 2. Busca Steam (todas as libs) | ✅ Existe | `services/detection/index.ts:20-31` |
| 3. Nao achou Steam → busca GOG | ✅ Existe | `services/detection/index.ts:42-47` |
| 4. Achou GOG → configura path | ✅ Existe | `services/detection/index.ts:44-46` |
| 5. Mods em ~/Games/Mods/{gameId}/ | ✅ Existe | `services/steam-library.ts:6-9` |
| 6. Botao "Detectar jogos" | ✅ Existe | `GameDetectionWizard.tsx` |
| 7. Popup "biblioteca alternativa" | ❌ NAO EXISTE | So mostra erro generico |
| 8. Heroic NAO deve ser usado | ❌ Ainda usa | `gog-detection.ts` le Heroic |
| 9. Config manual (browse) | ✅ Existe | `GameConfigPanel.tsx:112-123` |

### PROBLEMAS ENCONTRADOS:

#### PROB-1: Heroic ainda e usado na deteccao GOG
- `services/gog-detection.ts:24-49` → `detectThroughHeroic()` le `~/.config/heroic/gog_store/installed.json`
- `services/gog-detection.ts:11-22` → `heroicConfigPath()` busca 3 paths do Heroic
- **User disse:** "Heroic a gente nao mexe, nosso aplicativo e o Heroic melhorado"
- **Acao:** Remover toda referencia ao Heroic, usar scan direto de diretorios GOG

#### PROB-2: detectCommonPaths() hardcoded para Skyrim
- `services/gog-detection.ts:51-65` → So procura Skyrim SE em `~/GOG Games/`
- Para outros jogos GOG, so funciona via Heroic (que sera removido)
- **Acao:** Tornar generico - scanear `~/GOG Games/`, `~/GOG/`, `~/Games/` para QUALQUER jogo

#### PROB-3: Dois detectGame() diferentes
- `play/steps/01-detect.ts` → Usado pelo pipeline Play (duplica funcoes)
- `services/detection/index.ts` → Usado pelo `modDetectGamePath` (events)
- **Problema:** Logica duplicada, podem divergir
- **Acao:** Unificar - o `play/steps/01-detect.ts` deve importar de `services/detection/`

#### PROB-4: Sem popup "biblioteca alternativa"
- Quando o jogo nao e encontrado, mostra erro generico na UI
- Nao ha modal/popup explicando que e jogo de biblioteca alternativa
- **Acao:** Criar popup especifico quando `detectGame()` retorna `source: null`

#### PROB-5: Wizard detecta TODOS os jogos, nao so o selecionado
- `GameDetectionWizard.tsx:39-41` → Scaneia todos os jogos do catalogo
- User disse: "se eu to no Skyrim, quero detectar so o Skyrim"
- **Acao:** Filtrar wizard para mostrar SO o jogo selecionado (com opcao de "todos")

#### PROB-6: Caminho do prefixo nao e preenchido自动
- Apos deteccao GOG, `prefixPath` retorna `null` (services/detection/index.ts:46)
- User disse: "vai ta aqui no prefixo o caminho"
- **Acao:** Gerar prefixo padrao `~/Games/Prefix/{gameId}` na deteccao GOG

---

## 7. Problemas Encontrados (CRITICOS)

### BUG-1: core/ sem fontes Python
- **O que:** O diretorio `core/` contem APENAS `__pycache__/` com arquivos `.pyc`
- **Evidencia:** Nenhum `.py` encontrado via glob
- **Impacto:** O backend Python esta completo, mas as fontes nao estao no repositorio
- **Possivel causa:** Arquivos `.py` estao em outro local ou foram excluidos
- **Acao:** Verificar de onde vem esses .pyc ou se o Python esta em outro path

### BUG-2: Prefixo invalido recorrente
- **O que:** `prefixHealthCheck` retorna `valid=false`反复
- **Evidencia no play.log:**
  ```
  [2026-07-08 16:26:38] prefixHealthCheck | skyrim ... valid=false errors=Prefixo invalido ou nao existe
  ```
  Isso se repete **dezenas de vezes** ao longo de toda a sessao
- **Padrao:** O `prefixAutoFix` cria o prefixo, mas na proxima checagem ele continua invalido
- **Causa provavel:** O prefixo e criado mas os arquivos esperados (user.reg, system.reg, drive_c) nao estao sendo populados corretamente
- **Impacto:** Ciclo vicioso de criacao → validacao → falha → recriacao

### BUG-3: Erro de instalacao offline
- **O que:** Falha ao instalar DLLs quando offline
- **Evidencia no play.log:**
  ```
  [2026-07-08 20:34:45] modInstallGameDlls_result | skyrim installed= errors=Failed to install vcrun2022:
  warning: Github offline? versao '' nao parece uma versao valida
  ```
- **Causa:** O sistema tenta baixar winetricks/verb do GitHub sem fallback offline
- **Impacto:** DLLs criticas (vcrun2022, d3dcompiler_47) nao sao instaladas

### BUG-4: Variacao extrema no tempo de configs
- **O que:** Step 4 (configs) varia de ~140ms a ~31.000ms
- **Evidencia no activity.log:**
  ```
  Step 4: 146ms  (rapido)
  Step 4: 23.910ms (24 segundos!)
  Step 4: 12.093ms (12 segundos)
  Step 4: 31.023ms (31 segundos!)
  Step 4: 16.760ms (17 segundos)
  ```
- **Causa provavel:** `applyGameConfigs` faz operacoes bloqueantes (cópia de INIs, winetricks)
- **Impacto:** UI fica congelada por ate 30 segundos

### BUG-5: useCustomPrefix inconsistente
- **O que:** `useCustomPrefix` alterna entre true/false sem mudanca visivel
- **Evidencia no activity.log:**
  ```
  useCustomPrefix=false (19:14:48)
  useCustomPrefix=true  (19:18:58)
  useCustomPrefix=false (19:19:12)
  useCustomPrefix=false (21:15:49)
  ```
- **Causa:** A decisao de prefixo customizado depende de condicoes instaveis

---

## 6. Problemas de Organizacao

### ORG-1: Logs duplicados
- `play/activity.log` (JSON-lines) e `play/play.log` (texto plano) registram as mesmas informacoes em formatos diferentes
- Recomendado: Unificar em um so formato ou fazer um espelhar o outro

### ORG-2: `play-game.ts` mistura idiomas
- Comentarios em ingles ("// Always use the configured prefix")
- Logs em portugues ("Iniciando deteccao do jogo...")
- Variaveis em ingles (`finalPrefixPath`, `resolvedPrefix`)

### ORG-3: Games com estrutura inconsistente
- Alguns jogos tem `installer/` (skyrim), outros nao
- Alguns tem `frameworks.ts` (fallout3), outros nao
- Alguns tem `launch.ts` (fallout3), a maioria delega para `play/steps/07-launch.ts`

### ORG-4: Services fragmentados
- `services/` tem 10+ arquivos soltos sem subpastas claras
- `services/fomod/` tem 3 arquivos, mas outros servicos estao na raiz

### ORG-5: UI ANALISE.md desatualizado
- Menciona 36 IPC handlers (22 alive, 14 dead)
- Nao reflete o estado atual do codigo

---

## 7. Arquivos Chave para Investigacao

| Arquivo | Linhas | Por que ler |
|---------|--------|-------------|
| `play/play-game.ts` | 217 | Orquestrador principal |
| `play/steps/03-prefix.ts` | 151 | Problema do prefixo invalido |
| `play/steps/04-configs.ts` | 220 | Lentidao do step configs |
| `play/steps/02-proton.ts` | 224 | Logica de selecao Proton |
| `play/steps/07-launch.ts` | 393 | Maior arquivo, logica complexa |
| `events/mod-config.ts` | 182 | prefixHealthCheck/prefixAutoFix |
| `services/prefix-validator.ts` | 63 | Validacao do prefixo |
| `services/scanfix-game.ts` | 107 | Auto-fix do jogo |
| `events/mod-prefix-rpc.ts` | 207 | Comunicacao com Python RPC |

---

## 8. Jogos Suportados (36)

**Bethesda (12):** skyrim, skyrim-se, skyrim-vr, enderal, enderal-se, fallout3, falloutnv, fallout4, fallout4-vr, oblivion, morrowind, starfield

**Non-Bethesda (24):** cyberpunk2077, witcher3, masseffect, bannerlord, valheim, stardewvalley, terraria, factorio, rimworld, satisfactory, kerbalspaceprogram, xcom2, 7daystodie, subnautica, projectzomboid, battletech, minecraft, dragonageorigins, dragonage2, thelongdark, donotfeedthemonkeys, larian, generic

---

## 9. Proximos Passos

1. **Investigar BUG-1:** Onde estao as fontes Python do core/?
2. **Investigar BUG-2:** Por que o prefixo criado continua invalido?
3. **Investigar BUG-4:** O que causa a lentidao extrema no step configs?
4. **Verificar BUG-5:** Logica de `useCustomPrefix` no `ensureProton`
5. **Organizar:** Unificar logs ou justificar duplicacao
6. **Atualizar:** ui/ANALISE.md com estado atual

---

## 10. Comandos Uteis

```bash
# Verificar se .py existem em algum lugar
find /home/cas/Documentos/Makai-forge -name "*.py" -path "*/core/*" 2>/dev/null

# Verificar o prefixo do Skyrim
ls -la ~/Games/Prefix/skyrim/drive_c/ 2>/dev/null || echo "Prefixo nao existe"

# Verificar se Proton existe
ls -la ~/.config/makai-forger/compat-tools/compatibilitytools.d/

# Verificar activity.log por erros
grep -c '"status":"error"' /home/cas/Documentos/Makai-forge/tools/Mods_manager/play/activity.log

# Contar execucoes bem-sucedidas vs falhas
grep -c '"play_completed"' /home/cas/Documentos/Makai-forge/tools/Mods_manager/play/activity.log
grep -c '"play_failed"' /home/cas/Documentos/Makai-forge/tools/Mods_manager/play/activity.log
```
