import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@renderer/components/modal/modal";
import { ExecutableCandidateModal } from "@provision/ForgePipeline/ui/executable-candidate-modal";
import type { CandidateExe } from "@provision/ForgePipeline/ui/executable-candidate-modal";
import type { GameShop } from "@types";
import "./install-script-modal.scss";

interface CommentData {
  id: number;
  script_id: number;
  user_id: number;
  body: string;
  created_at: string;
  updated_at: string | null;
  username: string;
  avatar_url: string | null;
}

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
  liked_by_me?: boolean;
  disliked_by_me?: boolean;
  username: string;
  created_at: string;
  shop?: string;
}

interface InstallScriptResult {
  error?: string;
  shop?: string;
  objectId?: string;
  title?: string;
  candidates?: CandidateExe[];
  suggestedDir?: string | null;
  autoSetExe?: string;
  executableSelectWindowOpened?: boolean;
}

interface LogEntry {
  text: string;
  type: "info" | "wine" | "success" | "error";
}

interface Props {
  scriptId: string | null;
  visible: boolean;
  onClose: () => void;
}

const PLAY_STATUSES = new Set([
  "download", "download_progress", "download_ok",
  "extracting", "prefix", "dlls", "installing",
  "copying", "scanning", "complete", "error",
]);

export function InstallScriptModal({ scriptId, visible, onClose }: Props) {
  const navigate = useNavigate();
  const [script, setScript] = useState<ScriptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"info" | "installing" | "proton_pick" | "candidates">("info");
  const [installProgress, setInstallProgress] = useState<{ status: string; detail?: string; percent?: number } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [candidates, setCandidates] = useState<CandidateExe[]>([]);
  const [result, setResult] = useState<InstallScriptResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showErrorPopup, setShowErrorPopup] = useState(false);
  const [copiedLog, setCopiedLog] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [togglingVote, setTogglingVote] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const allLogsRef = useRef<string>("");

  const addLog = useCallback((text: string, type: LogEntry["type"] = "info") => {
    setLogs(prev => [...prev, { text, type }]);
    allLogsRef.current += `[${type.toUpperCase()}] ${text}\n`;
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (!visible || !scriptId) return;
    setScript(null);
    setError(null);
    setStep("info");
    setInstallProgress(null);
    setLogs([]);
    allLogsRef.current = "";
    setShowCandidateModal(false);
    setCandidates([]);
    setResult(null);
    setShowErrorPopup(false);
    setCopiedLog(false);
    setLiked(false);
    setDisliked(false);
    setLikesCount(0);
    setDislikesCount(0);
    setComments([]);
    setNewComment("");
    setPostingComment(false);
    setTogglingVote(false);
    setCurrentUserId(null);
    (async () => {
      try {
        const data = await (window as any).electron.getScriptById(scriptId);
        if (data?.error) {
          setError(data.error);
        } else {
          setScript(data);
          setLiked(!!data.liked_by_me);
          setDisliked(!!data.disliked_by_me);
          setLikesCount(data.likes ?? 0);
          setDislikesCount(data.dislikes ?? 0);

          try {
            const [userData, commentsData] = await Promise.all([
              (window as any).electron.getMe(),
              (window as any).electron.getScriptComments(scriptId),
            ]);
            if (userData?.id) setCurrentUserId(parseInt(userData.id, 10));
            if (Array.isArray(commentsData)) setComments(commentsData);
          } catch { /* non-critical */ }
        }
      } catch (e: any) {
        setError(`Falha ao conectar: ${e?.message || "desconhecido"}`);
      }
    })();
  }, [scriptId, visible]);

  useEffect(() => {
    const cleanupProgress = (window as any).electron.onInstallProgress?.(
      (data: { status: string; detail?: string; percent?: number }) => {
        setInstallProgress(data);
      }
    );
    const cleanupLog = (window as any).electron.onInstallLog?.(
      (line: string) => {
        const type: LogEntry["type"] =
          line.includes("ERRO") || line.includes("Error") ? "error" :
          line.includes("OK") || line.includes("sucesso") || line.includes("✅") ? "success" :
          line.includes("Wine") || line.includes("Proton") || line.includes("wineboot") ? "wine" :
          "info";
        addLog(line, type);
      }
    );
    return () => {
      if (cleanupProgress) cleanupProgress();
      if (cleanupLog) cleanupLog();
    };
  }, [addLog]);

  const getProgressPercent = (): number => {
    if (!installProgress) return 0;
    if (typeof installProgress.percent === "number") return installProgress.percent;
    const detail = installProgress.detail || "";
    const pctMatch = detail.match(/(\d+)%/);
    if (pctMatch) return parseInt(pctMatch[1], 10);
    return 0;
  };

  const handleInstall = useCallback(async () => {
    if (!script) return;
    setStep("installing");
    setError(null);
    addLog("Iniciando instalação do script...", "info");

    try {
      const res = await (window as any).electron.installScript(scriptId);
      if (res?.error) {
        addLog(`Erro: ${res.error}`, "error");
        setShowErrorPopup(true);
        return;
      }

      addLog("Instalação concluída!", "success");
      setResult(res);

      if (res.executableSelectWindowOpened) {
        onClose();
        return;
      }

      if (res.autoSetExe) {
        addLog(`Executável configurado: ${(res.autoSetExe.split(/[/\\]/).pop() || res.autoSetExe)}`, "success");
        if (res.shop && res.objectId) {
          await (window as any).electron.setGameExecutablePath(res.shop, res.objectId, res.autoSetExe);
        }
        onClose();
        navigate(`/game/${res.shop}/${res.objectId}`);
        return;
      }

      if (res.candidates?.length > 0) {
        setCandidates(res.candidates);
        setShowCandidateModal(true);
        return;
      }

      const filePath = await (window as any).electron.openExeFilePicker(res.suggestedDir ?? undefined);
      if (filePath && res.shop && res.objectId) {
        await (window as any).electron.setGameExecutablePath(res.shop, res.objectId, filePath);
        onClose();
        navigate(`/game/${res.shop}/${res.objectId}`);
      }
    } catch (e: any) {
      addLog(`Erro: ${e?.message || "desconhecido"}`, "error");
      setShowErrorPopup(true);
    }
  }, [script, scriptId, addLog, navigate, onClose]);

  const handleExePicked = useCallback(async (path: string) => {
    setShowCandidateModal(false);
    if (result?.shop && result?.objectId) {
      await (window as any).electron.setGameExecutablePath(
        result.shop,
        result.objectId,
        path
      );
      onClose();
      navigate(`/game/${result.shop}/${result.objectId}`);
    }
  }, [result, navigate, onClose]);

  const handleOpenExePicker = useCallback(async () => {
    if (!result?.shop || !result?.objectId) return;
    const path = await (window as any).electron.openExeFilePicker();
    if (path) {
      await (window as any).electron.setGameExecutablePath(
        result.shop,
        result.objectId,
        path
      );
      onClose();
      navigate(`/game/${result.shop}/${result.objectId}`);
    }
  }, [result, navigate, onClose]);

  const handleToggleLike = useCallback(async () => {
    if (!script || togglingVote) return;
    setTogglingVote(true);
    try {
      const res = await (window as any).electron.toggleScriptLike(script.id);
      if (res?.error) return;
      if (liked) {
        setLiked(false);
        setLikesCount(prev => Math.max(0, prev - 1));
      } else {
        setLiked(true);
        setLikesCount(prev => prev + 1);
        if (disliked) {
          setDisliked(false);
          setDislikesCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch { /* ignore */ }
    setTogglingVote(false);
  }, [script, liked, disliked, togglingVote]);

  const handleToggleDislike = useCallback(async () => {
    if (!script || togglingVote) return;
    setTogglingVote(true);
    try {
      const res = await (window as any).electron.toggleScriptDislike(script.id);
      if (res?.error) return;
      if (disliked) {
        setDisliked(false);
        setDislikesCount(prev => Math.max(0, prev - 1));
      } else {
        setDisliked(true);
        setDislikesCount(prev => prev + 1);
        if (liked) {
          setLiked(false);
          setLikesCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch { /* ignore */ }
    setTogglingVote(false);
  }, [script, liked, disliked, togglingVote]);

  const handlePostComment = useCallback(async () => {
    if (!script || !newComment.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const res = await (window as any).electron.postScriptComment(script.id, newComment.trim());
      if (res?.error) return;
      setNewComment("");
      const fresh = await (window as any).electron.getScriptComments(script.id);
      if (Array.isArray(fresh)) setComments(fresh);
    } catch { /* ignore */ }
    setPostingComment(false);
  }, [script, newComment, postingComment]);

  const handleDeleteComment = useCallback(async (commentId: number) => {
    if (!script) return;
    try {
      await (window as any).electron.deleteScriptComment(script.id, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch { /* ignore */ }
  }, [script]);

  const handleCopyLog = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(allLogsRef.current);
      setCopiedLog(true);
      setTimeout(() => setCopiedLog(false), 2000);
    } catch { /* ignore */ }
  }, []);

  const handleReportBug = useCallback(() => {
    const body = encodeURIComponent(
      `[Bug] Script Install - ${script?.title || "Unknown"}\n\n` +
      `Script ID: ${scriptId}\n` +
      `Error: ${error || "Unknown"}\n\n` +
      `=== Log ===\n${allLogsRef.current}`
    );
    window.open(`mailto:lucasxaviergertkefrimeen@gmail.com?subject=${encodeURIComponent(`[Bug] Script Install - ${script?.title || "Unknown"}`)}&body=${body}`, "_blank");
  }, [script, scriptId, error]);

  const progressPct = getProgressPercent();
  const showProgressBar = step !== "info" && installProgress;
  const progressStatus = installProgress?.status || "";
  const progressDetail = installProgress?.detail || "";

  return (
    <>
      <ExecutableCandidateModal
        visible={showCandidateModal}
        candidates={candidates}
        onSelect={handleExePicked}
        onBrowse={handleOpenExePicker}
        onClose={() => setShowCandidateModal(false)}
      />

      <Modal visible={visible} onClose={onClose} title="Instalar Script">
        <div className="install-script-modal__content" style={{ position: "relative" }}>
          {!script ? (
            <div className="install-script-modal__loading">
              {error || "Carregando script..."}
            </div>
          ) : (
            <>
              <h2 className="install-script-modal__title">{script.title}</h2>
              <p className="install-script-modal__meta">
                por {script.username} · v{script.version}
              </p>

              {script.description && (
                <div className="install-script-modal__section">
                  <div className="install-script-modal__section-title">📝 Resumo</div>
                  <p className="install-script-modal__section-text">{script.description}</p>
                </div>
              )}

              <div className="install-script-modal__tags">
                {script.distro && <span className="install-script-modal__tag">💻 {script.distro}</span>}
                {script.system_info && <span className="install-script-modal__tag">⚙️ {script.system_info}</span>}
                {script.status === "approved" && (
                  <span className="install-script-modal__tag" style={{ background: "rgba(34,197,94,0.15)", color: "var(--green-400)" }}>
                    ✓ Aprovado
                  </span>
                )}
              </div>

              {/* Likes / Dislikes */}
              <div className="install-script-modal__votes">
                <button
                  className={`install-script-modal__vote-btn${liked ? " install-script-modal__vote-btn--liked" : ""}`}
                  onClick={handleToggleLike}
                  disabled={step !== "info"}
                  title="Curtir"
                >
                  ▲ {likesCount}
                </button>
                <button
                  className={`install-script-modal__vote-btn${disliked ? " install-script-modal__vote-btn--disliked" : ""}`}
                  onClick={handleToggleDislike}
                  disabled={step !== "info"}
                  title="Não curtir"
                >
                  ▼ {dislikesCount}
                </button>
              </div>

              {/* Comments section */}
              {step === "info" && (
                <div className="install-script-modal__comments">
                  <div className="install-script-modal__comments-title">
                    💬 Comentários ({comments.length})
                  </div>

                  {comments.length === 0 ? (
                    <p className="install-script-modal__comments-empty">
                      Nenhum comentário ainda.
                    </p>
                  ) : (
                    <div className="install-script-modal__comments-list">
                      {comments.map(comment => (
                        <div key={comment.id} className="install-script-modal__comment">
                          <div className="install-script-modal__comment-header">
                            <span className="install-script-modal__comment-author">
                              {comment.username}
                            </span>
                            <span className="install-script-modal__comment-date">
                              {new Date(comment.created_at).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                          <div className="install-script-modal__comment-body">
                            {comment.body}
                          </div>
                          {currentUserId === comment.user_id && (
                            <button
                              className="install-script-modal__comment-delete"
                              onClick={() => handleDeleteComment(comment.id)}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="install-script-modal__comment-input-row">
                    <input
                      className="install-script-modal__comment-input"
                      type="text"
                      placeholder="Escreva um comentário..."
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handlePostComment();
                      }}
                    />
                    <button
                      className="install-script-modal__comment-post-btn"
                      onClick={handlePostComment}
                      disabled={!newComment.trim() || postingComment}
                    >
                      {postingComment ? "..." : "Enviar"}
                    </button>
                  </div>
                </div>
              )}

              {/* Preview collapsible */}
              <details className="install-script-modal__preview" open={showPreview}>
                <summary
                  className="install-script-modal__preview-summary"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowPreview(!showPreview);
                  }}
                >
                  {showPreview ? "▼" : "▶"} Preview do Script
                </summary>
                {showPreview && (
                  <div className="install-script-modal__preview-content">
                    {script.content}
                  </div>
                )}
              </details>

              {/* Progress */}
              {showProgressBar && (
                <div className="install-script-modal__progress">
                  <div className="install-script-modal__progress-status">
                    {progressStatus === "download" && "⬇️ Baixando arquivos..."}
                    {progressStatus === "download_progress" && `⬇️ Baixando... ${progressDetail || ""}`}
                    {progressStatus === "download_ok" && "✅ Download concluído"}
                    {progressStatus === "extracting" && `📦 Extraindo... ${progressDetail || ""}`}
                    {progressStatus === "prefix" && "🍷 Criando prefixo Wine..."}
                    {progressStatus === "dlls" && "📦 Instalando DLLs recomendadas..."}
                    {progressStatus === "installing" && `⚙️ Instalando via Popline... ${progressDetail || ""}`}
                    {progressStatus === "copying" && `📋 Copiando arquivos... ${progressDetail || ""}`}
                    {progressStatus === "complete" && "✅ Instalação concluída!"}
                    {progressStatus === "error" && "❌ Erro na instalação"}
                    {!PLAY_STATUSES.has(progressStatus) && (
                      `⚙️ ${progressStatus}${progressDetail ? ` — ${progressDetail}` : ""}`
                    )}
                  </div>
                  {progressStatus !== "complete" && progressStatus !== "error" && (
                    <>
                      <div className="install-script-modal__progress-bar-track">
                        <div
                          className="install-script-modal__progress-bar-fill"
                          style={{ width: `${Math.max(2, progressPct)}%` }}
                        />
                      </div>
                      <div className="install-script-modal__progress-pct">
                        {progressPct}%
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Log area (visible during install) */}
              {logs.length > 0 && (
                <div className="install-script-modal__log" ref={logRef}>
                  {logs.map((entry, i) => (
                    <div
                      key={i}
                      className={`install-script-modal__log-line install-script-modal__log-line--${entry.type}`}
                    >
                      {entry.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Install button */}
              {step === "info" && (
                <button
                  className="install-script-modal__install-btn"
                  onClick={handleInstall}
                  disabled={!!error}
                >
                  ⬇ Instalar Script
                </button>
              )}

              {/* Success / Done state */}
              {installProgress?.status === "complete" && !showErrorPopup && (
                <div className="install-script-modal__success">
                  ✅ Instalação concluída!
                  <div className="install-script-modal__success-sub">
                    O jogo foi adicionado à sua biblioteca.
                  </div>
                </div>
              )}

              {/* Error popup overlay */}
              {showErrorPopup && (
                <div className="install-script-modal__error-overlay">
                  <div className="install-script-modal__error-box">
                    <div className="install-script-modal__error-title">
                      ❌ Erro na Instalação
                    </div>
                    <div className="install-script-modal__error-message">
                      {error || "Algo deu errado durante a instalação do script."}
                    </div>
                    {allLogsRef.current && (
                      <div className="install-script-modal__error-log">
                        {allLogsRef.current}
                      </div>
                    )}
                    <div className="install-script-modal__error-actions">
                      <button
                        className="install-script-modal__error-btn install-script-modal__error-btn--copy"
                        onClick={handleCopyLog}
                      >
                        {copiedLog ? "✓ Copiado!" : "📋 Copiar Log"}
                      </button>
                      <button
                        className="install-script-modal__error-btn install-script-modal__error-btn--report"
                        onClick={handleReportBug}
                      >
                        🐛 Reportar Bug
                      </button>
                      <button
                        className="install-script-modal__error-btn install-script-modal__error-btn--close"
                        onClick={() => setShowErrorPopup(false)}
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
