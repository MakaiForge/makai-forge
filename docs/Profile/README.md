# Profile

Página de perfil do usuário, exibindo hero com informações, biblioteca de jogos, estatísticas, medalhas, amigos e atividade recente.

## Main Component

- **`profile.tsx`** — Wrapper que lê `userId` dos params da rota e inicializa `UserProfileContextProvider` com tema de skeleton.

## Sub-Components

### Profile Hero
| Component | File | Role |
|---|---|---|
| `ProfileHero` | `profile-hero/profile-hero.tsx` | Capa, avatar, nome, badge de status, botão de editar/bloquear |

### Profile Content
| Component | File | Role |
|---|---|---|
| `ProfileContent` | `profile-content/profile-content.tsx` | Layout principal com tabs (Library, Wrapped), sidebar de stats/badges/friends |
| `ProfileTabs` | `profile-content/profile-tabs.tsx` | Abas de navegação do perfil |
| `LibraryTab` | `profile-content/library-tab.tsx` | Biblioteca de jogos do usuário com ordenação |
| `WrappedTab` | `profile-content/wrapped-tab.tsx` | Estatísticas anuais do usuário |
| `UserStatsBox` | `profile-content/user-stats-box.tsx` | Box de estatísticas (total jogado, conquistas, etc.) |
| `BadgesBox` | `profile-content/badges-box.tsx` | Grid de medalhas/conquistas |
| `RecentGamesBox` | `profile-content/recent-games-box.tsx` | Jogos jogados recentemente |
| `FriendsBox` | `profile-content/friends-box.tsx` | Lista de amigos com modal de todos |

### Modals
| Component | File | Role |
|---|---|---|
| `EditProfileModal` | `edit-profile-modal/` | Editar display name, bio, avatar |
| `AddFriendModal` | `profile-content/add-friend-modal.tsx` | Adicionar amigo |
| `AllFriendsModal` | `profile-content/all-friends-modal.tsx` | Lista completa de amigos |
| `AllBadgesModal` | `profile-content/all-badges-modal.tsx` | Todas as medalhas |
| `ReportProfile` | `report-profile/report-profile.tsx` | Denunciar perfil |
| `LockedProfile` | `profile-content/locked-profile.tsx` | Tela de perfil privado |
| `UploadBackgroundImageButton` | `upload-background-image-button/` | Upload de imagem de capa |

## Context

- **`UserProfileContext`** (`@context/user-profile`) — `userProfile`, `isMe`, `userStats`, `libraryGames`, `pinnedGames`, `getUserLibraryGames()`, `loadMoreLibraryGames()`, `hasMoreLibraryGames()`, `isLoadingLibraryGames`

## IPC / Backend

- `window.electron.forgerApi.get/put` — Dados do perfil, biblioteca, estatísticas
- Requisições autenticadas (`needsAuth: true`)
- Paginação de library games com `sortBy` (playtime / playedRecently)

## Routing

- Rota `/profile/:userId`
- Header dinâmico: `setHeaderTitle(userProfile.displayName)`
