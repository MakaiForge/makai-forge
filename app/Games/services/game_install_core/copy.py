"""game_install_core.copy — cópia verificada do jogo para o prefixo.

Cópia SEGURA: grava numa pasta temporária, verifica contagem + SHA256 lá, e
SÓ ENTÃO substitui o destino (troca atômica). NUNCA apaga o jogo existente
se a cópia nova falhar — o antigo permanece intacto.
"""

import os
import shutil

from ._util import compute_hashes, resolve_actual_prefix, total_bytes, walk_dir


def copy_to_prefix(source_path: str, prefix_path: str,
                   progress_callback=None) -> dict:
    """
    Copia pasta source_path para drive_c/<folderName>/ com verificação SHA256.

    progress_callback(percent: int) — opcional, monotônico (0-100).
    Fases: pré-hash 0-5%, cópia 5-90%, pós-hash 90-100%.
    """
    source_path = os.path.abspath(source_path)
    prefix_path = os.path.expanduser(prefix_path)
    actual = resolve_actual_prefix(prefix_path)
    drive_c = os.path.join(actual, "drive_c")
    folder_name = os.path.basename(source_path.rstrip("/\\"))
    dest_path = os.path.join(drive_c, folder_name)
    tmp_path = dest_path + ".tmp-copy"

    if not os.path.isdir(source_path):
        return {"success": False, "error": "source_path is not a directory",
                "dest_path": None, "files_count": 0}

    # Lista arquivos ANTES de mexer no destino
    all_files = walk_dir(source_path)
    total = len(all_files)

    # Fonte vazia → NUNCA falso-sucesso: não mexe no que já existe
    if total == 0:
        return {"success": False,
                "error": "Fonte vazia — nada a copiar",
                "dest_path": dest_path, "files_count": 0, "hashes_ok": False}

    if total > 50000:
        return {"success": False, "error": f"Pasta com {total} arquivos parece não ser um jogo",
                "dest_path": None, "files_count": total}

    # Bytes totais para progresso realista
    bytes_total = total_bytes(all_files)
    if bytes_total == 0:
        bytes_total = total  # fallback: cada arquivo = 1 byte

    # Fase 1: SHA256 pré-cópia (0-5%)
    source_hashes = compute_hashes(all_files, source_path,
                                   progress_callback, 0, 5)

    # Fase 2: Cópia em lotes para a pasta TEMPORÁRIA (5-90%)
    if os.path.exists(tmp_path):
        shutil.rmtree(tmp_path, ignore_errors=True)
    os.makedirs(tmp_path, exist_ok=True)

    batch_size = 50
    copied_bytes = 0
    errors: list[str] = []
    for i in range(0, total, batch_size):
        batch = all_files[i:i + batch_size]
        for src_file in batch:
            rel = os.path.relpath(src_file, source_path)
            dest_file = os.path.join(tmp_path, rel)
            try:
                os.makedirs(os.path.dirname(dest_file), exist_ok=True)
                shutil.copy2(src_file, dest_file)
                try:
                    copied_bytes += os.path.getsize(src_file)
                except OSError:
                    copied_bytes += 1
            except OSError as exc:
                # NUNCA engolir erro de cópia — reportar e abortar
                errors.append(f"{rel}: {exc}")
                if len(errors) >= 20:
                    break
        if progress_callback and bytes_total > 0:
            pct = 5 + int(copied_bytes / bytes_total * 85)
            progress_callback(min(90, pct))
        if errors:
            break

    if errors:
        shutil.rmtree(tmp_path, ignore_errors=True)  # limpa só o temporário
        return {"success": False,
                "error": f"Falha ao copiar: {'; '.join(errors[:5])}",
                "dest_path": dest_path, "files_count": 0, "hashes_ok": False,
                "mismatches": errors[:10]}

    # Verificação pós-cópia: contagem (no temporário)
    dest_files = walk_dir(tmp_path)
    if len(dest_files) != total:
        shutil.rmtree(tmp_path, ignore_errors=True)
        return {"success": False,
                "error": f"Count mismatch: source {total}, dest {len(dest_files)}",
                "dest_path": dest_path, "files_count": 0, "hashes_ok": False}

    # Fase 3: SHA256 pós-cópia + comparação (90-100%)
    dest_hashes = compute_hashes(dest_files, tmp_path,
                                 progress_callback, 90, 10)

    mismatches = []
    for rel, expected in source_hashes.items():
        actual = dest_hashes.get(rel)
        if not actual:
            mismatches.append(f"{rel}: missing in dest")
        elif actual != expected:
            mismatches.append(f"{rel}: hash mismatch")

    if mismatches:
        shutil.rmtree(tmp_path, ignore_errors=True)
        return {"success": False,
                "error": f"{len(mismatches)} arquivo(s) com hash divergente após a cópia",
                "dest_path": dest_path, "files_count": 0, "hashes_ok": False,
                "mismatches": mismatches[:10]}

    # Tudo verificado → troca atômica: só agora mexe no destino real
    if os.path.exists(dest_path):
        shutil.rmtree(dest_path, ignore_errors=True)
    os.rename(tmp_path, dest_path)

    if progress_callback:
        progress_callback(100)

    return {
        "success": True,
        "dest_path": dest_path,
        "files_count": total,
        "hashes_ok": True,
        "mismatches": [],
    }
