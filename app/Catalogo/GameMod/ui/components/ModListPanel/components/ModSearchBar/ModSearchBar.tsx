import { SearchIcon } from "@primer/octicons-react";
import "./ModSearchBar.scss";

interface ModSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

export function ModSearchBar({ value, onChange, inputRef }: ModSearchBarProps) {
  return (
    <div className="mod-search-bar">
      <SearchIcon />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search mods..."
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
