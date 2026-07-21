"""
Catálogo de jogos — agora usa Makai API online (makai-forge.store).

O antigo catalogo.db local foi substituído pelo site Cloudflare.
Estas funções são mantidas para compatibilidade, mas retornam vazio.
O Electron deve usar MakaiApi para buscar jogos.
"""

import urllib.request
import urllib.parse
import json
import os

_SITE_URL = os.environ.get("MAKAI_FORGE_URL", "http://localhost:8788")


def _get_catalog_title(game_id: str) -> str | None:
    try:
        info = get_game_info(game_id)
        return info["title"] if info else None
    except Exception:
        return None


def get_game_info(game_id: str) -> dict | None:
    try:
        url = f"{_SITE_URL}/api/games/{urllib.parse.quote(str(game_id))}"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return data.get("game") if isinstance(data, dict) else None
    except Exception as e:
        print(f"[catalog] Erro ao buscar jogo {game_id} online: {e}")
        return None


def search_games(query: str, limit: int = 20) -> list:
    try:
        params = urllib.parse.urlencode({"title": query, "take": limit})
        url = f"{_SITE_URL}/catalogue/search?{params}"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[catalog] Erro na busca online '{query}': {e}")
        return []
