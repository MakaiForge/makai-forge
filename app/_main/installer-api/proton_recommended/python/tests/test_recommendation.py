"""
Testes para o módulo de recomendação.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.services.recommendation import recommend, get_available_forks
from api.services.catalog import get_game_info, search_games


def test_recommend_known_game():
    """Testa recomendação pra ELDEN RING (app_id 1245620)."""
    result = recommend("1245620")
    assert result is not None
    assert result["game_id"] == "1245620"
    assert result["title"] is not None
    assert result["primary"] is not None
    assert "fork" in result["primary"]
    assert "alternatives" in result
    print(f"  Primary: {result['primary']['name']} v{result['primary']['version']}")
    print(f"  Tier: {result['primary']['tier']}")
    print(f"  Confidence: {result['primary']['confidence']}")


def test_recommend_unknown_game():
    """Testa recomendação pra um jogo que talvez não exista."""
    result = recommend("999999999")
    assert result is not None
    assert result["primary"] is not None
    print(f"  Fallback: {result['primary']['fork']} v{result['primary']['version']}")


def test_get_available_forks():
    """Testa listagem de forks."""
    forks = get_available_forks()
    assert len(forks) > 0
    assert forks[0]["tierScore"] >= forks[-1]["tierScore"]
    print(f"  Total forks: {len(forks)}")
    for f in forks[:3]:
        print(f"  {f['name']}: {f['ranking']} ({f['tierScore']})")


def test_search_games():
    """Testa busca de jogos."""
    results = search_games("Elden")
    assert isinstance(results, list)
    print(f"  Results for 'Elden': {len(results)}")


if __name__ == "__main__":
    print("=== Test: recommend known game ===")
    test_recommend_known_game()
    print()
    print("=== Test: recommend unknown game ===")
    test_recommend_unknown_game()
    print()
    print("=== Test: available forks ===")
    test_get_available_forks()
    print()
    print("=== Test: search games ===")
    test_search_games()
    print()
    print("All tests passed!")
