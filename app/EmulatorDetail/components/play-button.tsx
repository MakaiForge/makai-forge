import { Play, Square } from "lucide-react";

interface PlayButtonProps {
  launching: boolean;
  running: boolean;
  onToggle: () => void;
}

export function PlayButton({ launching, running, onToggle }: PlayButtonProps) {
  return (
    <button
      type="button"
      className={`emulator-detail__play-btn ${running ? "emulator-detail__play-btn--running" : ""}`}
      onClick={onToggle}
      disabled={launching}
      title={running ? "Parar" : "Executar"}
    >
      {launching ? (
        <span className="emulator-detail__spinner" />
      ) : running ? (
        <Square size={20} fill="currentColor" />
      ) : (
        <Play size={20} fill="currentColor" />
      )}
    </button>
  );
}
