export interface FomodFile {
  source: string;
  destination: string;
  priority: number;
  alwaysInstall: boolean;
}

export interface FomodPlugin {
  name: string;
  description?: string;
  type?: string;
  image_path?: string;
  files: FomodFile[];
  condition_flags?: Record<string, string>;  // flags SET when this plugin is selected
  dependencies?: Record<string, string>;      // flags that must be active for this plugin to be selectable
}

export interface FomodGroup {
  name: string;
  type: "SelectAll" | "SelectAtLeastOne" | "SelectAtMostOne" | "SelectExactlyOne" | "SelectAny";
  plugins: FomodPlugin[];
}

export interface FomodStep {
  id: string;
  name: string;
  groups: FomodGroup[];
  visible?: Record<string, string>;  // flags that must be active for this step to be shown
}

export interface FomodConfig {
  name: string;
  module_image_path?: string;
  steps: FomodStep[];
  required_files?: FomodFile[];
}
