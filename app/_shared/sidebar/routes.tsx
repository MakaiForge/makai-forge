import {
  AppsIcon,
  DownloadIcon,
  GearIcon,
  HomeIcon,
  StackIcon,
  TabIcon,
  ToolsIcon,
} from "@primer/octicons-react";

export interface RouteDef {
  path: string;
  nameKey: string;
  render: () => JSX.Element;
  requiresHackerman?: boolean;
}

export const routes: (RouteDef | false)[] = [
  { path: "/", nameKey: "home", render: () => <HomeIcon /> },
  { path: "/catalogue", nameKey: "catalogue", render: () => <AppsIcon />, requiresHackerman: true },
  { path: "/downloads", nameKey: "downloads", render: () => <DownloadIcon />, requiresHackerman: true },
  { path: "/proton-tools", nameKey: "proton_tools", render: () => <StackIcon /> },
  { path: "/games", nameKey: "Games", render: () => <TabIcon /> },
  { path: "/mod-manager", nameKey: "mod_manager", render: () => <ToolsIcon /> },
  { path: "/settings", nameKey: "settings", render: () => <GearIcon /> },
];
