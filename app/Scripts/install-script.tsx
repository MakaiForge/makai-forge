import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ExecutableCandidateModal, type CandidateExe } from "@provision/ForgePipeline/ui/executable-candidate-modal";

interface ScriptData {
  id: number;
  game_id: string;
  title: string;
  description: string;
  content: string;
  version: string;
  distro: string;
  install_tips: string;
  system_info: string;
  status: string;
  likes: number;
  dislikes: number;
  username: string;
  created_at: string;
  shop?: string;
}

interface InstallResult {
  success?: boolean;
  error?: string;
  shop?: string;
  objectId?: string;
  gameId?: string;
  title?: string;
  candidates?: CandidateExe[];
  suggestedDir?: string | null;
  protonVersion?: string | null;
  protonFork?: string | null;
  executableSelectWindowOpened?: boolean;
}

export function InstallScript() {
  const { scriptId } = useParams<{ scriptId: string }>();
  const navigate = useNavigate();
  const [script, setScript] = useState<ScriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);

  const [autoInstall, setAutoInstall] = useState(false);
  const [installProgress, setInstallProgress] = useState<{
    status: string;
    detail?: string;
  } | null>(null);

  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [candidates, setCandidates] = useState<CandidateExe[]>([]);

  useEffect(() => {
    const cleanup = (window as any).electron.onInstallProgress?.(
      (data: { status: string; detail?: string }) => {
        setInstallProgress(data);
      }
    );
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  useEffect(() => {
    if (!scriptId) {
      setError("ID do script não fornecido");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const result = await (window as any).electron.getScriptById(scriptId);
        if (result?.error) {
          setError(`Erro: ${result.error}`);
        } else {
          setScript(result);
        }
      } catch (e: any) {
        setError(`Falha ao conectar: ${e?.message || "desconhecido"}`);
      }
      setLoading(false);
    })();
  }, [scriptId]);

  // Auto-install when opened via deep link
  useEffect(() => {
    if (!script || installing) return;
    const timer = setTimeout(() => setAutoInstall(true), 800);
    return () => clearTimeout(timer);
  }, [script, installing]);

  useEffect(() => {
    if (autoInstall && script && !installing) {
      handleInstall();
    }
  }, [autoInstall]);

  const handleExePicked = useCallback(async (path: string) => {
    setShowCandidateModal(false);
    if (installResult?.shop && installResult?.objectId) {
      await (window as any).electron.setGameExecutablePath(
        installResult.shop,
        installResult.objectId,
        path
      );
      navigate(`/game/${installResult.shop}/${installResult.objectId}`);
    }
  }, [installResult, navigate]);

  const handleOpenExePicker = useCallback(async () => {
    const path = await (window as any).electron.openExeFilePicker(
      installResult?.suggestedDir ?? undefined
    );
    if (path && installResult?.shop && installResult?.objectId) {
      setShowCandidateModal(false);
      await (window as any).electron.setGameExecutablePath(
        installResult.shop,
        installResult.objectId,
        path
      );
      navigate(`/game/${installResult.shop}/${installResult.objectId}`);
    }
  }, [installResult, navigate]);

  const handleInstall = async () => {
    if (!script) return;
    setInstalling(true);
    try {
      const result = await (window as any).electron.installScript(scriptId);
      if (result?.error) {
        alert(result.error);
        setInstalling(false);
        return;
      }

      if (result?.executableSelectWindowOpened) {
        setInstalling(false);
      } else if (result?.candidates && result.candidates.length > 0) {
        setInstallResult(result);
        setCandidates(result.candidates);
        setShowCandidateModal(true);
        setInstalling(false);
      } else if (result?.shop && result?.objectId) {
        setInstallResult(result);
        const path = await (window as any).electron.openExeFilePicker(
          result.suggestedDir ?? undefined
        );
        setInstalling(false);
        if (path) {
          await (window as any).electron.setGameExecutablePath(
            result.shop,
            result.objectId,
            path
          );
          navigate(`/game/${result.shop}/${result.objectId}`);
        }
      } else {
        setInstalling(false);
        navigate(`/game/steam/${script.game_id}`);
      }
    } catch {
      setInstalling(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "var(--bg)" }}>
        <div style={{ color: "var(--text-dim)", fontSize: "1.1rem" }}>Carregando script...</div>
      </div>
    );
  }

  if (error || !script) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100vh", background: "var(--bg)", gap: "1rem" }}>
        <div style={{ color: "var(--orange)", fontSize: "1.2rem" }}>{error || "Script não encontrado"}</div>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "0.5rem 1.5rem",
            borderRadius: 6,
            border: "1px solid var(--accent)",
            background: "transparent",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Voltar ao início
        </button>
      </div>
    );
  }

  const hasProton = installResult?.protonVersion || installResult?.protonFork;

  return (
    <>
      <ExecutableCandidateModal
        visible={showCandidateModal}
        candidates={candidates}
        onSelect={handleExePicked}
        onBrowse={handleOpenExePicker}
        onClose={() => setShowCandidateModal(false)}
      />
      <div style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1.5rem",
        color: "var(--text)",
        fontFamily: "var(--font)",
      }}
    >
      <button
        onClick={() => navigate(-1)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-dim)",
          cursor: "pointer",
          fontSize: "0.9rem",
          marginBottom: "1rem",
          padding: 0,
        }}
      >
        ← Voltar
      </button>

      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(168,85,247,0.15)",
          borderRadius: 12,
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.4rem", color: "var(--purple-200)" }}>{script.title}</h1>
            <p style={{ margin: "0.25rem 0 0", color: "var(--text-dim)", fontSize: "0.85rem" }}>
              por {script.username} · v{script.version}
            </p>
          </div>
          <div style={{ textAlign: "right", fontSize: "0.85rem", color: "var(--text-dim)" }}>
            <div>👍 {script.likes}</div>
            <div>👎 {script.dislikes}</div>
          </div>
        </div>

        {script.description && (
          <p style={{ color: "var(--text-light)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1rem" }}>
            {script.description}
          </p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {script.distro && (
            <span style={tagStyle}>
              💻 {script.distro}
            </span>
          )}
          {script.system_info && (
            <span style={tagStyle}>
              ⚙️ {script.system_info}
            </span>
          )}
          {script.status && (
            <span style={{ ...tagStyle, background: script.status === "approved" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)", color: script.status === "approved" ? "var(--green-400)" : "var(--yellow-400)" }}>
              {script.status === "approved" ? "✓ Aprovado" : script.status === "pending" ? "⏳ Pendente" : "✗ Rejeitado"}
            </span>
          )}
        </div>

        {hasProton && (
          <div
            style={{
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 8,
              padding: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ color: "var(--green-400)", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              ✓ Proton definido no script
            </div>
            <div style={{ color: "var(--text-light)", fontSize: "0.85rem" }}>
              {installResult?.protonFork || ""} {installResult?.protonVersion || ""}
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
              O seletor de Proton será pulado durante a instalação.
            </div>
          </div>
        )}

        {script.install_tips && (
          <div
            style={{
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.2)",
              borderRadius: 8,
              padding: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ color: "var(--blue-400)", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
              💡 Dicas de instalação
            </div>
            <div style={{ color: "var(--text-light)", fontSize: "0.85rem", lineHeight: 1.5 }}>
              {script.install_tips}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {installProgress && (
          <div style={{ marginTop: "0.75rem", background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <div style={{ color: "var(--accent)", fontSize: "0.85rem" }}>
                {installProgress.status === "proton" && "🔍 Verificando Proton..."}
                {installProgress.status === "proton_ok" && "✅ Proton resolvido"}
                {installProgress.status === "download" && "⬇️ Baixando arquivos..."}
                {installProgress.status === "download_progress" && "⬇️ Baixando..."}
                {installProgress.status === "installing" && "⚙️ Instalando jogo..."}
                {installProgress.status === "complete" && "✅ Instalação concluída!"}
                {installProgress.status === "error" && "❌ Erro na instalação"}
              </div>
            </div>
            {installProgress.detail && (
              <div style={{ color: "var(--text-dim)", fontSize: "0.78rem", wordBreak: "break-all" }}>
                {installProgress.detail}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleInstall}
          disabled={installing}
          style={{
            width: "100%",
            padding: "0.75rem",
            borderRadius: 8,
            border: "none",
            background: installing
              ? "var(--text-dim)"
              : "linear-gradient(135deg, var(--accent), #7c3aed)",
            color: "#fff",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: installing ? "not-allowed" : "pointer",
            transition: "opacity 0.2s",
            marginTop: "1rem",
          }}
        >
          {installing
            ? installProgress?.status === "complete"
              ? "✅ Instalado"
              : installProgress
                ? "Instalando..."
                : "Adicionando à biblioteca..."
            : `⬇ Instalar Script${hasProton ? "" : " (selecionar Proton)"}`}
        </button>

        {!hasProton && (
          <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", textAlign: "center", marginTop: "0.5rem" }}>
            Nenhum Proton especificado. Você poderá escolher durante a instalação.
          </p>
        )}

        <details style={{ marginTop: "1rem" }}>
          <summary style={{ color: "var(--text-dim)", cursor: "pointer", fontSize: "0.85rem" }}>
            📜 Ver conteúdo do script
          </summary>
          <pre
            style={{
              background: "rgba(0,0,0,0.3)",
              borderRadius: 6,
              padding: "0.75rem",
              marginTop: "0.5rem",
              fontSize: "0.78rem",
              color: "var(--text-light)",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 400,
              overflowY: "auto",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {script.content}
          </pre>
        </details>
      </div>
    </div>
    </>
  );
}

const tagStyle: React.CSSProperties = {
  background: "rgba(168,85,247,0.1)",
  color: "var(--purple-300)",
  padding: "0.25rem 0.65rem",
  borderRadius: 6,
  fontSize: "0.78rem",
  border: "1px solid rgba(168,85,247,0.15)",
};
