import { launchCompactFlow } from "./events/compact-flow";

export function openCompatFlowWindow(exePath?: string) {
  launchCompactFlow(exePath);
}
