<div align="center">

<h1 align="center">ProtonForge Launcher</h1>

  <p align="center">
    <strong>ProtonForge Launcher is an open-source gaming platform created to be the single tool that you need in order to manage your gaming library. ProtonForge is written in Node.js (Electron, React, Typescript), Python, and Rust.</strong>
  </p>

https://i.postimg.cc/CLK717Qg/background.png

</div>

## Features

- Add games that you own to your library
- Have a nice profile that shows what you are playing to your friends
- Save your game progress in the cloud with ProtonForge Cloud
- Unlock achievements
- Navigate through a rich catalogue with a powerful suggestion algorithm
- Discover new games that you haven't played before

## Build from source

See [`README-COMPILE.md`](./README-COMPILE.md).

### Local development requirements

- Node.js + Yarn
- Python 3.9+ with `pip install -r requirements.txt`
- Rust toolchain (for the native addon)

---

## 📚 Documentação

```
docs/                                                   # ← Você está aqui
├── README.md                                           # Visão geral do projeto
├── README-COMPILE.md                                   # Guia de compilação
├── README-UPDATE.md                                    # Versionamento e releases
├── changelog-2026-05-20.md                             # Changelog
│
├── arquitetura/
│   └── Mapa da Instalação de Jogos.md                  # Arquitetura completa do sistema
│
├── funcionalidades/
│   ├── GAME_LAUNCHER.md                                # Game Launcher / Gamebar (janela overlay)
│   ├── CLOUD_SAVES.md                                  # Cloud Saves (Ludusavi + nuvem)
│   ├── THEME_EDITOR.md                                 # Theme Editor (temas CSS + Monaco editor)
│   ├── SETTINGS.md                                     # Settings (preferências, armazenamento, sidebar)
│   ├── AUTH_PROFILE.md                                 # Auth/Login + Perfil de usuário
│   ├── STEAM_SHORTCUTS.md                              # Steam Shortcuts (atalhos non-Steam)
│   ├── NOTIFICATIONS.md                                # Notificações (local + API + toast)
│   ├── GAME_LIBRARY.md                                 # Game Library (64+ IPC, coleções, pin, favoritos)
│   ├── GAME_DETAILS.md                                 # Game Details (hero, gallery, repacks, modais)
│   ├── DOWNLOAD_INFRA.md                               # Download Infra (sources, torrent, hosters, debrid)
│   ├── UTILITIES.md                                    # Utility Systems (playtime, updater, WS, tray, wine tools)
│   ├── CATALOGO-CUSTOM.md                              # Catálogo customizado de jogos
│   ├── COMPATFLOW_INTEGRATION.md                       # Integração CompatFlow
│   └── SECURITY.md                                     # Política de segurança
│
├── proton-api/                                         # → protonforge-api/README.md
│   └── README.md                                       # Espelho da API Python
│
├── download/                                           # → src/main/services/download/ARQUITETURA.md
│   └── README.md                                       # Espelho da arquitetura de downloads
│
└── referencia/                                         # ⚠️ ESTUDOS DE IMPLEMENTAÇÃO ANTIGA
    ├── README.md                                       # Explicação do conteúdo
    ├── FLUXO_COMPLETO.md
    ├── MODULARIZACAO_INSTALACAO.md
    ├── MODULARIZATION_PLAN.md
    ├── INSTALL_FLOW.md
    ├── ADMIN-3-MODOS-INSTALACAO.md
    ├── ADMIN-PLAN-API-INTEGRATION.md
    ├── ADMIN-SCAN-POS-INSTALADOR.md
    ├── DOWNLOADS_PLAN.md
    ├── store-refactor.md
    ├── BUILD-SEGURA-README.md
    └── redmine/                                        # Relatos de bugs corrigidos
```

### Documentação externa (mantida em seus próprios diretórios)

| Local | Conteúdo |
|-------|----------|
| [`protonforge-api/README.md`](../protonforge-api/README.md) | API Python de recomendação Proton |
| [`tools/plaina_proton/api proton/README.md`](../tools/plaina_proton/api%20proton/README.md) | Dataset de compatibilidade Proton |
| [`data/compatflow-src/README.md`](../data/compatflow-src/README.md) | CompatFlow (análise de .exe) |
| [`src/main/services/download/ARQUITETURA.md`](../src/main/services/download/ARQUITETURA.md) | Arquitetura do sistema de downloads |

## Contributors

ProtonForge Mod Manager

## License

ProtonForge is licensed under the [MIT License](LICENSE).
