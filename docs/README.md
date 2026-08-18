# Documentação Makai Forge

Estrutura espelha a organização do código em `app/`.

## arquitetura/
Visão geral do sistema, camadas e fluxos.

- [`visao-geral.md`](arquitetura/visao-geral.md) — Árvore arquitetural completa (Electron + Python RPC)
- [`guia-camadas.md`](arquitetura/guia-camadas.md) — Responsabilidades Python vs TypeScript
- [`analise-atual.md`](arquitetura/analise-atual.md) — Estado atual do projeto (20/07/2026)
- [`plano-modelizacao.md`](arquitetura/plano-modelizacao.md) — Plano de modelização da arquitetura
- [`mapa-instalacao-jogos.md`](arquitetura/mapa-instalacao-jogos.md) — Mapeamento completo de fluxos
- [`navegador-manager.md`](arquitetura/navegador-manager.md) — Chrome headless screencast (CDP)

## _main/
Código do processo principal do Electron.

### bootstrap/
Setup inicial do app — venv Python, downloads de recursos, janela de setup.

- [`README.md`](_main/bootstrap/README.md) — Pipeline de bootstrap completo

### container/
Container engine (Wine/Proton) — substituto do pressure-vessel.

- [`runtime-arch.md`](_main/container/runtime-arch.md) — Arquitetura do runtime Makai (bwrap, GPU, display, áudio)
- [`implementacao.md`](_main/container/implementacao.md) — Plano de implementação do Makai Time
- [`provider-overrides.md`](_main/container/provider-overrides.md) — Plano de correção GPU Provider Mount
- [`plano-fixes.md`](_main/container/plano-fixes.md) — Plano de fixes do container
- [`relatorio-nte.md`](_main/container/relatorio-nte.md) — Relatório de análise do crash NTE

### emulators/
Engine de emuladores — 31 definições, auto-install, RetroArch/libretro.

- [`README.md`](_main/emulators/README.md) — Arquitetura e definições de emuladores

### installer-api/
API de instalação — classificação, extração, overrides.

- [`README.md`](_main/installer-api/README.md) — Visão geral
- [`classification.md`](_main/installer-api/classification.md) — Classificador de instaladores
- [`extraction.md`](_main/installer-api/extraction.md) — Extração de arquivos
- [`overrides.md`](_main/installer-api/overrides.md) — Sistema de overrides
- [`integration.md`](_main/installer-api/integration.md) — Integração com o app
- [`ADDING_NEW_TYPE.md`](_main/installer-api/ADDING_NEW_TYPE.md) — Como adicionar novo tipo de instalador

### rpc/
API Python de recomendação de Proton.

- [`README.md`](_main/rpc/README.md) — Visão geral
- [`migracao-sqlite.md`](_main/rpc/migracao-sqlite.md) — Migração CSV/JSON → SQLite

### torrent-rpc/
Cliente RPC para torrents — bridge STDIO JSON-RPC para qBittorrent Web API.

- [`README.md`](_main/torrent-rpc/README.md) — Arquitetura e métodos do RPC

## _resources/
Runtime binaries e recursos estáticos do app.

- [`README.md`](_resources/README.md) — Binários, Chrome, extensões, native addon, scripts Python

## _assets/
Assets de UI — ícones, backgrounds, sons, screenshots.

- [`README.md`](_assets/README.md) — Estrutura de assets do app

## _data/
Bancos de dados e dados estáticos.

- [`README.md`](_data/README.md) — SQLite DBs, catálogos JSON, dados de jogos

## _shared/
Componentes, hooks, contextos e utilidades compartilhadas entre páginas.

- [`README.md`](_shared/README.md) — Visão geral da biblioteca compartilhada
- [`components.md`](_shared/components.md) — Catálogo de 30+ componentes
- [`hooks.md`](_shared/hooks.md) — 22 hooks customizados
- [`context.md`](_shared/context.md) — 4 providers de contexto React
- [`features.md`](_shared/features.md) — 11 slices Redux

## _styles/
Sistema de temas SCSS — tokens, variáveis CSS, tema glass-morphism.

- [`README.md`](_styles/README.md) — Arquitetura de estilos e temas

## _venv/
Python virtualenv — gerenciado pelo bootstrap.

## Catalogo/GameMod/
Mod Manager — catalogação, mods, prefixos.

- [`arquitetura.md`](Catalogo/GameMod/arquitetura.md) — Arquitetura do Mod Manager
- [`adaptar-amethyst.md`](Catalogo/GameMod/adaptar-amethyst.md) — Plano de adaptação do Amethyst
- [`bethesda-mods/README.md`](Catalogo/GameMod/bethesda-mods/README.md) — API de mods Bethesda

## Catalogue/
Página de catálogo de jogos — busca, filtros, grid de resultados.

- [`README.md`](Catalogue/README.md) — Catálogo com busca e fontes múltiplas

## Relatorio-Play/
Relatório completo do mapeamento de Play — fluxo inteiro de clique em Play até o jogo rodando.

- [`README.md`](Relatorio-Play/README.md) — **Relatório principal completo** (fluxo Play → Proton → Prefix → Configs → Launch)
- [`arvore-genealogica.md`](Relatorio-Play/arvore-genealogica.md) — Árvore de chamadas: quem chama quem de ponta a ponta

## Downloads/
## Relatorio-Downloads/
Relatório completo do mapeamento de Downloads — fluxo inteiro de download até exibição na aba Games.

- [`README.md`](Relatorio-Downloads/README.md) — **Relatório principal completo** (fluxo Download → Extração → Instalação → Games)
- [`fluxo-download-completo.md`](Relatorio-Downloads/fluxo-download-completo.md) — Fluxo detalhado passo a passo com todos os pontos de decisão
- [`arvore-genealogica.md`](Relatorio-Downloads/arvore-genealogica.md) — Árvore de chamadas: quem chama quem de ponta a ponta
  - [`analise-bugs.md`](Relatorio-Downloads/analise-bugs.md) — Análise de bugs
  - [`auditoria-library-games.md`](Relatorio-Downloads/auditoria-library-games.md) — Auditoria Library e Games
  - [`auditoria-cards.md`](Relatorio-Downloads/auditoria-cards.md) — Auditoria Cards
  - [`auditoria-toolbar.md`](Relatorio-Downloads/auditoria-toolbar.md) — Auditoria Toolbar
  - [`auditoria-gamebar-wine.md`](Relatorio-Downloads/auditoria-gamebar-wine.md) — Auditoria GameBar e funções Wine/Proton
  - [`auditoria-notifications.md`](Relatorio-Downloads/auditoria-notifications.md) — Auditoria do sistema de notificações
  - [`auditoria-games-completa.md`](Relatorio-Downloads/auditoria-games-completa.md) — Auditoria completa do módulo Games
  - [`auditoria-proton-tools.md`](Relatorio-Downloads/auditoria-proton-tools.md) — Auditoria do ProtonTools (download, extração, armazenamento)

Página de downloads — gerenciamento de torrents, fila de instalação.

- [`README.md`](Downloads/README.md) — Infraestrutura de downloads

## Emulators/
Página de emuladores — grid de categorias, play/stop, ROM sites.

- [`README.md`](Emulators/README.md) — Interface de emuladores

## EmulatorDetail/
Página de detalhes de um emulador — hero, play button, sites de ROM.

- [`README.md`](EmulatorDetail/README.md) — Detalhes do emulador

## ExecutableSelect/
Modal de seleção de executável — lista candidatos + browse manual.

- [`README.md`](ExecutableSelect/README.md) — Seleção de executável

## FolderSelect/
Modal de seleção de pasta — checkbox tree com pre-seleção.

- [`README.md`](FolderSelect/README.md) — Seleção de diretórios

## Games/
Funcionalidades relacionadas a jogos.

- [`game-launcher.md`](Games/game-launcher.md) — Game Bar / lançamento de jogos
- [`play-games-vs-mod-manager.md`](Games/play-games-vs-mod-manager.md) — **Play da aba Games vs Play do Mod Manager** (jogo ≠ mod; correção do bug que apagava o jogo)
- [`game-library.md`](Games/game-library.md) — Gerenciamento da biblioteca
- [`game-details.md`](Games/game-details.md) — Página de detalhes do jogo
- [`download-infra.md`](Games/download-infra.md) — Infraestrutura de downloads
- [`cloud-saves.md`](Games/cloud-saves.md) — Cloud Saves (Ludusavi)
- [`catalogo-custom.md`](Games/catalogo-custom.md) — Catálogo custom (jogos fora do catálogo)
- [`steam-shortcuts.md`](Games/steam-shortcuts.md) — Atalhos Steam
- [`prefix-flow.md`](Games/prefix-flow.md) — Fluxo Prefix + Proton + Launch
- [`notifications.md`](Games/notifications.md) — Sistema de notificações
- [`configuracoes.md`](Games/configuracoes.md) — Página de configurações
- [`auth-profile.md`](Games/auth-profile.md) — Auth/Login + Perfil
- [`theme-editor.md`](Games/theme-editor.md) — Editor de temas
- [`utilities.md`](Games/utilities.md) — Utilitários (playtime, updater)
- [`compatflow.md`](Games/compatflow.md) — Integração CompatFlow
- [`seguranca.md`](Games/seguranca.md) — Política de segurança
- [`melhorias.md`](Games/melhorias.md) — Análise de melhorias na aba Games
- [`sync-feedback.md`](Games/sync-feedback.md) — Correção feedback visual Steam sync
- [`download/README.md`](Games/download/README.md) — Arquitetura do sistema de downloads
- [`switch-proton/`](Games/switch-proton/) — Módulo de troca de Proton por jogo

## Home/
Página inicial — carrossel de notícias, deals, jogos grátis, navegador.

- [`README.md`](Home/README.md) — Página home

## Library/
Biblioteca de jogos — 3 modos de visualização, coleções, busca.

- [`README.md`](Library/README.md) — Gerenciamento da biblioteca

## Notifications/
Central de notificações — API + local, ações, paginação.

- [`README.md`](Notifications/README.md) — Sistema de notificações

## Profile/
Perfil do usuário — hero, abas (Library/Wrapped), estatísticas, amigos.

- [`README.md`](Profile/README.md) — Página de perfil

## ProtonTools/
Catálogo de Protons — 20+ tool definitions, GitHub/Forgejo/GitLab releases.

- [`README.md`](ProtonTools/README.md) — Gerenciamento de Protons

## Scripts/
Página de scripts — deep-link auto-install.

- [`README.md`](Scripts/README.md) — Instalação de scripts

## Settings/
Configurações — 5 categorias, temas, runners, debrid services.

- [`README.md`](Settings/README.md) — Página de configurações

## SharedModals/
Modais compartilhados — InstallScript, BinaryNotFound, ProtonForgeCloud.

- [`README.md`](SharedModals/README.md) — Modais reutilizáveis

&nbsp;

**Total:** 25 categorias, 50+ documentos espelhando `app/`.
