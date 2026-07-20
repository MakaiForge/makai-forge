import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgeIcon } from "@renderer/utils/badge-icons";
import "./settings-general.scss";
import "./settings-login.scss";

const LEVEL_THRESHOLDS = [
  { level: 1, threshold: 0 },
  { level: 10, threshold: 10000 },
  { level: 20, threshold: 20000 },
  { level: 30, threshold: 30000 },
  { level: 40, threshold: 40000 },
  { level: 50, threshold: 50000 },
  { level: 60, threshold: 60000 },
  { level: 70, threshold: 70000 },
  { level: 80, threshold: 80000 },
  { level: 90, threshold: 90000 },
  { level: 100, threshold: 250000 },
];

function computeLevel(points: number): number {
  let level = 1;
  for (const { level: l, threshold } of LEVEL_THRESHOLDS) {
    if (points >= threshold) level = l;
  }
  return level;
}

type Mode = "idle" | "login" | "register";

interface MakaiProfile {
  id: number;
  username: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  points: number;
  role: string;
  is_admin: boolean;
  member_days: number;
  stats: {
    scripts: number;
    comments: number;
    threads: number;
    posts: number;
    likes_given: number;
    likes_received: number;
    approved_scripts: number;
  };
  badges: Array<{
    id: number;
    name: string;
    description: string;
    icon?: string;
    earned_at: string;
    pinned: number;
  }>;
  scripts: Array<{
    id: number;
    game_id: number;
    title: string;
    status: string;
    likes: number;
    dislikes: number;
    comment_count: number;
    created_at: string;
  }>;
}

export function SettingsContextLogin() {
  const { t } = useTranslation("settings");
  const { t: tBadges } = useTranslation("badges");
  const [auth, setAuth] = useState<{ token: string; user: { id: number; username: string; role: string; is_admin: boolean; avatar_url?: string } } | null>(null);
  const [profile, setProfile] = useState<MakaiProfile | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    const result = await window.electron.getMakaiAuth();
    setAuth(result);
    if (result) {
      const p = await window.electron.getMakaiProfile();
      setProfile(p);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Preencha email e senha");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await window.electron.authLogin(email.trim(), password);
    setLoading(false);
    if (result.success) {
      setAuth({ token: "", user: result.user });
      const p = await window.electron.getMakaiProfile();
      setProfile(p);
      setMode("idle");
      setEmail("");
      setPassword("");
    } else {
      setError(result.error || "Erro ao fazer login");
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      setError("Preencha todos os campos");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await window.electron.authRegister(username.trim(), email.trim(), password);
    setLoading(false);
    if (result.success) {
      setError("Conta criada! Agora faça login.");
      setMode("idle");
      setUsername("");
      setEmail("");
      setPassword("");
    } else {
      setError(result.error || "Erro ao criar conta");
    }
  };

  const handleLogout = async () => {
    await window.electron.authLogout();
    setAuth(null);
    setProfile(null);
    setMode("idle");
  };

  if (auth?.user && profile) {
    const level = computeLevel(profile.points);
    const pinnedBadges = profile.badges.filter((b) => b.pinned);

    return (
      <div className="settings-context-panel">
        {/* Header */}
        <div className="settings-context-panel__group settings-login__profile-header">
          <div className="settings-login__avatar-section">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="settings-login__avatar" />
            ) : (
              <div className="settings-login__avatar settings-login__avatar--fallback">
                {profile.username?.charAt(0)?.toUpperCase() || "?"}
              </div>
            )}
            <div className="settings-login__name-section">
              <div className="settings-login__username">{profile.username}</div>
              <div className="settings-login__role">
                {profile.is_admin ? "👑 Administrador" : profile.role === "founder" ? "⭐ Founder" : "Usuário"}
              </div>
              <div className="settings-login__level">
                Nv.{level} — {profile.points} pts
              </div>
              {pinnedBadges.length > 0 && (
                <div className="settings-login__badges">
                  {pinnedBadges.map((b) => (
                <span key={b.id} className="settings-login__badge" title={tBadges(`${b.id}.desc`, { defaultValue: b.description })}>
                  <BadgeIcon iconPath={b.icon} size={16} />
                  <small>{tBadges(`${b.id}.name`, { defaultValue: b.name })}</small>
                </span>
              ))}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="settings__logout-btn"
            onClick={handleLogout}
          >
            Sair da conta
          </button>
        </div>

        {/* Stats */}
        <div className="settings-context-panel__group">
          <h3>Estatísticas</h3>
          <div className="settings-login__stats-grid">
            <div className="settings-login__stat">
              <strong>{profile.stats.scripts}</strong>
              <small>Scripts</small>
            </div>
            <div className="settings-login__stat">
              <strong>{profile.stats.likes_given}</strong>
              <small>Likes dados</small>
            </div>
            <div className="settings-login__stat">
              <strong>{profile.stats.likes_received}</strong>
              <small>Likes recebidos</small>
            </div>
            <div className="settings-login__stat">
              <strong>{profile.stats.comments}</strong>
              <small>Comentários</small>
            </div>
            <div className="settings-login__stat">
              <strong>{profile.stats.approved_scripts}</strong>
              <small>Scripts aprovados</small>
            </div>
            <div className="settings-login__stat">
              <strong>{profile.member_days}</strong>
              <small>Dias como membro</small>
            </div>
          </div>
        </div>

        {/* All badges */}
        {profile.badges.length > 0 && (
          <div className="settings-context-panel__group">
            <h3>Conquistas ({profile.badges.length})</h3>
            <div className="settings-login__all-badges">
              {profile.badges.map((b) => (
                <div key={b.id} className="settings-login__badge-card">
                  <BadgeIcon iconPath={b.icon} size={24} />
                  <div>
                    <div className="settings-login__badge-name">{tBadges(`${b.id}.name`, { defaultValue: b.name })}</div>
                    <div className="settings-login__badge-desc">{tBadges(`${b.id}.desc`, { defaultValue: b.description })}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Scripts */}
        {profile.scripts.length > 0 && (
          <div className="settings-context-panel__group">
            <h3>Meus Scripts ({profile.scripts.length})</h3>
            <div className="settings-login__scripts-list">
              {profile.scripts.map((s) => (
                <div key={s.id} className="settings-login__script-item">
                  <div className="settings-login__script-title">{s.title}</div>
                  <div className="settings-login__script-meta">
                    <span className={s.status === "approved" ? "status-approved" : s.status === "pending" ? "status-pending" : "status-rejected"}>
                      {s.status}
                    </span>
                    <span>👍 {s.likes} 👎 {s.dislikes}</span>
                    <span>💬 {s.comment_count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="settings-context-panel">
      <div className="settings-context-panel__group">
        <p style={{ color: "var(--text-light)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "1rem" }}>
          Conecte-se à sua conta Makai Forge para interagir com scripts,
          comentários e muito mais.
        </p>

        {mode === "idle" && (
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="settings__login-btn"
              onClick={() => { setMode("login"); setError(null); }}
            >
              Fazer Login
            </button>
            <button
              type="button"
              className="settings__register-btn"
              onClick={() => { setMode("register"); setError(null); }}
            >
              Criar Conta
            </button>
          </div>
        )}

        {mode === "login" && (
          <div className="settings__auth-form" style={{ maxWidth: 360 }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="seu@email.com"
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", borderRadius: 6,
                  border: "1px solid rgba(168,85,247,0.2)", background: "rgba(0,0,0,0.3)",
                  color: "var(--text)", fontSize: "0.85rem", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", borderRadius: 6,
                  border: "1px solid rgba(168,85,247,0.2)", background: "rgba(0,0,0,0.3)",
                  color: "var(--text)", fontSize: "0.85rem", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {error && <p style={{ color: "#ef4444", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>{error}</p>}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                disabled={loading}
                onClick={handleLogin}
                style={{
                  background: "linear-gradient(135deg,#8b5cf6,#6366f1)", color: "#fff",
                  border: "none", borderRadius: 6, padding: "0.5rem 1.25rem",
                  fontSize: "0.85rem", fontWeight: 600, cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.6 : 1, transition: "opacity 0.2s",
                }}
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
              <button
                type="button"
                onClick={() => { setMode("idle"); setError(null); }}
                style={{
                  background: "transparent", color: "var(--text-dim)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                  padding: "0.5rem 1rem", fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                Voltar
              </button>
            </div>
            <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--text-dim)" }}>
              Esqueceu a senha? Acesse{" "}
              <span style={{ color: "#a855f7" }}>
                localhost:8788
              </span>{" "}
              no navegador para recuperar.
            </p>
          </div>
        )}

        {mode === "register" && (
          <div className="settings__auth-form" style={{ maxWidth: 360 }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>Nome de usuário</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                placeholder="usuário"
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", borderRadius: 6,
                  border: "1px solid rgba(168,85,247,0.2)", background: "rgba(0,0,0,0.3)",
                  color: "var(--text)", fontSize: "0.85rem", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                placeholder="seu@email.com"
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", borderRadius: 6,
                  border: "1px solid rgba(168,85,247,0.2)", background: "rgba(0,0,0,0.3)",
                  color: "var(--text)", fontSize: "0.85rem", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                placeholder="•••••••• (mín. 6 caracteres)"
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", borderRadius: 6,
                  border: "1px solid rgba(168,85,247,0.2)", background: "rgba(0,0,0,0.3)",
                  color: "var(--text)", fontSize: "0.85rem", outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {error && <p style={{ color: "#ef4444", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>{error}</p>}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                disabled={loading}
                onClick={handleRegister}
                style={{
                  background: "linear-gradient(135deg,#8b5cf6,#6366f1)", color: "#fff",
                  border: "none", borderRadius: 6, padding: "0.5rem 1.25rem",
                  fontSize: "0.85rem", fontWeight: 600, cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Criando..." : "Criar Conta"}
              </button>
              <button
                type="button"
                onClick={() => { setMode("idle"); setError(null); }}
                style={{
                  background: "transparent", color: "var(--text-dim)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6,
                  padding: "0.5rem 1rem", fontSize: "0.85rem", cursor: "pointer",
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
