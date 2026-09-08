# Download — Arquitetura

> A documentação completa da arquitetura de downloads está em:
>
> **[`src/main/services/download/ARQUITETURA.md`](../../src/main/services/download/ARQUITETURA.md)**

## Visão Geral

Sistema de downloads modularizado, com suporte a múltiplos provedores:

| Downloader | Tipo |
|------------|------|
| Nimbus (aria2) | Download HTTP direto |
| qBittorrent | Torrent via WebUI |
| Real-Debrid | Debrid via API |
| Premiumize | Debrid via API |
| AllDebrid | Debrid via API |
| TorBox | Debrid via API |
| Gofile | File hosting via API |

## Estrutura

```
src/main/services/download/
├── index.ts              ← Fachada principal
├── types.ts              ← Interfaces
├── url/                  ← Extração/sanitização de URLs
├── options/              ← Opções por provedor
├── managers/             ← Gerenciadores (queue, seeding)
└── ...helpers
```

## Eventos IPC

| Evento | Descrição |
|--------|-----------|
| `startDownload` | Inicia download |
| `pauseDownload` | Pausa download |
| `cancelDownload` | Cancela download |
| `getDownloadInfo` | Progresso do download |
| `extractGame` | Extrai arquivos baixados |
