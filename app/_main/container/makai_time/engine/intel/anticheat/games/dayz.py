GAME = {
    "id": "dayz",
    "exe": ["DayZ_x64.exe", "DayZ_BE.exe"],
    "ac_types": ["battleye"],
    "steam_id": "221100",
    "compatible": True,
    "env": {"PROTON_BATTLEYE_ENABLE": "1"},
    "container_relax": ["no_unshare_pid"],
    "notes": "BattlEye compat\u00edvel. Enforce sua.dll para alguns servidores.",
}
