"""
Catálogo e gerenciamento de DLLs para Wine/Proton.

Baseado no prefixo_dlls.json da API, este módulo fornece:
- Lista de DLLs disponíveis com descrição e comando de instalação
- Recomendação de DLLs por tipo de jogo (CEF, Unity, Unreal, etc.)
- Mapeamento de dependências entre DLLs e launch args

DLLs mais comuns:
- d3dcompiler_47: Compilador de shaders HLSL. Essencial pra CEF/login e Unity.
- mfplat: Windows Media Foundation. Cutscenes em vídeo.
- vcrun2022: Visual C++ Redistributable. Runtime básico.
- xact: DirectX Audio. Áudio de jogos.
- d3dx9: Direct3D 9 auxiliar. Jogos DX9 antigos.
- dotnet48: .NET Framework. Launchers e modding tools.

Referência: prefixo_dlls.json contém o catálogo completo com
descrições técnicas detalhadas de cada DLL.
"""

import json
import os

from ..db.connection import _get_db, _PROTON_API_DIR

_cache = {}


def _load_dlls() -> dict:
    """Carrega o catálogo de DLLs: tenta SQLite primeiro, fallback JSON."""
    if "dlls" in _cache:
        return _cache["dlls"]

    # Try SQLite
    db = _get_db()
    if db is not None:
        try:
            cursor = db.execute("SELECT * FROM dll_catalog")
            rows = cursor.fetchall()
            if rows:
                dlls = {}
                for row in rows:
                    r = dict(row)
                    dll_id = r.pop("dll_id")
                    dlls[dll_id] = {
                        "dll": r.get("dll_name", ""),
                        "funcao_geral": r.get("funcao_geral", ""),
                        "impacto": r.get("impacto", "MÉDIO"),
                        "winetricks": r.get("winetricks", ""),
                        "protontricks": r.get("protontricks", ""),
                        "override_necessario": r.get("override_necessario", ""),
                        "ja_incluso_proton": r.get("ja_incluso_proton", ""),
                        "jogos_tipo": json.loads(r.get("jogos_tipo", "[]")),
                    }
                    if r.get("descricao"):
                        dlls[dll_id]["descricao"] = r["descricao"]
                data = {"dlls": dlls}
                _cache["dlls"] = data
                return data
        except Exception:
            pass

    # Fallback JSON
    filepath = os.path.join(_PROTON_API_DIR, "prefixo_dlls.json")
    if not os.path.exists(filepath):
        return {"dlls": {}, "rede_dependencias": {}}

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    _cache["dlls"] = data
    return data


def get_all_dlls() -> list[dict]:
    """Retorna lista de todas as DLLs disponíveis no catálogo.

    Cada entrada contém:
    - id: identificador único
    - dll: nome do arquivo DLL
    - descricao: função geral
    - winetricks: comando pra instalar via winetricks
    - protontricks: comando pra instalar via protontricks
    - impacto: ALTO/MÉDIO/BAIXO/CRÍTICO
    - override: WINEDLLOVERRIDES necessário
    - jogos_tipo: tipos de jogo que se beneficiam

    Retorna:
        Lista de DLLs ordenadas por impacto
    """
    dlls_data = _load_dlls()
    dlls = dlls_data.get("dlls", {})

    impact_order = {"CRÍTICO": 0, "ALTO": 1, "MÉDIO": 2, "MÉDIO-ALTO": 1, "BAIXO": 3}
    result = []
    for dll_id, dll_info in dlls.items():
        result.append({
            "id": dll_id,
            "dll": dll_info.get("dll", ""),
            "descricao": dll_info.get("funcao_geral", ""),
            "winetricks": dll_info.get("winetricks", ""),
            "protontricks": dll_info.get("protontricks", ""),
            "impacto": dll_info.get("impacto", "MÉDIO"),
            "override": dll_info.get("override_necessario", ""),
            "jogos_tipo": dll_info.get("jogos_tipo", []),
            "ja_incluso_proton": dll_info.get("ja_incluso_proton", ""),
        })

    return sorted(result, key=lambda x: impact_order.get(x["impacto"], 99))


def get_recommended_dlls(game_id: str) -> dict:
    """Retorna DLLs recomendadas pra um jogo específico.

    Como não temos mapeamento por jogo individual ainda,
    retorna as DLLs essenciais e uma lista categorizada.

    Args:
        game_id: ID do jogo (para uso futuro com mapeamento específico)

    Retorna:
        Dict com dlls_recomendadas, essenciais, e diagnostico
    """
    result = {
        "game_id": game_id,
        "essenciais": [
            {
                "id": "vcrun2022",
                "dll": "vcruntime140.dll, vcruntime140_1.dll, msvcp140.dll",
                "impacto": "CRÍTICO",
                "winetricks": "winetricks vcrun2022",
                "descricao": "Visual C++ Redistributable — runtime básico pra todo jogo",
                "override": "Geralmente não necessário — o Proton já inclui",
            },
            {
                "id": "d3dcompiler_47",
                "dll": "d3dcompiler_47.dll",
                "impacto": "ALTO",
                "winetricks": "winetricks d3dcompiler_47",
                "descricao": "Compilador de shaders HLSL — essencial pra CEF/login e Unity",
                "override": "WINEDLLOVERRIDES=\"d3dcompiler_47=n,b\"",
            },
        ],
        "opcionais": [
            {
                "id": "mfplat",
                "dll": "mfplat.dll, mf.dll, mfreadwrite.dll",
                "impacto": "ALTO (cutscenes)",
                "winetricks": "winetricks mf",
                "descricao": "Windows Media Foundation — cutscenes em vídeo",
            },
            {
                "id": "xact",
                "dll": "XAudio2_7.dll, xactengine3_*.dll",
                "impacto": "MÉDIO (áudio)",
                "winetricks": "winetricks xact",
                "descricao": "DirectX Audio — elimina estalos e áudio ausente",
            },
            {
                "id": "d3dx9",
                "dll": "d3dx9_43.dll",
                "impacto": "MÉDIO (jogos DX9)",
                "winetricks": "winetricks d3dx9",
                "descricao": "Direct3D 9 auxiliar — jogos DX9 antigos (2004-2012)",
            },
        ],
        "diagnostico": {
            "fluxo": [
                "1. winetricks vcrun2022 (sempre, é básico)",
                "2. winetricks d3dcompiler_47 (CEF/login/tela branca)",
                "3. winetricks mf (cutscenes quebradas)",
                "4. winetricks xact (estalos de áudio)",
            ],
            "problema_comum": {
                "sintoma": "Tela branca/preta no login (CEF)",
                "solucao": "WINEDLLOVERRIDES=\"d3dcompiler_47=n,b\" + winetricks d3dcompiler_47",
                "alternativa": "PROTON_ENABLE_WAYLAND=0 (força X11, CEF funciona melhor)",
            },
        },
    }

    return result


def get_winetricks_command(dll_ids: list[str]) -> str:
    """Monta comando winetricks pra instalar múltiplas DLLs.

    Args:
        dll_ids: Lista de IDs de DLL (ex: ["vcrun2022", "d3dcompiler_47"])

    Retorna:
        Comando completo pra instalar as DLLs (ex: "winetricks vcrun2022 d3dcompiler_47")
    """
    if not dll_ids:
        return ""

    dlls_data = _load_dlls()
    dlls = dlls_data.get("dlls", {})

    verbs = []
    for dll_id in dll_ids:
        if dll_id in dlls:
            winetricks_cmd = dlls[dll_id].get("winetricks", "")
            if winetricks_cmd:
                verb = winetricks_cmd.replace("winetricks ", "")
                verbs.append(verb)
        else:
            verbs.append(dll_id)

    return f"winetricks {' '.join(set(verbs))}"
