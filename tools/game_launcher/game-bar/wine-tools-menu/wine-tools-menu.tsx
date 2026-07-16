import { useState } from "react";
import type { GameConfig } from "@provision/AddGame/games-service";
import { useClickOutside } from "@renderer/hooks/use-click-outside";
import "./wine-tools-menu.scss";

interface WineToolsMenuProps {
  game: GameConfig;
  onWineTool?: (toolId: string) => void;
}

const tools = [
  { id: "winetricks", label: "Wine Tricks", icon: "🧪" },
  { id: "taskmgr", label: "Gerenciador de Tarefas", icon: "📊" },
  { id: "control", label: "Painel de Controle", icon: "🎛" },
  { id: "regedit", label: "Registro do Wine", icon: "📝" },
  { id: "winecfg", label: "Configurações do Wine", icon: "🔧" },
  { id: "wineconsole", label: "Console do Wine", icon: "💻" },
] as const;

const bottomTools = [
  { id: "terminal", label: "Terminal Bash", icon: "🖥" },
  { id: "runexe", label: "Executar Programa", icon: "▶" },
  { id: "winelog", label: "Log do Wine", icon: "📋" },
] as const;

export function WineToolsMenu({
  game,
  onWineTool,
}: WineToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useClickOutside(() => setIsOpen(false));

  const hasPrefix = game.winePrefixPath || game.prefix;

  return (
    <div className="wine-tools-menu" ref={menuRef}>
      <button
        className="wine-tools-menu__toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Wine Tools"
        disabled={!hasPrefix}
      >
        ▲
      </button>

      {isOpen && (
        <div className="wine-tools-menu__dropdown">
          <div className="wine-tools-menu__header">
            <span>Ferramentas Wine</span>
          </div>

          <div className="wine-tools-menu__section">
            {tools.map((tool) => (
              <button
                key={tool.id}
                className="wine-tools-menu__item"
                onClick={() => {
                  onWineTool?.(tool.id);
                  setIsOpen(false);
                }}
                disabled={!hasPrefix}
              >
                <span className="wine-tools-menu__icon">{tool.icon}</span>
                <span className="wine-tools-menu__label">{tool.label}</span>
              </button>
            ))}
          </div>

          <div className="wine-tools-menu__divider" />

          <div className="wine-tools-menu__section">
            {bottomTools.map((tool) => (
              <button
                key={tool.id}
                className="wine-tools-menu__item"
                onClick={() => {
                  onWineTool?.(tool.id);
                  setIsOpen(false);
                }}
                disabled={!hasPrefix}
              >
                <span className="wine-tools-menu__icon">{tool.icon}</span>
                <span className="wine-tools-menu__label">{tool.label}</span>
              </button>
            ))}
          </div>

          {!hasPrefix && (
            <div className="wine-tools-menu__warning">
              Configure o prefixo do Wine primeiro
            </div>
          )}
        </div>
      )}
    </div>
  );
}
