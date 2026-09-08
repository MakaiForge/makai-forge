# Arrumar Erros de Importe CSS Customizado

## Análise Completa: Site (Theme Builder) → Makai Forge

Este documento analisa todo o fluxo de criação de temas no **site** (`/home/cas/Documentos/site2/app-custom`) e importação no **Makai Forge**, identificando todos os erros que impedem a importação perfeita.

---

## PARTE 1 — Erros no Site (Theme Builder)

### 1.1. NENHUMA persistência de temas

| Problema | Detalhe |
|----------|---------|
| `themes/` | Diretório vazio |
| `storage.js` | Não existe (citado no README mas nunca implementado) |
| Salvar tema | Impossível — não há botão ou função de salvar |
| Carregar tema | Impossível — não há seletor de arquivo para importar JSON |
| Recarregar página | Perde tudo — todas as customizações são voláteis |

**O que falta:**
- `core/storage.js` com `saveTheme(name)` e `loadTheme(name)` usando `localStorage`
- Exportar para arquivo `.json` com metadados (nome, autor, versão, data)
- Importar de arquivo `.json` para editar temas existentes
- Botões "Salvar", "Exportar JSON", "Importar JSON" na interface

### 1.2. Duplicidade de variáveis CSS (global vs modular)

O sistema tem **dois namespaces** que coexistem:

```
Global:  --sidebar-bg, --sidebar-width, --sidebar-border
Modular: --el-sidebar-bg, --el-sidebar-width, --el-sidebar-border
```

**Erro:** `controls.js` faz bind manual duplicado para algumas variáveis:

```js
// controls.js — bind manual duplicado
bindRange('sidebarWidth', '--sidebar-width');
bindRange('sidebarWidth', '--el-sidebar-width');       // duplicado

bindColor('sidebarBg', '--sidebar-bg');
bindColor('sidebarBg', '--el-sidebar-bg');             // duplicado

bindColor('sidebarBorder', '--sidebar-border');
bindColor('sidebarBorder', '--el-sidebar-border');      // duplicado
```

**Mas:** a maioria das variáveis NÃO é sincronizada. Exemplo:
- `--app-bg` não tem equivalente `--el-app-bg`
- `--card-bg` não tem equivalente `--el-card-bg`
- `--accent` não tem equivalente `--el-accent`

**Correção:** Unificar para UM sistema apenas. O modular (`--el-*`) é o futuro, mas incompleto. Definir:
- Ou usa apenas global
- Ou usa apenas modular
- Mas nunca ambos com sincronização seletiva

### 1.3. CSS gerado usa `!important` em TUDO

```css
/* engine.js linha 139 — força !important em TODAS as regras */
for (var ri = 0; ri < rules.length; ri++)
  rules[ri] = rules[ri].replace(';', ' !important;');
```

**Problema:** Isso torna impossível desfazer estilos específicos. Se o usuário desativar um tema, os `!important` persistem se não forem limpos corretamente.

**Correção:** Remover o `!important` forçado. A injeção via `<style id="custom-css">` já fica depois dos estilos base, por especificidade natural. Usar `!important` só em casos excepcionais.

### 1.4. Sistema híbrido incompleto (legado + modular)

- **Sidebar**: usa sistema modular com `component.json`, `style.css`, `editor.js`, `presets.js` (completo)
- **28 outros componentes**: registrados via `legacy/elements.js` (antigo)
- **CSS do sidebar**: em `components/sidebar/style.css` (modular)
- **CSS dos outros**: em `css/pages/*.css` (global)
- **Engine**: tenta ler de `App.Registry` (que só tem o sidebar) mas `controls.js` faz bind manual dos globais

**Correção:** Migrar todos os 28 componentes para o sistema modular. Cada componente precisa de:
- `components/<id>/component.json`
- `components/<id>/style.css` (com `var(--el-<id>-<prop>, default)`)
- `components/<id>/editor.js` (schema de props)
- (Opcional) `components/<id>/presets.js`
- (Opcional) `components/<id>/variables.js`

E remover `elements.js` e `css/pages/*.css` após a migração.

### 1.5. Preview não reflete todas as variáveis

O `genOutput()` do `engine.js` só inclui variáveis que ele conhece. A lista `PREVIEW_VARS` (linhas 28-45) está **hardcoded** e incompleta:

```js
var PREVIEW_VARS = ['--title-bar-height', '--sidebar-width', ...];  // faltam muitas
```

**Correção:** Em vez de lista hardcoded, o engine deve coletar TODAS as variáveis definidas no `:root` dinamicamente.

### 1.6. Sem suporte a fontes customizadas

O site tem `type: 'font'` nos schemas e `PROP_MAP` reconhece `font-family`, mas:
- `assets/fonts/` está vazio
- Não há fontes carregadas no `index.html`
- O select de fontes não tem opções populadas

**Correção:** Carregar fontes do Google Fonts e/ou permitir upload de fontes customizadas.

### 1.7. Sem suporte a ícones customizados

- `assets/icons/` está vazio
- `App.Data.ICON_CUSTOM` existe no `icons.js` mas não há UI para upload
- O preview usa SVGs inline, mas o CSS exportado não inclui os ícones

**Correção:** Implementar upload de ícones e exportá-los como base64 no CSS (ou como assets separados).

### 1.8. Sem suporte a som de achievement

Comparado aos temas Hydra (que suportam `achievement.{mp3,wav,ogg,m4a}`), o site não tem:
- Campo para upload de som de achievement
- Exportação do som junto com o CSS
- Preview do som

### 1.9. Sem validação de CSS

O usuário pode quebrar o preview com valores inválidos:
- Cores inválidas são ignoradas silenciosamente
- Valores fora de range geram CSS quebrado
- URLs de imagem inválidas quebram o background

**Correção:** Validar entradas antes de aplicar.

### 1.10. Engine gera CSS para componentes não registrados

`genOutput()` itera sobre `App.Registry.getAll()`, mas só o sidebar está registrado. Os outros 28 componentes são controlados via `controls.js` manualmente, mas o engine **não gera CSS para eles**.

**Resultado:** O CSS exportado só inclui regras para o sidebar. Os outros 28 componentes têm seus valores definidos no `:root` mas **sem regras de seletor**.

```css
/* O que é gerado */
:root {
  --text-primary: #f0f1f7;
}
/* FALTA: .home__carousel { background-color: ... } */
/* FALTA: .catalogue__game-item { ... } */
/* FALTA: .downloads__hero { ... } */
```

**Correção:** Todo componente precisa estar no registry para o engine gerar CSS.

---

## PARTE 2 — Erros no Makai Forge (App)

### 2.1. SCSS compilado não pode ser sobrescrito

**Arquivo:** `src/renderer/src/scss/globals.scss`

```scss
$background-color: #0c0c12;
$body-color: #b0b1b7;
$brand-teal: #16b195;
$border-color: rgba(255, 255, 255, 0.06);
```

Essas variáveis SCSS são **compiladas em build** para valores fixos. O CSS injetado via `<style id="custom-css">` NÃO consegue sobrescrevê-las.

**Correção:** Cada uso de `$variavel` no SCSS precisa ser refatorado para:
```scss
$background-color: var(--app-bg, #0c0c12);
```

E o `:root` precisa ser definido:
```css
:root {
  --app-bg: #0c0c12;
  --app-bg-dark: #08080a;
  --text-primary: #f0f1f7;
  --accent: #6366f1;
  /* ... todas as variáveis que o site exporta */
}
```

### 2.2. NENHUMA variável CSS definida no `:root`

O Makai Forge não tem **nenhum** bloco `:root` com variáveis CSS. O sistema de temas depende disso para funcionar.

**Correção:** Adicionar em `globals.scss` (ou `app.scss`):
```scss
:root {
  // Cores base
  --app-bg: #0c0c12;
  --app-bg-dark: #08080a;
  --app-bg-image: none;
  --app-bg-blur: 0px;
  --app-content-opacity: 1;
  --app-bg-overlay-color: rgba(0,0,0,0);
  --app-bg-overlay-blur: 0px;

  // Texto
  --text-primary: #f0f1f7;
  --text-secondary: #b0b1b7;
  --text-muted: rgba(255,255,255,0.4);

  // Accent
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --accent-gradient: linear-gradient(135deg, #6366f1, #8b5cf6);
  --accent-gradient-hover: linear-gradient(135deg, #4f46e5, #7c3aed);

  // Sidebar
  --sidebar-width: 250px;
  --sidebar-bg: #0a0a0e;
  --sidebar-border: rgba(255,255,255,0.06);
  --sidebar-text: rgba(255,255,255,0.55);
  --sidebar-text-hover: #f0f1f7;
  --sidebar-item-hover: rgba(255,255,255,0.06);
  --sidebar-item-active: #6366f1;

  // Title bar
  --title-bar-height: 35px;
  --title-bar-bg: #0a0a0e;
  --title-bar-border: rgba(255,255,255,0.06);

  // Header (sub-header de notificações)
  --header-height: 48px;
  --header-bg: #0a0a0e;
  --header-border: rgba(255,255,255,0.06);

  // Bottom panel
  --bottom-panel-height: 48px;
  --bottom-panel-bg: #0a0a0e;
  --bottom-panel-border: rgba(255,255,255,0.06);

  // Cards
  --card-radius: 8px;
  --card-bg: rgba(255,255,255,0.03);
  --card-border: rgba(255,255,255,0.06);
  --card-size: 180px;
  --card-gap: 16px;
  --card-glow: none;

  // Glass
  --glass-bg: rgba(12,12,18,0.65);
  --glass-blur: 20px;

  // Border
  --border-color: rgba(255,255,255,0.06);
}
```

### 2.3. Classes CSS do site não existem no DOM do app

O site assume que o DOM tem classes como:
```css
.sidebar { }
.container__content { }
.bottom-panel { }
.home__carousel { }
.home__deal-card { }
.catalogue__game-item { }
.library-game-card { }
.downloads__hero { }
.proton-tools__card { }
.mod-manager__mod-row { }
```

O Makai Forge (app Electron React) **não tem** essas classes no DOM. É preciso adicionar hooks.

**Correção:** Adicionar `className` correspondente em cada componente React:
| Classe no CSS | Componente React | Arquivo |
|---|---|---|
| `.sidebar` | Sidebar | `src/renderer/src/components/sidebar.tsx` (ou similar) |
| `.container__content` | Container principal | No layout |
| `.bottom-panel` | BottomPanel | Em `src/renderer/src/app.tsx` ou layout |
| `.home__carousel` | Home carousel | Em `src/renderer/src/pages/home/` |
| `.catalogue__game-item` | Game item | Em `src/renderer/src/pages/catalogue/` |
| `.downloads__hero` | Download hero | Em `src/renderer/src/pages/downloads/` |
| `.library-game-card` | Library game card | Em `src/renderer/src/pages/library/` |
| `.proton-tools__card` | Proton card | Em `src/renderer/src/pages/proton-tools/` |
| `.mod-manager__mod-row` | Mod row | Em `src/renderer/src/pages/mod-manager/` |

### 2.4. Injeção de CSS não trata `@import` nem `url()` relativas

Quando o tema exportado contém:
```css
body {
  background: url("data:image/...") center/cover no-repeat !important;
}
```

Funciona. Mas se contiver:
```css
body {
  background: url("images/fundo.jpg") center/cover no-repeat !important;
}
```

A URL relativa vai quebrar porque o CSS é injetado inline no `<head>`, não de um arquivo.

**Correção:** O `injectCustomCss()` em `helpers.ts` precisa converter URLs relativas para absolutas (ou base64). Ou o site precisa exportar imagens como base64.

### 2.5. Font family não carregada

O site exporta:
```css
font-family: 'Press Start 2P', cursive !important;
```

Mas o Makai Forge não tem essa fonte carregada. O app usa `@fontsource/noto-sans` e `@fontsource/space-grotesk`.

**Correção:** O Makai Forge precisa detectar `@import` ou `@font-face` no CSS do tema e carregar as fontes dinamicamente, ou o site precisa usar apenas fontes que o app já tem.

Alternativa: o `injectCustomCss()` deve extrair `@import` e `@font-face` do CSS e carregá-los antes do resto.

### 2.6. Sem fallback de variáveis

Se um tema define só algumas variáveis (ex: só `--accent`), o resto deve usar o valor padrão do app. Mas como o app não define `:root` com defaults, qualquer variável faltando fica como `undefined`.

**Correção:** O `:root` no app precisa definir TODAS as variáveis com valores padrão. O tema só sobrescreve as que quer mudar.

### 2.7. Preview de som de achievement não integrado

O Makai Forge tem suporte a som. O site não exporta som. Quando um tema Hydra tiver som, o Makai Forge precisa:
1. Aceitar upload de arquivo de som junto com o CSS
2. Armazenar o caminho do som no banco
3. Reproduzir o som no preview

### 2.8. Sem mapeamento de variáveis Hydra → Makai

Os temas Hydra usam:
```
--color-bg, --color-bg-secondary, --color-text, --color-accent, --color-border, --font-size-base
```

O site exporta:
```
--app-bg, --app-bg-dark, --text-primary, --accent, --border-color, (sem font-size)
```

O Makai Forge (quando tiver `:root`) precisará de:
```
--sidebar-bg, --text-primary, --accent, --border-color, --card-radius, --glass-bg, etc.
```

**Correção:** Criar um **adapter** que traduz entre os três formatos:
```typescript
const varMap: Record<string, string> = {
  // Hydra → Makai
  '--color-bg': '--app-bg',
  '--color-bg-secondary': '--app-bg-dark',
  '--color-text': '--text-primary',
  '--color-accent': '--accent',
  '--color-border': '--border-color',
  // Site → Makai (quando os nomes diferem)
  '--sidebar-bg': '--sidebar-bg',  // mesmo nome
  '--sidebar-width': '--sidebar-width',
  '--text-secondary': '--text-secondary',
  '--text-muted': '--text-muted',
};
```

---

## PARTE 3 — Erros de Integração (site → app)

### 3.1. Caminho de importação inexistente

| Site exporta | Makai Forge espera | Status |
|---|---|---|
| CSS inline | CSS inline via `<style>` | ✅ Funciona |
| `:root { --vars }` | `:root { --vars }` | ⚠️ App não tem `:root` |
| `.sidebar { }` | `.sidebar { }` | ❌ DOM não tem classe |
| `@import url(...)` | `@import url(...)` | ❌ Não tratado |
| `url("imagem.jpg")` | `url("imagem.jpg")` | ❌ URL relativa quebra |
| `@font-face { }` | `@font-face { }` | ❌ Não tratado |
| Arquivo .json | CSS como string | ❌ Só aceita CSS, não JSON |

### 3.2. Falta de formato de intercâmbio

Hoje o fluxo é:
```
Site → Copiar CSS → Settings → Add Theme → Colar CSS
```

Deveria ser:
```
Site → Exportar .makaitheme (zip com CSS + assets) → Settings → Import Theme → Selecionar arquivo
```

O formato `.makaitheme` (ou `.zip`) deveria conter:
- `theme.json` — metadados (nome, autor, versão)
- `theme.css` — CSS gerado
- `screenshot.webp` — preview
- `achievement.{mp3|wav|ogg}` — som (opcional)
- `fonts/` — fontes customizadas (opcional)

### 3.3. Sem dois sentidos

- Site → App: possível (copiar CSS)
- App → Site: impossível (não há export)

O usuário não pode editar um tema que já importou no app.

**Correção:** Makai Forge precisa exportar o tema como `.makaitheme` que o site pode importar.

### 3.4. Background image não persiste

O site permite upload de imagem de fundo, que vira base64 no CSS. Isso funciona, mas:
- Base64 enorme incha o CSS
- Se o usuário trocar de tema e voltar, a imagem original se perde (não há storage)

---

## PARTE 4 — Plano de Correção Completo

### Prioridade 1 — Crítico (impede funcionamento)

| # | Onde | Correção |
|---|------|----------|
| 1 | Makai Forge | Adicionar `:root` com TODAS as variáveis CSS no `globals.scss` |
| 2 | Makai Forge | Refatorar SCSS para usar `var(--nome, $fallback)` em vez de `$var` puro |
| 3 | Makai Forge | Adicionar hooks de classe CSS nos componentes React (`.sidebar`, `.container__content`, `.bottom-panel`, etc.) |
| 4 | Site | Registrar TODOS os 28 componentes no `App.Registry` (migrar de `elements.js`) |
| 5 | Site | Fazer `genOutput()` gerar regras de seletor para TODOS os componentes registrados |

### Prioridade 2 — Alto (quebra fluxo)

| # | Onde | Correção |
|---|------|----------|
| 6 | Site | Implementar `core/storage.js` com `localStorage` para salvar/recarregar temas |
| 7 | Site | Botão "Exportar .makaitheme" (zip com CSS + assets) |
| 8 | Makai Forge | Botão "Importar .makaitheme" (extrair zip, aplicar CSS + assets) |
| 9 | Site | Unificar sistema de variáveis (escolher global OU modular, não ambos) |
| 10 | Makai Forge | Tratar `@import` e `@font-face` no `injectCustomCss()` |

### Prioridade 3 — Médio (melhoria)

| # | Onde | Correção |
|---|------|----------|
| 11 | Site | Remover `!important` forçado do engine |
| 12 | Makai Forge | Adicionar mapeamento Hydra → Makai no `injectCustomCss()` |
| 13 | Site | Validar entradas (cores, ranges, URLs) antes de aplicar |
| 14 | Site | Adicionar upload de som de achievement |
| 15 | Makai Forge | Exportar tema do app para formato editável pelo site |
| 16 | Site | Popular `assets/fonts/` e seletor de fontes |

### Prioridade 4 — Baixo (nice to have)

| # | Onde | Correção |
|---|------|----------|
| 17 | Site | Upload de ícones customizados |
| 18 | Makai Forge | Preview de som de achievement no app |
| 19 | Site | Converter CSS vars `--el-*` para formato legado na exportação |
| 20 | Makai Forge | Suporte a `--font-size-base` dos temas Hydra |

---

## PARTE 5 — Resumo do Diagnóstico

### Funciona hoje
```
Site → Copiar CSS → App → Colar CSS → Salvar → Ativar → NADA ACONTECE
```

### O que precisa acontecer
```
Site → Exportar .makaitheme (CSS + assets + metadados)
App  → Importar .makaitheme
     → Extrair CSS + assets
     → Aplicar CSS no <head>
     → Variáveis CSS sobrescrevem defaults do :root
     → Classes CSS estilizam hooks do DOM
     → Tema visível
```

### O elo quebrado

**Site cria** variáveis `--app-bg`, `--text-primary`, `--accent`, etc. ✅  
**Site gera** regras `.sidebar { }`, `.container__content { }`, etc. ✅  
**App injeta** o CSS no `<head>` ✅  
**App NÃO tem** `:root` definido ❌  
**App NÃO tem** variáveis CSS no SCSS ❌  
**App NÃO tem** hooks de classe no DOM ❌  

**Resultado:** O CSS é carregado, as variáveis são definidas, as regras existem, mas **ninguém lê e ninguém aplica**. Zero efeito visual.
