# Ludusavi — Documentacao Completa

> Backup/restauracao de saves de jogos. Caminho base: `tools/ludusavi/`

---

## Estrutura

```
ludusavi/
├── ludusavi        # Binario ELF 64-bit x86-64 (Rust, stripped)
└── config.yaml     # Config minimal (3 linhas)
```

---

## O que Faz

**Ludusavi** e uma ferramenta externa CLI escrita em Rust que localiza saves de milhares de jogos Windows. O binario e disponibilizado ao lado de uma config minima.

### config.yaml
```yaml
manifest:
  enable: false
customGames: []
```

O manifest esta desabilitado e nenhum mapeamento customizado esta definido. A ferramenta e invocada programaticamente com parametros runtime.

---

## Como se Encaixa no Makai Forge

Fornece **backup e restauracao de saves**. Quando o usuario troca versao Proton ou recria um Wine prefix, saves precisam ser preservados. O binario `ludusavi` e chamado como subprocess para localizar saves dentro dos prefixos Wine:

- `drive_c/users/*/Documents/My Games`
- `AppData/Local`
- `AppData/Roaming`

Tambem e acessivel via `python-rpc/protonforge-api`:
- `get_prefix_saves(prefix_path)` — encontra diretorios de save
- `restore_saves(prefix_path, saves_backup, backup_source)` — copia saves entre prefixos
