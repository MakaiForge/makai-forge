import type { ReactNode } from "react";
import type { GameOptionsCategoryId } from "@renderer/context/game-details/game-details.context.types";

interface CategoryItem {
  id: GameOptionsCategoryId;
  label: string;
  icon: ReactNode;
}

interface GameOptionsSidebarProps {
  categories: CategoryItem[];
  selectedCategory: GameOptionsCategoryId;
  onSelectCategory: (categoryId: GameOptionsCategoryId) => void;
}

export function GameOptionsSidebar({
  categories,
  selectedCategory,
  onSelectCategory,
}: Readonly<GameOptionsSidebarProps>) {
  return (
    <aside className="game-options-modal__sidebar">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={`game-options-modal__sidebar-button ${
            selectedCategory === category.id
              ? "game-options-modal__sidebar-button--active"
              : ""
          }`}
          onClick={() => onSelectCategory(category.id)}
        >
          <span className="game-options-modal__sidebar-button-icon">
            {category.icon}
          </span>
          <span>{category.label}</span>
        </button>
      ))}
    </aside>
  );
}
