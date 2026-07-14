# Arquitetura do Mods Manager

> Visão geral do sistema. Caminho base: `tools/Mods_manager/`

---

## O que e o Mods Manager

Um mod manager para jogos Linux que rodam via Proton/Wine. Gerencia o ciclo de vida completo: instalar mods, configurar o prefix Wine, configurar camadas de compatibilidade (Proton, DXVK, VKD3D), e lançar o jogo com tudo funcionando.

---

## Camadas

```
┌─────────────────────────────────────────────────┐
│  UI (React)                                      │
│  ModManager.tsx → 25+ hooks → componentes        │
├─────────────────────────────────────────────────┤
│  IPC (Electron)                                  │
│  events/ → registerEvent() → handlers            │
├─────────────────────────────────────────────────┤
│  Services                                        │
│  install/ · deploy/ · detection/ · fomod/        │
│  environment · health-check · framework          │
├─────────────────────────────────────────────────┤
│  Games                                           │
│  registry.ts → 33 GameModules + generic          │
│  _shared/ → symlink · filemap · prefix · launch  │
├─────────────────────────────────────────────────┤
│  Play Flow                                       │
│  detect → proton → prefix → configs →            │
│  frameworks → tools → skse → deploy → launch     │
├─────────────────────────────────────────────────┤
│  Storage                                         │
│  ModStorageService → JSON file-backed store      │
└─────────────────────────────────────────────────┘
```

---

## Responsabilidades por Camada

### UI (React)
Componentes e hooks que montam a interface. `ModManager.tsx` e o componente raiz que monta 25+ hooks. Cada hook conecta a UI a um servico ou evento IPC.

### IPC (Electron)
Cada arquivo em `events/` registra handlers IPC via `registerEvent()`. Sao as pontes entre o renderer (UI) e o main process (Node.js). Cada handler e um ponto de entrada.

### Services
Logica de negocios pura. Nao dependem de UI nem de IPC. Dividem-se em:
- **install/**: Pipeline de instalacao (ler archive → extrair → verificar → detectar tipo → gravar meta → deploy)
- **deploy/**: Engine de deploy (hardlink → symlink → copy em batches de 16)
- **detection/**: Encontrar o jogo (Steam, GOG, manual)
- **fomod/**: Parser e instalador FOMOD
- **environment-scanner**: Verificacao completa do ambiente (23 campos)
- **health-check**: Saude do prefix e auto-fix
- **framework-installer**: BepInEx, SMAPI, CET, etc.

### Games
33 modulos de jogo, cada um implementando a interface `GameModule`. O `registry.ts` e o direcionador — dado um gameId, retorna o modulo correto (ou o generico como fallback).

### Play Flow
Pipeline de 13 etapas que prepara e lanca o jogo. Cada etapa e um step independente em `play/steps/`.

### Storage
`ModStorageService` — store JSON persistido em disco. Todas as configuracoes, modlists, inventarios e profiles passam por ele.

---

## Dois Fluxos Principais

O sistema tem dois fluxos que se complementam:

### Install (extrair e preparar o mod)
Lê o archive, extrai pro staging, verifica integridade, detecta tipo, grava meta, e opcionalmente prepara o ambiente do jogo (prefix, frameworks, SKSE) antes de fazer deploy.

### Play (configurar e lancar o jogo)
Detecta o jogo, configura Proton, cria/valida prefix, aplica configs (DLL overrides, registry), instala frameworks, faz deploy dos mods do staging pro jogo, e lanca.

A unica conexao entre os dois e a **modlist** — Install escreve nela, Play/deploy le.

### Auto-Deteccao de Prefix
O sistema busca automaticamente prefix existente antes de pedir criacao:
1. `detectGame()` encontra o jogo (Steam/GOG/manual) e retorna o prefixPath real
2. `findExistingPrefix()` busca em有多处: Steam compatdata, todas as libraries, default dir
3. O prefix so e criado se nao for encontrado em nenhum local conhecido

---

## Dependencias entre Modulos

```
         GameModule (interface)
              │
     ┌────────┼────────┐
     │        │        │
  games/    play/    services/
 registry  steps/   install-orchestrator
     │        │        │
  33 game   7 steps   deploy · detection
  modules             environment · fomod
```

Modulos mais referenciados:
1. `events/register-event` — 22 event files
2. `ModStorageService` — 15+ files
3. `getGameModule` (registry) — 12+ files
4. `getGameInfo` (registry) — 6 files
5. `buildFilemap` (_shared/filemap) — 8 files

---

## Pontos de Entrada (Entry Points)

| Entrada | Trigger | Onde |
|---------|---------|------|
| Instalar mod | Botao "Install" | `events/mod-deploy.ts` |
| Jogar | Botao "Play" | `play/index.ts` |
| Deploy | Botao "Deploy" | `events/mod-deploy.ts` |
| Matar jogo | Botao "Kill" | `play/index.ts` |
| Scan+Fix | Auto ou manual | `events/mod-launch.ts` |
| Environment scan | Auto ao selecionar | `events/mod-environment.ts` |
| FOMOD | Apos install | `events/mod-fomod.ts` |
| LOOT sort | Botao "Sort" | `events/mod-load-order.ts` |
| Backup/Restore | Painel backup | `events/mod-backup.ts` |
| Config jogo | Painel config | `events/mod-config.ts` |
| Trocar Proton | Painel proton | `events/mod-switch-proton.ts` |
| ESLify | Acao mod | `events/mod-eslifier.ts` |
| Ferramentas | Painel tools | `events/mod-exe-launcher.ts` |
| Health check | Auto/manual | `events/mod-config.ts` |
