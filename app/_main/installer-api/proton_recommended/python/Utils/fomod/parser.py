from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree


@dataclass
class PluginFile:
    source_path: str
    destination_path: str
    priority: int = 0
    is_folder: bool = False


@dataclass
class PluginTypeDescriptor:
    plugin_type: str = "Optional"


@dataclass
class FomodPlugin:
    name: str
    description: str = ""
    image_path: str | None = None
    type_descriptor: PluginTypeDescriptor | None = None
    files: list[PluginFile] = field(default_factory=list)


@dataclass
class FomodGroup:
    name: str
    type: str = "SelectExactlyOne"
    plugins: list[FomodPlugin] = field(default_factory=list)


@dataclass
class FomodStep:
    name: str
    optional: bool = False
    groups: list[FomodGroup] = field(default_factory=list)


@dataclass
class ModuleConfig:
    module_name: str = ""
    module_image: str | None = None
    install_steps: list[FomodStep] = field(default_factory=list)


def parse_module_config(mod_dir: Path) -> ModuleConfig:
    fomod_dir = mod_dir / "fomod"
    if not fomod_dir.exists():
        fomod_dir = mod_dir / "FOMOD"

    info_xml = fomod_dir / "info.xml"
    config_xml = fomod_dir / "ModuleConfig.xml"

    config = ModuleConfig()

    if info_xml.exists():
        try:
            root = ElementTree.parse(str(info_xml)).getroot()
            ns = {"fomod": "http://fomod-project.org/schema/fomod-1.0"}
            name_el = root.find(".//fomod:Name", ns) or root.find(".//Name")
            if name_el is not None and name_el.text:
                config.module_name = name_el.text
            img_el = root.find(".//fomod:Image", ns) or root.find(".//Image")
            if img_el is not None and img_el.text:
                config.module_image = img_el.text
        except Exception:
            pass

    if config_xml.exists():
        try:
            root = ElementTree.parse(str(config_xml)).getroot()
            ns = {"fomod": "http://fomod-project.org/schema/fomod-1.0"}
            steps = root.findall(".//fomod:step", ns) or root.findall("step")
            for step_el in steps:
                step = FomodStep(
                    name=step_el.get("name", ""),
                    optional=step_el.get("optional", "false").lower() == "true",
                )
                groups = step_el.findall(".//fomod:group", ns) or step_el.findall("group")
                for group_el in groups:
                    group = FomodGroup(
                        name=group_el.get("name", ""),
                        type=group_el.get("type", "SelectExactlyOne"),
                    )
                    plugins = group_el.findall(".//fomod:plugin", ns) or group_el.findall("plugin")
                    for plugin_el in plugins:
                        plugin = FomodPlugin(
                            name=plugin_el.get("name", ""),
                            description="",
                        )
                        desc_el = plugin_el.find(".//fomod:description", ns) or plugin_el.find("description")
                        if desc_el is not None and desc_el.text:
                            plugin.description = desc_el.text
                        img_el = plugin_el.find(".//fomod:image", ns) or plugin_el.find("image")
                        if img_el is not None and img_el.text:
                            plugin.image_path = img_el.text
                        type_desc = plugin_el.find(".//fomod:typeDescriptor", ns) or plugin_el.find("typeDescriptor")
                        if type_desc is not None:
                            ptype = type_desc.find(".//fomod:type", ns) or type_desc.find("type")
                            if ptype is not None and ptype.text:
                                plugin.type_descriptor = PluginTypeDescriptor(plugin_type=ptype.text)
                        files = plugin_el.findall(".//fomod:file", ns) or plugin_el.findall("file")
                        for file_el in files:
                            pf = PluginFile(
                                source_path=file_el.get("source", ""),
                                destination_path=file_el.get("destination", ""),
                                priority=int(file_el.get("priority", "0")),
                                is_folder=file_el.get("isFolder", "false").lower() == "true",
                            )
                            plugin.files.append(pf)
                        group.plugins.append(plugin)
                    step.groups.append(group)
                config.install_steps.append(step)
        except Exception:
            pass

    if not config.install_steps:
        _detect_flat_fomod(fomod_dir, config)

    return config


def resolve_fomod_selections(parsed: ModuleConfig, selections: dict) -> list[str]:
    """Given parsed FOMOD config and selections dict, return list of relative file paths."""
    resolved: set[str] = set()

    if parsed.install_steps:
        for step in parsed.install_steps:
            step_name = step.name
            selected_plugins = selections.get(step_name, [])
            for group in step.groups:
                for plugin in group.plugins:
                    pname = plugin.name
                    if not selected_plugins or pname in selected_plugins:
                        for f in plugin.files:
                            if f.source_path:
                                resolved.add(f.source_path)

    return list(resolved)


def _detect_flat_fomod(fomod_dir: Path, config: ModuleConfig):
    """Fallback para FOMOD sem ModuleConfig.xml — usa estrutura flat."""
    image = fomod_dir / "ModuleConfig.jpg"
    if image.exists():
        config.module_image = str(image)
    return config
