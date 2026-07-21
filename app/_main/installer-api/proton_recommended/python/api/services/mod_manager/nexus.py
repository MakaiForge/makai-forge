from __future__ import annotations

from Nexus.nexus_api import NexusAPI
from Nexus.nexus_download import NexusDownloader


def get_api() -> NexusAPI:
    return NexusAPI()


def get_downloader() -> NexusDownloader:
    return NexusDownloader()


def search(query: str, game_id: str | None = None) -> list[dict]:
    api = get_api()
    results = api.search_mods(query, game_id or "")
    return [
        {
            "modId": r.get("mod_id"),
            "name": r.get("name"),
            "author": r.get("author"),
            "description": r.get("description"),
            "downloads": r.get("downloads"),
            "endorsements": r.get("endorsements"),
            "version": r.get("version"),
            "category": r.get("category"),
            "imageUrl": r.get("picture_url"),
        }
        for r in results
    ]


def trending(game_id: str) -> list[dict]:
    api = get_api()
    results = api.get_trending_mods(game_id)
    return [
        {
            "modId": r.get("mod_id"),
            "name": r.get("name"),
            "author": r.get("author"),
            "downloads": r.get("downloads"),
            "endorsements": r.get("endorsements"),
        }
        for r in results
    ]


def download(mod_id: int, file_id: int, game_id: str) -> dict:
    downloader = get_downloader()
    result = downloader.download_file(game_id, mod_id, file_id)
    return {
        "success": result is not None,
        "filePath": result,
    }


def auth(api_key: str) -> dict:
    api = get_api()
    api.set_api_key(api_key)
    user = api.validate_key()
    return {
        "valid": user is not None,
        "user": user,
    }
