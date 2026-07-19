# Gap Analysis: Makai Time Container vs UMU-Launcher/pressure-vessel

**Data:** 17/07/2026
**Base:** UMU-Launcher v1.3.0 + pressure-vessel (steam-runtime-tools)
**Alvo:** Makai Time Engine (`makrun/container/builder.py`)

---

## 1. FILOSOFIA DE SEGURANÇA: Diferença Fundamental

| Aspecto | UMU/pressure-vessel | Makai Time | Justificativa |
|---------|-------------------|------------|---------------|
| **Namespace isolation** | `--not-a-security-boundary` (nenhum) | `--unshare-user --unshare-ipc --unshare-pid --unshare-uts --unshare-cgroup` | Makai Time isola por design |
| **Network** | Compartilhado (padrão bwrap) | Compartilhado (sem `--unshare-net`) | ✅ Ambos compartilham |
| **clearenv** | NÃO (env do host passa) | SIM (`--clearenv`) | Makai Time limpa e repovoa |
| **cap-drop ALL** | NÃO | SIM | Makai Time mais seguro |
| **seccomp** | NÃO | SIM (core/seccomp.py) | Makai Time bloqueia syscalls |
| **disable-userns** | NÃO | SIM | Makai Time seguro |

**IMPORTANTE**: O UMU NÃO isola NADA. É um container "leve" que só serve pra montar o runtime. 
Makai Time é um container DE VERDADE com isolamento. Isso significa que algumas coisas que 
funcionam no UMU (ex: processos verem /proc do host) NÃO funcionam no Makai Time sem 
relaxamentos explícitos.

---

## 2. ANÁLISE COMPLETA DE FLAGS

### 2.1. NETWORK (flags de rede)

| Flag / Config | UMU | Makai Time | Status |
|--------------|-----|------------|--------|
| `--unshare-net` | ❌ Não usa | ❌ Não usa | ✅ Correto |
| Namespace de rede | Compartilhado (padrão) | Compartilhado (padrão) | ✅ |
| `/etc/resolv.conf` | Montado do host | Montado do host | ✅ |
| `/etc/hosts` | Montado do host | Montado do host | ✅ |
| `/etc/host.conf` | Montado do host | Montado do host | ✅ |
| `/etc/nsswitch.conf` | Montado do runtime | Montado do host | ✅ |
| DNS caching | systemd-resolved (host) | systemd-resolved (host) | ✅ (herdado) |
| HTTP retry/timeout | `UMU_HTTP_RETRIES`, `UMU_HTTP_TIMEOUT` | Não aplicável (env var do host) | ✅ |
| Network check (1.1.1.1:53) | Antes de executar | Não faz | ➖ Opcional |
| Proxy env vars (`http_proxy`, etc) | Herdado do host | Não setado | ❌ FALTA |

**Conclusão Rede**: ✅ Funcional. O compartilhamento de namespace de rede é equivalente.
Proxy env vars podem ser necessários em redes corporativas/proxied.

---

### 2.2. SHADER CACHE (Vulkan/OpenGL)

| Flag / Config | UMU | Makai Time | Status |
|--------------|-----|------------|--------|
| `STEAM_COMPAT_SHADER_PATH` | `$WINEPREFIX/shadercache` | ❌ NÃO SETADO | ❌ FALTA |
| `DXVK_STATE_CACHE_PATH` | Não seta, mas Proton detecta de `STEAM_COMPAT_SHADER_PATH` | ❌ Não setado | ❌ FALTA |
| `DXVK_STATE_CACHE` | Não setado (Proton usa default `$WINEPREFIX`) | Não setado | ➖ Proton usa default |
| `VKD3D_SHADER_CACHE_PATH` | Não setado explicitamente | Não setado | ➖ Proton usa default |
| `__GL_SHADER_DISK_CACHE` | Não setado (NVIDIA) | Não setado | ➖ NVIDIA usa default |
| `MESA_SHADER_CACHE_PATH` | Não setado (Mesa) | Não setado | ➖ AMD/Intel usa default |
| `MESA_GLSL_CACHE_DIR` | Não setado | Não setado | ➖ AMD/Intel usa default |

**Problema**: Sem `STEAM_COMPAT_SHADER_PATH`, o Proton não sabe onde guardar caches de shader.
Cada execução pode recompilar shaders do zero → stutter infinito.

**Solução**: Setar `STEAM_COMPAT_SHADER_PATH = $WINEPREFIX/shadercache` e garantir que 
o diretório exista e seja gravável dentro do container.

---

### 2.3. GPU (Vulkan/OpenGL/EGL)

| Flag / Config | UMU (pressure-vessel) | Makai Time | Status |
|--------------|----------------------|------------|--------|
| `VK_ICD_FILENAMES` | `/overrides/share/vulkan/icd.d/nvidia_icd.json` | `/run/host/usr/share/vulkan/icd.d/nvidia_icd.json` | ✅ Funcional |
| `VK_DRIVER_FILES` | = `VK_ICD_FILENAMES` | ❌ NÃO SETADO | ❌ FALTA |
| `VK_IMPLICIT_LAYER_PATH` | `/overrides/share/vulkan/implicit_layer.d` | ❌ NÃO SETADO | ❌ FALTA |
| `VK_LAYER_PATH` | `/overrides/share/vulkan/explicit_layer.d` | ❌ NÃO SETADO | ❌ FALTA |
| `__EGL_VENDOR_LIBRARY_FILENAMES` | `overrides/.../10_nvidia.json:overrides/.../50_mesa.json` | ❌ NÃO SETADO (usa `__EGL_VENDOR_LIBRARY_DIRS`) | ⚠️ Parcial |
| `__EGL_VENDOR_LIBRARY_DIRS` | ❌ Não usa | `/run/host/usr/share/glvnd/egl_vendor.d` | ✅ Alternativo |
| `__EGL_EXTERNAL_PLATFORM_CONFIG_FILENAMES` | `overrides/.../09_nvidia_wayland2.json:...` | ❌ NÃO SETADO | ❌ FALTA |
| `GBM_BACKENDS_PATH` | `overrides/lib/x86_64-linux-gnu/gbm:overrides/lib/i386-linux-gnu/gbm` | ❌ NÃO SETADO | ❌ FALTA |
| `LIBGL_DRIVERS_PATH` | `overrides/lib/x86_64-linux-gnu/dri:overrides/lib/i386-linux-gnu/dri` | ❌ NÃO SETADO | ❌ FALTA |
| `LIBVA_DRIVERS_PATH` | `overrides/lib/x86_64-linux-gnu/dri:overrides/lib/i386-linux-gnu/dri` | ❌ NÃO SETADO | ❌ FALTA |
| `VDPAU_DRIVER_PATH` | `/tmp/pressure-vessel-libs-XXXX/\${LIB}/vdpau` | ❌ NÃO SETADO | ❌ FALTA |
| GPU overrides mechanism | Symlinks → `/run/host/usr/lib/...` (232KB) | Symlinks → `/run/host/usr/lib/...` | ✅ Idêntico |
| GPU overrides size | 232KB (só symlinks) | ~300MB (cópias) | ⚠️ Mt copia |

**Problema**: Das 11 env vars de GPU que o pressure-vessel seta, só 3 estão no Makai Time.

---

### 2.4. SSD/I/O (flags de disco e performance)

| Flag / Config | UMU | Makai Time | Status |
|--------------|-----|------------|--------|
| `/tmp` | `--bind /tmp /tmp` (host bind) | Não montado (tmpfs default do bwrap?) | ⚠️ |
| `STEAM_COMPAT_LIBRARY_PATHS` | Mount point do exe.parent (via `enable_steam_game_drive`) | `$HOME/.steam/steam` (fixo) | ❌ FALTA |
| mount point detection | Anda parents até achar mount point | ❌ Não implementado | ❌ FALTA |
| `ionice` | Não usado | Não usado | ➖ |
| `LD_LIBRARY_PATH` com host paths | `ldconfig -p` + host paths | Overrides + runtime + host | ✅ Melhor que UMU |
| `STEAM_RUNTIME_LIBRARY_PATH` | game_dir + ldconfig_paths + host_ld_path | runtime overrides + host | ⚠️ Diferente |

**Problema**: Falta `STEAM_COMPAT_LIBRARY_PATHS` dinâmico (detecção de mount point do jogo).
Makai Time usa `$HOME/.steam/steam` fixo, o que não funciona para jogos em outros discos.

---

### 2.5. SECURITY/SANDBOX (isolamento)

| Flag / Config | UMU | Makai Time | Status |
|--------------|-----|------------|--------|
| `--unshare-user` | ❌ | ✅ | Makai Time isola |
| `--unshare-ipc` | ❌ | ✅ | Makai Time isola |
| `--unshare-pid` | ❌ | ✅ | Makai Time isola |
| `--unshare-uts` | ❌ | ✅ | Makai Time isola |
| `--unshare-cgroup` | ❌ | ✅ | Makai Time isola |
| `--unshare-net` | ❌ | ❌ | ✅ Ambos não isolam |
| `--disable-userns` | ❌ | ✅ | Makai Time seguro |
| `--cap-drop ALL` | ❌ | ✅ | Makai Time seguro |
| `--seccomp` | ❌ | ✅ (core/seccomp.py) | Makai Time seguro |
| `--clearenv` | ❌ | ✅ | Makai Time limpa |
| `proc /proc` | ✅ | ✅ | ✅ |
| `/sys` | ✅ (ro-bind) | ✅ (ro-bind) | ✅ |

**Nota**: O UMU usa `--not-a-security-boundary` que desativa TODAS as proteções do bwrap.
O Makai Time é significativamente mais seguro.

---

### 2.6. FILESYSTEM (montagens)

| Flag / Config | UMU | Makai Time | Status |
|--------------|-----|------------|--------|
| Runtime `/usr` | `var/tmp-XXX/usr → /usr` | `var/tmp-XXX/usr → /usr` | ✅ |
| Symlinks (/bin, /lib, etc) | ✅ (5 symlinks) | ✅ (5 symlinks) | ✅ |
| Provider mount | `/ → /run/host` (parcial) | `/ → /run/host` (completo) | ✅ |
| /etc/hosts | ✅ | ✅ | ✅ |
| /etc/resolv.conf | ✅ | ✅ | ✅ |
| /etc/nsswitch.conf | ✅ | ✅ | ✅ |
| /etc/machine-id | ✅ | ✅ | ✅ |
| /etc/localtime | ✅ | ✅ | ✅ |
| /etc/fonts | ✅ (do runtime) | ✅ (do runtime) | ✅ |
| /etc/ssl | ✅ (do runtime) | ✅ (do host) | ✅ |
| /etc/ca-certificates | ✅ (do runtime) | ✅ (do host) | ✅ |
| /etc/pulse | ✅ (do runtime) | ❌ | ❌ FALTA |
| /etc/alsa | ✅ (do runtime) | ❌ | ❌ FALTA |
| /etc/vulkan | ✅ (do runtime) | ❌ | ❌ FALTA |
| /etc/glvnd | ✅ (do runtime) | ❌ | ❌ FALTA |
| /etc/timezone | ✅ (sintético) | ❌ | ❌ FALTA |
| /etc/passwd | ✅ (sintético via memfd) | ❌ | ❌ FALTA |
| /etc/group | ✅ (sintético via memfd) | ❌ | ❌ FALTA |
| /dev bind | `--dev-bind /dev /dev` (completo) | `/dev/dri`, NVIDIA, urandom, shm (parcial) | ⚠️ |
| /dev/snd | ✅ | ❌ | ❌ FALTA |
| /run/systemd/journal | ✅ | ❌ | ❌ FALTA |
| Discord IPC | ✅ | ✅ | ✅ |
| D-Bus system socket | ✅ (`/var/run/dbus`) | ❌ (`/run/user/.../bus` só session) | ❌ FALTA |
| Fonts host | ✅ (`/usr/share/fonts → /run/host/fonts`) | ❌ | ❌ FALTA |
| Fonts cache | ✅ (`/var/cache/fontconfig → /run/host/`) | ❌ | ❌ FALTA |
| /mnt, /opt, /srv | ✅ | ❌ | ❌ FALTA |
| /run/media | ✅ | ❌ | ❌ FALTA |
| /var/tmp | ✅ | ❌ | ❌ FALTA |

---

### 2.7. ENVIRONMENT VARIABLES (COMPLETO)

| Variável | UMU (dentro do container) | Makai Time (dentro do container) | Status |
|----------|--------------------------|----------------------------------|--------|
| `container` | `pressure-vessel` | `makai` | ✅ Só muda rótulo |
| `WINEPREFIX` | path real (host) | `/prefix` (mount) | ⚠️ Diferente |
| `PROTONPATH` | path real (host) | `/proton` (mount) | ⚠️ Diferente |
| `STEAM_COMPAT_DATA_PATH` | = WINEPREFIX | `/prefix` | ✅ |
| `STEAM_COMPAT_INSTALL_PATH` | = exe.parent | `/game` | ✅ |
| `STEAM_COMPAT_SHADER_PATH` | `WINEPREFIX/shadercache` | ❌ NÃO SETADO | ❌ |
| `STEAM_COMPAT_TOOL_PATHS` | PROTONPATH:RUNTIMEPATH | `/proton:RUNTIME_PATH` | ✅ |
| `STEAM_COMPAT_MOUNTS` | = TOOL_PATHS | = TOOL_PATHS | ✅ |
| `STEAM_COMPAT_LIBRARY_PATHS` | mount point do exe.parent | `$HOME/.steam/steam` | ⚠️ |
| `STEAM_COMPAT_CLIENT_INSTALL_PATH` | vazio ou host | `$HOME/.steam/steam` | ⚠️ |
| `STEAM_RUNTIME_LIBRARY_PATH` | game_dir + ldconfig_paths + host | overrides + runtime + host | ⚠️ |
| `LD_LIBRARY_PATH` | overrides <arch>/lib:aliases | overrides + runtime + host | ✅ |
| `SteamAppId` | `0` | `0` | ✅ |
| `SteamGameId` | `0` | `0` | ✅ |
| `GAMEID` | Valor do usuário | Valor do usuário | ✅ |
| `UMU_ID` | = GAMEID | ❌ NÃO SETADO | ❌ |
| `UMU_INVOCATION_ID` | token_hex(16) | ❌ NÃO SETADO | ❌ |
| `DXVK_STATE_CACHE` | herdado do host ou vazio | herdado do host (mas clearenv!) | ❌ |
| `DXVK_STATE_CACHE_PATH` | herdado do host ou vazio | herdado do host (mas clearenv!) | ❌ |
| `STORE` | herdado do host ou vazio | ❌ NÃO SETADO | ❌ |
| `FONTCONFIG_PATH` | herdado do host ou vazio | ❌ NÃO SETADO | ❌ |
| `VK_ICD_FILENAMES` | overrides/.../nvidia_icd.json | `/run/host/...` | ✅ |
| `VK_DRIVER_FILES` | = VK_ICD_FILENAMES | ❌ NÃO SETADO | ❌ |
| `VK_IMPLICIT_LAYER_PATH` | overrides/.../implicit_layer.d | ❌ NÃO SETADO | ❌ |
| `VK_LAYER_PATH` | overrides/.../explicit_layer.d | ❌ NÃO SETADO | ❌ |
| `__EGL_VENDOR_LIBRARY_FILENAMES` | overrides/.../10_nvidia:50_mesa | ❌ NÃO SETADO | ❌ |
| `__EGL_VENDOR_LIBRARY_DIRS` | ❌ Não usa | `/run/host/usr/share/glvnd/egl_vendor.d` | ✅ |
| `__EGL_EXTERNAL_PLATFORM_CONFIG_FILENAMES` | overrides/.../nvidia_wayland2.json | ❌ NÃO SETADO | ❌ |
| `GBM_BACKENDS_PATH` | overrides/lib/.../gbm | ❌ NÃO SETADO | ❌ |
| `LIBGL_DRIVERS_PATH` | overrides/lib/.../dri | ❌ NÃO SETADO | ❌ |
| `LIBVA_DRIVERS_PATH` | overrides/lib/.../dri | ❌ NÃO SETADO | ❌ |
| `VDPAU_DRIVER_PATH` | /tmp/pressure-vessel-libs/ | ❌ NÃO SETADO | ❌ |
| `PATH` | herdado do host | `/usr/bin:/usr/sbin:/bin:/sbin` | ✅ |
| `HOME` | herdado do host | path real do host | ✅ |
| `DISPLAY` | herdado do host | `:0` ou `$DISPLAY` | ✅ |
| `WAYLAND_DISPLAY` | herdado do host | `wayland-0` ou `$WAYLAND_DISPLAY` | ✅ |
| `XDG_SESSION_TYPE` | herdado do host | `$XDG_SESSION_TYPE` | ✅ |
| `XAUTHORITY` | herdado do host | Detectado dinamicamente | ✅ |
| `XDG_RUNTIME_DIR` | herdado do host | `/run/user/$UID` | ✅ |
| `DBUS_SESSION_BUS_ADDRESS` | herdado do host | `unix:path=/run/user/$UID/bus` | ✅ |
| `PULSE_SERVER` | herdado do host | `unix:/run/user/$UID/pulse/native` | ✅ |
| `LANG` / `LC_ALL` | herdado do host | ❌ NÃO SETADO | ❌ |
| `SSL_CERT_FILE` | herdado do host | ❌ NÃO SETADO | ➖ (usa openssl default) |
| `SSL_CERT_DIR` | herdado do host | ❌ NÃO SETADO | ➖ (usa openssl default) |

---

## 3. GAPS PRIORIZADOS

### 🔴 CRÍTICO (afeta funcionamento do jogo)

| # | Gap | O que falta | Por que importa |
|---|-----|-------------|-----------------|
| 1 | **Shader cache** | `STEAM_COMPAT_SHADER_PATH = $WINEPREFIX/shadercache` | Sem isso, DXVK/VKD3D recompila shaders toda vez → stutter infinito |
| 2 | **VK_DRIVER_FILES** | Setar = `VK_ICD_FILENAMES` | Vulkan loader não acha ICD se só VK_ICD_FILENAMES estiver setado (fallback) |
| 3 | **Vulkan layers** | `VK_IMPLICIT_LAYER_PATH` + `VK_LAYER_PATH` | MangoHud, Gamescope WSI, Steam overlay não carregam |
| 4 | **GBM_BACKENDS_PATH** | Apontar para overrides + host | GPU GBM backend não carrega → sem aceleração em alguns jogos |
| 5 | **LIBGL_DRIVERS_PATH** | Apontar para overrides + host | DRI drivers OpenGL não carregam → fallback para llvmpipe (software) |

### 🟡 ALTO (afeta compatibilidade/performance)

| # | Gap | O que falta | Por que importa |
|---|-----|-------------|-----------------|
| 6 | **LIBVA_DRIVERS_PATH** | Apontar para overrides + host | Aceleração de vídeo (cutscenes) não funciona |
| 7 | **VDPAU_DRIVER_PATH** | Dinâmico por arch | Decodificação de vídeo via VDPAU |
| 8 | **__EGL_VENDOR_LIBRARY_FILENAMES** | Paths dos JSONs EGL glvnd | Alternativa ao __EGL_VENDOR_LIBRARY_DIRS |
| 9 | **__EGL_EXTERNAL_PLATFORM_CONFIG_FILENAMES** | Configs de plataforma EGL | Wayland + EGL externo |
| 10 | **STEAM_COMPAT_LIBRARY_PATHS dinâmico** | detectar mount point do jogo | Jogos em outros discos/partições |
| 11 | **/etc/passwd + /etc/group sintéticos** | Gerar via memfd | Alguns anti-cheats e Proton verificam usuário |
| 12 | **Locale (LANG/LC_ALL)** | Passar do host | Jogos com locale específico |
| 13 | **/run/systemd/journal** | Bind dos sockets | Logging de alguns jogos/anti-cheats |

### 🟢 MÉDIO (nice-to-have)

| # | Gap | O que falta | Por que importa |
|---|-----|-------------|-----------------|
| 14 | **/dev/snd** | Bind de áudio | Alternativa ao PipeWire/Pulse (direto ALSA) |
| 15 | **D-Bus system socket** | `/var/run/dbus` | Alguns anti-cheats precisam |
| 16 | **/mnt, /opt, /srv, /run/media** | Binds de diretórios | Jogos instalados fora de $HOME |
| 17 | **Fonts host** | `/usr/share/fonts → /run/host/fonts` | Fontes do sistema não disponíveis |
| 18 | **/var/tmp** | Bind ou tmpfs | Alguns jogos usam /var/tmp |
| 19 | **Fonts cache** | `/var/cache/fontconfig` | Performance de fontconfig |
| 20 | **UMU_INVOCATION_ID** | token_hex(16) | Rastreamento de processo (debug) |
| 21 | **STORE** | Passar do host | Identificação de loja (Steam, Epic, etc.) |
| 22 | **FONTCONFIG_PATH** | Se herdado, passar | Config de fontes customizada |

---

## 4. PLANO DE IMPLEMENTAÇÃO POR FASE

### Fase 1: Shader Cache + GPU Critico (agora)
1. Adicionar `STEAM_COMPAT_SHADER_PATH = $WINEPREFIX/shadercache` no builder.py
2. Adicionar `VK_DRIVER_FILES = VK_ICD_FILENAMES`
3. Adicionar `VK_IMPLICIT_LAYER_PATH` e `VK_LAYER_PATH` (overrides + host)
4. Adicionar `GBM_BACKENDS_PATH` (overrides <arch>/lib/gbm + /run/host)
5. Adicionar `LIBGL_DRIVERS_PATH` (overrides <arch>/lib/dri + /run/host)
6. Adicionar `LIBVA_DRIVERS_PATH` (overrides <arch>/lib/dri + /run/host)
7. Adicionar `VDPAU_DRIVER_PATH` dinâmico (per-arch)

### Fase 2: Compatibilidade (próximo)
8. Mount point detection para `STEAM_COMPAT_LIBRARY_PATHS`
9. `/etc/passwd` + `/etc/group` sintéticos via memfd
10. `/dev/snd` bind
11. D-Bus system socket (`/var/run/dbus`)
12. Locale passthrough (`LANG`, `LC_ALL`)
13. `/run/systemd/journal` sockets

### Fase 3: Polish (futuro)
14. Fonts host + fontconfig cache
15. `/mnt`, `/opt`, `/srv`, `/run/media` binds
16. `/var/tmp` bind
17. `UMU_INVOCATION_ID` para rastreamento
18. `STORE` passthrough
19. `FONTCONFIG_PATH` passthrough

---

## 5. VERIFICAÇÃO DE REDE: UMU vs Makai Time

### Teste real executado (17/07/2026)

**UMU-Launcher:**
```
GAMEID=test-net WINEPREFIX=/tmp/test-umu-prefix PROTONPATH=UMU-Proton-10.0-4 \
umu-run waitforexitandrun Launcher.exe
```
- ✅ Network check (1.1.1.1:53) passou
- ✅ Runtime sniper resolvido
- ✅ Proton executou
- ❌ Launcher.exe não encontrado (esperado — prefixo vazio)

**Makai Time (com correções de 17/07):**
```
python3 -m makrun waitforexitandrun Launcher.exe --proton Proton-CachyOS --game-id gf
```
- ✅ Sem `--unshare-net` (rede compartilhada)
- ✅ `/etc/resolv.conf` montado (DNS)
- ✅ `/etc/ssl` + `/etc/ca-certificates` montados (HTTPS)
- ✅ Internet confirmada: `INTERNET SSL OK: 200` (teste com Python dentro do container)
- ✅ Proton executou com fsync

### Conclusão da Rede
Ambos compartilham o namespace de rede do host. **Zero diferença de performance/rede**
entre UMU e Makai Time. O que falta no Makai Time são env vars de GPU e shader cache,
NÃO flags de rede.

---

## 6. RESUMO: O QUE MUDA PARA JOGOS ONLINE

Para jogos online (MMO, FPS, RPG), o que realmente importa:

| Requisito | UMU | Makai Time | Impacto |
|-----------|-----|------------|---------|
| Latência de rede | Nativa (sem container) | Nativa (sem container) | ✅ Idêntico |
| Throughput | Nativo | Nativo | ✅ Idêntico |
| UDP (Winsock) | Nativo | Nativo | ✅ Idêntico |
| DNS | systemd-resolved | systemd-resolved | ✅ Idêntico |
| SSL/TLS | OpenSSL do runtime | OpenSSL do host | ✅ Funcional |
| Proxy HTTP | Herdado do host | ❌ Precisa adicionar | ⚠️ Faltam env vars |

**TL;DR**: Rede é idêntica entre UMU e Makai Time. O que falta resolver são:
1. Shader cache (stutter)
2. GPU env vars (compatibilidade Vulkan/OpenGL)
3. /etc/passwd sintético (anti-cheat)
