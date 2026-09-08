"""
core/engine/registry.py — Operações no registro do Wine.

Aplica DLL overrides via edição direta do user.reg (como o Amethyst faz),
registra caminhos de jogos Bethesda, e executa Makaitricks.
"""

import os
import re
import subprocess

MAKAITRICKS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "_resources", "binaries", "Makaitricks"
)


# ─── DLL Overrides (edição direta do user.reg, igual Amethyst) ─


def apply_dll_overrides(prefix_path: str, dlls: list[dict]) -> bool:
    user_reg = os.path.join(prefix_path, "pfx", "user.reg")
    if not os.path.isfile(user_reg):
        user_reg = os.path.join(prefix_path, "user.reg")
    if not os.path.isfile(user_reg):
        return False

    try:
        with open(user_reg, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return False

    lines = text.splitlines(keepends=True)
    section_header = "[Software\\\\Wine\\\\DllOverrides]"
    section_start = None
    section_end = None

    for i, line in enumerate(lines):
        if section_header in line:
            section_start = i
            continue
        if section_start is not None and section_end is None:
            if line.startswith("["):
                section_end = i
                break

    if section_end is None and section_start is not None:
        section_end = len(lines)

    new_lines = []
    existing = {}
    added_names = set()

    if section_start is not None:
        new_lines = lines[:section_start]
        new_lines.append(section_header + "\n")
        for i in range(section_start + 1, section_end):
            line = lines[i]
            stripped = line.strip()
            if not stripped or stripped.startswith("["):
                continue
            if "=" in stripped:
                key = stripped.split("=", 1)[0].strip(' \t"')
                existing[key.lower()] = len(new_lines)
                new_lines.append(line)
            else:
                new_lines.append(line)
        rest = lines[section_end:] if section_end < len(lines) else []
    else:
        last_section = len(lines)
        for i in range(len(lines) - 1, -1, -1):
            if lines[i].strip().startswith("["):
                last_section = i
                break
        new_lines = lines[:last_section]
        new_lines.append("\n")
        new_lines.append(section_header + "\n")
        rest = lines[last_section:]

    for dll in dlls:
        name = dll["name"]
        value = dll["type"]
        key = name.lower()
        if key in existing:
            idx = existing[key]
            new_lines[idx] = f'"{name}"="{value}"\n'
        else:
            new_lines.append(f'"{name}"="{value}"\n')
        added_names.add(name)

    if rest:
        for line in rest:
            if section_header in line:
                continue
            new_lines.append(line)

    content = "".join(new_lines).rstrip("\n") + "\n"

    try:
        with open(user_reg, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    except OSError:
        return False


def remove_dll_overrides(prefix_path: str, dll_names: list[str]) -> bool:
    user_reg = os.path.join(prefix_path, "pfx", "user.reg")
    if not os.path.isfile(user_reg):
        return False

    try:
        with open(user_reg, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError:
        return False

    lines = text.splitlines(keepends=True)
    section_header = "[Software\\\\Wine\\\\DllOverrides]"
    in_section = False
    new_lines = []
    targets = {d.lower() for d in dll_names}

    for line in lines:
        if section_header in line:
            in_section = True
            new_lines.append(line)
            continue
        if in_section:
            if line.startswith("["):
                in_section = False
                new_lines.append(line)
                continue
            stripped = line.strip()
            if stripped and "=" in stripped:
                key = stripped.split("=", 1)[0].strip(' \t"')
                if key.lower() in targets:
                    continue
            new_lines.append(line)
        else:
            new_lines.append(line)

    try:
        with open(user_reg, "w", encoding="utf-8") as f:
            f.write("".join(new_lines))
        return True
    except OSError:
        return False


# ─── Bethesda Registry ────────────────────────────────────────

_BETHESDA_REG_NAMES = {
    "skyrim":      "Skyrim",
    "skyrim_se":   "Skyrim Special Edition",
    "skyrim_vr":   "Skyrim VR",
    "enderal":     "Enderal",
    "enderal_se":  "Enderal Special Edition",
    "fallout3":    "Fallout3",
    "falloutnv":   "FalloutNV",
    "fallout4":    "Fallout4",
    "fallout4_vr": "Fallout4 VR",
    "oblivion":    "Oblivion",
    "morrowind":   "Morrowind",
    "starfield":   "Starfield",
}


def _find_wine_binary(proton_path: str) -> str | None:
    """Localiza o binário wine dentro do diretório Proton."""
    proto_dir = os.path.dirname(proton_path)
    candidates = [
        os.path.join(proto_dir, "files", "bin", "wine"),
        os.path.join(proto_dir, "dist", "bin", "wine"),
        os.path.join(proto_dir, "bin", "wine"),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def register_bethesda_game_path(
    prefix_path: str,
    proton_path: str,
    game_id: str,
    game_path: str,
    steam_app_id: str | None = None,
) -> bool:
    reg_name = _BETHESDA_REG_NAMES.get(game_id)
    if not reg_name:
        return False

    wine_binary = _find_wine_binary(proton_path)
    if not wine_binary:
        return False

    wine_path = "Z:" + game_path.replace("/", "\\") + "\\"

    env = os.environ.copy()
    env["WINEPREFIX"] = prefix_path
    if steam_app_id:
        env["SteamAppId"] = steam_app_id

    keys = [
        f"HKLM\\Software\\Bethesda Softworks\\{reg_name}",
        f"HKLM\\Software\\WOW6432Node\\Bethesda Softworks\\{reg_name}",
    ]

    success = True
    for key in keys:
        try:
            r = subprocess.run(
                [wine_binary, "reg", "add", key,
                 "/v", "Installed Path", "/t", "REG_SZ", "/d", wine_path, "/f"],
                env=env,
                timeout=30,
                capture_output=True,
            )
            if r.returncode != 0:
                success = False
        except Exception:
            success = False

    return success


def apply_registry_file(prefix_path: str, reg_file: str, proton_path: str | None = None) -> bool:
    if not os.path.isfile(reg_file):
        return False
    if not proton_path:
        from .proton import find_any_proton
        proton_path = find_any_proton()
    if not proton_path:
        return False

    wine_binary = _find_wine_binary(proton_path)
    if not wine_binary:
        return False

    env = os.environ.copy()
    env["WINEPREFIX"] = prefix_path

    try:
        subprocess.run(
            [wine_binary, "regedit", reg_file],
            env=env,
            timeout=30,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def run_makaitricks(prefix_path: str, components: list[str], proton_path: str) -> dict:
    if not components:
        return {"success": True, "log": []}

    env = os.environ.copy()
    pfx_dir = os.path.join(prefix_path, "pfx")
    env["WINEPREFIX"] = pfx_dir if os.path.isdir(pfx_dir) else prefix_path

    wine_dir = _find_wine_binary(proton_path)
    if wine_dir:
        wine_bin = os.path.dirname(wine_dir)
        env["PATH"] = wine_bin + os.pathsep + env.get("PATH", "")

    results = []
    all_ok = True

    for component in components:
        try:
            result = subprocess.run(
                [MAKAITRICKS_PATH, component],
                env=env,
                timeout=120,
                capture_output=True,
                text=True,
            )
            ok = result.returncode == 0
            results.append({
                "component": component,
                "success": ok,
                "output": result.stdout[-200:] if result.stdout else "",
            })
            if not ok:
                all_ok = False
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            results.append({"component": component, "success": False, "error": str(e)})
            all_ok = False

    return {"success": all_ok, "log": results}
