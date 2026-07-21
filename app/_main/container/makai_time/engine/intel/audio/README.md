# Audio Intelligence — Makrun

## O que é

Subsistema de inteligência de áudio do Makrun. Analisa jogos Windows para descobrir **como** eles produzem áudio — qual API, qual middleware, qual backend — e gera recomendações de configuração para o Proton/Wine.

Faz parte da camada `intel/` do Makrun, que responde perguntas como:
- `intel/audio/` → Como esse jogo produz áudio?
- `intel/anticheat/` → Possui EAC/BattlEye?
- `intel/definitions/` → Qual Proton fork é esse?
- `intel/profiles/` → Qual perfil de compatibilidade?

---

## Estrutura

```
makrun/intel/audio/
├── __init__.py              # Public API (analyze_audio, format_result, ...)
├── models.py                # AudioResult, AudioEvidence (dataclasses)
├── analyzer.py              # Orquestrador das 4 camadas de detecção
├── cache.py                 # Cache JSON (~/.cache/makrun/audio/)
├── README.md                ← Este arquivo
│
├── detectors/               # Camadas de análise
│   ├── __init__.py
│   ├── imports.py           # Camada 1: lê imports do PE do .exe
│   ├── dlls.py              # Camada 2: escaneia DLLs no diretório do jogo
│   ├── signatures.py        # Camada 3: identifica middleware por assinatura de bytes
│   └── runtime.py           # Camada 4: parseia log WINEDEBUG existente
│
└── knowledge/               # Base de conhecimento (desacoplada dos detectores)
    ├── __init__.py
    ├── middleware.py         # 11 middlewares catalogados (características + backends)
    ├── engines.py            # Mapeamento engine (Unity, UE4, etc.) → middleware
    ├── recommendations.py    # Motor de recomendações (entrada: AudioResult)
    └── compatibility.py      # Problemas conhecidos de jogos específicos
```

### Separação detector × conhecimento

```
analyzer.py                         knowledge/
  │                                   │
  ├─ Camada 1: imports   ──────────  │ (não consulta)
  ├─ Camada 2: dlls      ──────────  │ (não consulta)
  ├─ Camada 3: signature ──────────  ├─ middleware.py (confirma identidade)
  ├─ Camada 4: runtime   ──────────  │ (não consulta)
  │                                   │
  └─ recommendation     ──────────── └─ recommendations.py + middleware.py
```

Isso significa que `knowledge/` pode crescer sem mudar `detectors/`.

---

## Pipeline de detecção (4 camadas)

### Camada 1 — Imports (`detectors/imports.py`)

Lê a tabela de imports do executável PE32/PE32+. Verifica quais DLLs de áudio o `.exe` importa diretamente.

**Método:** `objdump -p` (primário) → fallback para parse manual do PE header.

**DLLs reconhecidas:** 30+ (DirectSound, MMDevAPI, XAudio2, OpenAL, FMOD, Wwise, CRIWARE, BASS, etc.)

**Complexidade:** milissegundos (lê só o cabeçalho do .exe).

```
Exemplo (GrandFantasia.exe):
  Imports: dsound.dll → "DirectSound"
```

### Camada 2 — DLL scan (`detectors/dlls.py`)

Escaneia o diretório do jogo (instalação + prefixo) por DLLs de áudio conhecidas.

**Regras:**
- Pula `system32/`, `syswow64/`, `windows/`, `Program Files/` (evita DLLs do Wine)
- Segue symlinks (`os.walk` com `followlinks=True`)
- Dedup por nome de arquivo

**DLLs reconhecidas:** 40+ (ALAudio, OpenAL32, FMOD, AkSoundEngine, cri_*, xaudio2_*, BASS, etc.)

```
Exemplo (Grand Fantasia Violet):
  ALAudio.dll          → "OpenAL Soft"  2.1MB
  discord_game_sdk.dll → "Discord RPC"  0.5MB
```

### Camada 3 — Assinaturas (`detectors/signatures.py`)

Analisa os bytes binários das DLLs do jogo para identificar o middleware **com precisão**, mesmo que o nome do arquivo não seja padrão.

**Método:** busca sequências de bytes características no PE.

**Assinaturas:** 12 middlewares (Wwise, FMOD, OpenAL Soft, CRIWARE, BASS, XAudio2, irrKlang, Discord, Steam Audio, Vivox, Miles, SoLoud).

```
Exemplo (ALAudio.dll):
  Padrão "OpenAL Soft" encontrado → confiança 100%
  Middleware: OpenAL Soft

Exemplo (discord_game_sdk.dll):
  Padrão "DiscordCreate" → confiança 100%
  Middleware: Discord GameSDK
```

### Camada 4 — Runtime (`detectors/runtime.py`)

Parseia logs de execução com `WINEDEBUG=+dsound,+mmdevapi,+xaudio2` para detectar **em tempo real** quais APIs de áudio são realmente chamadas.

**Não executa o jogo** — apenas analisa logs existentes.

```
Exemplo (Grand Fantasia Violet log):
  Chamadas mmdevapi: 5000+ (AudioClient_Create, GetBuffer, ReleaseBuffer)
  Chamadas dsound:    1 (DllMain apenas — NUNCA usado)
  API ativa: MMDevAPI/WASAPI
```

---

## Modelo de dados — `AudioResult`

```python
@dataclass
class AudioResult:
    api: str | None             # API de áudio detectada (ex: "MMDevAPI/WASAPI")
    middleware: str | None      # Middleware identificado (ex: "OpenAL Soft")
    backend: str | None         # Backend ativo (ex: "mmdevapi")
    confidence: float           # Confiança da detecção (0.0 a 1.0)
    evidence: list[AudioEvidence]  # Evidências que suportam o resultado
    recommendations: list[str]  # Recomendações de configuração
    dlls_detected: list[str]   # DLLs de áudio encontradas
    apis_detected: list[str]   # APIs detectadas
    preferred_driver: str | None    # driver Wine preferido
    needs_dsoal: bool           # Recomenda DSOAL?
```

---

## Cache

Resultados de análise são cacheados em `~/.cache/makrun/audio/<game_hash>.json` por 7 dias.

A chave é um hash SHA-256 do diretório + nomes de arquivos + timestamps das DLLs de áudio.

```bash
# Forçar re-análise
python3 -c "from makrun.intel.audio import invalidate_cache; invalidate_cache('/path/to/game')"

# Limpar todo cache
python3 -c "from makrun.intel.audio.cache import clear_all_cache; clear_all_cache()"
```

---

## Base de conhecimento

### Middlewares catalogados (`knowledge/middleware.py`)

| Middleware | Backends | Driver preferido | DSOAL? |
|-----------|----------|-----------------|--------|
| OpenAL Soft | mmdevapi, dsound, pulse, alsa, pipewire | winepipewire | ❌ |
| FMOD | mmdevapi, dsound, xaudio2, pulse, alsa | winepipewire | ❌ |
| Wwise | mmdevapi, dsound, xaudio2, pulse | winepipewire | ❌ |
| CRIWARE | mmdevapi, dsound, xaudio2 | winepipewire | ❌ |
| XAudio2 | mmdevapi | winepipewire | ❌ |
| DirectSound | mmdevapi, dsound_drv | winepulse | ✅ |
| BASS | mmdevapi, dsound, pulse, alsa | winepipewire | ❌ |
| irrKlang | dsound, pulse, alsa, winmm | winepulse | ✅ |
| SDL_mixer | pulse, alsa, pipewire, dsound | winepipewire | ❌ |
| Miles Sound System | dsound, winmm, pulse | winepulse | ✅ |
| SoLoud | pulse, alsa, pipewire, dsound, openal | winepipewire | ❌ |

### Recomendações (`knowledge/recommendations.py`)

Motor desacoplado: recebe `AudioResult`, retorna `dict` com:
- `preferred_driver`: driver Wine (winepipewire / winepulse / winealsa)
- `proton_hint`: sugestão de fork de Proton
- `env_vars`: variáveis de ambiente (ex: `WINEDLLOVERRIDES`)
- `dsoal`: flag se DSOAL é recomendado
- `notes`: observações e problemas conhecidos
- `avoid`: configurações a evitar

### Compatibilidade (`knowledge/compatibility.py`)

Jogos com problemas documentados:

| Jogo | Middleware | Causa provável | Status |
|------|-----------|---------------|--------|
| Grand Fantasia Violet | OpenAL Soft | Mixing 3D interno do ALAudio.dll | 🔴 Em investigação |
| FFXIV | CRIWARE | Buffer inadequado no winepipewire | ⚠️ Workaround |
| Skyrim SE | BASS/XAudio2 | XAudio2 2.7 legacy | ⚠️ Workaround |
| Fallout 4 | BASS/XAudio2 | XAudio2 2.7 legacy + winepipewire | ⚠️ Workaround |

---

## Como usar

```python
from makrun.intel.audio import analyze_audio, format_result

# Análise básica (2 segundos)
result = analyze_audio("/home/user/Games/my-game")

# Com executável específico + log runtime
result = analyze_audio(
    "/home/user/Games/my-game",
    exe_path="/home/user/Games/my-game/game.exe",
    runtime_log="/home/user/Games/logs/winedebug.log",
    use_cache=True,        # default
    force=False,           # re-analisar
)

# Formatar para exibição
print(format_result(result))

# Acessar dados estruturados
print(result.api)              # "MMDevAPI/WASAPI"
print(result.middleware)       # "OpenAL Soft"
print(result.confidence)       # 0.85
print(result.recommendations)  # [...]
```

---

## A descoberta do áudio 3D do Grand Fantasia Violet

### O problema

| Tipo de som | Funciona? |
|-------------|-----------|
| BGM | ✅ |
| SFX 2D | ✅ |
| Mobs | ✅ |
| Ataque corpo a corpo do personagem | ❌ silêncio |
| Carregamento de ataque à distância | ❌ silêncio |

### Hipótese inicial (ERRADA)

```
GrandFantasia.exe → ALAudio.dll (OpenAL Soft)
  → dsound.dll (DirectSound) → winepulse.drv → PulseAudio → PipeWire
```

Achávamos que o jogo usava **DirectSound3D** e que o problema era no Wine `dsound.dll`.

### Teste 1: DSOAL

Substituímos `dsound.dll` pelo DSOAL (DirectSound → OpenAL wrapper). Confirmamos via `/proc/PID/maps` que foi carregado.

**Resultado:** ❌ Não resolveu.

### Teste 2: Proton-CachyOS 20260702

Atualizamos para a versão mais recente do Proton, que substitui `winepulse.drv`/`winealsa.drv` por `mmdevapi.dll` + `winepipewire.so`.

Rodamos com `WINEDEBUG=+dsound,+mmdevapi` para capturar chamadas reais.

**Resultado:** ❌ Não resolveu. Mas revelou a verdade:

```
Log:
  trace:dsound:DllMain                    ← DLL carregada
  (nenhuma outra chamada dsound jamais)   ← NUNCA USADA
  trace:mmdevapi:init_driver              ← pipewire selecionado
  trace:mmdevapi:AudioClient_Create       ← 10+ clients criados
  trace:mmdevapi:render_GetBuffer         ← 960 samples, 20ms
  trace:mmdevapi:render_ReleaseBuffer     ← flags=0
```

`dsound.dll` foi carregado (provavelmente como dependência) mas **nunca chamado**. `IDirectSoundCreate`, `IDirectSound3DBuffer`, `DirectSoundCreate8` — zero.

### Pipeline real (DESCOBERTO)

```
GrandFantasia.exe
  → ALAudio.dll (OpenAL Soft, 2.1MB)
    → mmdevapi.dll (WASAPI nativo)
      → winepipewire.so
        → libpipewire-0.3.so.0 → PipeWire → SADES
```

**O jogo não usa DirectSound3D.** O `ALAudio.dll` foi compilado com o backend WASAPI, não DSound. O mixing 3D (posicionamento, atenuação, panning) é feito **dentro do próprio ALAudio.dll**.

### Por que o áudio 3D não funciona

WASAPI (`mmdevapi`) é um streaming simples: `GetBuffer` → escreve áudio → `ReleaseBuffer`. Ele **não tem suporte a buffers 3D**. Todo posicionamento espacial é responsabilidade do middleware.

O `ALAudio.dll` (OpenAL Soft 1.1, compilado com backend WASAPI) é quem deveria fazer o mixing 3D. A suspeita atual:

1. O `ALAudio.dll` do jogo pode ter um bug na implementação 3D (gain=0, posição do listener errada, distância crítica mal configurada)
2. Pode ser uma versão antiga do OpenAL Soft com problemas no backend WASAPI
3. O mixing 3D pode estar sendo aplicado mas os parâmetros não fazem sentido (minDistance=0 → atenuação zero → silêncio)

### O que o Audio Intelligence do Makrun revelou

O detector de áudio (criado durante esta investigação) analisou o jogo e retornou:

```
API............. OpenAL Soft
Middleware...... OpenAL Soft
Backend......... mmdevapi
Confiança....... 85%
Driver.......... winepipewire
DSOAL........... Não necessário

Evidências:
  ✔ DLLs: ALAudio.dll (OpenAL Soft), discord_game_sdk.dll (Discord RPC)
  ✔ Assinatura: "OpenAL Soft" em ALAudio.dll (100%)
  ✔ Assinatura: "DiscordCreate" em discord_game_sdk.dll (100%)

Recomendações:
  • OpenAL Soft via WASAPI não suporta posicionamento 3D nativo
  • Backend DSound pode ter problemas com buffers 3D no Wine
```

Isso **confirma automaticamente** o que descobrimos manualmente com horas de debugging.

### Próximos passos

1. **`ALSOFT_LOGLEVEL=3`** — capturar logs do mixing 3D do OpenAL Soft dentro do ALAudio.dll
2. **Substituir ALAudio.dll** por uma build vanilla do OpenAL Soft com WASAPI para ver se resolve
3. **strace** das chamadas mmdevapi para ver os formatos de buffer solicitados

---

## Licença

Parte do Makai Forge Runtime (Makrun).
