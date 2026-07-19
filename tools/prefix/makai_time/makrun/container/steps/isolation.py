"""
# =============================================================================
# !!! ATENÇÃO: NÃO MODIFICAR SEM AUTORIZAÇÃO EXPLÍCITA !!!
# =============================================================================
# Isolamento do container via bubblewrap.
#
# NÃO usa --unshare-all (que inclui --unshare-net e BLOQUEIA a internet).
# Usa flags INDIVIDUAIS:
#   - --unshare-ipc --unshare-pid --unshare-uts --unshare-cgroup
#   - --share-net (internet FUNCIONA)
#   - --unshare-user + --disable-userns (segurança)
#   - --clearenv (limpa env vars do host)
#   - --cap-drop ALL (remove capabilities)
#   - --add-seccomp-fd (filtra syscalls perigosos)
#
# Se um Proton/jogo precisar de rede isolada (anti-cheat rígido),
# setar "unshare_net": true na container config do fork.
# =============================================================================
"""

from pathlib import Path
from makrun.container.steps import StepResult
from makrun.log import log


def configure(config: dict) -> StepResult:
    """Isolamento: namespaces, capabilities, seccomp."""
    args = []
    container_cfg = config.get("container", {})

    # Namespace isolation — flags EXPLÍCITAS em vez de --unshare-all.
    # --unshare-all inclui --unshare-net, que BLOQUEIA a internet.
    # A maioria dos jogos precisa de rede (launcher, update, login).
    # Por padrão: isola IPC/PID/UTS/cgroup, mas COMPARTILHA a rede.
    if container_cfg.get("unshare_all", False):
        # Para forks que explicitamente querem --unshare-all (ex: alguns anti-cheats)
        args.extend(["--unshare-all"])
    else:
        if container_cfg.get("unshare_ipc", True):
            args.extend(["--unshare-ipc"])
        if container_cfg.get("unshare_pid", True):
            args.extend(["--unshare-pid"])
        if container_cfg.get("unshare_uts", True):
            args.extend(["--unshare-uts"])
        if container_cfg.get("unshare_cgroup", True):
            args.extend(["--unshare-cgroup"])
        # Rede: compartilhada por padrão para internet funcionar.
        # Para forks que precisam de isolamento de rede (ex: anti-cheat),
        # setar "unshare_net": true no container config.
        if container_cfg.get("unshare_net", False):
            args.extend(["--unshare-net"])
        else:
            args.extend(["--share-net"])

    # --unshare-user é OBRIGATÓRIO para --disable-userns (requisito do bwrap).
    # Bugfix 2026-07-18: bwrap 0.11.x exige --unshare-user antes de --disable-userns.
    if container_cfg.get("disable_userns", True):
        args.extend(["--unshare-user", "--disable-userns"])

    if container_cfg.get("clearenv", True):
        args.extend(["--clearenv"])

    if container_cfg.get("cap_drop_all", True):
        args.extend(["--cap-drop", "ALL"])

    # Die-with-parent: mata container se o processo pai (makrun) morrer
    if container_cfg.get("die_with_parent", True):
        args.extend(["--die-with-parent"])

    # Seccomp (se existir)
    if container_cfg.get("seccomp", True):
        try:
            from makrun.core.seccomp import get_seccomp_fd
            fd = get_seccomp_fd()
            if fd is not None:
                args.extend(["--add-seccomp-fd", str(fd)])
        except Exception as e:
            log.debug("seccomp not available: %s", e)

    # Lock file: DESABILITADO TEMPORARIAMENTE.
    # --lock-file /tmp/.makrun-lock quebra com --clearenv + --unshare-all
    # porque o bwrap tenta abrir o lock antes do tmpfs /tmp ser montado.
    # Reimplementar usando lock file no prefixo do jogo (fora do container).
    # TODO: usar FileLock do makrun.consts em vez de --lock-file

    applied = len(args) > 0
    return StepResult(
        args=args,
        applied=applied,
        summary=f"isolation: {' '.join(args[:4])}... ({len(args)} flags)" if applied else "isolation: skipped",
    )
