"""deploy/types.py — Data classes and constants for mod deployment."""

import re
from dataclasses import dataclass, field


@dataclass
class ModFileEntry:
    relative_path: str
    relative_path_lower: str
    size: int
    is_script_extender: bool = False
    is_plugin: bool = False


@dataclass
class ModInventory:
    mod_name: str
    files: list[ModFileEntry] = field(default_factory=list)
    script_extender_files: list[ModFileEntry] = field(default_factory=list)
    plugin_files: list[str] = field(default_factory=list)
    has_fomod: bool = False
    preview_files: list[ModFileEntry] = field(default_factory=list)
    readme_files: list[ModFileEntry] = field(default_factory=list)


@dataclass
class DeploymentResult:
    success: bool
    log: list[str]
    filemap: dict[str, str]


class LinkMode:
    SYMLINK = "symlink"
    COPY = "copy"
    HARDLINK = "hardlink"

    @staticmethod
    def from_str(s: str) -> str:
        return s if s in (LinkMode.SYMLINK, LinkMode.COPY, LinkMode.HARDLINK) else LinkMode.SYMLINK


SE_PATTERNS: list[re.Pattern] = [
    re.compile(r"^(skse|fose|nvse|obse|scriptextender)", re.IGNORECASE),
    re.compile(r"(d3d|dxgi|winhttp|version|binkw32|dsound|dinput8)\.dll$", re.IGNORECASE),
    re.compile(r"^steam_api", re.IGNORECASE),
]

ROOT_PLUGIN_EXTS = {".esp", ".esm", ".esl"}

SKIP_ROOT_EXTS = {
    ".txt", ".md", ".pdf", ".doc", ".docx", ".rtf", ".htm", ".html",
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
    ".max", ".blend", ".obj", ".fbx", ".psd", ".xcf", ".ai", ".svg",
    ".exe", ".zip", ".rar", ".7z", ".tar", ".gz",
    ".py", ".js", ".ts", ".css", ".json", ".xml",
    ".wav", ".mp3", ".flac", ".ogg",
}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
README_EXTS = {".txt", ".md", ".pdf", ".rtf"}
README_PATTERNS = ["readme", "install", "instructions", "leia-me", "leiame"]

GAME_LOCAL_DIR_MAP: dict[str, str] = {
    "skyrim_se": "Skyrim Special Edition",
    "skyrim": "Skyrim",
    "fallout4": "Fallout 4",
    "fallout3": "Fallout 3",
    "falloutnv": "Fallout New Vegas",
    "cyberpunk_2077": "Cyberpunk 2077",
    "baldurs_gate_3": "Baldur's Gate 3",
    "starfield": "Starfield",
    "oblivion": "Oblivion",
    "enderal": "Enderal",
}

BETTHESDA_GAME_TYPES: set[str] = {
    "Skyrim", "SkyrimSE", "SkyrimVR",
    "Fallout3", "FalloutNV", "Fallout4", "Fallout4VR",
    "Oblivion", "Morrowind",
    "Starfield",
    "Enderal", "EnderalSE",
}
