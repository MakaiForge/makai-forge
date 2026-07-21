# Extração

Cada tipo de instalador tem seu próprio extrator em `extractors/`. Todos seguem a mesma interface:

## Interface do extrator

```js
async function extract(info, options) → ExtractResult
```

### Parâmetros

```js
info = {
  type: string,
  method: string,
  needsWine: boolean,
  needsRegistrySetup: boolean,
  confidence: number,
  gameName: string,
  companionArchives: string[],
  originalPath: string,
  details: object
}

options = {
  destPath: string,        // Onde extrair (prefix/drive_c/games/Nome/)
  protonPath: string|null,  // Path do Proton (se needsWine)
  source: 'catalog' | 'manual' | 'compactflow',
  gameId: string|null,
  onProgress: function(string),  // Callback de progresso
  signal: AbortSignal|null       // Para cancelamento
}
```

### Retorno

```js
{
  success: boolean,
  destDir: string|null,        // Onde foi extraído
  candidates: string[],        // .exe encontrados no destino
  registryNeeded: boolean,     // Precisa rodar EXE pra registry?
  error: string|null
}
```

## Extratores

### archive.js — Pure Archive

**Formatos:** `.7z`, `.7z.001+`, `.rar`, `.r00+`, `.zip`, `.tar.*`

**Fluxo:**
1. Determina o comando certo pela extensão (`7z x`, `unrar x`, `unzip`, `tar xf`)
2. Executa o comando apontando pra `destPath`
3. Se for multi-volume, usa o primeiro arquivo (`.001`, `.r00`)
4. Extrai direto no `destPath`

**Exemplo:**
```bash
7z x -mmt -o"/prefix/drive_c/games/Jogo" "arquivo.7z"
```

### exe-companions.js — EXE + Companions

**Cenário:** EXE pequeno (wrapper) + archives enormes separados (TERA, private servers)

**Fluxo:**
1. Cria pasta temporária para extração
2. Extrai todos os companions nativamente com `7z` para a temp
3. Move o conteúdo para `destPath`
4. **Se `needsRegistrySetup`:** roda o EXE via `wine64` com `WINEPREFIX` e PROTON_NO_* para criar registros
5. Remove temp

**Detalhes:**
- A extração nativa dos companions é responsável por ~99% dos dados
- O EXE roda apenas para registrar caminhos, DLLs, atalhos
- Compatível com os mesmos PROTON_NO_* do wine-fallback

### sfx-nsis.js — SFX / NSIS

**Cenário:** EXE único que é na verdade um archive auto-extrável (7z-SFX, WinRAR-SFX, NSIS)

**Fluxo:**
1. Executa `7z x -y -o"<destPath>" "<exe>"`
2. Remove pastas temporárias comuns do NSIS (`$PLUGINSDIR`, `$TEMP`)

**Funciona para:**
- 7z-SFX (stub do 7z)
- WinRAR-SFX
- NSIS (nullsoft scriptable install system)
- Alguns InnoSetup mais antigos

### inno-std.js — InnoSetup (padrão)

**Cenário:** InnoSetup que o innoextract consegue ler

**Fluxo:**
1. Executa `innoextract -d "<tempDir>" --lowercase "<exe>"`
2. Move pasta `app/` pra raiz (se existir)
3. Remove pasta `tmp/` (se existir)
4. Move tudo pra `destPath`

### portable.js — Portable / Pasta

**Cenário:** O usuário selecionou uma pasta, ou o instalador já extraiu algo portátil

**Fluxo:**
1. Lista conteúdo da pasta origem
2. Copia tudo com `cp -r` para `destPath`
3. Não usa Wine

### iso.js — ISO Image

**Cenário:** Jogo em formato `.iso`, `.nrg`, `.mdf`

**Fluxo:**
1. Executa `7z x -y -o"<tempDir>" "<iso>"`
2. Move o conteúdo para `destPath`
3. Se houver `setup.exe` ou `install.exe` dentro, retorna como candidate

### wine-fallback.js — Wine + Proton

**Cenário:** Último recurso — InnoSetup customizado, InstallShield, ou desconhecido

**Fluxo:**
1. Monta env vars iguais ao `runner.js` original:
   ```
   WINEPREFIX, WINEDEBUG=-all,
   PROTON_NO_ESYNC=1, PROTON_NO_FSYNC=1,
   PROTON_NO_D3D11=1, PROTON_NO_VKD3D=1,
   PROTON_NO_D3D12=1, PROTON_NO_NVAPI=1,
   PROTON_HEAPTYPES=0, PROTON_HIDE_NVIDIA_GPU=1,
   PROTON_USE_WINED3D11=1
   ```
2. Executa `wine64 <exe>` com `cwd` no diretório do exe
3. Aguarda o instalador fechar (timeout 1h)

## Mapa de decisão de extração

```
analyze()
    │
    ▼
┌──────────┐    ┌──────────┐
│ archive  │    │   exe    │
│ (7z/r)   │    └────┬─────┘
└────┬─────┘         │
     ▼                ▼ 7z l funciona?
archive.js       ┌───┴───┐
                 │ SIM   │ NÃO
                 ▼       ▼
            sfx-nsis.js  innoextract funciona?
                         ┌───┴───┐
                         │ SIM   │ NÃO
                         ▼       ▼
                    inno-std.js  companions no dir?
                                 ┌───┴───┐
                                 │ SIM   │ NÃO
                                 ▼       ▼
                           exe-      wine-fallback.js
                           companions.js
```

## Como a extração nativa acelera

| Tipo | Antes (Wine) | Depois (nativo) | Ganho estimado |
|---|---|---|---|
| Pure archive (33GB 7z) | Wine 7z: ~45min | Nativo 7z (32 threads): ~5min | **9x** |
| EXE + companions | Wine extrai tudo: ~50min | Nativo + wine reg: ~7min | **7x** |
| SFX / NSIS | Wine roda SFX: ~30min | Nativo 7z: ~3min | **10x** |
| InnoSetup padrão | Wine roda installer | innoextract: segundos | **~100x** |
| Portable | Wine copia | cp -r nativo | **~5x** |

> **Nota:** Os ganhos são proporcionais ao tamanho do jogo. Para jogos de 1-5GB a diferença é menor, mas ainda significativa.
