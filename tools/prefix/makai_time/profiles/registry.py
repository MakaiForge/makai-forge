"""Registry de perfis de jogos.

Banco de dados curado com perfis por executável.
Cada perfil contém configurações específicas para garantir
compatibilidade e performance.

Estrutura do perfil:
{
    "name": "Nome do Jogo",
    "exe": "Game.exe",          # nome do executável (match exato)
    "exe_pattern": "*",         # glob pattern alternativo
    "engine": "unity",          # engine (opcional)
    "runtime": "steamrt4",      # runtime recomendado
    "proton_fork": None,        # fork recomendado (None = default)
    "sync": None,               # método de sync (None = auto detect)
    "no_fsync": False,          # forçar esync
    "use_wined3d": False,       # usar wined3d em vez de DXVK
    "env": {},                  # env vars específicas
    "dxvk": {},                 # overrides dxvk.conf
    "vkd3d": {},                # overrides vkd3d_proton.conf
    "notes": "",                # notas de compatibilidade
    "source": "protonDB",       # fonte da informação
}
"""

import fnmatch
import json
import os


# ── Banco de perfis curados ──────────────────────────────────────────────────

GAME_PROFILES = [
    # ── Bethesda ──────────────────────────────────────────────────────────
    {
        "name": "The Elder Scrolls V: Skyrim Special Edition",
        "exe": "SkyrimSE.exe",
        "engine": "bethesda",
        "sync": "esync",
        "no_fsync": True,
        "env": {
            "PROTON_NO_FSYNC": "1",
        },
        "notes": "FSync causa crash em save games. Usar esync. bUseTemporaryFiles=0 recomendado no SkyrimPrefs.ini",
    },
    {
        "name": "The Elder Scrolls V: Skyrim",
        "exe": "TESV.exe",
        "engine": "bethesda",
        "sync": "esync",
        "no_fsync": True,
        "env": {
            "PROTON_NO_FSYNC": "1",
        },
        "notes": "Legendary/Classic. Esync recomendado.",
    },
    {
        "name": "Fallout 4",
        "exe": "Fallout4.exe",
        "engine": "bethesda",
        "sync": "esync",
        "env": {
            "PROTON_NO_FSYNC": "1",
        },
        "notes": "FSync pode causar crash. Plugin loader (f4se) precisa de atenção.",
    },
    {
        "name": "Fallout: New Vegas",
        "exe": "FalloutNV.exe",
        "engine": "bethesda",
        "env": {},
        "notes": "Funciona bem com Proton. NVSE e 4GB patch recomendados.",
    },
    {
        "name": "The Elder Scrolls IV: Oblivion",
        "exe": "Oblivion.exe",
        "engine": "bethesda",
        "use_wined3d": True,
        "env": {
            "PROTON_USE_WINED3D": "1",
        },
        "notes": "D3D9 antigo. Wined3d funciona melhor que DXVK para este título.",
    },

    # ── Unity ─────────────────────────────────────────────────────────────
    {
        "name": "Hollow Knight",
        "exe": "Hollow Knight.exe",
        "engine": "unity",
        "env": {},
        "notes": "Funciona perfeitamente com Proton. Nenhum workaround necessário.",
    },
    {
        "name": "Cities: Skylines",
        "exe": "Cities.exe",
        "engine": "unity",
        "env": {
            "UNITY_ENABLE_ENHANCED_GFX_JOBS": "1",
        },
        "notes": "Problemas de performance com muitas assets. Mods requerem atenção.",
    },
    {
        "name": "Kerbal Space Program",
        "exe": "KSP.exe",
        "engine": "unity",
        "env": {},
        "notes": "Funciona bem. Problemas com mods que usam D3D11 hooks.",
    },

    # ── Unreal Engine ─────────────────────────────────────────────────────
    {
        "name": "Cyberpunk 2077",
        "exe": "Cyberpunk2077.exe",
        "engine": "unreal",
        "runtime": "steamrt4",
        "env": {
            "VKD3D_CONFIG": "dxr",
            "DXVK_ENABLE_NVAPI": "1",
        },
        "notes": "D3D12. VKD3D dxr para ray tracing. NVIDIA DLSS funciona com Proton.",
    },
    {
        "name": "Red Dead Redemption 2",
        "exe": "RDR2.exe",
        "engine": "unreal",
        "env": {
            "VKD3D_CONFIG": "dxr",
            "PROTON_HIDE_NVIDIA_GPU": "1",
        },
        "notes": "Vulkan recommended. D3D12 tem problemas. Esconder GPU NVIDIA ajuda em certas configs.",
    },
    {
        "name": "Borderlands 3",
        "exe": "Borderlands3.exe",
        "engine": "unreal",
        "env": {},
        "notes": "D3D12. Funciona bem com Proton Experimental/CachyOS.",
    },
    {
        "name": "BioShock Infinite",
        "exe": "BioShockInfinite.exe",
        "engine": "unreal",
        "env": {},
        "notes": "D3D9/11. Funciona bem. Problemas ocasionais de áudio.",
    },

    # ── NW.js / Electron ─────────────────────────────────────────────────
    {
        "name": "How to Raise a Happy NEET",
        "exe": "Game.exe",
        "exe_pattern": "*NEET*",
        "engine": "nwjs",
        "runtime": "steamrt4",
        "env": {
            "PROTON_NO_SANDBOX": "1",
        },
        "notes": "NW.js app. Testado com Proton-CachyOS-11.0. GPU 18%, 51°C. Funciona perfeitamente.",
    },
    {
        "name": "Doki Doki Literature Club!",
        "exe": "DDLC.exe",
        "engine": "nwjs",
        "env": {
            "PROTON_NO_SANDBOX": "1",
        },
        "notes": "Ren'Py com NW.js wrapper. --no-sandbox necessário.",
    },
    {
        "name": "VA-11 Hall-A: Cyberpunk Bartender Action",
        "exe": "VA11.exe",
        "engine": "nwjs",
        "env": {
            "PROTON_NO_SANDBOX": "1",
        },
        "notes": "NW.js. Funciona bem.",
    },

    # ── Ren'Py ────────────────────────────────────────────────────────────
    {
        "name": "Katawa Shoujo",
        "exe": "Katawa Shoujo.exe",
        "engine": "renpy",
        "env": {},
        "notes": "Ren'Py clássico. Funciona sem problemas.",
    },

    # ── GameMaker ─────────────────────────────────────────────────────────
    {
        "name": "Undertale",
        "exe": "UNDERTALE.exe",
        "engine": "gamemaker",
        "use_wined3d": True,
        "env": {
            "PROTON_USE_WINED3D": "1",
        },
        "notes": "GameMaker D3D9. Wined3d recomendado sobre DXVK.",
    },

    # ── RPG Maker ─────────────────────────────────────────────────────────
    {
        "name": "To the Moon",
        "exe": "To the Moon.exe",
        "engine": "rpgmaker",
        "env": {},
        "notes": "RPG Maker XP. Funciona bem com Proton.",
    },

    # ── Outros ────────────────────────────────────────────────────────────
    {
        "name": "Stardew Valley",
        "exe": "Stardew Valley.exe",
        "engine": "unity",
        "env": {},
        "notes": "XNA/MonoGame via Wine. Funciona perfeitamente.",
    },
    {
        "name": "Celeste",
        "exe": "Celeste.exe",
        "engine": "unity",
        "env": {},
        "notes": "XNA/MonoGame. Perfeito.",
    },
    {
        "name": "Portal 2",
        "exe": "portal2.exe",
        "engine": "unreal",  # Source Engine, similar handling
        "env": {},
        "notes": "Source Engine. Funciona nativamente, mas via Proton também funciona.",
    },
    {
        "name": "The Witcher 3: Wild Hunt",
        "exe": "witcher3.exe",
        "engine": "unreal",  # REDengine 3
        "env": {
            "VKD3D_CONFIG": "dxr",
            "DXVK_ENABLE_NVAPI": "1",
        },
        "notes": "D3D11/12. D3D12 via VKD3D tem melhor performance. DLSS funciona.",
    },
]


GENERIC_EXES = {"game.exe", "launcher.exe", "start.exe", "app.exe", "client.exe"}


def find_by_exe(exe_name: str, full_path: str | None = None) -> list[dict]:
    """Busca perfis que correspondem ao nome do executável.
    
    Args:
        exe_name: nome do executável (ex: "Game.exe")
        full_path: caminho completo (ex: "/jogos/NEET/Game.exe")
                   usado para pattern matching
    
    Retorna lista de matches ordenada por relevância.
    """
    exe_lower = exe_name.lower()
    path_lower = full_path.lower() if full_path else exe_lower
    matches = []

    for profile in GAME_PROFILES:
        profile_exe = profile.get("exe", "").lower()
        profile_pattern = profile.get("exe_pattern")
        profile_name = profile.get("name", "").lower()

        # Se o exe é genérico (Game.exe, Launcher.exe) e o perfil tem pattern,
        # NÃO faz match exato — precisa do pattern casar com o path
        is_generic = profile_exe in GENERIC_EXES

        if not is_generic and profile_exe == exe_lower:
            matches.append(profile)
            continue

        # Match por padrão (full path se disponível)
        if profile_pattern:
            target = path_lower if full_path else exe_lower
            if fnmatch.fnmatch(target, profile_pattern.lower()):
                matches.append(profile)
                continue

        # Match por nome do jogo (exe_base aparece no nome)
        exe_base = os.path.splitext(exe_lower)[0]
        if len(exe_base) > 4 and (exe_base in profile_name or profile_name.startswith(exe_base)):
            matches.append(profile)
            continue

    return matches


def find_by_engine(engine: str) -> list[dict]:
    """Busca todos os perfis de uma engine."""
    return [p for p in GAME_PROFILES if p.get("engine") == engine]


def get_profile_safe(exe_name: str, full_path: str | None = None) -> dict | None:
    """Retorna o melhor perfil para um executável.
    
    Prioridade: match exato (se não genérico) > pattern > nome.
    """
    matches = find_by_exe(exe_name, full_path)
    if not matches:
        return None

    exe_lower = exe_name.lower()
    is_generic = exe_lower in GENERIC_EXES

    # Match exato (não genérico)
    if not is_generic:
        for m in matches:
            if m.get("exe", "").lower() == exe_lower:
                return m

    # Match por pattern
    for m in matches:
        if m.get("exe_pattern"):
            return m

    # Primeiro match
    return matches[0]


def save_registry_to_disk(base_path: str):
    """Salva todos os perfis do registry em disco como JSON."""
    from makai_time.profiles.manager import _profiles_dir
    pdir = _profiles_dir(base_path)
    os.makedirs(pdir, exist_ok=True)

    for profile in GAME_PROFILES:
        slug = profile.get("name", "unknown").lower().replace(" ", "-").replace(":", "").replace("'", "")
        fpath = os.path.join(pdir, f"{slug}.json")
        with open(fpath, "w") as f:
            json.dump(profile, f, indent=2)
