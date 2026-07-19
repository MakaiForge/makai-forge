from pathlib import Path
from makrun.container.steps import StepResult


def configure(proton_path: Path, prefix_path: str, exe_path: str,
              config: dict) -> StepResult:
    """Monta provider, Proton, prefixo, jogo e home."""
    args = []
    mounts_cfg = config.get("mounts", {})

    # Provider mount (host em /run/host)
    if mounts_cfg.get("host_provider", True):
        args.extend(["--ro-bind", "/", "/run/host"])

    # Proton
    proton_container = mounts_cfg.get("proton_mount", "/proton")
    args.extend(["--bind", str(proton_path.resolve()), proton_container])

    # Prefixo Wine
    prefix_resolved = Path(prefix_path).expanduser().resolve()
    prefix_container = str(prefix_resolved)
    args.extend(["--bind", str(prefix_resolved), prefix_container])

    # Jogo — monta o install dir raiz (2 níveis acima do exe)
    # Ex: .../Violet Games/Grand Fantasia Violet/Launcher.exe
    #   → monta .../Violet Games/ como install dir
    #   → STEAM_COMPAT_INSTALL_PATH = .../Violet Games/
    # Isso segue o padrão do PV (dirname dirname do exe)
    exe_resolved = Path(exe_path).expanduser().resolve()
    install_root = exe_resolved.parent.parent  # 2 níveis acima
    game_container = str(install_root)
    args.extend(["--bind", str(install_root), game_container])

    # Home isolation (tmpfs + bind do real)
    home = str(Path.home())
    args.extend(["--tmpfs", "/home"])
    args.extend(["--bind", home, home])

    applied = True
    return StepResult(
        args=args,
        applied=applied,
        summary=f"mounts: proton={proton_container}, prefix={prefix_container}, game={game_container}",
        extra={
            "proton_container": proton_container,
            "prefix_container": prefix_container,
            "game_container": game_container,
            "home": home,
            "exe_resolved": exe_resolved,
        },
    )
