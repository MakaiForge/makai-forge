# 🧩 Installer API

API modular de análise e extração de instaladores de jogos. Substitui a lógica espalhada de extração via Wine por um sistema que detecta o tipo do instalador e escolhe o método mais rápido disponível nativamente no Linux, usando Wine apenas como fallback absoluto.

## Estrutura da API

```
src/compatflow/bridge/installer/
├── index.js                 ← API pública (analyze + extract)
├── classifier.js            ← Detecta o tipo do instalador
├── utils.js                 ← Helpers (scan dir, checksum, etc.)
└── extractors/
    ├── archive.js            ← Pure archive (7z, rar, zip)
    ├── exe-companions.js     ← EXE pequeno + archives enormes
    ├── sfx-nsis.js           ← SFX / NSIS (7z no EXE)
    ├── inno-std.js           ← InnoSetup padrão (innoextract)
    ├── portable.js           ← Pasta / cópia direta
    ├── iso.js                ← ISO images
    └── wine-fallback.js      ← Wine + Proton (último caso)
```

## Como usar

```js
const installer = require('./installer');

// 1. Análise — só inspeciona, não mexe em nada
const info = installer.analyze('/path/to/setup.exe');
// → { type, method, needsWine, confidence, companionArchives, ... }

// 2. Extração — executa o método recomendado
const result = installer.extract(info, {
  destPath: '/prefix/drive_c/games/MeuJogo',
  protonPath: '/path/to/proton',       // só usado se needsWine = true
  source: 'catalog',                   // 'catalog' | 'manual' | 'compactflow'
  gameId: '123',
  onProgress: (msg) => console.log(msg)
});
// → { success, destDir, candidates, registryNeeded }
```

## Fluxo completo

```
Source (arquivo ou pasta)
    │
    ▼
┌─────────────────────────────┐
│  installer.analyze(path)    │
│  ─────────────────────      │
│  1. Extensão → archive/ISO  │
│  2. Se EXE:                 │
│     a. 7z l (SFX/NSIS?)     │
│     b. innoextract (Inno?)  │
│     c. Tamanho + strings    │
│  3. Scan diretório:         │
│     companions archives     │
│  4. Se pasta → portable     │
└──────────┬──────────────────┘
           │
           ▼ JSON
    { type, method, needsWine, confidence }
           │
           ▼
┌─────────────────────────────┐
│  installer.extract(info)    │
│  ────────────────────       │
│  Escolhe o extrator certo   │
│  com base no type:          │
│                             │
│  pure-archive    → archive  │
│  exe-companions  → exe-     │
│  sfx / nsis      → sfx-    │
│  inno-std        → inno-   │
│  portable        → portable │
│  iso             → iso      │
│  inno-custom     → wine-    │
│  unknown         → wine-    │
└──────────┬──────────────────┘
           │
           ▼
    { success, destDir, candidates }
```

## Os 3 fluxos que usam a API

| Fluxo | Arquivo de entrada | source | Quando chama |
|---|---|---|---|
| **Catálogo** | `src/main/install-flow/orchestrator.ts` | `"catalog"` | Instala direto do catálogo |
| **Manual** | `src/main/events/library/open-game/execute-installer.ts` | `"manual"` | Add Game manual |
| **CompactFlow** | `src/compatflow/bridge/install-game/index.js` | `"compactflow"` | Bridge legada |

## Como adicionar um novo tipo de extração

1. Crie um arquivo em `extractors/novo-tipo.js`
2. Registre no `classifier.js` (método `classify`)
3. Registre no `index.js` (mapping type → extractor)
4. Documente em `extraction.md`

## Vantagens

- **Extrações nativas** (7z, innoextract, etc.) são 5-10x mais rápidas que Wine
- **Wine só no último caso** — menos dependência de Proton
- **Modular** — cada tipo é isolado, testável, substituível
- **Source tracking** — sabemos qual fluxo mais usa cada método
- **Fácil de estender** — novo formato = novo arquivo + 2 linhas de registro
