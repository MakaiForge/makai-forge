"""
Testes para o módulo de prefixo.
"""

import sys
import os
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from api.services.prefix import delete_prefix
from api.services.prefix.core import (
    _resolve_prefix_path,
    _ensure_proton_valid,
    _is_prefix_initialized,
)
from prefix.makaitricks import check_dll_installed


def test_resolve_prefix_path_default():
    """Testa resolução de caminho padrão."""
    path = _resolve_prefix_path("1245620")
    assert path.endswith("1245620")
    assert "games/proton-forger" in path
    print(f"  Default path: {path}")


def test_resolve_prefix_path_custom():
    """Testa resolução de caminho customizado."""
    path = _resolve_prefix_path("1245620", "/tmp/test-prefix")
    assert path == "/tmp/test-prefix"
    print(f"  Custom path: {path}")


def test_ensure_proton_valid_invalid():
    """Testa validação de Proton inválido."""
    with tempfile.TemporaryDirectory() as tmpdir:
        result = _ensure_proton_valid(tmpdir)
        assert result is False
        print(f"  Invalid proton correctly rejected")


def test_is_prefix_initialized_empty():
    """Testa prefixo vazio."""
    with tempfile.TemporaryDirectory() as tmpdir:
        result = _is_prefix_initialized(tmpdir)
        assert result is False
        print(f"  Empty prefix correctly detected")


def test_check_dll_installed_no_drive():
    """Testa verificação de DLL sem drive_c."""
    with tempfile.TemporaryDirectory() as tmpdir:
        result = check_dll_installed("vcrun2022", tmpdir)
        assert result is False
        print(f"  No drive_c correctly handled")


def test_delete_prefix():
    """Testa remoção de prefixo."""
    with tempfile.TemporaryDirectory() as tmpdir:
        assert delete_prefix(tmpdir) is True
        assert not os.path.exists(tmpdir)
        print(f"  Prefix deletion works")


if __name__ == "__main__":
    print("=== Test: resolve prefix path ===")
    test_resolve_prefix_path_default()
    test_resolve_prefix_path_custom()
    print()
    print("=== Test: validate proton ===")
    test_ensure_proton_valid_invalid()
    print()
    print("=== Test: prefix state ===")
    test_is_prefix_initialized_empty()
    print()
    print("=== Test: DLL check ===")
    test_check_dll_installed_no_drive()
    print()
    print("=== Test: delete prefix ===")
    test_delete_prefix()
    print()
    print("All tests passed!")
