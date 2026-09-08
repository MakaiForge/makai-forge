export type ModCategory =
  | "standard"       // Data/ → Data/
  | "fomod"          // Fomod/ModuleConfig.xml — precisa de diálogo
  | "skse-loader"    // skse_loader.exe + .dll — script extender
  | "skse-plugin"    // SKSE/Plugins/*.dll — plugin pro SKSE
  | "loose-plugin"   // .esp/.esm solto na raiz
  | "bodyslide"      // CalienteTools/BodySlide/
  | "unknown";

export interface ModFileEntry {
  source: string;      // path dentro do archive
  destination: string; // path relativo ao Data/ (ou raiz do jogo)
}

export interface ModStructure {
  category: ModCategory;
  hasFomod: boolean;
  wrapperLevels: number;
  files: ModFileEntry[];
  plugins: string[];     // .esp/.esm
  archives: string[];    // .bsa
  sksePlugins: string[]; // SKSE/Plugins/*.dll
  hasData: boolean;
}

export interface InstallPlan {
  modName: string;
  structure: ModStructure;
  steps: InstallStep[];
}

export interface InstallStep {
  type: "copy" | "fomod" | "skse-deploy" | "warning";
  source: string;
  destination: string;
}
