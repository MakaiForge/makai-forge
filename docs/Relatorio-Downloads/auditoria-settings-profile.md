# Auditoria: Settings & Profile

> Data: 2026-08-18
> Escopo: `app/Settings/` (~3800 linhas), `app/Profile/` (~2500 linhas)

---

## 1. Visão Geral

### Settings (25 arquivos)
- **settings.tsx** — Router principal (5 categorias: General, Login, Account, Content, Runners)
- **settings-context-general.tsx** — Idioma, startup, appearance
- **settings-context-login.tsx** — Login/Register Makai Forge
- **settings-context-account-settings.tsx** — Notificações da conta
- **settings-context-content-gameplay.tsx** — Autoplay, NSFW, explícito
- **settings-context-runners.tsx** — Emuladores (install/launch/update)
- **settings-download-sources.tsx** — Fontes de download custom
- **settings-general.tsx** — Downloads path, notificações, common redist

### Profile (~10 arquivos)
- **profile.tsx** — Página de perfil pública
- **profile-content/** — Conteúdo do perfil
- **edit-profile-modal/** — Edição de perfil
- **profile-hero/** — Hero/banner

---

## 2. Problemas Identificados

### 🔴 Críticos

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 1 | **`settings-context-account-settings` usa campos errados** | `settings-context-account-settings.tsx:55-65` | `downloadNotificationsEnabled` é mapeado para "Alguém deu like no meu comentário". `repackUpdatesNotificationsEnabled` é mapeado para "Alguém respondeu meu comentário". Os labels não correspondem às variáveis. |
| 2 | **`settings-context-login` expõe `localhost:8788` para recuperação de senha** | `settings-context-login.tsx:185` | Hardcoded `localhost:8788` — não funciona se o servidor estiver em outra porta ou host. |
| 3 | **`settings-general` polling infinito de redist** | `settings-general.tsx:56-60` | `setInterval` a cada 5 segundos chama `canInstallCommonRedist()`. Se o componente nunca desmontar, roda para sempre. Interval não é limpo corretamente se o componente desmontar durante o poll. |
| 4 | **`settings-context-runners` `console.error` em produção** | `settings-context-runners.tsx:148` | `console.error("Erro ao lançar:", err)` — dados sensíveis logados. |

### 🟡 Médios

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 5 | **`settings-context-runners` interval não limpo no error** | `settings-context-runners.tsx:92-104` | `setInterval` é limpo no `finally`, mas se `installRunner` throw antes do `finally`, o interval continua rodando. |
| 6 | **`settings-download-sources` interval de 5s** | `settings-download-sources.tsx:80` | `setInterval` a cada 5s para checar status. Pode ser reduzido para 10s ou usar polling adaptativo. |
| 7 | **`settings-context-login` inline styles extensos** | `settings-context-login.tsx` | ~100 linhas de `style={{...}}` hardcoded. Deveria usar classes CSS. |
| 8 | **`settings-context-account-settings` não tem `achievementNotificationsEnabled` no type** | `settings-context-account-settings.tsx` | Campo `achievementNotificationsEnabled` pode não existir no tipo `UserPreferences`. |
| 9 | **`settings-general` `customStyles` em localStorage** | `settings-general.tsx:40` | `window.localStorage.getItem("customStyles")` — estilos custom ficam no localStorage, não no store. Se o app limpar localStorage, perde. |
| 10 | **`add-download-source-modal` `console.log` em produção** | `add-download-source-modal.tsx` | Não tem console.log mas o schema `yup` valida URL aceitando qualquer string que pareça URL. |
| 11 | **`settings-context-login` sem rate limiting** | `settings-context-login.tsx` | Login/Register sem delay entre tentativas. Brute force possível. |
| 12 | **`settings-context-login` `checkAuth` chama profile toda vez** | `settings-context-login.tsx:60-63` | `checkAuth` é chamado no mount e busca profile. Se o componente re-renderizar, faz request desnecessário. |

### 🟢 Menores

| # | Problema | Arquivo | Descrição |
|---|----------|---------|-----------|
| 13 | **`settings-context-runners` `confirm()` nativo** | `settings-context-runners.tsx` | Não usa — bom. Mas `handleInstall` não tem confirmação. |
| 14 | **`settings-general` headings vazios** | `settings-general.tsx:140-145` | `<h2>{t("downloads")}</h2>` e `<h2>{t("notifications")}</h2>` — headings sem conteúdo abaixo. |
| 15 | **`settings-context-login` LEVEL_THRESHOLDS hardcoded** | `settings-context-login.tsx:14-25` | 11 níveis hardcoded. Se os thresholds mudarem no backend, precisa atualizar manualmente. |
| 16 | **`settings-context-runners` `getRunnerIcon` sequencial** | `settings-context-runners.tsx:38-41` | Loop `for` com `await` sequencial para buscar ícones. Deveria ser `Promise.all`. |
| 17 | **Profile sem SEO/meta tags** | `profile.tsx` | Página pública sem `<title>` dinâmico ou meta description. |

---

## 3. Bug Mais Crítico: Labels Errados

**Arquivo:** `settings-context-account-settings.tsx`

```typescript
// O que está:
<CheckboxField
  label="Alguém deu like no meu comentário"
  checked={form.downloadNotificationsEnabled}  // ← ERRADO
  onChange={() => handleChange({
    downloadNotificationsEnabled: !form.downloadNotificationsEnabled,
  })}
/>

<CheckboxField
  label="Alguém respondeu meu comentário"
  checked={form.repackUpdatesNotificationsEnabled}  // ← ERRADO
  onChange={() => handleChange({
    repackUpdatesNotificationsEnabled: !form.repackUpdatesNotificationsEnabled,
  })}
/>

// O que deveria ser:
<CheckboxField
  label="Alguém deu like no meu comentário"
  checked={form.likeNotificationsEnabled}  // ← campo correto
  onChange={() => handleChange({
    likeNotificationsEnabled: !form.likeNotificationsEnabled,
  })}
/>
```

**Impacto:** O usuário ativa "Alguém deu like" mas na verdade ativa "download notifications". Configurações cruzadas.

---

## 4. Fluxo de Dados

```
Settings Context
  │
  ├─ updateUserPreferences(values)
  │    └─ Redux → userPreferencesSlice → db.put()
  │
  ├─ SettingsContextGeneral
  │    ├─ language → i18next.changeLanguage()
  │    ├─ runAtStartup → electron.autoLaunch()
  │    └─ appearance → themesStore
  │
  ├─ SettingsContextRunners
  │    ├─ getRunners() → electron.getRunners()
  │    ├─ installRunner() → electron.installRunner()
  │    └─ launchGame() → electron.launchGame()
  │
  ├─ SettingsDownloadSources
  │    ├─ addDownloadSource() → electron.addDownloadSource()
  │    └─ syncDownloadSources() → electron.syncDownloadSources()
  │
  └─ SettingsContextLogin
       ├─ authLogin() → electron.authLogin()
       ├─ authRegister() → electron.authRegister()
       └─ getMakaiProfile() → electron.getMakaiProfile()
```

---

## 5. Recomações

### Prioridade Alta

1. **Corrigir labels em `settings-context-account-settings`** — Usar campos corretos
2. **Remover `console.error`** em produção
3. **Corrigir polling de redist** — Usar `useEffect` cleanup correto

### Prioridade Média

4. **Adicionar rate limiting** no login
5. **Usar Promise.all** para buscar ícones de runners
6. **Externalizar inline styles** para CSS classes
7. **Reduzir interval** de download sources para 10s

### Prioridade Baixa

8. Remover headings vazios
9. Externalizar LEVEL_THRESHOLDS
10. Adicionar SEO ao Profile
