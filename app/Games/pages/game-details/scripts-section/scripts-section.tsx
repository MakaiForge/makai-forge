import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@renderer/hooks";
import { InstallScriptModal } from "@renderer/pages/shared-modals/install-script-modal";
import "./scripts-section.scss";

interface ScriptComment {
  id: number;
  script_id: number;
  user_id: number;
  username: string;
  avatar_url?: string;
  body: string;
  parent_id?: number;
  likes_count?: number;
  dislikes_count?: number;
  created_at: string;
  replies?: ScriptComment[];
}

interface ScriptData {
  id: number;
  game_id: string;
  title: string;
  description: string;
  version: string;
  distro: string;
  system_info: string;
  install_tips: string;
  content: string;
  likes: number;
  dislikes: number;
  liked_by_me?: boolean;
  disliked_by_me?: boolean;
  username: string;
  avatar_url?: string;
  created_at: string;
  shop?: string;
}

interface Props {
  shop: string;
  objectId: string;
}

function getTimeAgo(dateStr: string) {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  if (isNaN(then)) return dateStr;
  const diff = Math.floor((now - then) / 1000);
  if (diff < 5) return "agora";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function linkify(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="scripts-section__link">${url}</a>`);
}

function CommentThread({
  comment,
  scriptId,
  depth,
  replyTo,
  setReplyTo,
  replyInputs,
  setReplyInputs,
  handlePostReply,
  handleDeleteComment,
  handleCommentVote,
  t,
}: {
  comment: ScriptComment;
  scriptId: number;
  depth: number;
  replyTo: number | null;
  setReplyTo: (id: number | null) => void;
  replyInputs: Record<number, string>;
  setReplyInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  handlePostReply: (commentId: number) => void;
  handleDeleteComment: (commentId: number) => void;
  handleCommentVote: (scriptId: number, commentId: number, type: "like" | "dislike") => void;
  t: (key: string, fallback?: string) => string;
}) {
  const isOwner = comment.user_id === 1;
  const showReplyInput = replyTo === comment.id;
  const avatarUrl = comment.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.username)}&background=7c3aed&color=fff&size=20`;

  return (
    <div
      className="scripts-section__comment-card"
      style={{
        marginLeft: Math.min(depth * 20, 80),
        ...(depth > 0 ? { borderLeft: "2px solid rgba(168,85,247,0.15)" } : {}),
      }}
    >
      <div className="scripts-section__comment-header">
        <img
          className="scripts-section__comment-avatar"
          src={avatarUrl}
          alt=""
        />
        <span
          className="scripts-section__comment-username"
          style={{ cursor: "pointer" }}
          onClick={async () => {
            const siteUrl = await (window as any).electron.getSiteUrl();
            (window as any).electron.openExternal(`${siteUrl}/pages/profile.html?user=${encodeURIComponent(comment.username)}`);
          }}
        >
          {comment.username}
        </span>
        <span className="scripts-section__comment-time">
          {getTimeAgo(comment.created_at)}
        </span>
        <div className="scripts-section__comment-votes">
          <button
            type="button"
            className="scripts-section__cvote-btn"
            onClick={() => handleCommentVote(scriptId, comment.id, "like")}
            title={t("scripts_likes", "Like")}
          >
            👍 <span className="scripts-section__cvote-count">{comment.likes_count || 0}</span>
          </button>
          <button
            type="button"
            className="scripts-section__cvote-btn"
            onClick={() => handleCommentVote(scriptId, comment.id, "dislike")}
            title={t("scripts_dislikes", "Dislike")}
          >
            👎 <span className="scripts-section__cvote-count">{comment.dislikes_count || 0}</span>
          </button>
        </div>
        <div className="scripts-section__comment-actions">
          <button
            type="button"
            className="scripts-section__comment-reply-btn"
            onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
          >
            {t("scripts_reply", "Responder")}
          </button>
          {isOwner && (
            <button
              type="button"
              className="scripts-section__comment-delete"
              onClick={() => handleDeleteComment(comment.id)}
            >
              {t("delete", "Excluir")}
            </button>
          )}
        </div>
      </div>
      <div
        className="scripts-section__comment-body"
        dangerouslySetInnerHTML={{ __html: linkify(comment.body) }}
      />

      {showReplyInput && (
        <div className="scripts-section__reply-input-container">
          <input
            type="text"
            className="scripts-section__reply-input"
            placeholder={t("scripts_reply_placeholder", "Escreva uma resposta...")}
            value={replyInputs[comment.id] || ""}
            onChange={(e) =>
              setReplyInputs((prev) => ({
                ...prev,
                [comment.id]: e.target.value,
              }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePostReply(comment.id);
            }}
            autoFocus
          />
          <button
            type="button"
            className="scripts-section__btn-send scripts-section__btn-send--small"
            onClick={() => handlePostReply(comment.id)}
          >
            {t("scripts_send", "Enviar")}
          </button>
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="scripts-section__replies">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              scriptId={scriptId}
              depth={depth + 1}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              replyInputs={replyInputs}
              setReplyInputs={setReplyInputs}
              handlePostReply={handlePostReply}
              handleDeleteComment={handleDeleteComment}
              handleCommentVote={handleCommentVote}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ScriptsSection({ shop, objectId }: Props) {
  const { t } = useTranslation("game_details");
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [expandedScripts, setExpandedScripts] = useState<Set<number>>(new Set());
  const [shownCode, setShownCode] = useState<Set<number>>(new Set());
  const [comments, setComments] = useState<Record<number, ScriptComment[]>>({});
  const [commentsLoading, setCommentsLoading] = useState<Set<number>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyInputs, setReplyInputs] = useState<Record<number, string>>({});
  const [currentUser, setCurrentUser] = useState<{ id: number; username: string; role: string; is_admin: boolean } | null>(null);

  useEffect(() => {
    (window as any).electron.getMakaiAuth().then((a: any) => {
      if (a?.user) setCurrentUser(a.user);
    });
  }, []);

  const fetchScripts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await (window as any).electron.getScriptsByGame(shop, objectId);
      setScripts(Array.isArray(data) ? data : []);
    } catch {
      setScripts([]);
    }
    setLoading(false);
  }, [shop, objectId]);

  useEffect(() => {
    fetchScripts();
  }, [fetchScripts]);

  const handleInstall = (scriptId: number) => {
    setSelectedScriptId(String(scriptId));
    setShowInstallModal(true);
  };

  const { showErrorToast } = useToast();

  const handleVote = async (scriptId: number, type: "like" | "dislike") => {
    const fn = type === "like"
      ? (window as any).electron.toggleScriptLike
      : (window as any).electron.toggleScriptDislike;

    const result = await fn(scriptId);
    if (result && !result.error) {
      setScripts((prev) =>
        prev.map((s) => {
          if (s.id !== scriptId) return s;

          if (type === "like") {
            const wasLiked = s.liked_by_me;
            return {
              ...s,
              likes: s.likes + (wasLiked ? -1 : 1),
              dislikes: s.disliked_by_me ? s.dislikes - 1 : s.dislikes,
              liked_by_me: !wasLiked,
              disliked_by_me: false,
            };
          }

          const wasDisliked = s.disliked_by_me;
          return {
            ...s,
            dislikes: s.dislikes + (wasDisliked ? -1 : 1),
            likes: s.liked_by_me ? s.likes - 1 : s.likes,
            disliked_by_me: !wasDisliked,
            liked_by_me: false,
          };
        })
      );
    } else if (result?.error) {
      showErrorToast(result.error);
    }
  };

  const toggleExpand = (scriptId: number) => {
    setExpandedScripts((prev) => {
      const next = new Set(prev);
      if (next.has(scriptId)) {
        next.delete(scriptId);
      } else {
        next.add(scriptId);
        loadComments(scriptId);
      }
      return next;
    });
  };

  const toggleCode = (scriptId: number) => {
    setShownCode((prev) => {
      const next = new Set(prev);
      if (next.has(scriptId)) next.delete(scriptId);
      else next.add(scriptId);
      return next;
    });
  };

  const loadComments = async (scriptId: number) => {
    if (commentsLoading.has(scriptId)) return;
    setCommentsLoading((prev) => new Set(prev).add(scriptId));
    try {
      const data = await (window as any).electron.getScriptComments(scriptId);
      setComments((prev) => ({ ...prev, [scriptId]: Array.isArray(data) ? data : [] }));
    } catch {
      setComments((prev) => ({ ...prev, [scriptId]: [] }));
    }
    setCommentsLoading((prev) => {
      const next = new Set(prev);
      next.delete(scriptId);
      return next;
    });
  };

  const postComment = async (scriptId: number) => {
    const body = commentInputs[scriptId]?.trim();
    if (!body) return;
    const result = await (window as any).electron.postScriptComment(scriptId, body);
    if (result && !result.error) {
      setCommentInputs((prev) => ({ ...prev, [scriptId]: "" }));
      loadComments(scriptId);
    }
  };

  const handlePostReply = async (commentId: number) => {
    const activeScriptId = Array.from(expandedScripts).find((sid) =>
      comments[sid]?.some((c) => c.id === commentId || c.replies?.some((r) => r.id === commentId))
    );
    if (!activeScriptId) return;

    const body = replyInputs[commentId]?.trim();
    if (!body) return;

    const result = await (window as any).electron.postScriptComment(activeScriptId, body, commentId);
    if (result && !result.error) {
      setReplyInputs((prev) => ({ ...prev, [commentId]: "" }));
      setReplyTo(null);
      loadComments(activeScriptId);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    const activeScriptId = Array.from(expandedScripts).find((sid) =>
      comments[sid]?.some((c) => c.id === commentId || c.replies?.some((r) => r.id === commentId))
    );
    if (!activeScriptId) return;

    const result = await (window as any).electron.deleteScriptComment(activeScriptId, commentId);
    if (result && !result.error) {
      loadComments(activeScriptId);
    }
  };

  const handleCommentVote = async (scriptId: number, commentId: number, type: "like" | "dislike") => {
    const fn = type === "like"
      ? (window as any).electron.toggleCommentLike
      : (window as any).electron.toggleCommentDislike;

    const result = await fn(scriptId, commentId);
    if (result && !result.error) {
      setComments((prev) => {
        const updateReplies = (list: ScriptComment[]): ScriptComment[] =>
          list.map((c) => {
            if (c.id === commentId) {
              return {
                ...c,
                likes_count: result.likes ?? c.likes_count,
                dislikes_count: result.dislikes ?? c.dislikes_count,
              };
            }
            if (c.replies) return { ...c, replies: updateReplies(c.replies) };
            return c;
          });
        return { ...prev, [scriptId]: updateReplies(prev[scriptId] || []) };
      });
    }
  };

  if (loading) {
    return (
      <section className="scripts-section">
        <h2 className="scripts-section__title">{t("scripts", "Scripts")}</h2>
        <div className="scripts-section__loading">
          <div className="scripts-section__skeleton" />
          <div className="scripts-section__skeleton" />
        </div>
      </section>
    );
  }

  return (
    <section className="scripts-section">
      <div className="scripts-section__header">
        <h2 className="scripts-section__title">
          {t("scripts", "Scripts")}
          <span className="scripts-section__count">{scripts.length}</span>
        </h2>
        <div className="scripts-section__header-actions">
          {currentUser && (
            <button
              type="button"
              className="scripts-section__btn scripts-section__btn--create"
              onClick={async () => {
                const siteUrl = await (window as any).electron.getSiteUrl();
                (window as any).electron.openExternal(`${siteUrl}/pages/game-detail.html?id=${objectId}`);
              }}
            >
              + {t("scripts_new", "Criar Script")}
            </button>
          )}
        </div>
      </div>

      {scripts.length === 0 ? (
        <div className="scripts-section__empty">
          <p>{t("scripts_empty", "Nenhum script ainda. Crie o primeiro!")}</p>
        </div>
      ) : (
      <div className="scripts-section__list">
        {scripts.map((script) => {
          const score = (script.likes || 0) - (script.dislikes || 0);
          const isExpanded = expandedScripts.has(script.id);
          const isCodeShown = shownCode.has(script.id);
          const scriptComments = comments[script.id];

          return (
            <div key={script.id} className="scripts-section__card">
              <div className="scripts-section__card-main">
                <div className="scripts-section__card-info">
                  <div className="scripts-section__card-header">
                    <strong className="scripts-section__card-title">
                      {script.title}
                    </strong>
                    {script.version && (
                      <span className="scripts-section__card-version">
                        v{script.version}
                      </span>
                    )}
                    <span className="scripts-section__card-author">
                      {t("scripts_by", "por")}{" "}
                      <img
                        className="scripts-section__card-avatar"
                        src={script.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(script.username)}&background=7c3aed&color=fff&size=20`}
                        alt=""
                      />
                      <span
                        className="scripts-section__card-username"
                        style={{ cursor: "pointer" }}
                        onClick={async () => {
                          const siteUrl = await (window as any).electron.getSiteUrl();
                          (window as any).electron.openExternal(`${siteUrl}/pages/profile.html?user=${encodeURIComponent(script.username)}`);
                        }}
                      >
                        {script.username}
                      </span>
                    </span>
                  </div>

                  {script.description && (
                    <p
                      className="scripts-section__card-description"
                      dangerouslySetInnerHTML={{
                        __html: linkify(script.description),
                      }}
                    />
                  )}

                  <div className="scripts-section__card-meta">
                    <span className="scripts-section__card-score">
                      Score:{" "}
                      <strong
                        className={`scripts-section__score-value ${
                          score > 0
                            ? "scripts-section__score-value--positive"
                            : score < 0
                            ? "scripts-section__score-value--negative"
                            : ""
                        }`}
                      >
                        {score > 0 ? "+" : ""}
                        {score}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="scripts-section__card-votes">
                  <button
                    type="button"
                    className={`scripts-section__vote-btn ${
                      script.liked_by_me ? "scripts-section__vote-btn--liked" : ""
                    }`}
                    onClick={() => handleVote(script.id, "like")}
                    title={t("scripts_likes", "Like")}
                  >
                    <span>👍</span>
                    <span className="scripts-section__vote-count">
                      {script.likes || 0}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`scripts-section__vote-btn ${
                      script.disliked_by_me ? "scripts-section__vote-btn--disliked" : ""
                    }`}
                    onClick={() => handleVote(script.id, "dislike")}
                    title={t("scripts_dislikes", "Dislike")}
                  >
                    <span>👎</span>
                    <span className="scripts-section__vote-count">
                      {script.dislikes || 0}
                    </span>
                  </button>
                </div>
              </div>

              <div className="scripts-section__card-actions">
                <button
                  type="button"
                  className="scripts-section__btn scripts-section__btn--install"
                  onClick={() => handleInstall(script.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {t("install", "Instalar Script")}
                </button>
                <button
                  type="button"
                  className="scripts-section__btn scripts-section__btn--expand"
                  onClick={() => toggleExpand(script.id)}
                >
                  {isExpanded
                    ? `${t("scripts_less", "Mostrar menos")} ▲`
                    : `${t("scripts_more", "Mostrar mais")} ▼`}
                </button>
                {(currentUser?.is_admin || currentUser?.role === "founder") && (
                  <button
                    type="button"
                    className="scripts-section__btn scripts-section__btn--delete"
                    onClick={async () => {
                      const ok = window.confirm(`Deletar script "${script.title}"?`);
                      if (!ok) return;
                      try {
                        const res = await (window as any).electron.deleteScript(script.id);
                        if (res?.ok) fetchScripts();
                      } catch {}
                    }}
                  >
                    🗑 Excluir
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="scripts-section__card-details">
                  {(script.distro || script.system_info || script.install_tips) && (
                    <div className="scripts-section__info-box">
                      {script.distro && (
                        <div className="scripts-section__info-row">
                          <span className="scripts-section__info-label">
                            Distro:
                          </span>
                          <span className="scripts-section__info-value">
                            {script.distro}
                          </span>
                        </div>
                      )}
                      {script.system_info && (
                        <div className="scripts-section__info-row">
                          <span className="scripts-section__info-label">
                            Sistema:
                          </span>
                          <span className="scripts-section__info-value">
                            {script.system_info}
                          </span>
                        </div>
                      )}
                      {script.install_tips && (
                        <div className="scripts-section__info-row">
                          <span className="scripts-section__info-label">
                            Dicas:
                          </span>
                          <span
                            className="scripts-section__info-value"
                            dangerouslySetInnerHTML={{
                              __html: linkify(script.install_tips),
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="scripts-section__toggle-code"
                    onClick={() => toggleCode(script.id)}
                  >
                    {isCodeShown
                      ? `📜 ${t("scripts_hide_code", "Esconder código do script")} ▲`
                      : `📜 ${t("scripts_show_code", "Mostrar código do script")} ▼`}
                  </button>

                  {isCodeShown && (
                    <pre className="scripts-section__code">
                      {script.content}
                    </pre>
                  )}

                  <div className="scripts-section__comments">
                    <div className="scripts-section__comments-header">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      {t("scripts_comments", "Comentários")}
                    </div>

                    <div className="scripts-section__comments-input">
                      <input
                        type="text"
                        className="scripts-section__comment-input"
                        placeholder={t("scripts_comment_placeholder", "Escreva um comentário...")}
                        value={commentInputs[script.id] || ""}
                        onChange={(e) =>
                          setCommentInputs((prev) => ({
                            ...prev,
                            [script.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") postComment(script.id);
                        }}
                      />
                      <button
                        type="button"
                        className="scripts-section__btn-send"
                        onClick={() => postComment(script.id)}
                      >
                        {t("scripts_send", "Enviar")}
                      </button>
                    </div>

                    <div className="scripts-section__comments-list">
                      {!scriptComments ? (
                        <span className="scripts-section__comments-placeholder">
                          {t("scripts_comments_loading", "Carregando comentários...")}
                        </span>
                      ) : scriptComments.length === 0 ? (
                        <span className="scripts-section__comments-placeholder">
                          {t("scripts_comments_empty", "Nenhum comentário ainda.")}
                        </span>
                      ) : (
                        scriptComments.map((c) => (
                          <CommentThread
                            key={c.id}
                            comment={c}
                            scriptId={script.id}
                            depth={0}
                            replyTo={replyTo}
                            setReplyTo={setReplyTo}
                            replyInputs={replyInputs}
                            setReplyInputs={setReplyInputs}
                            handlePostReply={handlePostReply}
                            handleDeleteComment={handleDeleteComment}
                            handleCommentVote={handleCommentVote}
                            t={t}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      )}

      {selectedScriptId && (
        <InstallScriptModal
          scriptId={selectedScriptId}
          visible={showInstallModal}
          onClose={() => {
            setShowInstallModal(false);
            setSelectedScriptId(null);
          }}
        />
      )}
    </section>
  );
}
