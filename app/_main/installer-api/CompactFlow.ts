import { WindowManager } from "@main/services";

export function openCompatFlowWindow(exePath?: string) {
  WindowManager.openCompactFlowWindow();

  if (exePath && WindowManager.compactFlowWindow) {
    const wc = WindowManager.compactFlowWindow.webContents;
    if (wc.isLoading()) {
      wc.once("did-finish-load", () => {
        WindowManager.compactFlowWindow?.webContents.send("file-opened", {
          filePath: exePath,
          testMode: process.argv.includes("--test"),
        });
      });
    } else {
      wc.send("file-opened", {
        filePath: exePath,
        testMode: process.argv.includes("--test"),
      });
    }
  }
}
