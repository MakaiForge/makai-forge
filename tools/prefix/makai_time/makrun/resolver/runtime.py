import os
import re
import shutil
import tarfile
import zipfile
from pathlib import Path
from makrun import RUNTIME_VERSIONS, DEFAULT_RUNTIME
from makrun.consts import CACHE_DIR, RUNTIME_DIR, RUNTIME_DOWNLOAD_URLS
from makrun.log import log

RuntimeVersion = tuple[str, str, str]


def resolve_runtime_version(proton_path: Path | None) -> RuntimeVersion:
    if not proton_path or not proton_path.is_dir():
        log.debug("No PROTONPATH, defaulting to %s", DEFAULT_RUNTIME[1])
        return DEFAULT_RUNTIME

    manifest = proton_path / "toolmanifest.vdf"
    if not manifest.is_file():
        log.debug("No toolmanifest.vdf, defaulting to %s", DEFAULT_RUNTIME[1])
        return DEFAULT_RUNTIME

    appid = _parse_manifest(manifest)
    if not appid:
        return DEFAULT_RUNTIME

    for version in RUNTIME_VERSIONS:
        if version[2] == appid:
            log.debug("Resolved runtime: %s (appid %s)", version[1], appid)
            return version

    log.debug("Unknown appid %s, defaulting to %s", appid, DEFAULT_RUNTIME[1])
    return DEFAULT_RUNTIME


def _parse_manifest(path: Path) -> str | None:
    key = "require_tool_appid"
    try:
        with path.open(encoding="utf-8") as f:
            for line in f:
                if key not in line:
                    continue
                m = re.search(r'"require_tool_appid"\s+"(\d+)"', line)
                if m:
                    return m.group(1)
    except (OSError, UnicodeDecodeError):
        pass
    return None


def get_runtime_path(version: RuntimeVersion) -> Path:
    return RUNTIME_DIR / version[0] / version[1]


def ensure_runtime(version: RuntimeVersion) -> Path:
    """Garante que o runtime existe no cache. Baixa + extrai se necessário."""
    runtime_path = get_runtime_path(version)
    _runtime_name = version[1]

    if runtime_path.is_dir():
        log.debug("Runtime ja existe: %s", runtime_path)
        return runtime_path

    log.info("Runtime %s nao encontrado em %s", _runtime_name, runtime_path)
    log.info("Baixando runtime... (%d URLs configuradas)", len(RUNTIME_DOWNLOAD_URLS))

    runtime_path.parent.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    archive_name = f"{_runtime_name}.tar.gz"
    archive_path = CACHE_DIR / archive_name

    for idx, url in enumerate(RUNTIME_DOWNLOAD_URLS):
        try:
            log.info("Tentando [%d/%d]: %s", idx + 1, len(RUNTIME_DOWNLOAD_URLS), url)
            _download_runtime(url, archive_path)
            log.info("Download concluido: %s", archive_path)
            _extract_runtime(archive_path, runtime_path.parent, _runtime_name)
            log.info("Runtime extraido em: %s", runtime_path)
            archive_path.unlink(missing_ok=True)
            return runtime_path
        except Exception as e:
            log.warning("Falha na URL %d: %s", idx + 1, e)
            archive_path.unlink(missing_ok=True)

    raise RuntimeError(
        f"Nao foi possivel baixar o runtime {_runtime_name}. "
        f"Todas as {len(RUNTIME_DOWNLOAD_URLS)} URLs falharam."
    )


def _download_runtime(url: str, dest: Path) -> None:
    import urllib.request

    urllib.request.urlretrieve(url, dest)


def _extract_runtime(archive_path: Path, dest_dir: Path, runtime_name: str) -> None:
    """Extrai o runtime. Suporta .tar.gz e .zip.
    
    O arquivo pode conter a pasta makai-time-platform-1.0/ na raiz
    ou os arquivos soltos. Detecta e ajusta.
    """
    dest = dest_dir / runtime_name

    if dest.is_dir():
        shutil.rmtree(dest)

    if str(archive_path).endswith(".tar.gz"):
        _extract_tar_gz(archive_path, dest_dir)
    elif str(archive_path).endswith(".zip"):
        _extract_zip(archive_path, dest_dir)
    else:
        raise RuntimeError(f"Formato de arquivo nao suportado: {archive_path}")

    # Se extraiu para uma subpasta com o nome do runtime, move os arquivos
    extracted = dest_dir / runtime_name
    if not extracted.is_dir():
        # Procura a pasta correta
        for entry in sorted(dest_dir.iterdir()):
            if entry.is_dir() and entry.name != runtime_name:
                entry.rename(dest)
                break
        else:
            raise RuntimeError(f"Nao foi possivel encontrar a pasta do runtime apos extracao: {dest_dir}")


def _extract_tar_gz(archive_path: Path, dest_dir: Path) -> None:
    with tarfile.open(archive_path, "r:gz") as tar:
        tar.extractall(dest_dir)


def _extract_zip(archive_path: Path, dest_dir: Path) -> None:
    with zipfile.ZipFile(archive_path, "r") as zf:
        zf.extractall(dest_dir)
