"""
Detecção e tratamento especial para jogos gacha.

Gacha games (Genshin Impact, Honkai Star Rail, etc) precisam de
tratamento especial na recomendação: priorizam DW-Proton e
Proton-CachyOS com boost de +30 no tierScore.

Mapeamento de IDs:
  Chave interna        Steam ID        Custom ID
  genshin_impact       —               custom_genshin_impact
  honkai_star_rail     —               custom_honkai_star_rail
  zenless_zone_zero    4162040         custom_zenless_zone_zero
  wuthering_waves      3513350         —
  tower_of_fantasy     2064650         —
  neverness_to_everness 3040220        —
"""

from .data import _load_json

_GACHA_MAP: dict[str, dict] | None = None

_GACHA_FORKS = {"dw-proton": 56.8, "proton-cachyos": 68.5, "ge-proton": 100.0}


def _build_gacha_map() -> dict[str, dict]:
    global _GACHA_MAP
    if _GACHA_MAP is not None:
        return _GACHA_MAP

    gacha = _load_json("gacha_navegador_chromium.json")
    jogos = gacha.get("jogos_afetados", {}) if isinstance(gacha, dict) else {}
    _GACHA_MAP = {}

    steam_ids = {
        "neverness_to_everness": "3040220",
        "zenless_zone_zero": "4162040",
        "wuthering_waves": "3513350",
        "tower_of_fantasy": "2064650",
    }

    for key, entry in jogos.items():
        gid = entry.get("id", key)
        _GACHA_MAP[gid] = entry
        _GACHA_MAP[key] = entry
        if key in steam_ids:
            _GACHA_MAP[steam_ids[key]] = entry
        if gid == "genshin_impact":
            _GACHA_MAP["custom_genshin_impact"] = entry
        if gid == "honkai_star_rail":
            _GACHA_MAP["custom_honkai_star_rail"] = entry
            _GACHA_MAP["honkai_star_rail"] = entry
        if gid == "zenless_zone_zero":
            _GACHA_MAP["custom_zenless_zone_zero"] = entry

    return _GACHA_MAP


def _get_gacha_data(game_id: str) -> dict | None:
    mapa = _build_gacha_map()
    return mapa.get(game_id)


def _sort_forks_for_gacha(protons: dict) -> list[tuple]:
    boosted = {}
    for fid, finfo in protons.items():
        score = finfo.get("tierScore", 0)
        if fid in _GACHA_FORKS:
            score += 30
        boosted[fid] = (fid, {**finfo, "tierScore": score})
    return sorted(
        boosted.values(),
        key=lambda x: x[1].get("tierScore", 0),
        reverse=True,
    )
