interface HealthBannerProps {
  status: "loading" | "valid" | "issues" | "error";
  message: string;
  onConfigure?: () => void;
}

export function HealthBanner({ status, message, onConfigure }: HealthBannerProps) {
  if (status === "loading") return null;

  const icon = status === "valid" ? "✅ " : status === "issues" ? "⚠️ " : "❌ ";

  return (
    <div className={`mod-manager__health-banner mod-manager__health-banner--${status}`}>
      {icon}{message}
      {status !== "valid" && (
        <button className="mod-manager__health-banner-fix" onClick={onConfigure}>
          Configurar
        </button>
      )}
    </div>
  );
}
