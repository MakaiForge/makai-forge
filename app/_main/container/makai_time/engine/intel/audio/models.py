"""Modelos de dados para análise de áudio."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AudioEvidence:
    source: str
    detail: str
    confidence: float


@dataclass
class AudioResult:
    api: str | None = None
    middleware: str | None = None
    backend: str | None = None
    confidence: float = 0.0
    evidence: list[AudioEvidence] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    dlls_detected: list[str] = field(default_factory=list)
    apis_detected: list[str] = field(default_factory=list)
    preferred_driver: str | None = None
    needs_dsoal: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "api": self.api,
            "middleware": self.middleware,
            "backend": self.backend,
            "confidence": self.confidence,
            "evidence": [{"source": e.source, "detail": e.detail, "confidence": e.confidence} for e in self.evidence],
            "recommendations": self.recommendations,
            "dlls_detected": self.dlls_detected,
            "apis_detected": self.apis_detected,
            "preferred_driver": self.preferred_driver,
            "needs_dsoal": self.needs_dsoal,
        }
