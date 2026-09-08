from __future__ import annotations

from pathlib import Path

from Utils.fomod_parser import parse_module_config


def parse(mod_path: str) -> dict:
    mod_dir = Path(mod_path)
    if not mod_dir.is_dir():
        raise FileNotFoundError(f"Mod directory not found: {mod_path}")

    config = parse_module_config(mod_dir)

    steps_data = []
    for step in config.install_steps:
        groups_data = []
        for group in step.groups:
            plugins_data = []
            for plugin in group.plugins:
                plugins_data.append({
                    "name": plugin.name,
                    "description": plugin.description,
                    "image": plugin.image_path if plugin.image_path else None,
                    "type": plugin.type_descriptor.plugin_type if plugin.type_descriptor else "Optional",
                })
            groups_data.append({
                "name": group.name,
                "type": group.type,
                "plugins": plugins_data,
            })
        steps_data.append({
            "name": step.name,
            "optional": step.optional,
            "groups": groups_data,
        })

    return {
        "moduleName": config.module_name,
        "moduleImage": config.module_image if config.module_image else None,
        "steps": steps_data,
    }


def install(mod_path: str, selections: dict[str, list[str]]) -> dict:
    mod_dir = Path(mod_path)
    if not mod_dir.is_dir():
        raise FileNotFoundError(f"Mod directory not found: {mod_path}")

    config = parse_module_config(mod_dir)

    installed_files = []
    failed_files = []

    for step in config.install_steps:
        if step.optional and step.name not in selections:
            continue

        for group in step.groups:
            selected_plugins = selections.get(f"{step.name}:{group.name}", [])
            for plugin in group.plugins:
                if plugin.name not in selected_plugins:
                    continue

                for file_install in plugin.files:
                    src = mod_dir / file_install.source_path
                    if src.exists():
                        installed_files.append({
                            "source": str(src),
                            "destination": file_install.destination_path,
                            "priority": file_install.priority,
                            "is_folder": file_install.is_folder,
                        })
                    else:
                        failed_files.append(file_install.source_path)

    return {
        "success": len(failed_files) == 0,
        "files": installed_files,
        "failed": failed_files,
    }
