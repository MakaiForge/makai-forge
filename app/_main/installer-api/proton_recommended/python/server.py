#!/usr/bin/env python3
"""
DEPRECATED — Use tools/Mods_manager/core/server.py.

Este arquivo é mantido como compatibilidade reversa.
Redireciona para o servidor RPC unificado.
"""

import os
import sys
import warnings

warnings.warn(
    "proton_recommended/python/server.py is deprecated. Use tools/Mods_manager/core/server.py",
    DeprecationWarning,
)

_server_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))),
    "tools", "Mods_manager", "core", "server.py",
)

if os.path.isfile(_server_path):
    _globals = {"__name__": "__main__", "__file__": _server_path}
    with open(_server_path) as _f:
        exec(compile(_f.read(), _server_path, "exec"), _globals)
else:
    import json
    print(json.dumps({"error": {"code": "deprecated", "message": "Use Mods_manager/core/server.py"}}))
    sys.exit(1)
