interface Props {
  findVisible: boolean;
  findQuery: string;
  findCount: string;
  findInputRef: React.Ref<HTMLInputElement>;
  onFindQueryChange: (query: string) => void;
  onDoFind: (forward: boolean) => void;
  onCloseFind: () => void;
}

export function BrowserFindBar({ findVisible, findQuery, findCount, findInputRef, onFindQueryChange, onDoFind, onCloseFind }: Props) {
  return (
    <div className={`browser-view__find-bar${findVisible ? "" : " hidden"}`}>
      <input
        ref={findInputRef}
        id="find-input"
        className="find-input"
        type="text"
        placeholder="Localizar na página..."
        value={findQuery}
        onChange={(e) => {
          onFindQueryChange(e.target.value);
          if (e.target.value) onDoFind(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDoFind(!e.shiftKey);
          if (e.key === "Escape") onCloseFind();
        }}
      />
      <span className="find-count">{findCount}</span>
      <button className="find-btn" onClick={() => onDoFind(false)} title="Anterior">&uarr;</button>
      <button className="find-btn" onClick={() => onDoFind(true)} title="Próximo">&darr;</button>
      <button className="find-btn find-close" onClick={onCloseFind} title="Fechar">&times;</button>
    </div>
  );
}
