# Atualizar o ProtonForge

Guia completo para desenvolvedores sobre versionamento, releases e boas práticas.

## Versionamento

Cada versão estável gera uma **Release no GitHub** com os recursos customizados.

| Versão | Tag | Descrição |
|--------|-----|-----------|
| V1 | `resources-v1` | Primeira versão estável |
| V2 | `resources-v2` | Próxima versão |
| V3 | `resources-v3` | ... |

Cada Release contém:
- `protonforge-resources-v{N}.tar.gz` → protonforge-python-rpc + libs
- `venv.tar.gz` → venv Python 3.10 completo

## Como criar uma nova versão

### 1. Modifique o código

Edite `src/` normalmente.

### 2. Compile e teste

```bash
npm run build
./run.sh
```

### 3. Atualize o venv (se instalou novas libs Python)

```bash
cd /home/cas/Documentos/ProtonForge
tar czf app/_venv/venv.tar.gz --exclude="__pycache__" -C venv .
```

### 4. Atualize a versão no script

Em `scripts/restore-deps.cjs`:

```js
const RESOURCES_VERSION = "v2";
```

### 5. Empacote os recursos

```bash
tar czf /tmp/protonforge-resources-v2.tar.gz -C resources \
  protonforge-python-rpc frozen_application_license.txt icon.ico
```

### 6. Crie a Release no GitHub

1. https://github.com/lucasgertke11-bot/Proton_Forge/releases/new
2. Tag: `resources-v2`
3. Título: `Recursos ProtonForge v2`
4. Anexe: `protonforge-resources-v2.tar.gz`
5. Publique

### 7. Commit e push

```bash
git add -A
git commit -m "versão v2"
git push
```

## Scripts disponíveis

| Comando | O que faz |
|---------|-----------|
| `npm run build` | Compila o código (rápido) |
| `npm run reinstall` | Reinstala tudo do zero |
| `./run.sh` | Roda o app |

## Estrutura

```
src/                    → Código fonte
  main/                 → Processo principal (Electron)
  renderer/             → Interface (React)
  preload/              → Ponte main-renderer
  shared/               → Código compartilhado
  locales/              → Traduções
app/                    → Código reestruturado
  _main/                → Processo principal + Python RPC
    container/          → Engine de container (bwrap, runtime)
    rpc/                → Python RPC server
    installer-api/      → API de instalação
  _resources/           → Binários, runtime Python, extensões
  _data/                → Bancos SQLite, dados estáticos
  _assets/              → Assets de UI (ícones, backgrounds)
  _venv/                → Python virtualenv
  Catalogo/GameMod/     → Mod Manager (core + RPC)
  Games/                → Páginas e serviços de jogos
  Home/ Catalogue/      → Páginas da UI (React)
out/                    → Compilado (gerado pelo build)
scripts/
  restore-deps.cjs      → Script de reinstalação
  build-native-addon.cjs → Compilação Rust
```

## Observações

- **Nunca** use `electron-builder install-app-deps`
- **Nunca** modifique `node_modules/`
- **Sempre** crie Release manual após validar
- **Venv é a única opção** de runtime Python (sem fallback pro sistema)
- Se o venv quebrar, `npm run reinstall` restaura do `app/_venv/venv.tar.gz`
