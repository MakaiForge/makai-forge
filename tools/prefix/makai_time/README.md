# Makai Time

Runtime container próprio para jogos Windows no Linux via Proton/Wine.
Substitui pressure-vessel + _v2-entry-point + steamrt4 da Steam.

## Filosofia

O Makai Time é um **runtime container** — não um launcher, não um Proton.
Ele cria um ambiente isolado e previsível para qualquer Proton/Wine rodar,
detectando automaticamente o hardware e configurando tudo para máxima
performance e compatibilidade.

### O que a Steam faz → o que nós fazemos diferente

| Steam (pressure-vessel) | Makai Time |
|---|---|
| GPU detection em C (GLib/GObject) | GPU detection em Python puro |
| Só configura o básico do runtime | + sync detection, CPU pinning, DXVK config, Wayland |
| Usuário configura Proton manualmente | Recommendation engine por jogo |
| 1 runtime (steamrt4) por vez | Múltiplos runtimes (scout → steamrt4) com fallback |
| Container "cego" — não expõe info ao Proton | Container-aware: expõe GPU/drivers/sync para Proton |

### O que Lutris não faz → o que nós fazemos

| Lutris | Makai Time |
|---|---|
| Usa pressure-vessel da Steam | Runtime próprio em Python |
| GPU config manual (checkbox esync/fsync) | Sync detection + configuração automática |
| Perfil de jogo via script YAML | Handlers por engine + banco de perfis |
| 3-4 Protons gerenciados | 20+ Protons com recommendation engine |
| Só roda jogos | + ferramentas (cmd, notepad, dxdiag via Makaitricks) |

## Estrutura

```
makaitime/
├── core/                    # Núcleo do runtime
│   ├── __init__.py
│   ├── container.py         # bwrap command builder + executor
│   ├── gpu.py              # GPU detection (NVIDIA/AMD/Intel)
│   ├── sync.py             # sync method detection (ntsync/fsync/esync)
│   ├── runtime.py          # Runtime download + extract (steamrt4/scout/etc)
│   ├── display.py          # Display (X11/Wayland) + audio (PipeWire/Pulse)
│   └── ldso.py             # LD_LIBRARY_PATH + ld.so.cache regeneration
│
├── proton/                  # Gerenciamento de Protons
│   ├── __init__.py
│   ├── catalog.py           # Catálogo de Protons disponíveis
│   ├── recommender.py       # Recommendation engine por jogo
│   └── config.py           # Proton-specific config injection
│
├── overrides/               # GPU driver detection + overrides
│   ├── __init__.py
│   ├── detect.py           # Detecta libs GPU do host
│   ├── capture.py          # Copia libs detectadas para overrides
│   └── mount.py            # Monta overrides no container
│
├── profiles/                # Per-game profiles
│   ├── __init__.py
│   ├── registry.py          # Banco de perfis conhecidos
│   ├── engine.py           # Handlers por engine (Bethesda, Unity, Unreal, etc)
│   └── inject.py           # Injeção de config (dxvk.conf, registry, env vars)
│
├── utils/                   # Utilitários
│   ├── __init__.py
│   ├── elf.py              # Leitura de ELF (DT_NEEDED, SONAME)
│   └── sysinfo.py          # Detecção de sistema (kernel, CPU, memória)
│
├── __init__.py
├── makai_time.py           # Entry point principal
└── README.md               # Este arquivo
```

## Dependências

- Python 3.10+
- bubblewrap (bwrap) — instalado no sistema
- steamrt4 — baixado automaticamente por `core/runtime.py`
- Nenhuma dependência Python externa (stdlib only)

## Licença

MIT
