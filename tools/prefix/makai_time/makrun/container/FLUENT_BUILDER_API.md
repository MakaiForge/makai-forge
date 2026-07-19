# Fluent Builder API

## Filosofia

O Builder é um motor genérico que **não conhece nenhum Proton fork específico**.

Ele recebe um dicionário de configuração vindo da `get_container_config()` do fork e monta o container. Cada seção do dicionário (`gpu`, `audio`, `display`, `devices`, `env`, etc.) é processada por um step module independente em `container/steps/`.

```
                ┌──────────────────────────┐
                │  proton_cachyos.py        │
                │  get_container_config()   │
                └──────────┬───────────────┘
                           │  dict
                           ▼
                ┌──────────────────────────┐
                │  Builder (API fluente)   │
                │                          │
                │  .apply_isolation()      │
                │  .apply_runtime()        │
                │  .apply_gpu()            │
                │  .apply_audio()          │
                │  .apply_display()        │
                │  .apply_devices()        │
                │  .apply_env()            │
                │  .build()                │
                └──────────┬───────────────┘
                           │  list[str]
                           ▼
                ┌──────────────────────────┐
                │  bwrap + args            │
                └──────────────────────────┘
```

## API

### Construtor

```python
Builder(config: dict, ctx: dict)
```

- `config` → dicionário retornado por `get_container_config()`
- `ctx` → contexto compartilhado (env, features, paths)

### Métodos fluentes

Cada método retorna `self` para encadeamento.

| Método | Step module | O que faz |
|--------|-------------|-----------|
| `apply_isolation()` | `steps/isolation.py` | `--unshare-all`, `--clearenv`, `--cap-drop ALL`, lock file |
| `apply_runtime(path)` | `steps/runtime.py` | Monta runtime (usr, lib, ld.so.cache) |
| `apply_tmp_proc_sys()` | (inline) | `--tmpfs /tmp`, `--proc /proc`, `--ro-bind /sys` |
| `apply_etc()` | `steps/etc.py` | nsswitch, hosts, resolv, machine-id, timezone |
| `apply_ssl()` | `steps/ssl.py` | Certificados CA do host |
| `apply_fonts()` | `steps/fonts.py` | Fontes do sistema + usuário |
| `apply_mounts(proton, prefix, exe)` | `steps/mounts.py` | Proton, prefixo, jogo, provider mount, home |
| `apply_display()` | `steps/display.py` | X11, Wayland, D-Bus, Discord |
| `apply_audio(path)` | `steps/audio.py` | PulseAudio, PipeWire, ALSA, OpenAL |
| `apply_devices()` | `steps/devices.py` | `/dev/dri`, `/dev/nvidia*`, ntsync, snd, input |
| `apply_gpu()` | `steps/gpu.py` | GPU overrides (libs nativas) |
| `apply_env(env, features)` | `steps/env.py` | 70+ env vars (STEAM_, PROTON_, WINEDEBUG, etc.) |
| `apply_exec(env, features)` | `steps/exec.py` | `/proton/proton waitforexitandrun <exe>` |
| `apply_relaxations(features)` | (inline) | Anti-cheat relax flags |

### Build

```python
.build() -> list[str]
```

Finaliza, loga resultados e retorna a lista de argumentos do bwrap.

## Uso típico

```python
from makrun.container import Builder
from makrun.intel import get_container_config

config = get_container_config("proton-cachyos")

cmd = (Builder(config, ctx)
       .apply_isolation()
       .apply_runtime(runtime_path)
       .apply_tmp_proc_sys()
       .apply_etc()
       .apply_ssl()
       .apply_fonts()
       .apply_mounts(proton_path, prefix_path, exe_path)
       .apply_display()
       .apply_audio(runtime_path)
       .apply_devices()
       .apply_gpu()
       .apply_env(env, features)
       .apply_relaxations(features)
       .apply_exec(env, features)
       .build())
```

Equivalente funcional (wrapper):

```python
from makrun.container import build_bwrap_cmd
cmd = build_bwrap_cmd(runtime_path, proton_path, prefix_path, exe_path, env, features)
```

## Adicionar um step novo

Se surgir um domínio novo (ex: VR, CUPS, anti-cheat):

1. Crie `container/steps/vr.py` com função `configure(config) -> StepResult`
2. Adicione método `apply_vr()` no `Builder`
3. Adicione a chamada no encadeamento em `build_bwrap_cmd()`

**Fora isso, nunca mexa no Builder.** Toda configuração de Proton fica em `intel/definitions/`.

## Contrato

- Builder **não** tem `if fork == "cachyos"` em lugar nenhum
- Builder **não** sabe nomes de DLLs, paths de GPU, ou configurações de áudio
- Builder **só** chama steps e coleta resultados
- Cada fork diz **o quê**; o Builder decide **como** montar
