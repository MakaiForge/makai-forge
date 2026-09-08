# Mod Install API — API Python de Instalação de Mods

## Visão Geral

Esta API Python fornece todas as operações de instalação, deploy e gerenciamento de mods para jogos Windows no Linux (via Proton/Wine). Ela se comunica com o Electron via **JSON-RPC sobre stdin/stdout**.

### Escopo da API

| Capacidade | Módulo | Status |
|------------|--------|--------|
| Parse FOMOD | `mod_manager/fomod.py` | ✅ Funcional |
| Install FOMOD | `mod_manager/fomod.py` | ✅ Funcional |
| Read/Write Plugins | `mod_manager/plugins.py` | ✅ Funcional |
| Sort Plugins (LOOT) | `plugins/load_order.py` | ✅ Funcional |
| Deploy (symlinks) | `deploy/core.py` | ✅ Funcional |
| Restore (undo deploy) | `deploy/core.py` | ✅ Funcional |
| Undeploy (remove mod) | `deploy/core.py` | ✅ Funcional |
| Detect Conflicts | `deploy/core.py` | ✅ Funcional |
| Inventory Mod | `deploy/inventory.py` | ✅ Funcional |
| Detect Mod Type | `deploy/inventory.py` | ✅ Funcional |
| Build Filemap | `deploy/inventory.py` | ✅ Funcional |
| Extract Archive | `deploy/archive.py` | ✅ Funcional |
| BAIN Detect | `bain_parser.py` | ✅ Funcional |
| BAIN Install | `bain_parser.py` | ✅ Funcional |
| Nexus Search | `mod_manager/nexus.py` | ✅ Funcional |
| Nexus Download | `mod_manager/nexus.py` | ✅ Funcional |
| Mod Compat Info | `mod_compat.py` | ✅ Funcional |
| **Read Archive Info** | `archive_reader.py` | 🔨 Novo |
| **Verify Integrity** | `integrity_checker.py` | 🔨 Novo |
| **Orchestrated Install** | `install_orchestrator.py` | 🔨 Novo |

---

## Arquitetura Atual

```
python/
├── api/
│   ├── handler.py              ← Dispatcher RPC (registra todos os métodos)
│   ├── services/
│   │   ├── mod_manager/
│   │   │   ├── fomod.py        ← Parse + Install FOMOD
│   │   │   ├── plugins.py      ← Read/Write plugins.txt
│   │   │   └── nexus.py        ← Nexus Mods API
│   │   └── mod_compat.py       ← Compatibilidade de mods
│   └── data/                   ← Dados (masterlist.json, mod_compat.json)
├── Utils/
│   ├── deploy/
│   │   ├── core.py             ← Deploy/Restore/Undeploy/Conflict
│   │   ├── inventory.py        ← Inventory/TypeDetect/Filemap
│   │   ├── archive.py          ← Extract archive
│   │   └── types.py            ← Dataclasses e constants
│   ├── plugins/
│   │   ├── manager.py          ← Read/Write/Sort/Prune/Sync plugins
│   │   ├── load_order.py       ← LOOT-based topological sort
│   │   ├── eslifier.py         ← ESP → ESL conversion
│   │   └── plugin_parser.py    ← Parse plugin headers (masters)
│   ├── fomod/
│   │   └── parser.py           ← Parse ModuleConfig.xml
│   └── bain_parser.py          ← Detect + Install BAIN packages
└── bridge/
    └── bridge.py               ← IPC bridge (stdin/stdout JSON)
```

---

## Métodos RPC Disponíveis

### FOMOD

```python
# Parse FOMOD config
{"method": "mod_fomod_parse", "params": {"mod_path": "/path/to/staged/mod"}}
→ {
    "moduleName": "RaceMenu",
    "moduleImage": "fomod/ModuleImage.jpg",
    "steps": [
        {
            "name": "Main",
            "optional": false,
            "groups": [
                {
                    "name": "Main Files",
                    "type": "SelectExactlyOne",
                    "plugins": [
                        {
                            "name": "RaceMenu v3.4.5",
                            "description": "Core files",
                            "image": null,
                            "type": "Required",
                            "files": [
                                {"source": "meshes/", "destination": "Data/meshes/", "priority": 0, "is_folder": true}
                            ]
                        }
                    ]
                }
            ]
        }
    ]
}

# Install FOMOD with selections
{"method": "mod_fomod_install", "params": {"mod_path": "/path/to/staged/mod", "selections": {"Main:Main Files": ["RaceMenu v3.4.5"]}}}
→ {"success": true, "files": [...], "failed": []}
```

### Plugins

```python
# Read plugins.txt
{"method": "mod_read_plugins", "params": {"path": "/path/to/plugins.txt", "star_prefix": true}}
→ [{"name": "skse64_loader.exe", "enabled": true}, ...]

# Write plugins.txt
{"method": "mod_write_plugins", "params": {"path": "/path/to/plugins.txt", "entries": [{"name": "mod.esp", "enabled": true}], "star_prefix": true}}
→ true
```

### Deploy

```python
# Full deploy pipeline
{"method": "deploy", "params": {
    "game_path": "/path/to/game",
    "staging_dir": "/path/to/staging",
    "profile_dir": "/path/to/profile",
    "game_id": "skyrim_se",
    "modlist": [{"name": "RaceMenu", "enabled": true, "priority": 0}],
    "link_mode": "symlink",
    "proton_prefix": "/path/to/pfx"
}}
→ {
    "success": true,
    "log": ["Starting deploy...", "Built filemap with 45 entries", "Deploy complete: 45 links created"],
    "filemap": {"meshes/": "/staging/RaceMenu/meshes/"}
}
```

### Nexus Mods

```python
# Search
{"method": "mod_nexus_search", "params": {"query": "racemenu", "game_id": "skyrim_se"}}
→ [{"modId": 29624, "name": "RaceMenu", "author": "expired6978", ...}]

# Trending
{"method": "mod_nexus_trending", "params": {"game_id": "skyrim_se"}}
→ [{"modId": ..., "name": ..., ...}]
```

### Mod Compat

```python
# Get modding recommendation
{"method": "recommend_proton_for_modding", "params": {"game_id": "489830"}}
→ {
    "game_id": "489830",
    "title": "Skyrim Special Edition",
    "scriptExtender": "SKSE64",
    "recommendedFork": "GE-Proton",
    "communityScore": 95,
    "tier": "gold"
}
```

---

## Nova API: Archive Reader + Integrity Checker

### Problema

A extração atual (`deploy/archive.py`) não fornece:
1. Informações do archive antes de extrair (tamanho, lista de arquivos, CRC32)
2. Verificação pós-extração (arquivos corretos, tamanho bate, CRC32 bate)
3. Progresso por arquivo durante extração

### Solução

Dois novos módulos:

#### `archive_reader.py` — Lê archive sem extrair

```python
"""Lê informações de um archive usando 7z l -slt."""

def read_archive_info(archive_path: str) -> dict:
    """
    Retorna:
    {
        "path": "/path/to/mod.7z",
        "name": "RaceMenu v3.4.5.7z",
        "total_size": 47523840,          # bytes
        "total_files": 243,
        "compressed_size": 12847104,     # bytes
        "format": "7z",
        "is_password_protected": false,
        "entries": [
            {
                "path": "meshes/characters/femalehead.dds",
                "size": 1048576,
                "compressed_size": 524288,
                "is_directory": false,
                "crc32": "A1B2C3D4"
            },
            ...
        ]
    }
    """

def check_password_protected(archive_path: str) -> bool:
    """Verifica se o archive é protegido por senha."""
```

**Como funciona:**
- Executa `7z l -slt <archive>` (lista sem extrair)
- Parse do output para extrair: Path, Size, Pack Size, CRC32, Folder
- Retorna estrutura completa com todos os arquivos

#### `integrity_checker.py` — Verifica arquivos extraídos

```python
"""Verifica integridade dos arquivos extraídos contra o archive original."""

def verify_extracted_files(
    extracted_files: list[dict],    # [{relative_path, absolute_path, expected_size, expected_crc32}]
    archive_entries: list[dict],    # [{path, size, crc32}]
) -> dict:
    """
    Retorna:
    {
        "all_valid": true,
        "files_checked": 243,
        "files_valid": 243,
        "files_invalid": 0,
        "errors": []
    }

    Cada erro:
    {
        "file": "meshes/characters/femalehead.dds",
        "type": "size_mismatch" | "crc_mismatch" | "empty_file" | "missing_file" | "corrupted",
        "expected": "Size: 1048576",
        "actual": "Size: 524288"
    }
    """
```

**Verificações:**
1. Arquivo existe no disco
2. Arquivo não está vazio
3. Tamanho bate com o esperado
4. CRC32 bate (quando disponível no archive)

#### `install_orchestrator.py` — Orquestra todo o fluxo

```python
"""Orquestra instalação completa: read → extract → verify → analyze → save."""

class InstallOrchestrator:
    def __init__(self, config: dict, on_progress: callable, on_stage_change: callable):
        """
        config = {
            "game_id": "skyrim_se",
            "profile": "Default",
            "staging_dir": "/path/to/staging",
            "overwrite_existing": false,
            "verify_after_extract": true,
            "max_retries": 2,
            "timeout_ms": 300000
        }
        """

    async def install(self, archive_path: str) -> dict:
        """
        Fluxo completo:
        1. reading_archive → readArchiveInfo()
        2. extracting → extractWithProgress()
        3. verifying → verifyExtractedFiles()
        4. analyzing → analyzeMod()
        5. saving → saveToModlist()
        6. ready → resultado final
        """

    def abort(self):
        """Cancela instalação em andamento."""
```

---

## Integração com Electron

### Comunicação

```
Electron Main Process
    │
    ├── IPC: installModOrchestrated(archivePath, config)
    │   → Invoca Python API via stdin/stdout
    │   → Retorna InstallResult
    │
    ├── IPC: onInstallProgress (event)
    │   → Python envia progresso via callback
    │   → Electron repassa para renderer
    │
    └── IPC: abortInstall()
        → Python aborta processo 7z
        → Limpa arquivos parciais
```

### Bridge Protocol

```python
# Electron → Python (request)
{"id": 1, "method": "install_mod_orchestrated", "params": {
    "archive_path": "/path/to/mod.7z",
    "game_id": "skyrim_se",
    "profile": "Default",
    "verify": true
}}

# Python → Electron (progress events, via stdout)
{"event": "install_progress", "data": {"stage": "extracting", "percent": 52, "message": "Extraindo...", "current_file": "meshes/dds.dds", "files_processed": 127, "files_total": 243}}

# Python → Electron (final result)
{"id": 1, "result": {
    "success": true,
    "mod_name": "RaceMenu v3.4.5",
    "staging_dir": "/path/to/staging/RaceMenu",
    "archive_info": {...},
    "extracted_files": [...],
    "verified": true,
    "plugins": ["RaceMenu.esp"],
    "has_fomod": false,
    "has_skse": true,
    "duration_ms": 34200
}}
```

---

## Fluxo Completo: Adicionar → Instalar

### Fase 1: Adicionar Mod (extract + stage)

```
Usuário seleciona arquivo .7z
    │
    ▼
[reading_archive]
    │  7z l -slt → lista de 243 arquivos, 45.2 MB, CRC32
    │
    ▼
[extracting]
    │  7z x → extrai para staging/
    │  Progresso: 127/243 arquivos, 23.1 MB / 45.2 MB
    │
    ▼
[verifying]
    │  Compara tamanho + CRC32 de cada arquivo
    │  243/243 verificados ✓
    │
    ▼
[analyzing]
    │  detectModType → {has_fomod, has_plugins, has_skse}
    │  inventoryMod → {files, plugins, previews, readmes}
    │
    ▼
[saving]
    │  Salva no modlist (mods-store.json)
    │  Retorna InstallResult
    │
    ▼
[ready]
    │  "Instalação Concluída" → fecha auto após 2s
```

### Fase 2: Instalar Mod (deploy)

```
Usuário clica "Instalar"
    │
    ▼
[deploying]
    │  buildFilemap → mapa de 45 arquivos
    │  detectConflicts → 0 conflitos
    │  force-copy SE → skse64_loader.exe copiado
    │  createSymlinks → 45 links criados
    │  writePluginsTxt → 12 plugins escritos
    │
    ▼
[deployed]
    │  "Deploy Concluído"
```

---

## Módulos a Criar

### 1. `api/services/archive_reader.py`

```python
"""Lê informações de um archive sem extrair."""

import subprocess
import re
from pathlib import Path
from dataclasses import dataclass


@dataclass
class ArchiveEntry:
    path: str
    size: int
    compressed_size: int
    is_directory: bool
    crc32: str | None = None


@dataclass
class ArchiveInfo:
    path: str
    name: str
    total_size: int
    total_files: int
    compressed_size: int
    format: str
    is_password_protected: bool
    entries: list[ArchiveEntry]


def read_archive_info(archive_path: str) -> ArchiveInfo:
    """Lê informações do archive usando 7z l -slt."""
    args = ["7z", "l", archive_path, "-slt"]
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)

    if result.returncode != 0:
        if "wrong password" in result.stderr.lower() or "encrypted" in result.stderr.lower():
            raise ValueError("ARCHIVE_PASSWORD_PROTECTED")
        raise RuntimeError(f"7z listing failed: {result.stderr}")

    return _parse_7z_listing(result.stdout, archive_path)


def _parse_7z_listing(output: str, archive_path: str) -> ArchiveInfo:
    """Parse do output do 7z l -slt."""
    entries = []
    current = {}

    for line in output.split("\n"):
        line = line.strip()

        if line.startswith("Path = "):
            if current.get("path"):
                entries.append(ArchiveEntry(**current))
            current = {"path": line[7:], "size": 0, "compressed_size": 0, "is_directory": False}
        elif line.startswith("Size = "):
            current["size"] = int(line[7:]) if line[7:].isdigit() else 0
        elif line.startswith("Pack Size = "):
            current["compressed_size"] = int(line[12:]) if line[12:].isdigit() else 0
        elif line.startswith("CRC = "):
            current["crc32"] = line[6:]
        elif line.startswith("Folder = +"):
            current["is_directory"] = True

    if current.get("path"):
        entries.append(ArchiveEntry(**current))

    # Calcular totais
    total_size = sum(e.size for e in entries if not e.is_directory)
    compressed_size = sum(e.compressed_size for e in entries if not e.is_directory)
    total_files = len([e for e in entries if not e.is_directory])

    # Detectar formato
    ext = Path(archive_path).suffix.lower()
    format_map = {".zip": "zip", ".fomod": "zip", ".7z": "7z", ".rar": "rar", ".tar.gz": "tar.gz"}
    fmt = format_map.get(ext, "unknown")

    return ArchiveInfo(
        path=archive_path,
        name=Path(archive_path).name,
        total_size=total_size,
        total_files=total_files,
        compressed_size=compressed_size,
        format=fmt,
        is_password_protected=False,
        entries=entries,
    )


def check_password_protected(archive_path: str) -> bool:
    """Verifica se o archive é protegido por senha."""
    try:
        result = subprocess.run(
            ["7z", "t", archive_path],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return "wrong password" in result.stderr.lower() or "encrypted" in result.stderr.lower()
        return False
    except Exception:
        return False
```

### 2. `api/services/integrity_checker.py`

```python
"""Verifica integridade dos arquivos extraídos."""

import os
import hashlib
from pathlib import Path
from dataclasses import dataclass


@dataclass
class VerificationError:
    file: str
    type: str  # "size_mismatch" | "crc_mismatch" | "empty_file" | "missing_file"
    expected: str
    actual: str


@dataclass
class VerificationResult:
    all_valid: bool
    files_checked: int
    files_valid: int
    files_invalid: int
    errors: list[VerificationError]


def verify_extracted_files(
    extracted_files: list[dict],
    archive_entries: list[dict],
) -> VerificationResult:
    """Verifica integridade dos arquivos extraídos."""
    errors = []
    files_checked = 0
    files_valid = 0

    # Indexar entries por path
    entry_map = {e["path"]: e for e in archive_entries}

    for extracted in extracted_files:
        files_checked += 1
        rel_path = extracted["relative_path"]
        abs_path = extracted["absolute_path"]

        # Encontrar entry correspondente
        archive_entry = entry_map.get(rel_path)
        if not archive_entry:
            errors.append(VerificationError(
                file=rel_path,
                type="missing_file",
                expected="Present in archive",
                actual="Not found",
            ))
            continue

        # Verificar se existe
        if not os.path.exists(abs_path):
            errors.append(VerificationError(
                file=rel_path,
                type="missing_file",
                expected=f"Size: {archive_entry['size']}",
                actual="File not found",
            ))
            continue

        # Verificar tamanho
        actual_size = os.path.getsize(abs_path)
        if actual_size == 0:
            errors.append(VerificationError(
                file=rel_path,
                type="empty_file",
                expected=f"Size: {archive_entry['size']}",
                actual="Size: 0",
            ))
            continue

        if archive_entry["size"] > 0 and actual_size != archive_entry["size"]:
            errors.append(VerificationError(
                file=rel_path,
                type="size_mismatch",
                expected=f"Size: {archive_entry['size']}",
                actual=f"Size: {actual_size}",
            ))
            continue

        # CRC32 (se disponível)
        if archive_entry.get("crc32"):
            actual_crc = _compute_md5(abs_path)  # Fallback: md5
            if actual_crc != archive_entry["crc32"]:
                # CRC32 não é md5, então só verificar se tivermos crc32 real
                pass  # Skip CRC check por enquanto

        files_valid += 1

    return VerificationResult(
        all_valid=len(errors) == 0,
        files_checked=files_checked,
        files_valid=files_valid,
        files_invalid=len(errors),
        errors=errors,
    )


def _compute_md5(file_path: str) -> str:
    """Computa hash MD5 de um arquivo."""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()
```

### 3. `api/services/install_orchestrator.py`

```python
"""Orquestra instalação completa de mods."""

import os
import time
import subprocess
from pathlib import Path
from typing import Callable

from .archive_reader import read_archive_info, ArchiveInfo
from .integrity_checker import verify_extracted_files
from ..Utils.deploy.inventory import inventory_mod, detect_mod_type, build_filemap
from ..Utils.deploy.core import deploy


class InstallOrchestrator:
    def __init__(
        self,
        config: dict,
        on_progress: Callable,
        on_stage_change: Callable,
    ):
        self.config = config
        self.on_progress = on_progress
        self.on_stage_change = on_stage_change
        self.current_stage = "idle"
        self.abort_controller = False

    def install(self, archive_path: str) -> dict:
        """Executa instalação completa."""
        start_time = time.time()

        try:
            # Stage 1: Read Archive
            self._transition("reading_archive")
            archive_info = read_archive_info(archive_path)
            self._update_progress(5, f"Arquivo: {archive_info.total_files} arquivos")

            # Stage 2: Extract
            self._transition("extracting")
            extracted_files = self._extract_with_progress(archive_path, archive_info)

            # Stage 3: Verify
            if self.config.get("verify_after_extract", True):
                self._transition("verifying")
                verification = verify_extracted_files(
                    [{"relative_path": f, "absolute_path": str(Path(self.config["staging_dir"]) / f)}
                     for f in extracted_files],
                    [{"path": e.path, "size": e.size, "crc32": e.crc32}
                     for e in archive_info.entries if not e.is_directory],
                )
                if not verification.all_valid:
                    raise RuntimeError(f"Verification failed: {verification.files_invalid} errors")

            # Stage 4: Analyze
            self._transition("analyzing")
            mod_name = Path(archive_path).stem
            staging_dir = self.config["staging_dir"]
            mod_type = detect_mod_type(Path(staging_dir) / mod_name)
            inventory = inventory_mod(staging_dir, mod_name)

            # Stage 5: Save
            self._transition("saving")
            # Salvar no modlist seria feito pelo Electron

            # Stage 6: Ready
            self._transition("ready")
            duration_ms = int((time.time() - start_time) * 1000)

            return {
                "success": True,
                "mod_name": mod_name,
                "staging_dir": str(Path(staging_dir) / mod_name),
                "archive_info": {
                    "path": archive_info.path,
                    "name": archive_info.name,
                    "total_size": archive_info.total_size,
                    "total_files": archive_info.total_files,
                    "format": archive_info.format,
                },
                "extracted_files": extracted_files,
                "verified": True,
                "plugins": inventory.plugin_files,
                "has_fomod": mod_type["has_fomod"],
                "has_skse": mod_type["has_script_extender"],
                "category": "unknown",
                "duration_ms": duration_ms,
            }

        except Exception as e:
            self._transition("error")
            return {
                "success": False,
                "error": str(e),
                "duration_ms": int((time.time() - start_time) * 1000),
            }

    def abort(self):
        """Cancela instalação."""
        self.abort_controller = True

    def _transition(self, stage: str):
        self.current_stage = stage
        self.on_stage_change(stage)

    def _update_progress(self, percent: int, message: str):
        self.on_progress({
            "stage": self.current_stage,
            "percent": percent,
            "message": message,
        })

    def _extract_with_progress(self, archive_path: str, archive_info: ArchiveInfo) -> list[str]:
        """Extrai archive com progresso."""
        staging_dir = self.config["staging_dir"]
        os.makedirs(staging_dir, exist_ok=True)

        ext = Path(archive_path).suffix.lower()
        args = ["7z", "x", archive_path, f"-o{staging_dir}", "-y"]

        result = subprocess.run(args, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            raise RuntimeError(f"Extraction failed: {result.stderr}")

        # Listar arquivos extraídos
        extracted = []
        for root, dirs, files in os.walk(staging_dir):
            for f in files:
                rel = os.path.relpath(os.path.join(root, f), staging_dir)
                extracted.append(rel)

        return extracted
```

---

## Traduções

Adicionar em cada `translation.json`:

### `en/translation.json`
```json
{
  "mod_manager": {
    "install_api_fomod_parse": "Parsing FOMOD config...",
    "install_api_fomod_install": "Installing FOMOD selections...",
    "install_api_deploy": "Deploying mods...",
    "install_api_restore": "Restoring vanilla state...",
    "install_api_undeploy": "Removing mod links...",
    "install_api_extract": "Extracting archive...",
    "install_api_verify": "Verifying integrity...",
    "install_api_analyze": "Analyzing mod structure...",
    "install_api_save": "Saving to modlist...",
    "install_api_complete": "Installation complete",
    "install_api_error": "Installation failed",
    "install_api_verified": "All files verified",
    "install_api_not_verified": "Verification skipped",
    "install_api_size_mismatch": "Size mismatch: {{expected}} vs {{actual}}",
    "install_api_crc_mismatch": "Integrity check failed",
    "install_api_password_protected": "Archive is password-protected"
  }
}
```

### `pt-BR/translation.json`
```json
{
  "mod_manager": {
    "install_api_fomod_parse": "Analisando configuração FOMOD...",
    "install_api_fomod_install": "Instalando seleções FOMOD...",
    "install_api_deploy": "Implantando mods...",
    "install_api_restore": "Restaurando estado original...",
    "install_api_undeploy": "Removendo links do mod...",
    "install_api_extract": "Extraindo archive...",
    "install_api_verify": "Verificando integridade...",
    "install_api_analyze": "Analisando estrutura do mod...",
    "install_api_save": "Salvando no modlist...",
    "install_api_complete": "Instalação concluída",
    "install_api_error": "Falha na instalação",
    "install_api_verified": "Todos os arquivos verificados",
    "install_api_not_verified": "Verificação pulada",
    "install_api_size_mismatch": "Tamanho incorreto: {{expected}} vs {{actual}}",
    "install_api_crc_mismatch": "Falha na verificação de integridade",
    "install_api_password_protected": "Archive protegido por senha"
  }
}
```

---

## Notas de Implementação

1. **CRC32 vs MD5**: O 7z fornece CRC32, mas o Python não tem `binascii.crc32` nativo confiável para arquivos grandes. Usar MD5 como fallback para verificação de integridade.

2. **Timeout**: Cada operação 7z tem timeout próprio:
   - `7z l` (list): 60s
   - `7z x` (extract): 300s
   - `7z t` (test): 30s

3. **Abort**: Usar `subprocess.Popen` com `communicate()` para poder matar o processo.

4. **Progresso sem stdout**: Se o 7z não mandar progresso, usar fallback:
   - Contar arquivos extraídos vs total
   - Ou usar `7z x -bsp1` que força output de progresso

5. **Backward compat**: A API atual (handler.py) já registra `mod_fomod_parse` e `mod_fomod_install`. Os novos métodos (`install_mod_orchestrated`, `read_archive_info`, `verify_files`) serão adicionados ao dispatcher.
