GAME = {
    "id": "rust",
    "exe": ["RustClient.exe", "Rust.exe"],
    "ac_types": ["eac"],
    "steam_id": "252490",
    "compatible": True,
    "env": {"PROTON_EAC_ENABLE": "1"},
    "container_relax": ["no_unshare_pid"],
    "notes": "EAC. ProtonDB Silver. Multiplayer só funciona em servidores sem EAC ou com EAC desativado. Facepunch não ativou oficialmente, mas comunidade mantém workarounds.",
}
