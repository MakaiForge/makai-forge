# Auth / Login & Perfil de Usuário

> Sistema de autenticação via servidor externo (OAuth) com JWT, sessão persistida
> em armazenamento local, e página de perfil com library, amigos, badges e estatísticas.

---

## Mapa Mental

```
AUTH / PROFILE
│
├── LOGIN
│     ├── Botão "Sign In" → openAuthWindow(SignIn)
│   ├── Janela modal (600×640) → servidor auth externo
│   ├── Callback: protonforge://auth → salva tokens no armazenamento
│     └── Renderer: "on-signin" → fetchUserDetails() → Redux
│
├── SESSÃO
│   ├── storeKeys.auth  (accessToken, refreshToken)
│   ├── storeKeys.user  (id, displayName, etc)
│     └── localStorage: "userDetails" (cache rápido)
│
├── LOGOUT
│   └── signOut → deleta auth+user do armazenamento, limpa games/downloads, fecha WS
│
├── PERFIL (/profile/:userId)
│     ├── Hero: avatar, banner, displayName, karma, currentGame
│     ├── Content:
│     │     ├── Library (jogos com playtime, favoritos, pinned)
│     │     ├── Recent Games
│     │     ├── Friends
│     │     ├── Badges
│     │     └── Stats
│     └── EDITAR (próprio perfil):
│           ├── displayName, bio, avatar, banner
│           └── profileVisibility (PUBLIC | FRIENDS | PRIVATE)
│
└── SETTINGS ACCOUNT
      ├── Visibilidade do perfil
      ├── Email (update → openAuthWindow)
      ├── Senha (update → openAuthWindow)
      └── Usuários bloqueados
```

---

## Fluxo de Login

```
Renderer: "Sign In" click
  → window.electron.openAuthWindow(AuthPage.SignIn)
    │
    ▼  IPC "openAuthWindow"
Main: WindowManager.openAuthWindow()
  ├── Cria BrowserWindow modal 600×640
  ├── URL: MAIN_VITE_AUTH_URL?lang=pt-BR
  ├── Sem moldura (frame: false), sempre no topo
  │
  ▼ Usuário faz login no servidor externo
Servidor redireciona para protonforge://auth?...
  │
  ▼ will-navigate detecta protonforge://
  ├── Fecha a janela modal
  ├── Salva Auth (tokens) + User no armazenamento
  └── Envia "on-signin" ao renderer
    │
    ▼ Renderer: app.tsx
  ├── fetchUserDetails() → IPC "getMe" → armazenamento → UserDetails
  ├── dispatch(setUserDetails) + localStorage.setItem
  └── Toast: "Welcome back, {displayName}!"
```

---

## Sessão Persistente

```
Startup:
  app.tsx
    ├── localStorage.getItem("userDetails") → Redux (instantâneo)
    └── window.electron.getMe()
          └── IPC "getMe" → armazenamento storeKeys.user → UserDetails

Em qualquer lugar:
  useUserDetails() → retorna { userDetails, updateUserDetails, signOut }
  useSubscription() → retorna subscription
```

---

## Fluxo de Logout

```
ProfileHero → signOut()
  ├── dispatch(setUserDetails(null))
  ├── localStorage.removeItem("userDetails")
  └── window.electron.signOut()
        │
        ▼ IPC "signOut"
Main:
  ├── Deleta storeKeys.auth do armazenamento
  ├── Deleta storeKeys.user do armazenamento
  ├── Limpa gamesSublevel, gamesPlaytime, downloadsSublevel
  ├── Cancela todos os downloads ativos
  └── Fecha conexão WebSocket
```

---

## Estrutura do Perfil (/profile/:userId)

```
<Profile>
  <UserProfileContextProvider>
    │
    ├── ProfileHero
    │     ├── Avatar + background image
    │     ├── DisplayName + Karma
    │     ├── CurrentGame (se jogando agora)
    │     ├── Botão Editar (se for próprio perfil)
    │     └── Botão Add Friend / Report (se for outro)
    │
    └── ProfileContent
          ├── ProfileTabs
          │     ├── LibraryTab (grid de jogos, ordenar, favoritar, pin)
          │     ├── RecentGamesBox
          │     ├── FriendsBox (grid + AllFriendsModal)
          │     ├── BadgesBox (grid + AllBadgesModal)
          │     ├── UserStatsBox
          │     └── WrappedTab (2025 wrapped)
          │
          └── LockedProfile (se privado e não é amigo)
```

---

## Tipos

### UserDetails (estado atual do usuário logado)
```typescript
interface UserDetails {
  id: string
  username: string
  email: string | null
  displayName: string
  profileImageUrl: string | null
  backgroundImageUrl: string | null
  profileVisibility: "PUBLIC" | "PRIVATE" | "FRIENDS"
  bio: string
  subscription: Subscription | null
  karma: number
  quirks?: { backupsPerGameLimit: number }
}
```

### Auth (tokens)
```typescript
interface Auth {
  accessToken: string
  refreshToken: string
  tokenExpirationTimestamp: number
}
```

### UserProfile (perfil de QUALQUER usuário, incluindo outros)
```typescript
interface UserProfile {
  id: string
  displayName: string
  profileImageUrl: string | null
  email: string | null
  backgroundImageUrl: string | null
  profileVisibility: ProfileVisibility
  libraryGames: UserGame[]
  recentGames: UserGame[]
  friends: UserFriend[]
  totalFriends: number
  relation: UserRelation | null
  currentGame: UserProfileCurrentGame | null
  bio: string
  hasActiveSubscription: boolean
  karma: number
  quirks: { backupsPerGameLimit: number }
  badges: string[]
  hasCompletedWrapped2025: boolean
}
```

---

## Eventos IPC

### Invoke (Renderer → Main)

| Canal | Preload | Quando |
|-------|---------|--------|
| `openAuthWindow` | `window.electron.openAuthWindow(page)` | Login, Update Email, Update Password |
| `signOut` | `window.electron.signOut()` | Logout |
| `getAuth` | `window.electron.getAuth()` | Recuperar tokens |
| `getSessionHash` | `window.electron.getSessionHash()` | Decodificar JWT → sessionId |
| `getMe` | `window.electron.getMe()` | Buscar UserDetails |
| `updateProfile` | `window.electron.updateProfile(data)` | Salvar edições do perfil |
| `processProfileImage` | `window.electron.processProfileImage(path)` | Processar imagem de avatar |
| `forgerApiCall` | `window.electron.forgerApi.get/post/...` | Chamadas autenticadas à API |

### Push (Main → Renderer)

| Evento | Quando | Efeito |
|--------|--------|--------|
| `on-signin` | Login concluído | fetchUserDetails + toast |
| `on-account-updated` | Email/senha alterado | Refresh user details |
| `on-signout` | Logout externo | Limpar estado |
| `on-sync-friend-requests` | WS: novo pedido | Atualizar contagem |
| `on-sync-notification-count` | WS: notificações | Atualizar badge |

---

## Componentes

| Componente | Arquivo | Função |
|-----------|---------|--------|
| `Profile` | `pages/profile/profile.tsx` | Página de perfil |
| `ProfileHero` | `pages/profile/profile-hero/` | Header: avatar, banner, nome |
| `EditProfileModal` | `pages/profile/edit-profile-modal/` | Modal de edição |
| `UploadBackgroundImageButton` | `pages/profile/upload-background-image-button/` | Upload de banner |
| `ReportProfile` | `pages/profile/report-profile/` | Denunciar perfil |
| `LibraryTab` | `pages/profile/profile-content/library-tab.tsx` | Grid de jogos |
| `FriendsBox` | `pages/profile/profile-content/friends-box.tsx` | Grid de amigos |
| `BadgesBox` | `pages/profile/profile-content/badges-box.tsx` | Grid de badges |
| `UserStatsBox` | `pages/profile/profile-content/user-stats-box.tsx` | Estatísticas |
| `AddFriendModal` | `pages/profile/profile-content/add-friend-modal.tsx` | Adicionar amigo |
| `LockedProfile` | `pages/profile/profile-content/locked-profile.tsx` | Perfil privado |
| `SettingsAccount` | `pages/settings/settings-account.tsx` | Config de conta |
| `SidebarProfile` | `components/sidebar/sidebar-profile.tsx` | Sidebar: avatar + badge |

---

## Servidor Externo (Auth)

A autenticação é delegada a um servidor web externo configurado via env:
```
MAIN_VITE_AUTH_URL=http://localhost:0  (ou staging/production)
```

O servidor externo:
- Gerencia cadastro/login (não há registro in-app)
- Redireciona via deep link `protonforge://auth` após sucesso
- Gerencia update de email e senha via `protonforge://update-account`

---

## Arquivos Envolvidos

| Área | Arquivos |
|------|----------|
| **Types** | `src/types/index.ts` (UserDetails, UserProfile), `src/types/level.types.ts` (Auth, User), `src/shared/constants.ts` (AuthPage) |
| **Main IPC Auth** | `src/main/events/auth/open-auth-window.ts`, `sign-out.ts`, `get-session-hash.ts` |
| **Main IPC Profile** | `src/main/events/profile/get-me.ts`, `update-profile.ts`, `process-profile-image.ts` |
| **Main IPC User** | `src/main/events/user/get-auth.ts` |
| **Main Services** | `src/main/services/window-manager.ts` (openAuthWindow), `src/main/services/user/get-user-data.ts` |
| **Main WS** | `src/main/services/ws/ws-client.ts`, `events/friend-request.ts`, `events/notification.ts` |
| **Preload** | `src/preload/auth.ts`, `src/preload/app.ts` |
| **Renderer Pages** | `src/renderer/src/pages/profile/` (15+ componentes) |
| **Renderer Settings** | `src/renderer/src/pages/settings/settings-account.tsx` |
| **Renderer Context** | `src/renderer/src/context/user-profile/user-profile.context.tsx` |
| **Renderer Hooks** | `src/renderer/src/hooks/use-user-details.ts`, `use-subscription.ts` |
| **Renderer Redux** | `src/renderer/src/features/user-details-slice.ts`, `subscription-slice.ts` |
| **Renderer App** | `src/renderer/src/app.tsx` (auth init + event listeners) |
| **Config** | `.env` (MAIN_VITE_AUTH_URL) |
