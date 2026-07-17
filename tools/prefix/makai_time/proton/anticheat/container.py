CONTAINER_RELAX_FLAGS: dict[str, dict] = {
    "no_unshare_pid": {
        "bwrap_flags": ["--no-unshare-pid"],
        "description": "Remove isolamento PID. Necessário para anti-cheats que escaneiam /proc.",
    },
    "no_unshare_cgroup": {
        "bwrap_flags": ["--no-unshare-cgroup"],
        "description": "Remove isolamento cgroup. Necessário para alguns anti-cheats.",
    },
    "full_dev": {
        "bwrap_flags": ["--dev-bind", "/dev", "/dev"],
        "description": "Expõe /dev completo do host. Necessário para anti-cheats que carregam drivers.",
    },
    "full_proc": {
        "bwrap_flags": ["--bind", "/proc", "/proc"],
        "description": "Bind explícito de /proc. Garante visibilidade de processos do host.",
    },
}
