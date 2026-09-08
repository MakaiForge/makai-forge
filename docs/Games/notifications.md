# Notifications — Sistema de Notificações

> Duas fontes de notificação (API remota + local), exibição via página dedicada
> com merged list, notificações nativas do SO (Electron Notification), e toasts
> temporários na interface.

---

## Mapa Mental

```
NOTIFICATIONS
│
├── LOCAIS (armazenamento)
│     ├── DOWNLOAD_COMPLETE    → DownloadManager
│     ├── EXTRACTION_COMPLETE  → GameFilesManager
│     ├── UPDATE_AVAILABLE     → AutoUpdater
│     └── SCAN_GAMES_COMPLETE  → ScanInstalledGames
│
├── REMOTAS (API/WS)
│     ├── FRIEND_REQUEST_RECEIVED
│     ├── FRIEND_REQUEST_ACCEPTED
│     └── BADGE_RECEIVED
│
├── EXIBIÇÃO
│     ├── Página /notifications (merged list API + local)
│     ├── Native Notification (SO) via Electron
│     └── Toast (canto inferior direito, temporário)
│
├── CONFIGURAÇÃO (UserPreferences)
│     ├── downloadNotificationsEnabled
│     ├── repackUpdatesNotificationsEnabled
│     ├── friendRequestNotificationsEnabled
│     └── friendStartGameNotificationsEnabled
│
└── BADGE
      └── SidebarProfile → contagem de não lidas (max "99+")
```

---

## Tipos de Notificação

### Locais (`LocalNotificationType`)
| Tipo | Gatilho | Native Notification | LocalNotification |
|------|---------|-------------------|-------------------|
| `DOWNLOAD_COMPLETE` | Download finalizado | ✅ (se ativado) | ✅ |
| `EXTRACTION_COMPLETE` | Extração concluída | ✅ (sempre) | ✅ |
| `UPDATE_AVAILABLE` | Update baixado | ✅ (sempre, click → reinicia) | ✅ |
| `SCAN_GAMES_COMPLETE` | Scan de jogos instalados | ❌ | ✅ |

### Remotas (`NotificationType`)
| Tipo | Origem | Descrição |
|------|--------|-----------|
| `FRIEND_REQUEST_RECEIVED` | WebSocket | Alguém te enviou pedido de amizade |
| `FRIEND_REQUEST_ACCEPTED` | WebSocket | Seu pedido foi aceito |
| `BADGE_RECEIVED` | WebSocket | Você ganhou um badge |

### Toast (feedback temporário)
| Tipo | Ícone | Duração |
|------|-------|---------|
| `success` | CheckCircleFillIcon | 2500ms |
| `error` | XCircleFillIcon | 2500ms |
| `warning` | AlertIcon | 2500ms |

---

## Armazenamento

### Armazenamento: Notificações Locais
```
<userData>/stores/app/ → "localNotifications"
```

Formato:
```typescript
interface LocalNotification {
  id: string
  type: LocalNotificationType
  title: string
  description: string
  pictureUrl: string | null
  url: string | null        // Rota interna (ex: /game/:shop/:objectId)
  isRead: boolean
  createdAt: string          // ISO string
}
```

### API Remota: Notificações do Servidor
```typescript
interface Notification {
  id: string
  type: NotificationType
  variables: Record<string, string>   // senderId, senderDisplayName, badgeName...
  pictureUrl: string | null
  url: string | null
  isRead: boolean
  priority: number                     // 1 = alta prioridade
  createdAt: string
}
```

### Merged (exibição unificada)
```typescript
type MergedNotification =
  | (Notification & { source: "api" })
  | (LocalNotification & { source: "local" })
```

---

## Fluxo de Exemplo: Download Completo

```
DownloadManager.handleDownloadCompletion()
  │
  ▼ publishDownloadCompleteNotification(game)
    ├── [Se downloadNotificationsEnabled]
    │     new Notification({ title: game.title, body: "Download complete!", icon })
    │
    └── LocalNotificationManager.createNotification("DOWNLOAD_COMPLETE", game.title)
          ├── Gera ID (crypto.randomBytes)
          ├── Salva no armazenamento (localNotificationsStore)
          └── webContents.send("on-local-notification-created", notification)
                │
                ▼ Renderer
                ├── SidebarProfile: atualiza badge count
                ├── Página /notifications: adiciona à lista
                └── LocalNotificationItem: renderiza com ícone + texto
```

---

## Página de Notificações (/notifications)

```
<Notifications>
  ├── Filtro: "All" | "Unread"
  ├── Botões: "Mark All as Read" | "Clear All"
  ├── Lista merged (API + local, ordenada por priority↓ + createdAt↓)
  ├── Load More (20 itens por página)
  ├── AnimatedPresence (Framer Motion) para entrada/saída
  │
  ├── NotificationItem (API)
  │     ├── FRIEND_REQUEST_RECEIVED → botões Accept/Refuse
  │     ├── FRIEND_REQUEST_ACCEPTED → informativo
  │     ├── BADGE_RECEIVED → descrição do badge
  │     └── default → genérico
  │
  └── LocalNotificationItem
        ├── DOWNLOAD_COMPLETE   → DownloadIcon
        ├── EXTRACTION_COMPLETE → PackageIcon
        ├── UPDATE_AVAILABLE    → SyncIcon
        └── SCAN_GAMES_COMPLETE → SyncIcon
```

---

## Notificações Nativas (SO)

Arquivo: `src/main/services/notifications/index.ts`

| Função | Gatilho | Config | Action |
|--------|---------|--------|--------|
| `publishDownloadCompleteNotification` | Download fim | `downloadNotificationsEnabled` | — |
| `publishExtractionCompleteNotification` | Extração fim | Sempre | — |
| `publishNotificationUpdateReadyToInstall` | Update baixado | Sempre | Click → restartAndInstall |
| `publishNewFriendRequestNotification` | WS pedido | `friendRequestNotificationsEnabled` | — |
| `publishFriendStartedPlayingGameNotification` | WS amigo jogando | `friendStartGameNotificationsEnabled` | — |
| `publishNewRepacksNotification` | IPC do renderer | `repackUpdatesNotificationsEnabled` | — |

---

## Toast System

```
<Toast>  ← componente fixo no layout
  ├── Animação: slide up (enter) / slide down (exit)
  ├── Barra de progresso (requestAnimationFrame)
  └── 3 tipos: success (verde), error (vermelho), warning (amarelo)

Hook: useToast()
  ├── showSuccessToast(message)
  ├── showErrorToast(message)
  └── showWarningToast(message)
```

Toast é **feedback de ação do usuário** — diferente das notificações de sistema.

---

## Sidebar Badge

```
SidebarProfile
  ├── Escuta: onLocalNotificationCreated
  ├── Escuta: onSyncNotificationCount (WS)
  ├── Escuta: CustomEvent "notificationsChanged"
  ├── Pooling: getLocalNotificationsCount() + API /profile/notifications/count
  └── Exibe: badge com contagem (max "99+")
```

---

## Eventos IPC

### Invoke (Renderer → Main) — Notificações Locais

| Canal | Preload | Quando |
|-------|---------|--------|
| `getLocalNotifications` | `window.electron.getLocalNotifications()` | Carregar lista |
| `getLocalNotificationsCount` | `window.electron.getLocalNotificationsCount()` | Badge count |
| `markLocalNotificationRead` | `window.electron.markLocalNotificationRead(id)` | Click na notificação |
| `markAllLocalNotificationsRead` | `window.electron.markAllLocalNotificationsRead()` | Botão "Mark All Read" |
| `deleteLocalNotification` | `window.electron.deleteLocalNotification(id)` | Remover uma |
| `clearAllLocalNotifications` | `window.electron.clearAllLocalNotifications()` | Limpar tudo |
| `publishNewRepacksNotification` | `window.electron.publishNewRepacksNotification(count)` | Notificar novos repacks |

### Push (Main → Renderer)

| Evento | Quando | Efeito |
|--------|--------|--------|
| `on-local-notification-created` | Nova notif local | Adiciona à lista + atualiza badge |
| `on-sync-notification-count` | WS: contagem remota | Atualiza badge |

### API (via forgerApiCall)

| Rota | Método | Uso |
|------|--------|-----|
| `/profile/notifications` | GET | Listar (pagination: filter, take, skip) |
| `/profile/notifications/count` | GET | Contar não lidas |
| `/profile/notifications/{id}/read` | PATCH | Marcar lida |
| `/profile/notifications/all/read` | PATCH | Marcar todas lidas |
| `/profile/notifications/{id}` | DELETE | Remover |
| `/profile/notifications/all` | DELETE | Limpar todas |

---

## Configurações

`SettingsContextNotifications` → checkboxes:
- `enable_download_notifications` → `downloadNotificationsEnabled`
- `enable_repack_list_notifications` → `repackUpdatesNotificationsEnabled`

`friendRequestNotificationsEnabled` e `friendStartGameNotificationsEnabled` existem no tipo mas **não têm UI de configuração**.

---

## WebSocket

```
WSClient (main)
  ├── Mensagem "notification" → notificationEvent() → on-sync-notification-count
  └── Mensagem "friendRequest" → friendRequestEvent() → on-sync-friend-requests
```

---

## LocalNotificationManager (Main Process)

```typescript
class LocalNotificationManager {
  static createNotification(type, title, desc, options?)
    → storePut + webContents.send("on-local-notification-created")
  static getNotifications()       → sorted by createdAt desc
  static getUnreadCount()         → count isRead === false
  static markAsRead(id)           → storePut
  static markAllAsRead()          → batch update
  static deleteNotification(id)   → storeDel
  static clearAll()               → storeClear
}
```

Persistência: `src/main/level/sublevels/local-notifications.ts`

---

## Arquivos Envolvidos

| Área | Arquivos |
|------|----------|
| **Types** | `src/types/index.ts` (Notification, LocalNotification, MergedNotification, LocalNotificationType, NotificationType) |
| **Types Prefs** | `src/types/level.types.ts` (UserPreferences flags) |
| **Main IPC** | `src/main/events/notifications/*.ts` (7 handlers) |
| **Main Service** | `src/main/services/notifications/index.ts` (native notifications), `local-notifications.ts` (LocalNotificationManager) |
| **Main Gatilhos** | `src/main/services/download/completion/index.ts`, `game-files-manager.ts`, `update-manager.ts`, `events/library/scan-installed-games.ts` |
| **Main WS** | `src/main/services/ws/events/notification.ts`, `friend-request.ts` |
| **Main Armazenamento** | `src/main/store/sublevels/local-notifications.ts` |
| **Preload** | `src/preload/app.ts` (local notif bindings), `auth.ts` (onSyncNotificationCount) |
| **Renderer Page** | `src/renderer/src/pages/notifications/` (4 componentes) |
| **Renderer Toast** | `src/renderer/src/components/toast/` |
| **Renderer Badge** | `src/renderer/src/components/sidebar/sidebar-profile.tsx` |
| **Renderer Settings** | `src/renderer/src/pages/settings/settings-context-notifications.tsx` |
| **Renderer Redux** | `src/renderer/src/features/toast-slice.ts` |
| **Renderer Hook** | `src/renderer/src/hooks/use-toast.ts` |
