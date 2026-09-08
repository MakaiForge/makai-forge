import { registerEvent } from "../register-event";
import { closeRunner } from "@emulators/installer";
import { WindowManager } from "@main/services";

registerEvent("closeRunner", async (_event, runnerId: string) => {
  await closeRunner(runnerId);
  WindowManager.mainWindow?.webContents.send("on-runner-stopped", runnerId);
});
