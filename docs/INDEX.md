# Índice Geral — Documentação Makai Forge

> **Última atualização:** 18/08/2026  
> Este índice mapeia TODA a documentação disponível em `docs/`, organizada por categoria, com descrição de cada arquivo e funções cobertas.

---

## 📁 Índice por Categoria

### 1. [Arquitetura](#arquitetura) (`docs/arquitetura/`)

| Arquivo | Descrição | Funções Cobertas |
|---------|-----------|------------------|
| [`visao-geral.md`](arquitetura/visao-geral.md) | Árvore arquitetural completa | Electron + Python RPC, camadas, store |
| [`mapa-instalacao-jogos.md`](arquitetura/mapa-instalacao-jogos.md) | Mapeamento completo de fluxos | Download, install, play, prefix, Proton |
| [`plano-modelizacao.md`](arquitetura/plano-modelizacao.md) | Plano de modelização | Separação de responsabilidades |
| [`guia-camadas.md`](arquitetura/guia-camadas.md) | Responsabilidades Python vs TypeScript | Frontend/Backend split |
| [`analise-atual.md`](arquitetura/analise-atual.md) | Estado atual do projeto | Análise de código legado |
| [`navegador-manager.md`](arquitetura/navegador-manager.md) | Chrome headless screencast | CDP, webview |

---

### 2. [Relatório de Downloads](#relatório-de-downloads) (`docs/Relatorio-Downloads/`)

| Arquivo | Descrição | Funções Cobertas |
|---------|-----------|------------------|
| [`README.md`](Relatorio-Downloads/README.md) | **Relatório principal completo** | Fluxo inteiro: Download → Extração → Instalação → Games |
| [`fluxo-download-completo.md`](Relatorio-Downloads/fluxo-download-completo.md) | Fluxo detalhado passo a passo | Todos os pontos de decisão e ramificações |
| [`arvore-genealogica.md`](Relatorio-Downloads/arvore-genealogica.md) | Árvore de chamadas | Quem chama quem, de ponta a ponta |
| [`analise-bugs.md`](Relatorio-Downloads/analise-bugs.md) | **Análise de bugs** | Race conditions, estados inconsistentes, tipos errados |
| [`auditoria-library-games.md`](Relatorio-Downloads/auditoria-library-games.md) | **Auditoria Library/Games** | Mapeamento das abas Library e Games, problemas identificados |
| [`auditoria-cards.md`](Relatorio-Downloads/auditoria-cards.md) | **Auditoria Cards** | Mapeamento dos 4 componentes de card da aba Games |
| [`auditoria-toolbar.md`](Relatorio-Downloads/auditoria-toolbar.md) | **Auditoria Toolbar** | Mapeamento do toolbar da aba Games |
| [`auditoria-gamebar-wine.md`](Relatorio-Downloads/auditoria-gamebar-wine.md) | **Auditoria GameBar & Wine** | Mapeamento completo GameBar, WineToolRunner, ferramentas Wine |
| [`auditoria-notifications.md`](Relatorio-Downloads/auditoria-notifications.md) | **Auditoria Notifications** | Sistema completo de notificações (API + Local) |
| [`auditoria-games-completa.md`](Relatorio-Downloads/auditoria-games-completa.md) | **Auditoria Games Completa** | Detecção, instalação, execução, GameBar, process watcher, ~60 arquivos |
| [`auditoria-proton-tools.md`](Relatorio-Downloads/auditoria-proton-tools.md) | **Auditoria ProtonTools** | Download, extração, armazenamento de Protons, 17 bugs |
| [`auditoria-settings-profile.md`](Relatorio-Downloads/auditoria-settings-profile.md) | **Auditoria Settings & Profile** | Configurações, login, runners, perfil, 17 bugs |
| [`auditoria-catalogue-emulators.md`](Relatorio-Downloads/auditoria-catalogue-emulators.md) | **Auditoria Catalogue & Emulators** | Catálogo de jogos, emuladores, webview, 13 bugs |

#### O que o Relatório de Downloads cobre:
- ✅ Início do download (startGameDownload)
- ✅ DownloadManager (polling, backends HTTP/Torrent)
- ✅ QBittorrentBackend + QBittorrentClient
- ✅ JsHttpDownloader
- ✅ Extração (7zip, GameFilesManager)
- ✅ Botão "Instalar" + Seleção de Proton
- ✅ ProtonRecommendationModal
- ✅ openGameInstaller (setupPrefix, installGame)
- ✅ installGame (installer vs portable vs restore)
- ✅ Seleção de executável (ExecutableCandidateModal)
- ✅ Jogo na aba Games (launchGame)
- ✅ Sub-aba qBittorrent (webview)
- ✅ Mapeamento completo de arquivos
- ✅ Fluxo de dados entre camadas
- ✅ Estados de download (active → paused → complete → seeding)
- ✅ Store keys (downloadsStore, gamesStore)
- ✅ Análise de bugs (20 problemas identificados)
- ✅ Auditoria das abas Library e Games
- ✅ Auditoria dos componentes de Cards
- ✅ Auditoria do Toolbar
- ✅ Auditoria do GameBar e ferramentas Wine
- ✅ Auditoria do sistema de Notificações
- ✅ Auditoria completa do módulo Games (detecção, instalação, play, GameBar)
- ✅ Auditoria do ProtonTools (download, extração, armazenamento)
- ✅ Auditoria de Settings e Profile
- ✅ Auditoria de Catalogue e Emulators

---

---

### 4. [Relatório de Play](#relatório-de-play) (`docs/Relatorio-Play/`)

| Arquivo | Descrição | Funções Cobertas |
|---------|-----------|------------------|
| [`README.md`](Relatorio-Play/README.md) | **Relatório principal completo** | Fluxo inteiro: Play → Proton → Prefix → Configs → Launch |
| [`arvore-genealogica.md`](Relatorio-Play/arvore-genealogica.md) | Árvore de chamadas | Quem chama quem, de ponta a ponta |

#### O que o Relatório de Play cobre:
- ✅ Entry point (modPlayGame, modKillGame)
- ✅ Setup manual (setupGame)
- ✅ Scan environment (scanEnvironment)
- ✅ Proton (recomendação, busca, download, mismatch)
- ✅ Prefixo Wine (criação, validação, versão)
- ✅ Bridge prefix to Steam
- ✅ DLL Overrides + verify
- ✅ MakaiTricks (winetricks components)
- ✅ Bethesda Registry + verify
- ✅ DXVK Config
- ✅ My Games (INI/saves)
- ✅ Frameworks (BepInEx, SMAPI, CET)
- ✅ External Tools
- ✅ Script Extender (SKSE, F4SE, NVSE)
- ✅ Deploy de Mods (separação Aba Games vs Mod Manager)
- ✅ Launch (umu-run, env vars, log)
- ✅ Process Watcher (playtime, cloud sync)
- ✅ Cloud Sync (Ludusavi)
- ✅ Store keys (ModStorageService, gamesStore, gamesPlaytime)

---

### 4. [Processo Principal (_main/)](#processo-principal) (`docs/_main/`)

| Subpasta | Arquivo | Descrição |
|----------|---------|-----------|
| **bootstrap/** | [`README.md`](_main/bootstrap/README.md) | Pipeline de bootstrap — venv, recursos, setup |
| **container/** | [`runtime-arch.md`](_main/container/runtime-arch.md) | Arquitetura do runtime Makai (bwrap, GPU, display) |
| | [`implementacao.md`](_main/container/implementacao.md) | Plano de implementação Makai Time |
| | [`provider-overrides.md`](_main/container/provider-overrides.md) | GPU Provider Mount |
| | [`plano-fixes.md`](_main/container/plano-fixes.md) | Fixes do container |
| | [`relatorio-nte.md`](_main/container/relatorio-nte.md) | Análise crash NTE |
| **emulators/** | [`README.md`](_main/emulators/README.md) | Engine de emuladores — 31 definições |
| **installer-api/** | [`README.md`](_main/installer-api/README.md) | API de instalação — visão geral |
| | [`classification.md`](_main/installer-api/classification.md) | Classificador de instaladores |
| | [`extraction.md`](_main/installer-api/extraction.md) | Extração de arquivos |
| | [`overrides.md`](_main/installer-api/overrides.md) | Sistema de overrides |
| | [`integration.md`](_main/installer-api/integration.md) | Integração com o app |
| | [`ADDING_NEW_TYPE.md`](_main/installer-api/ADDING_NEW_TYPE.md) | Como adicionar novo tipo |
| **rpc/** | [`README.md`](_main/rpc/README.md) | API Python de recomendação |
| | [`migracao-sqlite.md`](_main/rpc/migracao-sqlite.md) | Migração CSV/JSON → SQLite |
| **torrent-rpc/** | [`README.md`](_main/torrent-rpc/README.md) | Cliente RPC para torrents |

---

### 5. [Recursos (_resources/)](#recursos) (`docs/_resources/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](_resources/README.md) | Binários, Chrome, extensões, native addon, scripts Python |

---

### 6. [Assets (_assets/)](#assets) (`docs/_assets/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](_assets/README.md) | Estrutura de assets do app |

---

### 7. [Dados (_data/)](#dados) (`docs/_data/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](_data/README.md) | SQLite DBs, catálogos JSON, dados de jogos |

---

### 8. [Compartilhado (_shared/)](#compartilhado) (`docs/_shared/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](_shared/README.md) | Visão geral da biblioteca compartilhada |
| [`components.md`](_shared/components.md) | Catálogo de 30+ componentes |
| [`hooks.md`](_shared/hooks.md) | 22 hooks customizados |
| [`context.md`](_shared/context.md) | 4 providers de contexto React |
| [`features.md`](_shared/features.md) | 11 slices Redux |

---

### 9. [Estilos (_styles/)](#estilos) (`docs/_styles/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](_styles/README.md) | Arquitetura de estilos e temas |

---

### 10. [Mod Manager (Catalogo/GameMod/)](#mod-manager) (`docs/Catalogo/GameMod/`)

| Arquivo | Descrição |
|---------|-----------|
| [`arquitetura.md`](Catalogo/GameMod/arquitetura.md) | Arquitetura do Mod Manager |
| [`adaptar-amethyst.md`](Catalogo/GameMod/adaptar-amethyst.md) | Plano de adaptação Amethyst |
| [`bethesda-mods/README.md`](Catalogo/GameMod/bethesda-mods/README.md) | API de mods Bethesda |

---

### 11. [Catálogo (Catalogue/)](#catálogo) (`docs/Catalogue/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](Catalogue/README.md) | Catálogo com busca e fontes múltiplas |

---

### 12. [Downloads (Downloads/)](#downloads-aba) (`docs/Downloads/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](Downloads/README.md) | Infraestrutura de downloads (aba) |

> **Nota:** O relatório completo está em [`docs/Relatorio-Downloads/`](Relatorio-Downloads/)

---

### 13. [Emuladores](#emuladores) (`docs/Emulators/` e `docs/EmulatorDetail/`)

| Arquivo | Descrição |
|---------|-----------|
| [`Emulators/README.md`](Emulators/README.md) | Interface de emuladores |
| [`EmulatorDetail/README.md`](EmulatorDetail/README.md) | Detalhes do emulador |

---

### 14. [Seleção de Executável](#seleção-de-executável) (`docs/ExecutableSelect/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](ExecutableSelect/README.md) | Seleção de executável |

---

### 15. [Seleção de Pasta](#seleção-de-pasta) (`docs/FolderSelect/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](FolderSelect/README.md) | Seleção de diretórios |

---

### 16. [Aba Games](#aba-games) (`docs/Games/`)

| Arquivo | Descrição |
|---------|-----------|
| [`game-launcher.md`](Games/game-launcher.md) | Game Bar / lançamento |
| [`play-games-vs-mod-manager.md`](Games/play-games-vs-mod-manager.md) | Play vs Mod Manager |
| [`game-library.md`](Games/game-library.md) | Gerenciamento da biblioteca |
| [`game-details.md`](Games/game-details.md) | Página de detalhes |
| [`download-infra.md`](Games/download-infra.md) | Infraestrutura de downloads |
| [`cloud-saves.md`](Games/cloud-saves.md) | Cloud Saves (Ludusavi) |
| [`catalogo-custom.md`](Games/catalogo-custom.md) | Catálogo custom |
| [`steam-shortcuts.md`](Games/steam-shortcuts.md) | Atalhos Steam |
| [`prefix-flow.md`](Games/prefix-flow.md) | Fluxo Prefix + Proton + Launch |
| [`notifications.md`](Games/notifications.md) | Notificações |
| [`configuracoes.md`](Games/configuracoes.md) | Configurações |
| [`auth-profile.md`](Games/auth-profile.md) | Auth/Login + Perfil |
| [`theme-editor.md`](Games/theme-editor.md) | Editor de temas |
| [`utilities.md`](Games/utilities.md) | Utilitários |
| [`compatflow.md`](Games/compatflow.md) | Integração CompatFlow |
| [`seguranca.md`](Games/seguranca.md) | Política de segurança |
| [`melhorias.md`](Games/melhorias.md) | Análise de melhorias |
| [`sync-feedback.md`](Games/sync-feedback.md) | Feedback visual Steam sync |
| [`download/README.md`](Games/download/README.md) | Arquitetura do sistema de downloads |
| [`switch-proton/`](Games/switch-proton/) | Módulo de troca de Proton |

---

### 17. [Home](#home) (`docs/Home/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](Home/README.md) | Página home |

---

### 18. [Biblioteca](#biblioteca) (`docs/Library/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](Library/README.md) | Gerenciamento da biblioteca |

---

### 19. [Notificações](#notificações) (`docs/Notifications/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](Notifications/README.md) | Sistema de notificações |

---

### 20. [Perfil](#perfil) (`docs/Profile/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](Profile/README.md) | Página de perfil |

---

### 21. [Proton Tools](#proton-tools) (`docs/ProtonTools/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](ProtonTools/README.md) | Gerenciamento de Protons |

---

### 22. [Scripts](#scripts) (`docs/Scripts/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](Scripts/README.md) | Instalação de scripts |

---

### 23. [Configurações](#configurações) (`docs/Settings/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](Settings/README.md) | Página de configurações |

---

### 24. [Modais Compartilhados](#modais-compartilhados) (`docs/SharedModals/`)

| Arquivo | Descrição |
|---------|-----------|
| [`README.md`](SharedModals/README.md) | Modais reutilizáveis |

---

### 25. [Editor de Temas](#editor-de-temas) (`docs/ThemeEditor/`)

| Arquivo | Descrição |
|---------|-----------|
| (sem README) | Pasta existe mas sem documentação |

---

### 26. [Desenvolvimento](#desenvolvimento) (`docs/dev/`)

| Arquivo | Descrição |
|---------|-----------|
| [`agentes.md`](dev/agentes.md) | Agentes de IA e mapeamento de código |

---

## 📊 Resumo Geral

| Categoria | Documentos | Status |
|-----------|-----------|--------|
| Arquitetura | 6 | ✅ Completo |
| **Relatório Downloads** | **3** | **✅ Completo** |
| **Relatório Play** | **2** | **✅ Criado agora** |
| Processo Principal | 12 | ✅ Completo |
| Recursos | 1 | ✅ Completo |
| Assets | 1 | ✅ Completo |
| Dados | 1 | ✅ Completo |
| Compartilhado | 5 | ✅ Completo |
| Estilos | 1 | ✅ Completo |
| Mod Manager | 3 | ✅ Completo |
| Catálogo | 1 | ✅ Completo |
| Downloads (aba) | 1 | ✅ Completo |
| Emuladores | 2 | ✅ Completo |
| ExecutableSelect | 1 | ✅ Completo |
| FolderSelect | 1 | ✅ Completo |
| Games | 15+ | ✅ Completo |
| Home | 1 | ✅ Completo |
| Biblioteca | 1 | ✅ Completo |
| Notificações | 1 | ✅ Completo |
| Perfil | 1 | ✅ Completo |
| Proton Tools | 1 | ✅ Completo |
| Scripts | 1 | ✅ Completo |
| Configurações | 1 | ✅ Completo |
| SharedModals | 1 | ✅ Completo |
| ThemeEditor | 0 | ⚠️ Sem docs |
| Desenvolvimento | 1 | ✅ Completo |
| **Total** | **~65+** | |

---

## 🔗 Links Rápidos

### Para começar:
1. [`docs/arquitetura/visao-geral.md`](arquitetura/visao-geral.md) — Visão geral completa
2. [`docs/Relatorio-Downloads/README.md`](Relatorio-Downloads/README.md) — **Relatório de Downloads** (novo)
3. [`docs/arquitetura/mapa-instalacao-jogos.md`](arquitetura/mapa-instalacao-jogos.md) — Mapeamento de fluxos

### Para debugar:
1. [`docs/Relatorio-Downloads/fluxo-download-completo.md`](Relatorio-Downloads/fluxo-download-completo.md) — Fluxo Downloads passo a passo
2. [`docs/Relatorio-Downloads/arvore-genealogica.md`](Relatorio-Downloads/arvore-genealogica.md) — Quem chama quem (Downloads)
3. [`docs/Relatorio-Play/README.md`](Relatorio-Play/README.md) — **Relatório de Play** (novo)
4. [`docs/Relatorio-Play/arvore-genealogica.md`](Relatorio-Play/arvore-genealogica.md) — Quem chama quem (Play)
5. [`docs/Games/prefix-flow.md`](Games/prefix-flow.md) — Fluxo de prefixo

### Para desenvolver:
1. [`docs/_main/installer-api/`](_main/installer-api/) — API de instalação
2. [`docs/_shared/hooks.md`](_shared/hooks.md) — Hooks disponíveis
3. [`docs/_shared/components.md`](_shared/components.md) — Componentes disponíveis
