"""
Importa do módulo unificado tools/prefix/python/prefix/.
"""
import sys, os
_prefix_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), *([".."] * 7), "tools", "prefix", "python")
)
if _prefix_path not in sys.path:
    sys.path.insert(0, _prefix_path)

from prefix.core import create_prefix, delete_prefix  # noqa: E402,F401
from prefix.makaitricks import install_recommended_dlls, run_makaitricks_verbs  # noqa: E402,F401

__all__ = ["create_prefix", "delete_prefix", "install_recommended_dlls", "run_makaitricks_verbs"]
