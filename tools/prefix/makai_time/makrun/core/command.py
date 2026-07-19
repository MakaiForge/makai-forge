"""
# =============================================================================
# !!! ATENÇÃO: NÃO MODIFICAR SEM AUTORIZAÇÃO EXPLÍCITA !!!
# =============================================================================
# Ponte entre runner.py e builder.py.
# 
# Só faz:
#   1. Verifica se o script proton existe
#   2. Decide se usa container (bwrap) ou direto (UMU_NO_RUNTIME)
#   3. Chama build_bwrap_cmd() com os parâmetros certos
#
# NÃO ADICIONAR:
#   - Config de container (builder.py + steps/ cuidam disso)
#   - Env vars (environment.py + steps/env.py cuidam)
#   - Lógica de jogo específico (profiles.py)
# =============================================================================
"""

from pathlib import Path

from makrun.log import log
from makrun.container.builder import build_bwrap_cmd


def build_command(
    env: dict[str, str],
    runtime_path: Path,
    proton_path: Path,
    exe_path: str,
    features: dict | None = None,
    dry_run: bool = False,
) -> list[str]:
    proton = proton_path / "proton"

    if not proton.is_file():
        raise FileNotFoundError(f"proton script not found: {proton}")

    verb = env.get("PROTON_VERB", "waitforexitandrun")
    prefix = env.get("WINEPREFIX", "")
    display_backend = env.get("DISPLAY_BACKEND", "auto")

    if env.get("UMU_NO_RUNTIME") == "1":
        log.warning("Runtime disabled, skipping container")
        return [str(proton), verb, exe_path]

    cmd = build_bwrap_cmd(
        runtime_path=runtime_path,
        proton_path=proton_path,
        prefix_path=prefix,
        exe_path=exe_path,
        env=env,
        features=features,
        display_backend=display_backend,
        dry_run=dry_run,
    )

    if dry_run:
        log.info("DRY-RUN command: %s", " ".join(cmd))

    return cmd
