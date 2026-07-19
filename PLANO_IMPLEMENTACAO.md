# PLANO DE IMPLEMENTAÇÃO — Makai Time Fixes

**Agente memory — não apagar, atualizar conforme implementação**

---

## Status Geral

| Fase | Descrição | Status |
|---|---|---|
| FASE 1A | Montar GLVND EGL vendor JSONs | ✅ CONCLUÍDA |
| FASE 1B | Detectar e capturar DRI drivers | ✅ CONCLUÍDA |
| FASE 1C | Capturar libva (VA-API client libs) | ✅ CONCLUÍDA |
| FASE 1-TESTE | Testar NTE — verificar vídeo | ⏳ Pendente (depende Fase 1 Provider Mount) |
| FASE 2A | Detecção dinâmica via ldconfig -p | ⏳ Pendente |
| FASE 2B | Captura recursiva via ldd | ⏳ Pendente |
| FASE 3 | /dev/nvidia-caps, OpenCL, CUDA | ⏳ Pendente |

> **NOTA:** As FASEs 1A/1B/1C foram implementadas, mas o crash NTE persiste
> porque o bug raiz é o GPU Provider Mount (symlinks vs runtime).
> Ver `PLANO_FASES_PROVIDER_OVERRIDES.md` para as próximas fases críticas.

---

## FASE 1A: Montar GLVND EGL vendor JSONs

### Problema
`detect.py` encontra `10_nvidia.json` e `50_mesa.json` em `/usr/share/glvnd/egl_vendor.d/`,
mas `mount.py` só monta Vulkan ICD JSONs. Os GLVND JSONs são ignorados.
O loader EGL no container não sabe qual vendor usar → launcher cai em SoftwareOpenGL.

### O que fazer

**Arquivo: `detect.py`**
- Adicionar função `egl_vendor_jsons()` que retorna lista de dicts:
  `[{"json_path": str, "lib_name": str}]`
- Diferente de `egl_resources()` existente que só retorna paths de .so

**Arquivo: `capture.py`**
- Adicionar função `capture_glvnd_egls()` que:
  1. Chama `detect.egl_vendor_jsons()`
  2. Para cada JSON: copia o JSON para `overrides/share/glvnd/egl_vendor.d/`
  3. Ajusta `library_path` no JSON para apontar para `/overrides/<arch>/lib/<libname>`
  4. Cria symlink da lib .so no `lib_dir`
- Chamar dentro de `capture_all_graphics()`

**Arquivo: `mount.py`**
- Em `override_bwrap_args()`, adicionar bind dos GLVND JSONs:
  ```python
  glvnd_dir = os.path.join(overrides_base, "share", "glvnd", "egl_vendor.d")
  if os.path.isdir(glvnd_dir):
      for f in sorted(os.listdir(glvnd_dir)):
          src = os.path.join(glvnd_dir, f)
          if os.path.isfile(src):
              args.extend(["--ro-bind", src, f"/usr/share/glvnd/egl_vendor.d/{f}"])
  ```

### Arquivos modificados
- `tools/prefix/makai_time/overrides/detect.py` — nova função `egl_vendor_jsons()`
- `tools/prefix/makai_time/overrides/capture.py` — nova função `capture_glvnd_egls()`, chamada em `capture_all_graphics()`
- `tools/prefix/makai_time/overrides/mount.py` — bind de GLVND JSONs em `override_bwrap_args()`

### Verificação
```bash
# Rodar makai_time com --dry-run para NTE e verificar se GLVND JSONs aparecem nos args
cd /home/cas/Documentos/Makai-forge
source tools/venv/bin/activate
python3 -m makai_time.makai_time \
  --game-exe "C:/Neverness To Everness/Client/WindowsNoEditor/HT/Binaries/win64/HTGame.exe" \
  --proton-path /home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/DW-Proton-11.0-5 \
  --prefix-path /home/cas/Games/Makai-forger/neverness-to-everness/pfx \
  --game-path /home/cas/Games/Makai-forger/neverness-to-everness \
  --dry-run 2>&1 | grep -i glvnd
```

---

## FASE 1B: Detectar e capturar DRI drivers

### Problema
`detect.py` tem `dri_drivers()` que busca `*_dri.so`, mas:
1. Só busca em `HOST_LIB_PATHS` (hardcoded)
2. Os DRI drivers NÃO são chamados em `all_graphics_libraries()` — verificar!

### O que fazer

**Arquivo: `detect.py`**
- Verificar se `dri_drivers()` já é chamado em `all_graphics_libraries()`
- Se não for, adicionar `libs.extend(dri_drivers())`

### Verificação
```bash
python3 -c "from makai_time.overrides.detect import dri_drivers; print(dri_drivers()[:5])"
```

---

## FASE 1C: Capturar libva (VA-API client libs)

### Problema
`detect.py` captura drivers VA-API (`*_drv_video.so`) mas NÃO as libs cliente.

### O que fazer

**Arquivo: `detect.py`**
- Adicionar função `vaapi_client_libs()`:
  ```python
  def vaapi_client_libs() -> list[str]:
      patterns = [r"libva\.so.*", r"libva-drm\.so.*", r"libva-x11\.so.*",
                   r"libva-wayland\.so.*", r"libva-glx\.so.*"]
      # Buscar em HOST_LIB_PATHS
  ```
- Adicionar chamada em `all_graphics_libraries()`

### Verificação
```bash
python3 -c "from makai_time.overrides.detect import vaapi_client_libs; print(vaapi_client_libs())"
```

---

## FASE 1-TESTE: Testar NTE

### Pré-requisitos
- FASE 1A, 1B, 1C implementadas
- DW-Proton-11.0-5 disponível
- NTE instalado com prefix

### Comando de teste
```bash
cd /home/cas/Documentos/Makai-forge
source tools/venv/bin/activate
python3 -m makai_time.makai_time \
  --game-exe "C:/Neverness To Everness/Client/WindowsNoEditor/HT/Binaries/win64/HTGame.exe" \
  --proton-path /home/cas/.config/makai-forger/compat-tools/compatibilitytools.d/DW-Proton-11.0-5 \
  --prefix-path /home/cas/Games/Makai-forger/neverness-to-everness/pfx \
  --game-path /home/cas/Games/Makai-forger/neverness-to-everness \
  --game-args "/Game/LoginAndCreate/Map/Updater/Updater_P --saveddirsuffix=Global" \
  --verbose
```

### O que verificar
1. Launcher NÃO força SoftwareOpenGL (verificar NTEGlobalGame.log)
2. Janela do jogo aparece com vídeo (não tela preta)
3. Jogo roda mais de 28 segundos sem crash

---

## FASE 2A: Detecção dinâmica via ldconfig -p

### Problema
`HOST_LIB_PATHS` é hardcoded. Falha em Arch (/usr/lib32), Gentoo, NixOS, etc.

### O que fazer
- Criar módulo `tools/prefix/makai_time/overrides/resolve.py`
- Função `discover_host_lib_dirs()` → `ldconfig -v` → lista de dirs
- Função `resolve_library(name, arch)` → `ldconfig -p` → caminho real
- Função `resolve_library_32(name)` → `ldconfig -p` filtrando i386
- Substituir `_find_lib()` e `_find_libs()` em `detect.py` para usar o resolver

---

## FASE 2B: Captura recursiva via ldd

### O que fazer
- Função `resolve_recursive(lib_path, max_depth=8)` → `ldd lib_path` → dependências
- Filtrar libs do runtime (não capturar o que já está no steamrt4)
- Usar em `capture_all_graphics()` como alternativa a listas fixas

---

## FASE 3: Completude

- `/dev/nvidia-caps/` em `gpu_device_args()`
- OpenCL: `libOpenCL.so` + ICD JSONs
- CUDA: `libnvoptix.so` + libs OptiX

---

## Arquivos do projeto (referência)

```
tools/prefix/makai_time/
├── makai_time.py              # Entry point: build_bwrap_cmd() + run()
├── core/
│   ├── gpu.py                 # Info de GPU (não montagem)
│   ├── ldso.py                # LD_LIBRARY_PATH + ld.so.cache
│   ├── display.py             # X11, Wayland, PipeWire, PulseAudio
│   ├── layers.py              # Vulkan/OpenXR layer masking
│   └── runtime.py             # Resolução de runtime
├── overrides/
│   ├── __init__.py            # exports
│   ├── detect.py              # ← FASE 1A, 1B, 1C modifying
│   ├── capture.py             # ← FASE 1A modifying
│   ├── mount.py               # ← FASE 1A modifying
│   └── capsule_capture.py     # Referência para resolução ELF
└── proton/
    ├── config.py              # Env vars
    └── intel.py               # Proton intelligence
```

---

## Última atualização
- **Data:** 17/07/2026
- **FASE 1A:** ✅ CONCLUÍDA — detect.py (egl_vendor_jsons), capture.py (capture_glvnd_egls), mount.py (bind GLVND)
- **FASE 1B:** ✅ CONCLUÍDA — detect.py (dri_drivers com subdir search), capture.py (chamado em capture_all_graphics)
- **FASE 1C:** ✅ CONCLUÍDA — detect.py (vaapi_client_libs), deduplicação
- **PRÓXIMO:** Provider Mount (PLANO_FASES_PROVIDER_OVERRIDES.md Fase 1 + Fase 2)
