import os
import sys
import types
from pathlib import Path


def register_handlers(register):
    from app._main.rpc.base import RpcError

    _prefix_py_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "makai_time", "engine", "python"))
    if _prefix_py_dir not in sys.path:
        sys.path.insert(0, _prefix_py_dir)

    # Inject minimal prefix module to avoid loading __init__.py
    # (which triggers makai_time → Xlib chain).
    if "prefix" not in sys.modules:
        _minimal = types.ModuleType("prefix")
        _minimal.__path__ = [os.path.join(_prefix_py_dir, "prefix")]
        _minimal.__file__ = os.path.join(_prefix_py_dir, "prefix", "__init__.py")
        _minimal.__package__ = "prefix"
        sys.modules["prefix"] = _minimal

    from prefix.core import create_prefix, delete_prefix, clean_prefix


    @register("create_prefix")
    def handle_create_prefix(params: dict):
        game_id = params.get("game_id")
        proton_path = params.get("proton_path")
        if not game_id or not proton_path:
            raise RpcError("missing_param", "game_id and proton_path are required")
        prefix_path = params.get("prefix_path")
        auto_dlls = params.get("auto_dlls", True)
        extra_verbs = params.get("extra_verbs")
        game_path = params.get("game_path", "")

        if prefix_path:
            os.environ.setdefault("STEAM_COMPAT_DATA_PATH", prefix_path)
            os.environ.setdefault("WINEPREFIX", prefix_path)
        if game_path:
            os.environ.setdefault("STEAM_COMPAT_INSTALL_PATH", game_path)
        return create_prefix(
            game_id=str(game_id),
            proton_path=str(proton_path),
            prefix_path=str(prefix_path) if prefix_path else None,
            auto_dlls=bool(auto_dlls),
            extra_verbs=extra_verbs,
        )


    @register("delete_prefix")
    def handle_delete_prefix(params: dict):
        prefix_path = params.get("prefix_path")
        if not prefix_path:
            raise RpcError("missing_param", "prefix_path is required")
        return {"success": delete_prefix(str(prefix_path))}


    @register("clean_prefix")
    def handle_clean_prefix(params: dict):
        prefix_path = params.get("prefix_path")
        if not prefix_path:
            raise RpcError("missing_param", "prefix_path is required")
        return {"success": clean_prefix(str(prefix_path))}


    @register("get_prefix_saves")
    def handle_get_prefix_saves(params: dict):
        prefix_path = params.get("prefix_path")
        if not prefix_path:
            raise RpcError("missing_param", "prefix_path is required")
        pfx = Path(prefix_path)
        if not pfx.is_dir():
            return {"saves": [], "error": "prefix directory not found"}
        saves = []
        game_id = params.get("game_id", "")
        search_bases = [
            "drive_c/users/*/Documents/My Games",
            "drive_c/users/*/AppData/Local",
            "drive_c/users/*/AppData/Roaming",
        ]
        for pattern in search_bases:
            for base in pfx.glob(pattern):
                if not base.is_dir():
                    continue
                for child in base.iterdir():
                    if not child.is_dir():
                        continue
                    child_lower = child.name.lower()
                    if game_id:
                        gid = game_id.lower().replace("_", "").replace("-", "")
                        cname = child_lower.replace("_", "").replace("-", "").replace(" ", "")
                        if gid not in cname and cname not in gid:
                            continue
                    saves.append(str(child.relative_to(pfx)))
        return {"saves": saves}


    @register("restore_saves")
    def handle_restore_saves(params: dict):
        import shutil
        from pathlib import Path
        prefix_path = params.get("prefix_path")
        saves_backup = params.get("saves_backup", [])
        backup_source = params.get("backup_source")
        if not all([prefix_path, backup_source]):
            raise RpcError("missing_param", "prefix_path and backup_source are required")
        pfx = Path(prefix_path)
        src = Path(backup_source)
        restored = []
        errors = []
        for save_rel in saves_backup:
            src_path = src / save_rel
            dst_path = pfx / save_rel
            if not src_path.exists():
                errors.append(f"{save_rel}: fonte não encontrada em {backup_source}")
                continue
            try:
                if dst_path.exists():
                    shutil.rmtree(dst_path)
                shutil.copytree(src_path, dst_path)
                restored.append(save_rel)
            except Exception as e:
                errors.append(f"{save_rel}: {str(e)[:150]}")
        return {"restored": restored, "errors": errors}


    @register("install_game_dlls")
    def handle_install_game_dlls(params: dict):
        from api.services import prefix
        game_id = params.get("game_id")
        prefix_path = params.get("prefix_path")
        proton_path = params.get("proton_path")
        if not all([game_id, prefix_path, proton_path]):
            raise RpcError("missing_param", "game_id, prefix_path, proton_path are required")
        return prefix.install_recommended_dlls(
            game_id=str(game_id),
            prefix_path=str(prefix_path),
            proton_path=str(proton_path),
            extra_verbs=params.get("extra_verbs"),
        )


    @register("install_makaitricks")
    def handle_install_makaitricks(params: dict):
        prefix_path = params.get("prefix_path")
        proton_path = params.get("proton_path")
        verbs = params.get("verbs")
        if not prefix_path or not proton_path or not verbs:
            raise RpcError("missing_param", "prefix_path, proton_path, verbs are required")
        if not isinstance(verbs, list):
            raise RpcError("invalid_param", "verbs must be a list")
        from core.engine.makaitricks import run_multiple
        result = run_multiple(verbs, prefix_path, proton_path)
        return result
