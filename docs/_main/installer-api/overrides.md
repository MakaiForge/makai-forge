# Overrides: regras específicas por jogo

O sistema de overrides permite definir **regras fixas de classificação** para jogos específicos, sem modificar o código do classifier ou dos extractors.

## Como funciona

1. O `classifier.js` chama `findOverride(sourcePath, gameId, gameTitle)` **antes** da detecção genérica
2. Se uma regra corresponde ao jogo, o resultado dela é usado **imediatamente** — a detecção genérica é pulada
3. Se nenhuma regra corresponde, o classifier faz a detecção automática normalmente

## Onde ficam as regras

### `overrides.json` (arquivo único, principal)

```
src/compatflow/bridge/installer/overrides.json
```

Recomendado para regras pequenas e diretamente ligadas ao código.

### `overrides/*.json` (múltiplos arquivos, modular)

```
src/compatflow/bridge/installer/overrides/
├── 01-terareforged.json
├── 02-wow-private.json
└── ...
```

Recomendado para muitos overrides — cada jogo ou categoria em seu próprio arquivo.  
Os arquivos são carregados em **ordem alfabética**. O **primeiro match** vence.

## Formato de cada regra

```json
{
  "version": 1,
  "rules": [
    {
      "gameId": "tera-reforged",
      "matchFile": "TERA_Reforged_Setup",
      "matchTitle": "TERA Reforged",
      "type": "exe-with-companions",
      "method": "native-7z-and-wine",
      "needsWine": true,
      "needsRegistrySetup": true,
      "confidence": 1.0,
      "extractorOptions": {
        "companionPattern": "tera_client\\.7z\\.",
        "extractToSubdir": "TERA"
      }
    }
  ]
}
```

### Campos de match (qual combina)

| Campo | O que verifica | Exemplo |
|---|---|---|
| `gameId` | ID do jogo no banco (match exato, substring ou regex) | `"tera-reforged"` |
| `matchTitle` | Título do jogo (case insensitive, substring) | `"TERA Reforged"` |
| `matchFile` | Nome do arquivo selecionado (lowercase, substring) | `"TERA_Reforged_Setup"` |
| `matchDir` | Nome do diretório pai (lowercase, substring) | `"tera"` |

### Campos de resultado (o que usar)

| Campo | Descrição |
|---|---|
| `type` | Tipo do instalador (qualquer `type` válido da classification) |
| `method` | Nome legível do método |
| `needsWine` | Precisa de Wine? |
| `needsRegistrySetup` | Precisa rodar o EXE pra registros depois da extração? |
| `confidence` | Confiança (1.0 = certeza absoluta) |
| `extractorOptions` | Opções extras passadas pro extractor |

## Para que servem overrides

### 1. Jogos que o classifier classifica errado

Se um jogo específico cai em `unknown` ou no tipo errado, um override corrige:

```json
{
  "matchFile": "MeuInstalador.exe",
  "type": "inno-std",
  "needsWine": false
}
```

### 2. Jogos que precisam de parâmetros extras no extractor

```json
{
  "gameId": "meu-jogo",
  "type": "exe-with-companions",
  "extractorOptions": {
    "companionPattern": "data\\..*\\.7z",
    "extractToSubdir": "GameFolder"
  }
}
```

### 3. Jogos com instalador quebrado que exigem gambiarra

```json
{
  "matchFile": "InstallerLegacy.exe",
  "type": "unknown",
  "needsWine": true,
  "extractorOptions": {
    "customWineArgs": ["/silent", "/norestart"]
  }
}
```

### 4. Jogos portáteis que o detector confunde como instalador

```json
{
  "matchDir": "portable-games",
  "type": "portable",
  "needsWine": false
}
```

## Prioridade de carregamento

```
1. overrides.json (arquivo raiz, sempre carregado primeiro)
2. overrides/*.json (ordenado alfabeticamente)
   → Primeiro match encontrado = vence
```

Se dois arquivos definem regras para o mesmo jogo, a **primeira regra que der match** é usada.

## Como adicionar um override

### Via JSON (recomendado para iniciantes)

Adicione um objeto no array `rules` do `overrides.json`:

```json
{
  "matchFile": "setup.exe",
  "type": "inno-std",
  "needsWine": false,
  "confidence": 0.9
}
```

### Via arquivo separado (recomendado para muitos overrides)

Crie `src/compatflow/bridge/installer/overrides/meu-jogo.json`:

```json
{
  "rules": [
    {
      "gameId": "meu-jogo",
      "type": "pure-archive",
      "needsWine": false
    }
  ]
}
```

## Limitações atuais

- Overrides só definem a **classificação** (analyze). A extração ainda usa os extractors existentes.
- Se você precisa de um **novo método de extração**, crie um extrator novo (veja `ADDING_NEW_TYPE.md`).
- Overrides com `extractorOptions` são passados para o extractor, mas cada extractor decide se e como usa essas opções.
