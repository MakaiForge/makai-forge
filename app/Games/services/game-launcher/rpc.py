def register_handlers(register):
    from app._main.rpc.base import RpcError, write_event


    @register("detect_installer_type")
    def handle_detect_installer_type(params: dict):
        from game_launcher.game_install import detect_installer_type
        source_path = params.get("source_path") if isinstance(params, dict) else None
        if not source_path:
            raise RpcError("invalid_params", "source_path required")
        return detect_installer_type(str(source_path))


    @register("copy_to_prefix")
    def handle_copy_to_prefix(params: dict):
        from game_launcher.game_install import copy_to_prefix
        source_path = params.get("source_path") if isinstance(params, dict) else None
        prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
        if not source_path or not prefix_path:
            raise RpcError("invalid_params", "source_path and prefix_path required")

        def _progress(pct):
            write_event("copy_progress", percent=pct)

        return copy_to_prefix(str(source_path), str(prefix_path), progress_callback=_progress)


    @register("scan_prefix_for_exes")
    def handle_scan_prefix_for_exes(params: dict):
        from game_launcher.game_install import scan_prefix_for_exes
        prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
        game_folder_name = params.get("game_folder_name") if isinstance(params, dict) else None
        if not prefix_path:
            raise RpcError("invalid_params", "prefix_path required")
        return scan_prefix_for_exes(str(prefix_path), str(game_folder_name) if game_folder_name else None)


    @register("snapshot_prefix")
    def handle_snapshot_prefix(params: dict):
        from game_launcher.game_install import snapshot_prefix
        prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
        if not prefix_path:
            raise RpcError("invalid_params", "prefix_path required")
        return snapshot_prefix(str(prefix_path))


    @register("find_new_executables")
    def handle_find_new_executables(params: dict):
        from game_launcher.game_install import find_new_executables
        before = params.get("before") if isinstance(params, dict) else None
        after = params.get("after") if isinstance(params, dict) else None
        if before is None or after is None:
            raise RpcError("invalid_params", "before and after required")
        return find_new_executables(list(before), list(after))


    @register("install_game")
    def handle_install_game(params: dict):
        from game_launcher.game_install import install_game
        source_path = params.get("source_path") if isinstance(params, dict) else None
        prefix_path = params.get("prefix_path") if isinstance(params, dict) else None
        proton_path = params.get("proton_path") if isinstance(params, dict) else None
        game_id = params.get("game_id", "") if isinstance(params, dict) else ""
        existing_exe_path = params.get("existing_exe_path") if isinstance(params, dict) else None
        if not source_path or not prefix_path or not proton_path:
            raise RpcError("invalid_params", "source_path, prefix_path, proton_path required")

        def _progress(step, pct, msg):
            write_event("install_progress", step=step, percent=pct, message=msg)

        return install_game(
            source_path=str(source_path),
            prefix_path=str(prefix_path),
            proton_path=str(proton_path),
            game_id=str(game_id),
            existing_exe_path=str(existing_exe_path) if existing_exe_path else None,
            progress_callback=_progress,
        )
