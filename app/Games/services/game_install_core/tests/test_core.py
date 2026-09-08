"""
Testes do game_install_core (módulo único de instalação).

Cobrem:
  1. detect_installer_type — executável vs instalador (.exe único, .msi,
     setup aninhado, portátil, pasta inexistente)
  2. copy_to_prefix — cópia verificada (fonte vazia, falha de cópia,
     reinstalação sobre destino existente) — o falso-sucesso nunca volta
  3. scan_prefix_for_exes — nunca retorna exe de diretórios do sistema
  4. server.py — protocolo RPC standalone (single-shot)
"""

import json
import os
import stat
import subprocess
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from game_install_core import (  # noqa: E402
    copy_to_prefix,
    detect_installer_type,
    scan_prefix_for_exes,
)


# ─── helpers ─────────────────────────────────────────────────────

def make_game_tree(root: str, marker: str = "v1", name: str = "My Game") -> str:
    """Cria uma árvore de jogo com subpasta e arquivos."""
    game_dir = os.path.join(root, name)
    os.makedirs(os.path.join(game_dir, "bin"), exist_ok=True)
    with open(os.path.join(game_dir, "Game.exe"), "w") as f:
        f.write(f"exe-{marker}")
    with open(os.path.join(game_dir, "bin", "data.bin"), "wb") as f:
        f.write(f"data-{marker}".encode() * 100)
    with open(os.path.join(game_dir, "readme.txt"), "w") as f:
        f.write(f"readme-{marker}")
    return game_dir


# ─── detect_installer_type ───────────────────────────────────────

class TestDetectInstallerType:
    def test_single_exe_is_installer(self):
        with tempfile.TemporaryDirectory() as tmp:
            exe = os.path.join(tmp, "Setup.exe")
            with open(exe, "w") as f:
                f.write("x")
            r = detect_installer_type(exe)
            assert r["is_installer"] is True
            assert r["installer_path"] == exe

    def test_single_msi_is_installer(self):
        with tempfile.TemporaryDirectory() as tmp:
            msi = os.path.join(tmp, "game.msi")
            with open(msi, "w") as f:
                f.write("x")
            r = detect_installer_type(msi)
            assert r["is_installer"] is True

    def test_folder_with_setup_is_installer(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = os.path.join(tmp, "game")
            os.makedirs(os.path.join(folder, "sub"))
            with open(os.path.join(folder, "sub", "setup.exe"), "w") as f:
                f.write("x")
            r = detect_installer_type(folder)
            assert r["is_installer"] is True
            assert r["installer_path"].endswith("setup.exe")

    def test_portable_folder_is_not_installer(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = make_game_tree(tmp)
            r = detect_installer_type(folder)
            assert r["is_installer"] is False
            assert r["exe_count"] == 1
            assert r["total_files"] == 3

    def test_missing_path_reports_error(self):
        r = detect_installer_type("/nonexistent/definitely/missing")
        assert r["is_installer"] is False
        assert r["error"] is not None


# ─── copy_to_prefix ──────────────────────────────────────────────

class TestCopyToPrefix:
    def test_happy_path_copies_and_verifies(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = make_game_tree(tmp, "v1")
            prefix = os.path.join(tmp, "prefix")
            os.makedirs(prefix)

            result = copy_to_prefix(src, prefix)

            assert result["success"] is True, result
            assert result["hashes_ok"] is True, result
            assert result["mismatches"] == [], result
            assert result["files_count"] == 3, result

            dest = result["dest_path"]
            assert os.path.exists(os.path.join(dest, "Game.exe"))
            assert os.path.exists(os.path.join(dest, "bin", "data.bin"))
            assert not os.path.exists(dest + ".tmp-copy")

    def test_empty_source_never_fake_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            empty_src = os.path.join(tmp, "empty-src")
            os.makedirs(empty_src)

            prefix = os.path.join(tmp, "prefix")
            os.makedirs(prefix)
            dest = os.path.join(prefix, "drive_c", "empty-src")
            os.makedirs(dest)
            with open(os.path.join(dest, "Game.exe"), "w") as f:
                f.write("existing-game")

            result = copy_to_prefix(empty_src, prefix)

            assert result["success"] is False, "fonte vazia NUNCA pode dar sucesso"
            assert "vazia" in result.get("error", ""), result
            with open(os.path.join(dest, "Game.exe")) as f:
                assert f.read() == "existing-game"

    def test_missing_source_fails_without_touching_dest(self):
        with tempfile.TemporaryDirectory() as tmp:
            prefix = os.path.join(tmp, "prefix")
            os.makedirs(prefix)
            dest = os.path.join(prefix, "drive_c", "ghost")
            os.makedirs(dest)
            with open(os.path.join(dest, "Game.exe"), "w") as f:
                f.write("existing-game")

            result = copy_to_prefix(os.path.join(tmp, "ghost"), prefix)

            assert result["success"] is False, result
            assert result["files_count"] == 0, result
            with open(os.path.join(dest, "Game.exe")) as f:
                assert f.read() == "existing-game"

    def test_copy_failure_keeps_old_destination_intact(self):
        if os.geteuid() == 0:
            pytest.skip("rodando como root — chmod 000 não bloqueia leitura")

        with tempfile.TemporaryDirectory() as tmp:
            src = make_game_tree(tmp, "new")
            blocked = os.path.join(src, "bin", "data.bin")
            os.chmod(blocked, 0)
            try:
                prefix = os.path.join(tmp, "prefix")
                os.makedirs(prefix)
                dest = os.path.join(prefix, "drive_c", "My Game")
                os.makedirs(dest)
                with open(os.path.join(dest, "Game.exe"), "w") as f:
                    f.write("old-game-still-here")

                result = copy_to_prefix(src, prefix)

                assert result["success"] is False, result
                assert "Falha ao copiar" in result.get("error", ""), result
                with open(os.path.join(dest, "Game.exe")) as f:
                    assert f.read() == "old-game-still-here"
                assert not os.path.exists(dest + ".tmp-copy")
            finally:
                os.chmod(blocked, stat.S_IRUSR | stat.S_IWUSR)

    def test_reinstall_replaces_old_destination_atomically(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = make_game_tree(tmp, "v1")
            prefix = os.path.join(tmp, "prefix")
            os.makedirs(prefix)

            r1 = copy_to_prefix(src, prefix)
            assert r1["success"] is True, r1

            # "Nova versão" na MESMA pasta de origem, reinstalada por cima
            make_game_tree(tmp, "v2")
            r2 = copy_to_prefix(src, prefix)

            assert r2["success"] is True, r2
            assert r2["hashes_ok"] is True, r2
            dest = r2["dest_path"]
            with open(os.path.join(dest, "Game.exe")) as f:
                assert f.read() == "exe-v2"
            assert not os.path.exists(dest + ".tmp-copy")


# ─── scan_prefix_for_exes ────────────────────────────────────────

class TestScanPrefixForExes:
    def test_never_returns_system_exes(self):
        with tempfile.TemporaryDirectory() as tmp:
            prefix = os.path.join(tmp, "prefix")
            drive_c = os.path.join(prefix, "drive_c")
            # Estrutura wine real: windows/ (minúsculo, como o wine cria no Linux)
            os.makedirs(os.path.join(drive_c, "windows", "system32"))
            os.makedirs(os.path.join(drive_c, "windows", "Microsoft.NET", "Framework", "v1.1.4322"))
            os.makedirs(os.path.join(drive_c, "Program Files", "Common Files"))
            os.makedirs(os.path.join(drive_c, "My Game"))
            with open(os.path.join(drive_c, "windows", "Microsoft.NET", "Framework", "v1.1.4322", "aspnet_regiis.exe"), "w") as f:
                f.write("x" * 5000)
            with open(os.path.join(drive_c, "windows", "system32", "wineboot.exe"), "w") as f:
                f.write("x" * 5000)
            with open(os.path.join(drive_c, "Program Files", "Common Files", "vc_redist.exe"), "w") as f:
                f.write("x" * 5000)
            with open(os.path.join(drive_c, "My Game", "Game.exe"), "w") as f:
                f.write("x" * 5000)

            r = scan_prefix_for_exes(prefix)

            assert len(r["candidates"]) == 1, r
            assert r["candidates"][0]["name"] == "Game.exe", r


# ─── server.py (RPC standalone) ──────────────────────────────────

class TestStandaloneServer:
    def test_single_shot_detect(self):
        server = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server.py")
        with tempfile.TemporaryDirectory() as tmp:
            folder = make_game_tree(tmp)
            req = json.dumps({"id": 1, "method": "detect_installer_type",
                              "params": {"source_path": folder}})
            out = subprocess.run(
                [sys.executable, server],
                input=req + "\n", capture_output=True, text=True, timeout=30,
            )
            assert out.returncode == 0, out.stderr
            lines = [json.loads(l) for l in out.stdout.strip().splitlines()]
            resp = next(l for l in lines if l.get("id") == 1)
            assert resp["result"]["is_installer"] is False
            assert resp["result"]["exe_count"] == 1

    def test_unknown_method_returns_error(self):
        server = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server.py")
        req = json.dumps({"id": 9, "method": "nao_existe", "params": {}})
        out = subprocess.run(
            [sys.executable, server],
            input=req + "\n", capture_output=True, text=True, timeout=30,
        )
        resp = json.loads(out.stdout.strip().splitlines()[-1])
        assert resp["id"] == 9
        assert resp["error"]["code"] == "method_not_found", resp
