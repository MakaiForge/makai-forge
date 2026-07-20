import type { GameEntry, ProfileEntry } from "../ui/types/mod.types";

interface GamePresetBarProps {
  games: GameEntry[]
  selectedGame: string
  profiles: ProfileEntry[]
  selectedProfile: string
  onGameChange: (gameId: string) => void
  onGameConfig: () => void
  onProfileChange: (profile: string) => void
  onAddProfile: () => void
  onDetectGames?: () => void
}

function gameIdFor(g: GameEntry): string {
  return g.gameId || g.name;
}

export function GamePresetBar({
  games, selectedGame, profiles, selectedProfile,
  onGameChange, onGameConfig, onProfileChange, onAddProfile, onDetectGames,
}: GamePresetBarProps) {
  return (
    <div className="mod-manager__selector-group">
      <div className="mod-manager__selector">
        <label>Jogo</label>
        <select value={selectedGame} onChange={e => onGameChange(e.target.value)}>
          {games.length === 0 && <option value="">Nenhum jogo</option>}
          {games.map(g => (
            <option key={gameIdFor(g)} value={gameIdFor(g)}>{g.name}</option>
          ))}
        </select>
        <button className="mod-manager__topbar-btn" onClick={onGameConfig} title="Configurar jogo">⚙</button>
        {onDetectGames && <button className="mod-manager__topbar-btn" onClick={onDetectGames} title="Detectar jogos">🔍</button>}
      </div>
      <div className="mod-manager__selector">
        <label>Perfil</label>
        <select value={selectedProfile} onChange={e => onProfileChange(e.target.value)}>
          {profiles.length === 0 && <option value="">{selectedGame ? "Sem perfis" : "Selecione um jogo"}</option>}
          {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <button className="mod-manager__topbar-btn" onClick={onAddProfile} title="Adicionar perfil">+</button>
      </div>
    </div>
  );
}
