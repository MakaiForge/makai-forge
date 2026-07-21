# Notifications

Central de notificações do aplicativo, combinando notificações da API (servidor) e notificações locais (app).

## Main Component

- **`notifications.tsx`** — Gerencia dois tipos de notificação (API + local) com filtros "Todas" / "Não lidas", marcação individual/todas como lidas, dismiss individual, limpar tudo com animação stagger, carregar mais (paginação).

## Sub-Components

| Component | File | Role |
|---|---|---|
| `NotificationItem` | `notification-item.tsx` | Notificação da API com suporte a badges, friend request accept/refuse |
| `LocalNotificationItem` | `local-notification-item.tsx` | Notificação local do app |

## Hooks / State

- **`useUserDetails()`** — Usuário atual (para notificações autenticadas)
- Estado local: `apiNotifications`, `localNotifications`, `badges`, `isLoading`, `filter`, `pagination`
- Merge de notificações: prioridade alta (priority === 1) no topo, demais ordenadas por data
- Animação stagger no clear all (70ms entre remoções)

## IPC / Backend

### API (autenticada)
- `window.electron.forgerApi.get("/profile/notifications")` — Lista paginada (20 itens)
- `window.electron.forgerApi.patch("/profile/notifications/:id/read")` — Marcar lida
- `window.electron.forgerApi.patch("/profile/notifications/all/read")` — Marcar todas lidas
- `window.electron.forgerApi.delete("/profile/notifications/:id")` — Remover individual
- `window.electron.forgerApi.delete("/profile/notifications/all")` — Remover todas

### Local
- `window.electron.getLocalNotifications()` — Listar locais
- `window.electron.markLocalNotificationRead(id)` — Marcar lida
- `window.electron.markAllLocalNotificationsRead()` — Todas lidas
- `window.electron.deleteLocalNotification(id)` — Remover
- `window.electron.clearAllLocalNotifications()` — Limpar todas
- `window.electron.onLocalNotificationCreated()` — Listener de novas

### Badges
- `window.electron.forgerApi.get("/badges")` — Badges disponíveis

## Routing

- Rota `/notifications`
- Header dinâmico: `setHeaderTitle(t("title"))`
