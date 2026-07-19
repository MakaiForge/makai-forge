"""
# =============================================================================
# !!! ATENÇÃO: NÃO MODIFICAR SEM AUTORIZAÇÃO EXPLÍCITA !!!
# =============================================================================
# Orquestrador de construção do container bwrap.
#
# A ORDEM DOS STEPS IMPORTA. O bwrap processa os argumentos em ordem
# sequencial. Mudar a ordem aqui pode:
#   - Quebrar montagens (runtime antes de isolation)
#   - Fazer o linker não encontrar libs (LD_LIBRARY_PATH antes de /usr)
#   - Impedir o X11 de funcionar (display antes de mounts)
#
# CADA STEP TEM UMA FUNÇÃO ESPECÍFICA e NÃO deve ser pulado ou
# reordenado sem entender o impacto em TODOS os forks de Proton.
#
# Steps atuais e por que existem:
#   1. isolation → security: unshare, seccomp, capabilities
#   2. runtime   → mount do makai-runtime como /usr
#   3. tmp/proc/sys → filesystems essenciais
#   4. etc       → /etc/hosts, resolv.conf, machine-id
#   5. ssl      → certificados CA (HTTPS em jogos)
#   6. fonts    → renderização de texto
#   7. mounts   → proton=/proton, prefixo, jogo
#   8. display  → X11/Wayland/D-Bus/Discord
#   9. audio    → PipeWire/PulseAudio
#   10. devices  → /dev/dri, /dev/nvidia*, /dev/ntsync
#   11. gpu      → overrides de libs GPU
#   12. env      → --setenv para cada variável
#   13. relaxations → anti-cheat precisa de flags especiais
#   14. exec     → comando final (proton + exe)
#
# NÃO ADICIONAR STEPS NOVOS sem discutir com o usuário.
# NÃO REMOVER STEPS EXISTENTES — cada um é necessário.
#
# Se PRECISAR modificar algo, crie um STEP CONDICIONAL que só ative
# quando a config do fork pedir (ex: anti-cheat relaxations).
# =============================================================================
"""

import shutil
from pathlib import Path
from typing import Any

import shutil
from pathlib import Path
from typing import Any

from makrun.container.steps import StepResult
from makrun.container.steps import (
    isolation, runtime, gpu, audio, display, etc as etc_step,
    ssl, fonts, devices, mounts, env as env_step, exec as exec_step,
)
from makrun.intel import get_container_config, identify_proton
from makrun.log import log


def _find_bwrap() -> str:
    bwrap = shutil.which("bwrap")
    if not bwrap:
        raise FileNotFoundError("bwrap not found in PATH. Install bubblewrap.")
    return bwrap


def _log_results(results: list[tuple[str, StepResult]]) -> None:
    for name, result in results:
        status = "OK" if result.applied else "SKIP"
        log.info("  [%s] %s → %s", status, name, result.summary)


class Builder:
    """Constrói o comando bwrap via API fluente.

    Uso:
        cmd = (Builder(config, ctx)
               .apply_isolation()
               .apply_runtime(runtime_path)
               .apply_display()
               .apply_audio()
               .apply_devices()
               .apply_env()
               .apply_exec()
               .build())
    """

    def __init__(self, config: dict, ctx: dict):
        self.config = config
        self.ctx = ctx
        self.cmd: list[str] = [_find_bwrap()]
        self.results: list[tuple[str, StepResult]] = []

    # ── Steps base ──────────────────────────────────────────────────────

    def apply_isolation(self):
        r = isolation.configure(self.config)
        self.cmd.extend(r.args)
        self.results.append(("isolation", r))
        return self

    def apply_runtime(self, runtime_path: Path):
        r, runtime_files = runtime.configure(runtime_path, self.config)
        self.cmd.extend(r.args)
        self.results.append(("runtime", r))
        self.ctx["runtime_files"] = runtime_files
        return self

    def apply_tmp_proc_sys(self):
        self.cmd.extend(["--tmpfs", "/tmp"])
        self.cmd.extend(["--proc", "/proc"])
        self.cmd.extend(["--ro-bind", "/sys", "/sys"])
        return self

    def apply_etc(self):
        r = etc_step.configure(self.config)
        self.cmd.extend(r.args)
        self.results.append(("etc", r))
        return self

    def apply_ssl(self):
        r = ssl.configure(self.config)
        self.cmd.extend(r.args)
        self.results.append(("ssl", r))
        return self

    def apply_fonts(self):
        r = fonts.configure(self.config)
        self.cmd.extend(r.args)
        self.results.append(("fonts", r))
        return self

    def apply_mounts(self, proton_path: Path, prefix_path: str, exe_path: str):
        r = mounts.configure(proton_path, prefix_path, exe_path, self.config)
        self.cmd.extend(r.args)
        self.results.append(("mounts", r))
        self.ctx["mounts_extra"] = r.extra
        return self

    def apply_display(self):
        r = display.configure(self.config)
        self.cmd.extend(r.args)
        self.results.append(("display", r))
        return self

    def apply_audio(self, runtime_path: Path):
        r = audio.configure(self.config, runtime_path)
        self.cmd.extend(r.args)
        self.results.append(("audio", r))
        return self

    def apply_devices(self):
        r = devices.configure(self.config)
        self.cmd.extend(r.args)
        self.results.append(("devices", r))
        return self

    def apply_gpu(self):
        r = gpu.configure(self.config)
        self.cmd.extend(r.args)
        self.results.append(("gpu", r))
        self.ctx["gpu_info"] = r.extra.get("gpu_info")
        return self

    def apply_env(self, env: dict, features: dict | None = None):
        r = env_step.configure(
            env, features, self.config,
            mounts_extra=self.ctx.get("mounts_extra"),
            gpu_info=self.ctx.get("gpu_info"),
        )
        self.cmd.extend(r.args)
        self.results.append(("env", r))
        return self

    def apply_exec(self, env: dict, features: dict | None = None):
        r = exec_step.configure(env, features, mounts_extra=self.ctx.get("mounts_extra"))
        self.cmd.extend(r.args)
        self.results.append(("exec", r))
        return self

    # ── Util ────────────────────────────────────────────────────────────

    def apply_relaxations(self, features: dict):
        if features.get("container_flags"):
            for flag in features["container_flags"]:
                self.cmd.extend(flag.split() if isinstance(flag, str) else flag)
        if features.get("container_relaxations"):
            try:
                from makrun.intel.anticheat.container import CONTAINER_RELAX_FLAGS
                for relax in features["container_relaxations"]:
                    flags = CONTAINER_RELAX_FLAGS.get(relax, {}).get("bwrap_flags", [])
                    self.cmd.extend(flags)
            except ImportError:
                log.debug("anticheat.container not available")
        return self

    def build(self) -> list[str]:
        _log_results(self.results)
        return self.cmd


def build_bwrap_cmd(
    runtime_path: Path,
    proton_path: Path,
    prefix_path: str,
    exe_path: str,
    env: dict[str, str],
    features: dict | None = None,
    display_backend: str = "auto",
    interactive: bool = False,
    dry_run: bool = False,
) -> list[str]:
    """Constrói comando bwrap (wrapper da classe Builder)."""
    fork_id = (features or {}).get("fork_id") or identify_proton(str(proton_path))
    container_config = get_container_config(fork_id)

    log.info("=== Construindo container para fork=%s ===", fork_id)

    ctx: dict[str, Any] = {
        "config": container_config,
        "env": env,
        "features": features or {},
        "runtime_path": runtime_path,
        "proton_path": proton_path,
        "prefix_path": prefix_path,
        "exe_path": exe_path,
        "display_backend": display_backend,
        "interactive": interactive,
    }

    builder = Builder(container_config, ctx)

    cmd = (
        builder
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
        .apply_relaxations(features or {})
        .apply_exec(env, features)
        .build()
    )

    log.info("=== Container: %d argumentos bwrap ===", len(cmd))

    if dry_run:
        log.info(" ".join(str(c) for c in cmd))

    return cmd
