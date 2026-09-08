import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { WindowManager, logger } from "./services";
import { migrateJsonToSqlite } from "@main/services/sqlite-store";
import { handleDeepLinkPath } from "./deep-link";

export function setupSecondInstance() {
  app.on("second-instance", async (_event, commandLine) => {
    const deepLink = commandLine.find((arg) => arg.startsWith("protonforge://"));
    const isRunDeepLink = deepLink?.startsWith("protonforge://run");

    if (!isRunDeepLink) {
      if (WindowManager.mainWindow) {
        if (WindowManager.mainWindow.isMinimized())
          WindowManager.mainWindow.restore();
        WindowManager.mainWindow.focus();
        tryRefreshFlag();
      } else {
        WindowManager.createMainWindow();
      }
    }

    if (deepLink) {
      await handleDeepLinkPath(deepLink);
    }

    const exeArg = commandLine.find((arg) =>
      /\.(exe|msi|sh|AppImage)$/i.test(arg) && fs.existsSync(arg)
    );
    if (exeArg) {
      import("@provision/compatflow-adapter").then(({ openCompatFlowWindow }) => {
        openCompatFlowWindow(exeArg);
      });
    }
  });
}

function tryRefreshFlag() {
  const cfRefreshFlag = path.join(
    app.getPath("userData"), ".compatflow-refresh"
  );
  try {
    if (fs.existsSync(cfRefreshFlag)) {
      fs.unlinkSync(cfRefreshFlag);
      migrateJsonToSqlite();
      WindowManager.mainWindow?.webContents.send("on-library-batch-complete");
      logger.info("[CompatFlow] Library refresh triggered");
    }
  } catch {}
}
