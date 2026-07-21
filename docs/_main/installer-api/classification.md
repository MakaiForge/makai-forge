# Classificação de Instaladores

O `classifier.js` é o coração da Installer API. Ele inspeciona o arquivo/pasta de origem e devolve um veredito estruturado que determina qual extractor usar.

## Algoritmo de classificação

A classificação acontece em 4 camadas, em ordem de prioridade:

### Camada 1: Extensão do arquivo

Se o path de entrada for um **arquivo**, a extensão já define vários tipos:

| Extensão | Tipo | Ação |
|---|---|---|
| `.7z` | `pure-archive` | 7z nativo |
| `.7z.001`, `.7z.002`, ... | `pure-archive` | 7z nativo (multi-volume) |
| `.rar` | `pure-archive` | unrar nativo |
| `.r00`, `.r01`, ... | `pure-archive` | unrar nativo (multi-volume) |
| `.zip` | `pure-archive` | unzip nativo |
| `.tar`, `.tar.gz`, `.tgz`, `.tar.xz` | `pure-archive` | tar nativo |
| `.iso` | `iso` | 7z nativo |
| `.exe` | continua camada 2 | análise mais profunda |
| `.msi` | `inno-std` | msiextract / WiNE |

### Camada 2: Análise do EXE

Se o arquivo for `.exe`, a API executa 3 testes em sequência:

#### Teste A: `7z l <exe>`

Executa `7z l` no EXE. Se listar arquivos internos, é um **SFX** ou **NSIS**.

```
7z l setup.exe
  ├── Lista arquivos + pastas normais → SFX (7z-SFX, WinRAR-SFX, etc.)
  ├── Mostra "$PLUGINSDIR", "$TEMP"   → NSIS
  └── Erro "Cannot open as archive"   → não é SFX/NSIS, continua
```

**Heurística de distinção SFX vs NSIS:**
- Se listar `$PLUGINSDIR` → NSIS
- Se listar `[0-9]+` como pastas numeradas → pode ser InnoSetup (teste B)
- Se listar arquivos de jogo normais → SFX

#### Teste B: `innoextract -l <exe>`

Se o 7z falhou, tenta innoextract.

```
innoextract -l setup.exe
  ├── Lista arquivos → InnoSetup padrão (inno-std)
  └── Erro (loader revision, checksum, etc.) → InnoSetup customizado ou outro
```

**Se innoextract falhar** mas as strings do EXE contiverem "Inno Setup" → `inno-custom`

#### Teste C: Heurística por tamanho + strings

Se ambos os testes falharem:

- **Tamanho do EXE:**
  - `< 50MB` → provável wrapper, vai pra Camada 3 (scan de companions)
  - `> 50MB` → pode ser installer monolítico ou portátil empacotado
- **Strings:**
  - `"Nullsoft"` ou `"NSIS"` → NSIS (o 7z pode ter falhado em alguns casos raros)
  - `"InstallShield"` → InstallShield (fallback Wine)
  - `"WISE"` → WISE (fallback Wine)
  - Nenhuma das acima → `unknown`

### Camada 3: Scan de diretório (companion archives)

Se o EXE for pequeno (`< 50MB`) e os testes do Camada 2 não confirmaram o tipo, a API varre o **mesmo diretório** em busca de arquivos suspeitos:

```
Diretório do EXE:
├── TERA_Reforged_Setup.exe     (2.6 MB)  ← pequeno
├── tera_client.7z.001          (4 GB)    ← companion! (>100MB)
├── tera_client.7z.002          (4 GB)    ← companion!
└── ...
```

**Regras de detecção:**
- Arquivos `.7z`, `.7z.001`, `.rar`, `.r00`, `.zip` com **>100MB**
- Arquivos que **não são** o próprio EXE
- Se encontrar 1+ archives enormes → **`exe-with-companions`**

**Companions detectados são retornados na prop `companionArchives`** para o extrator usar.

### Camada 4: Path é uma pasta

Se o path for um diretório:

- Contém `.exe` dentro → **`portable`**
- Só contém archives → trata como `pure-archive` (extrai todos)
- Vazio ou sem `.exe` → **`unknown`**

## Formato do retorno

```json
{
  "type": "exe-with-companions",
  "method": "native-7z-and-wine",
  "needsWine": true,
  "needsRegistrySetup": true,
  "confidence": 0.95,
  "gameName": "TERA_Reforged",
  "companionArchives": [
    "/home/user/Desktop/tera/tera_client.7z.001",
    "/home/user/Desktop/tera/tera_client.7z.002"
  ],
  "details": {
    "exeSize": 2621564,
    "exeStrings": ["Inno Setup"],
    "innoextractResult": "failed",
    "sevenZipResult": "failed",
    "companionCount": 8,
    "companionTotalSize": 33222777571
  }
}
```

### Propriedades

| Propriedade | Tipo | Descrição |
|---|---|---|
| `type` | string | Tipo classificado |
| `method` | string | Nome legível do método |
| `needsWine` | boolean | Precisa de Wine? |
| `needsRegistrySetup` | boolean | Precisa rodar o EXE pra registros? |
| `confidence` | number | 0.0 a 1.0 |
| `gameName` | string | Nome sugerido do jogo |
| `companionArchives` | string[] | Archives companions encontrados |
| `details` | object | Debug info bruta |

## Tabela de classificação completa

| type | needsWine | Método de extração | Ferramenta |
|---|---|---|---|
| `pure-archive` | false | Extrai archive(s) direto | `7z`, `unrar`, `unzip`, `tar` |
| `exe-with-companions` | true (só registry) | Extrai companions nativo + EXE pra reg | `7z` + `wine64` |
| `sfx` | false | Extrai o próprio EXE como archive | `7z x exe` |
| `nsis` | false | Extrai o próprio EXE como archive | `7z x exe` |
| `inno-std` | false | Extrai com innoextract | `innoextract` |
| `inno-custom` | true | Wine + Proton (fallback) | `wine64` |
| `portable` | false | Copia a pasta | `cp -r` |
| `iso` | false | Extrai a imagem | `7z x` |
| `unknown` | true | Wine + Proton (fallback) | `wine64` |
