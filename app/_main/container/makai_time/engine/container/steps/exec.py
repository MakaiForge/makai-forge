from engine.container.steps import StepResult
from engine.log import log


def configure(env: dict, features: dict, mounts_extra: dict | None = None) -> StepResult:
    """Monta o comando final com watchdog para manter container vivo.

    Jogos com launcher (ex: NTE, Genshin) funcionam assim:
      launcher baixa/atualiza → sai → jogo de verdade começa
    O problema: waitforexitandrun espera o launcher, não o jogo.
    Quando o launcher sai, o container morre e mata o jogo.

    Solução (watchdog wrapper):
      1. Roda o launcher em background
      2. Espera ele terminar (wait)
      3. Monitora /proc/*/exe por processos Wine ainda rodando
      4. Mantém o container vivo até TODOS os processos Wine morrerem
      5. Só então deixa o container morrer
    """
    args = []

    proton_container = (mounts_extra or {}).get("proton_container", "/proton")
    game_container = (mounts_extra or {}).get("game_container", "")
    exe_resolved = (mounts_extra or {}).get("exe_resolved")

    proton_exe = f"{proton_container}/proton"
    verb = env.get("PROTON_VERB", "waitforexitandrun")

    if exe_resolved:
        # Caminho relativo do exe dentro do install dir montado
        # Ex: install_root = .../Violet Games/
        #     exe_resolved = .../Violet Games/Grand Fantasia Violet/Launcher.exe
        #     relative = Grand Fantasia Violet/Launcher.exe
        install_root = exe_resolved.parent.parent
        exe_relative = exe_resolved.relative_to(install_root)
        game_exe = f"{game_container}/{exe_relative}"
        game_quoted = str(game_exe).replace('"', '\\"')

        # Watchdog wrapper em POSIX sh (mantém container vivo)
        watchdog = (
            f'{proton_exe} {verb} "{game_quoted}" &\n'
            "GAME_PID=$!\n"
            "wait $GAME_PID\n"
            "LAUNCHER_EXIT=$?\n"
            "# Makai Watchdog: mantém container vivo enquanto\n"
            "# houver processos Wine rodando (launcher pode ter\n"
            "# iniciado o jogo de verdade e saído).\n"
            "while :; do\n"
            "  found=0\n"
            '  for _p in /proc/[0-9]*/exe; do\n'
            '    _link=$(readlink "$_p" 2>/dev/null || true)\n'
            '    case "$_link" in\n'
            "      *wine-preloader*|*wine64*|*wineserver*|*wine*)\n"
            "        found=1; break ;;\n"
            "    esac\n"
            "  done\n"
            '  [ "$found" = "0" ] && break\n'
            "  sleep 2\n"
            "done\n"
            "exit $LAUNCHER_EXIT"
        )
        args.extend(["/usr/bin/bash", "-c", watchdog])
        log.debug(
            "Exec watchdog: %s %s \"%s\" + wine process monitor",
            proton_exe, verb, game_exe,
        )
    else:
        args.extend([proton_exe, verb])

    return StepResult(
        args=args,
        applied=True,
        summary=f"exec: {proton_exe} {verb} {game_exe if exe_resolved else ''}",
    )
