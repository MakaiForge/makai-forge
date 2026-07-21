# Catálogo Custom — Adicionando Jogos

## Visão Geral

O catálogo custom permite adicionar **qualquer jogo** ao ProtonForge, mesmo que ele não esteja na Steam ou no catálogo padrão (`catalogo.json`). Basta editar o arquivo:

```
app/_data/catalogo-custom.json
```

Se você quiser também adicionar **fontes de download** (links magnéticos, torrents, etc.), é feito separadamente em:

```
data/sources/<nome>.json
```

---

## Estrutura do `catalogo-custom.json`

O arquivo é um array de objetos. Cada objeto é um jogo. Exemplo completo:

```json
[
  {
    "objectId": "custom_rapelay",
    "title": "RapeLay",
    "shop": "custom",
    "genres": ["Adult", "Adventure", "Simulation"],
    "libraryImageUrl": "https://i.ibb.co/rfbFScmG/maxresdefault.jpg",
    "libraryHeroImageUrl": "https://i.ibb.co/rfbFScmG/maxresdefault.jpg",
    "iconUrl": "https://i.ibb.co/ycWXTqBQ/icon.png",
    "release_date": { "date": "2006" },
    "releaseYear": 2006,
    "downloadSources": ["RapeLay Source"],
    "screenshots": [
      "https://i.ibb.co/Df0tky7g/1.jpg",
      "https://i.ibb.co/qFcJcPGj/2.jpg"
    ],
    "movies": [
      {
        "name": "Gameplay Preview",
        "mp4": "https://files.catbox.moe/5d2kmm.mp4",
        "thumbnail": "https://i.ibb.co/rfbFScmG/thumb.jpg"
      }
    ],
    "shortDescription": "Descrição curta do jogo...",
    "pc_requirements": {
      "minimum": "OS: Windows 10\nCPU: Intel i5\nRAM: 8 GB\nGPU: GTX 1060\nStorage: 50 GB",
      "recommended": "OS: Windows 10\nCPU: Intel i7\nRAM: 16 GB\nGPU: RTX 2060\nStorage: 50 GB"
    },
    "developer": "Nome do Desenvolvedor",
    "publisher": "Nome da Publicadora"
  }
]
```

### Campos Obrigatórios

| Campo | Descrição |
|---|---|
| `objectId` | ID único do jogo. Use `custom_<nome>` (sem espaços) |
| `title` | Nome do jogo |
| `shop` | Sempre `"custom"` |

### Campos de Imagem

| Campo | Descrição | Tamanho recomendado | Onde encontrar |
|---|---|---|---|
| `libraryImageUrl` | Capa do jogo (header) | 460x215 (horizontal) | Steam, IGDB, imgbb |
| `libraryHeroImageUrl` | Imagem de fundo da página de detalhes | 1920x720 | Steam background, fan art |
| `iconUrl` | Ícone pequeno (biblioteca, downloads, games) | 256x256 | Steam capsule, Google |
| `logoImageUrl` | Logo do jogo (sobreposto no hero) | 640x360 | Steam logo, fan art |
| `screenshots` | Array de URLs de screenshots | 1920x1080 | Steam, YouTube, prints próprios |

**Importante**: O `iconUrl` deve ser um link **direto** para a imagem (terminando em `.jpg`, `.png`), não uma página de galeria. Exemplo:

- ✅ Correto: `https://i.ibb.co/.../imagem.jpg` (link direto)
- ❌ Errado: `https://ibb.co/...` (página web, não funciona como imagem)

### Mapeamento das imagens no app

Cada campo do JSON é usado em diferentes partes do app:

| Campo | Onde aparece |
|---|---|
| `libraryImageUrl` | Capa no catálogo, thumbnail em downloads, card de jogos |
| `libraryHeroImageUrl` | Fundo da página de detalhes, hero em downloads |
| `iconUrl` | Ícone na biblioteca (games), sidebar |
| `logoImageUrl` | Logo sobreposto no hero (detalhes do jogo) |

### Onde hospedar as imagens

- **ibb.co** (imgbb) — hospeda imagem, aceita +18, link direto
- **catbox.moe** — também aceita imagens, link direto
- **Steam CDN** — se o jogo existe na Steam, pode usar o link direto:
  ```
  https://shared.steamstatic.com/store_item_assets/steam/apps/<STEAM_ID>/header.jpg
  https://shared.steamstatic.com/store_item_assets/steam/apps/<STEAM_ID>/library_hero.jpg
  ```

### Campo de Vídeo (`movies`)

```json
"movies": [
  {
    "name": "Gameplay Trailer",
    "mp4": "https://files.catbox.moe/5d2kmm.mp4",
    "thumbnail": "https://i.ibb.co/rfbFScmG/thumb.jpg"
  }
]
```

Suporta os formatos:
- `mp4` — link direto para arquivo .mp4
- `webm` — link direto para arquivo .webm
- `hls` — link para stream .m3u8
- `thumbnail` — URL da miniatura do vídeo
- `name` — nome do vídeo (ex: "Gameplay Trailer")

Onde hospedar vídeos **com link direto permanente**:

| Site | Limite | +18 | Cadastro |
|---|---|---|---|
| **catbox.moe** | 200MB | Sim | Não |
| **pixeldrain.com** | 1GB | Sim | Não |

Para upload via terminal:

```bash
# catbox.moe
curl -s -F "reqtype=fileupload" -F "fileToUpload=@video.mp4" https://catbox.moe/user/api.php

# pixeldrain.com
curl -s -F "file=@video.mp4" https://pixeldrain.com/api/file
```

Os links gerados são permanentes e funcionam no app.

### Descrição do Jogo

```json
"shortDescription": "Texto descritivo sobre o jogo..."
```

Esse texto aparece na página de detalhes, abaixo das screenshots.

### Requisitos de Sistema

```json
"pc_requirements": {
  "minimum": "OS: ...\nCPU: ...\nRAM: ...\nGPU: ...\nStorage: ...",
  "recommended": "OS: ...\nCPU: ...\nRAM: ...\nGPU: ...\nStorage: ..."
}
```

Use `\n` para quebrar linhas dentro de cada campo.

### Gêneros

```json
"genres": ["Action", "Adventure", "RPG", "Simulation"]
```

Lista de gêneros do jogo. Aparece como tags no catálogo.

---

## Adicionando Fonte de Download

As fontes de download (links magnéticos, torrents, etc.) são definidas em arquivos separados dentro de `data/sources/`.

Cada arquivo JSON em `data/sources/` representa uma fonte. Exemplo (`data/sources/rapelay.json`):

```json
{
  "name": "RapeLay Source",
  "downloads": [
    {
      "title": "RapeLay | PC Game",
      "steamId": "custom_rapelay",
      "uris": [
        "magnet:?xt=urn:btih:TORRENT_HASH&dn=NomeDoJogo"
      ],
      "fileSize": "2.15 GB",
      "uploadDate": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

### Campos da Fonte de Download

| Campo | Descrição |
|---|---|
| `name` | Nome da fonte (deve ser igual ao listado em `downloadSources` no catalogo-custom.json) |
| `downloads[].title` | Título do download |
| `downloads[].steamId` | Deve ser igual ao `objectId` do jogo no catalogo-custom.json |
| `downloads[].uris` | Array de links (magnet, HTTP, etc.) |
| `downloads[].fileSize` | Tamanho do arquivo em formato legível |
| `downloads[].uploadDate` | Data de upload no formato ISO |

### Como funciona o matching

1. O app procura em TODOS os arquivos `data/sources/*.json`
2. Para cada download, verifica se `steamId` bate com o `objectId` do jogo
3. Se bater, o download aparece na página de detalhes do jogo

---

## Fluxo Completo: Adicionar um Jogo Novo

1. Crie uma entrada no `app/_data/catalogo-custom.json` com os dados do jogo
2. (Opcional) Crie um arquivo em `data/sources/<nome>.json` com o link de download
3. Recompile o app: `npm run build`
4. Teste: `npm run start`
5. O jogo aparece na busca do catálogo
6. Ao clicar, mostra capa, screenshots, vídeo, descrição e download

---

## Exemplo: Jogo da Steam que não está no catálogo

Se o jogo existe na Steam mas não aparece no catálogo, você pode adicionar manualmente no `catalogo-custom.json` e usar os links oficiais da Steam:

```json
{
  "objectId": "123456",
  "title": "Nome do Jogo",
  "shop": "steam",
  "genres": ["Action"],
  "libraryImageUrl": "https://shared.steamstatic.com/store_item_assets/steam/apps/123456/header.jpg",
  "libraryHeroImageUrl": "https://shared.steamstatic.com/store_item_assets/steam/apps/123456/library_hero.jpg",
  "iconUrl": "https://shared.steamstatic.com/store_item_assets/steam/apps/123456/icon.jpg",
  "screenshots": [
    "https://shared.steamstatic.com/store_item_assets/steam/apps/123456/ss_1.jpg",
    "https://shared.steamstatic.com/store_item_assets/steam/apps/123456/ss_2.jpg"
  ],
  "shortDescription": "Descrição do jogo...",
  "developer": "Desenvolvedora",
  "publisher": "Publicadora"
}
```

Para achar as screenshots da Steam: vá até a página do jogo na loja, clique com direito nas imagens e copie o link, ou use o padrão acima substituindo `123456` pelo App ID.

---

## Dicas Rápidas

- **objectId** deve ser único para cada jogo
- Links de imagem/vídeo devem ser **diretos** (terminar em .jpg, .png, .mp4 etc.)
- Para vídeos, sempre use **catbox.moe** ou **pixeldrain.com** — links permanentes
- Após editar o JSON, precisa recompilar (`npm run build`) para as alterações aparecerem
- Se o jogo não aparecer, verifique se o JSON é válido (use `jsonlint` ou validador online)
