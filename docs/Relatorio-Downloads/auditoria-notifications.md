# Auditoria: Notifications (Sistema de Notificações)

> Data: 2026-08-18
> Escopo: `app/Notifications/`, `src/main/services/notifications/`, `src/main/events/notifications/`

---

## 1. Visão Geral

O sistema de notificações do Makai Forge é composto por duas fontes:
- **Notificações API** — vindas do backend Forger (social: amigos, badges)
- **Notificações Locais** — gerenciadas localmente (downloads, extrações, updates, scan)

Ambas são unificadas na UI em uma única lista com merge e ordenação por data.

### Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│  Renderer (React)                                            │
│                                                              │
│  Notifications (página)                                      │
│    ├─ NotificationItem (API)                                 │
│    │    ├─ parseNotificationUrl() → navegação interna        │
│    │    ├─ handleAccept/Refuse → amigo request               │
│    │    └─ handleDismiss → delete                           │
│    │                                                         │
│    └─ LocalNotificationItem (local)                          │
│         ├─ getIcon() → Download/Package/Sync                 │
│         └─ handleDismiss → delete                           │
│                                                              │
├─────────────── IPC Bridge ───────────────────────────────────┤
│                                                              │
│  Main Process                                                │
│    ├─ getLocalNotifications → LocalNotificationManager       │
│    ├─ markLocalNotificationRead → .markAsRead()              │
│    ├─ markAllLocalNotificationsRead → .markAllAsRead()       │
│    ├─ deleteLocalNotification → .deleteNotification()        │
│    ├─ clearAllLocalNotifications → .clearAll()               │
│    └─ forgerApi → /profile/notifications (API REST)          │
│                                                              │
│  Store                                                       │
│    ├─ localNotificationsStore (levelDB)                      │
│    └─ db → userPreferences (toggles)                         │
│                                                              │
│  WebSocket                                                   │
│    └─ on-sync-notification-count → sidebar badge             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Arquivos Mapeados

### Renderer (UI)

| Arquivo | Linhas | Função |
|---------|--------|--------|
| `notifications.tsx` | ~350 | **Página principal** — state, fetch, merge, actions |
| `notification-item.tsx` | ~140 | Item de notificação API (amigo, badge) |
| `local-notification-item.tsx` | ~90 | Item de notificação local (download, extração) |
| `notifications.scss` | ~10 | Barrel para SCSS |
| `notification-item.scss` | ~10 | Barrel para SCSS |

### SCSS Parciais

| Arquivo | Função |
|---------|--------|
| `_notifications-layout.scss` | Layout da página (flex, max-width 800px) |
| `_notifications-utility.scss` | Utilitários |
| `_notifications-text.scss` | Tipografia |
| `_notification-item-layout.scss` | Layout do item (flex, opacidade) |
| `_notification-item-utility.scss` | Utilitários |
| `_notification-item-app-bg.scss` | Background do ícone |
| `_notification-item-border.scss` | Bordas |
| `_notification-item-accent.scss` | Accent (teal para não lidas) |
| `_notification-item-text.scss` | Tipografia do item |

### Main Process (Backend)

| Arquivo | Linhas | Função |
|---------|--------|--------|
| `notifications/local-notifications.ts` | ~100 | **LocalNotificationManager** — CRUD em levelDB |
| `notifications/index.ts` | ~130 | Funções de publicação (download, extraction, update, friend) |
| `events/notifications/get-local-notifications.ts` | ~8 | IPC: buscar notificações |
| `events/notifications/get-local-notifications-count.ts` | ~8 | IPC: contar não lidas |
| `events/notifications/mark-local-notification-read.ts` | ~8 | IPC: marcar como lida |
| `events/notifications/mark-all-local-notifications-read.ts` | ~8 | IPC: marcar todas como lidas |
| `events/notifications/delete-local-notification.ts` | ~8 | IPC: deletar |
| `events/notifications/clear-all-local-notifications.ts` | ~8 | IPC: limpar todas |
| `ws/events/notification.ts` | ~10 | WebSocket: atualizar badge no sidebar |

---

## 3. Tipos de Notificação

### 3.1 Notificações API (`NotificationType`)

| Tipo | Descrição | Ações |
|------|-----------|-------|
| `FRIEND_REQUEST_RECEIVED` | Pedido de amizade recebido | Aceitar / Recusar / Navegar pro perfil |
| `FRIEND_REQUEST_ACCEPTED` | Pedido aceito | Navegar pro perfil |
| `BADGE_RECEIVED` | Badge conquistado | Navegar pro badge |

### 3.2 Notificações Locais (`LocalNotificationType`)

| Tipo | Descrição | Ícone | URL |
|------|-----------|-------|-----|
| `DOWNLOAD_COMPLETE` | Download finalizado | DownloadIcon | `/game/{shop}/{objectId}` |
| `EXTRACTION_COMPLETE` | Extração finalizada | PackageIcon | `/game/{shop}/{objectId}` |
| `UPDATE_AVAILABLE` | Nova versão disponível | SyncIcon | (nenhum) |
| `SCAN_GAMES_COMPLETE` | Scan de jogos finalizado | SyncIcon | (nenhum) |

---

## 4. Fluxo de Dados

### 4.1 Criação de Notificação Local

```
Evento (ex: download completo)
  │
  └─ notifications/index.ts
       │
       ├─ publishDownloadCompleteNotification(game)
       │    ├─ new Notification({ title, body }).show()  ← notificação OS
       │    └─ LocalNotificationManager.createNotification("DOWNLOAD_COMPLETE", ...)
       │         ├─ crypto.randomBytes(8) → id
       │         ├─ localNotificationsStore.put(id, notification)
       │         └─ mainWindow.webContents.send("on-local-notification-created", notification)
       │
       └─ Renderer recebe via onLocalNotificationCreated listener
            └─ setLocalNotifications(prev => [notification, ...prev])
```

### 4.2 Busca de Notificações

```
Notifications.tsx → fetchAllNotifications()
  │
  ├─ fetchLocalNotifications()
  │    └─ window.electron.getLocalNotifications()
  │         └─ IPC → LocalNotificationManager.getNotifications()
  │              └─ localNotificationsStore.iterator() → sort by date
  │
  ├─ fetchBadges()
  │    └─ window.electron.forgerApi.get("/badges")
  │
  └─ fetchApiNotifications(skip, append, filter)
       └─ window.electron.forgerApi.get("/profile/notifications", { params })
            └─ API REST → { notifications[], pagination }
```

### 4.3 Merge e Ordenação

```
mergedNotifications = useMemo(() => {
  1. Filtra API notificações:
     ├─ priority === 1 → highPriority (mantém ordem da API)
     └─ priority !== 1 → lowPriorityApi

  2. Filtra Local notificações:
     └─ filter === "unread" ? só não lidas : todas

  3. Junta lowPriorityApi + localWithSource → sort by date

  4. Retorna [...highPriority, ...lowPriority]
})
```

### 4.4 Ações do Usuário

| Ação | Source | Endpoint | State Update |
|------|--------|----------|-------------|
| **Marcar como lida** | API | `PATCH /profile/notifications/{id}/read` | `isRead: true` |
| **Marcar como lida** | Local | `markLocalNotificationRead(id)` | `isRead: true` |
| **Marcar todas lidas** | API | `PATCH /profile/notifications/all/read` | Todas `isRead: true` |
| **Marcar todas lidas** | Local | `markAllLocalNotificationsRead()` | Todas `isRead: true` |
| **Dispensar** | API | `DELETE /profile/notifications/{id}` | Remove do array |
| **Dispensar** | Local | `deleteLocalNotification(id)` | Remove do array |
| **Limpar todas** | API | `DELETE /profile/notifications/all` | Array vazio |
| **Limpar todas** | Local | `clearAllLocalNotifications()` | Array vazio |
| **Aceitar amigo** | API | `updateFriendRequestState(id, "ACCEPTED")` | Remove notificação |
| **Recusar amigo** | API | `updateFriendRequestState(id, "REFUSED")` | Remove notificação |

---

## 5. LocalNotificationManager — Detalhamento

### 5.1 Métodos

```typescript
class LocalNotificationManager {
  static generateId(): string              // crypto.randomBytes(8).hex
  static createNotification(type, title, description, options?)
  static getNotifications(): Promise<LocalNotification[]>
  static getUnreadCount(): Promise<number>
  static markAsRead(id): Promise<void>
  static markAllAsRead(): Promise<void>    // batch write
  static deleteNotification(id): Promise<void>
  static clearAll(): Promise<void>
}
```

### 5.2 Storage

- **Backend**: `localNotificationsStore` (levelDB via `@main/store`)
- **Renderer**: `useState<LocalNotification[]>([])` — cache em memória
- **Sincronização**: WebSocket `on-sync-notification-count` atualiza badge no sidebar

### 5.3 Onde são criadas

| Função | Tipo | Trigger |
|--------|------|---------|
| `publishDownloadCompleteNotification` | `DOWNLOAD_COMPLETE` | Download manager → extração concluída |
| `publishExtractionCompleteNotification` | `EXTRACTION_COMPLETE` | GameFilesManager → extração OK |
| `publishNotificationUpdateReadyToInstall` | `UPDATE_AVAILABLE` | Auto-updater → nova versão |
| `scan-installed-games.ts` | `SCAN_GAMES_COMPLETE` | Scan de jogos no disco |

---

## 6. UI — Animações e Layout

### 6.1 Animações (Framer Motion)

| Elemento | Initial | Animate | Exit |
|----------|---------|---------|------|
| **Item** | `opacity: 0, x: -20` | `opacity: 1, x: 0` | `opacity: 0, x: 80` |
| **Tab underline** | Spring | `layoutId` | — |
| **Content wrapper** | `opacity: 0, x: -10` | `opacity: 1, x: 0` | `opacity: 0, x: 10` |

### 6.2 Constantes

```typescript
const STAGGER_DELAY_MS = 70;   // Delay entre remoções staggered
const EXIT_DURATION_MS = 250;  // Duração da animação de saída
```

### 6.3 Visual

```
┌──────────────────────────────────────────────────────────────┐
│ [Todos] [Não lidas (3)]                    [Marcar lidas] [Limpar] │
├──────────────────────────────────────────────────────────────┤
│ ┃ 🟢 Foto    Amigo aceitou pedido     há 2 min       [×]    │
│ ┃ 🏅 Badge   Conquistou "Veterano"    há 5 min       [×]    │
│ ┃ 🟢 Foto    João enviou pedido       há 10 min  [Aceitar]  │
│                                                          [Recusar]│
│                                                            [×] │
│  📥 Download completo          "Skyrim"          há 15 min  [×] │
│  📦 Extração completa          "Morrowind"       há 20 min  [×] │
├──────────────────────────────────────────────────────────────┤
│                    [Carregar mais]                            │
└──────────────────────────────────────────────────────────────┘
```

- **Não lidas** → `opacity: 1` + border-left teal (3px)
- **Lidas** → `opacity: 0.4`
- **Hover** → `opacity: 0.6` (lidas) / `opacity: 1` (não lidas)

---

## 7. Problemas Identificados

### 🔴 Críticos

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 1 | **`handleClearAll` deleta backend ANTES de garantir remoção** | `notifications.tsx:230-250` | Se a deleção do backend falhar (rede), o state já foi limpo. Usuário vê "sem notificações" mas elas ainda existem no servidor. |
| 2 | **`handleAcceptFriendRequest` não recarrega lista** | `notifications.tsx:270-273` | Ao aceitar amigo, mostra toast mas não atualiza a lista de notificações. A notificação de pedido continua visível até refresh manual. |
| 3 | **Race condition: `fetchAllNotifications` + `onLocalNotificationCreated`** | `notifications.tsx:95-105` | Se uma notificação local é criada enquanto `fetchLocalNotifications` está em andamento, ela pode ser perdida (fetch retorna dados antigos que sobrescrevem). |
| 4 | **`handleDismiss` não trata erro de state** | `notifications.tsx:215-225` | Se o `forgerApi.delete` falhar, a notificação já foi removida do state (linha 220). O state fica inconsistente com o backend. |

### 🟡 Médios

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 5 | **`handleMarkAsRead` API ignora erro de state** | `notifications.tsx:170-185` | Se `forgerApi.patch` falhar, o state já foi atualizado. Notificação aparece como lida mas não está no backend. |
| 6 | **`handleMarkAllAsRead` envia PATCH para todas individualmente** | `notifications.tsx:190-210` | Não usa batch — envia PATCH para cada notificação não lida. Se houver 100+, são 100+ requests. |
| 7 | **`displayedNotifications` é wrapper desnecessário** | `notifications.tsx:130-132` | `displayedNotifications` é apenas `useMemo(() => mergedNotifications, [mergedNotifications])` — o useMemo é inútil aqui. |
| 8 | **`badges` buscam a cada mudança de idioma** | `notifications.tsx:50-58` | `fetchBadges` depende de `i18n.language`. Se o idioma mudar, badges são re-buscadas. Poderia cachear. |
| 9 | **`parseNotificationUrl` não valida URL maliciosa** | `notification-item.tsx:10-30` | `new URL(notificationUrl, "http://localhost")` aceita qualquer string. Se o backend retornar uma URL com `javascript:`, pode causar XSS via `navigate()`. |
| 10 | **`onLocalNotificationCreated` listener não tem cleanup seguro** | `notifications.tsx:107-113` | `window.electron.onLocalNotificationCreated` retorna unsubscribe, mas se o componente desmontar durante uma notificação em trânsito, pode haver leak. |
| 11 | **`downloadImage` em notifications/index.ts não tem timeout** | `notifications/index.ts:33-48` | `axios.get(url, { responseType: "stream" })` sem timeout. Se a imagem for enorme ou o servidor lento, bloqueia. |
| 12 | **`publishNotificationUpdateReadyToInstall` não cria local notification com URL** | `notifications/index.ts:103-110` | A notificação de update não tem `url` — o clique no OS notification chama `restartAndInstallUpdate`, mas a notificação local não navega para lugar nenhum. |

### 🟢 Menores

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 13 | **`getNotifications` itera toda a store** | `local-notifications.ts:45-52` | `for await (... iterator())` é O(n). Para poucas notificações é OK, mas se acumularem centenas, fica lento. |
| 14 | **`markAllAsRead` usa batch sem limitar tamanho** | `local-notifications.ts:63-75` | Se houver 1000+ notificações, o batch pode ser grande demais para o levelDB. |
| 15 | **SCSS usa `rgba(255, 255, 255, ...)` hardcoded** | `_notifications-layout.scss` | Não usa variáveis CSS ou tokens. Temaescuro-only. |
| 16 | **`notification-item__dismiss` position absolute sem bounds** | `_notification-item-layout.scss:68-80` | Botão X posicionado absolute mas sem `top/right` definidos. Pode ficar em posição errada em telas pequenas. |
| 17 | **`notification-item` é `<button>` mas não tem `type="button"` em todos os contextos** | `local-notification-item.tsx:58` | O item outer é `<button>` sem `type="button"` explícito — pode submeter form se estiver dentro de um. |

---

## 8. Fluxo de友人リクエスト (Friend Request)

```
1. Backend envia WebSocket → notification.ts
   │
2. notificationEvent() → mainWindow.send("on-sync-notification-count")
   │
3. SidebarProfile atualiza badge
   │
4. Usuário abre aba Notificações
   │
5. fetchApiNotifications() → GET /profile/notifications
   │
6. Renderiza NotificationItem com type="FRIEND_REQUEST_RECEIVED"
   │
7. Usuário clica "Aceitar":
   │  handleAccept()
   │  ├─ updateFriendRequestState(senderId, "ACCEPTED")
   │  ├─ onAcceptFriendRequest() → showSuccessToast
   │  └─ onDismiss() → DELETE /profile/notifications/{id}
   │
8. Notificação removida da lista
```

---

## 9. Mapa de Chamadas

```
Renderer                              Main Process
────────                              ────────────
Notifications.tsx
  │
  ├─ fetchLocalNotifications() ──────→ getLocalNotifications
  │                                      └─ LocalNotificationManager.getNotifications()
  │
  ├─ fetchApiNotifications() ────────→ forgerApi.get("/profile/notifications")
  │
  ├─ fetchBadges() ──────────────────→ forgerApi.get("/badges")
  │
  ├─ handleMarkAsRead(id, source)
  │    ├─ API ────────────────────────→ forgerApi.patch("/profile/notifications/{id}/read")
  │    └─ Local ─────────────────────→ markLocalNotificationRead(id)
  │                                      └─ LocalNotificationManager.markAsRead(id)
  │
  ├─ handleMarkAllAsRead()
  │    ├─ API ────────────────────────→ forgerApi.patch("/profile/notifications/all/read")
  │    └─ Local ─────────────────────→ markAllLocalNotificationsRead()
  │                                      └─ LocalNotificationManager.markAllAsRead()
  │
  ├─ handleDismiss(id, source)
  │    ├─ API ────────────────────────→ forgerApi.delete("/profile/notifications/{id}")
  │    └─ Local ─────────────────────→ deleteLocalNotification(id)
  │                                      └─ LocalNotificationManager.deleteNotification(id)
  │
  ├─ handleClearAll()
  │    ├─ API ────────────────────────→ forgerApi.delete("/profile/notifications/all")
  │    └─ Local ─────────────────────→ clearAllLocalNotifications()
  │                                      └─ LocalNotificationManager.clearAll()
  │
  ├─ onLocalNotificationCreated ──────→ webContents.send("on-local-notification-created")
  │
  └─ handleAccept/Refuse()
       └─ updateFriendRequestState() ─→ API (friend request)
```

---

## 10. Recomendações

### Prioridade Alta

1. **Corrigir `handleClearAll`** — Deletar backend ANTES de limpar state, ou usar rollback
2. **Corrigir `handleDismiss`** — Remover do state SÓ APÓS sucesso do backend
3. **Adicionar validação de URL** em `parseNotificationUrl` — Whitelist de paths permitidos
4. **Recarregar lista após accept/refuse** de friend request

### Prioridade Média

5. **Adicionar optimistic updates corretos** — state só muda após sucesso
6. **Usar batch** para `handleMarkAllAsRead` (ou aceitar N requests)
7. **Cachear badges** — não re-buscar a cada mudança de idioma
8. **Adicionar timeout** em `downloadImage`
9. **Adicionar `type="button"`** em todos os `<button>` elements
10. **Corrigir `notification-item__dismiss`** — adicionar `top: 8px; right: 8px;`

### Prioridade Baixa

11. **Usar tokens CSS** em vez de `rgba(255, 255, 255, ...)` hardcoded
12. **Remover `displayedNotifications`** wrapper inútil
13. **Adicionar paginação lazy** para `getNotifications` se a store crescer
