const STRINGS: Record<string, Record<string, string>> = {
  "features": { en: "Features", pt: "Recursos", es: "Características" },
  "details": { en: "Details", pt: "Detalhes", es: "Detalles" },
  "author": { en: "Author", pt: "Autor", es: "Autor" },
  "license": { en: "License", pt: "Licença", es: "Licencia" },
  "viewOnGitHub": { en: "View on GitHub", pt: "Ver no GitHub", es: "Ver en GitHub" },
};

export function t(key: string): string {
  const lang = navigator.language?.slice(0, 2) || "en";
  return STRINGS[key]?.[lang] || STRINGS[key]?.en || key;
}
