# Native — Documentacao Completa

> Addon nativo Rust N-API para Node.js/Electron. Caminho base: `tools/native/`

---

## Estrutura de Diretorios

```
native/
├── native/
│   ├── package-lock.json        # npm: node-addon-api + node-gyp
│   └── protonforge-native/
│       ├── Cargo.toml           # Config crate Rust
│       ├── Cargo.lock           # Lock de dependencias
│       ├── build.rs             # Setup napi-build
│       └── src/
│           └── lib.rs           # Modulo nativo (224 linhas)
└── src/
    └── target/release/
        ├── libprotonforge_native.so  # .so compilado
        ├── libhydra_native.so        # .so secundario
        └── deps/                     # Artefatos de build Rust
```

---

## Funcoes Nativas Exportadas

### `process_profile_image(image_path, target_extension?)`
```rust
pub fn process_profile_image(
    image_path: String,
    target_extension: Option<String>,  // "webp", "png", "jpg"
) -> napi::Result<ProcessedImageData>
```
- Detecta se imagem e animada (GIF >1 frame, WebP animado, APNG)
- Se animada: converte para formato alvo (default WebP)
- Se estatica: retorna path original
- Retorna `{ image_path, mime_type }`
- **Usado para**: processar capas de jogos/mods, thumbnails de perfil

### `list_processes()`
```rust
pub fn list_processes() -> Vec<NativeProcessPayload>
```
- Lista todos os processos do sistema
- Retorna `{ exe, pid, name, environ?, cwd? }`
- No Linux: inclui `cwd` e `environ`
- **Usado para**: detectar jogos rodando, kill game, monitorar arvores de processos Proton/Wine

---

## Dependencias Rust

| Crate | Versao | Uso |
|-------|--------|-----|
| napi + napi-derive | v3 | Bindings Node.js N-API |
| image | 0.25.8 | Deteccao/conversao de formato |
| mime_guess | 2.0.5 | Deteccao MIME |
| sysinfo | 0.7.2 | Info de processos |
| uuid | 1.11.0 | Nomes unicos de temp files |

---

## Como se Encaixa no Makai Forge

Camada **nativa de performance**. `process_profile_image` processa cover art (converte GIFs animados para WebP estatico). `list_processes` e essencial para "kill game", deteccao de jogo ja rodando, e monitoramento de processos Proton/Wine. O `.so` e carregado via `require()` ou `napi.load()` no Electron.
