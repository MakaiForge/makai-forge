GAME = {
    "id": "elden-ring",
    "exe": ["eldenring.exe"],
    "ac_types": ["denuvo", "eac"],
    "steam_id": "1245620",
    "compatible": True,
    "env": {"PROTON_EAC_ENABLE": "1"},
    "container_relax": ["no_unshare_pid"],
    "notes": "Denuvo DRM + EAC. EAC ativado só no multiplayer. Single-player roda sem AC.",
}
