import { createWineToolRunner, WineTool } from "@main/services/wine-tools";
import { registerEvent } from "@main/events/register-event";
import { spawn } from "node:child_process";
import { app } from "electron";
import path from "node:path";
import { logsPath } from "@main/constants";
import type { GameShop } from "@types";
import { getVenvPythonPath } from "@container/core/venv";
import { logOperation } from "../activity-logger";

const getGUIScriptPath = () =>
  path.join(app.getAppPath(), "app", "_resources", "python", "wine_log_gui.py");

const runWineTool = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  tool: string
): Promise<boolean> => {
  logOperation("runWineTool", "started", { shop, objectId, tool });
  const _start = Date.now();
  try {
    if (tool === "winelog") {
      const pythonBin = getVenvPythonPath();
      const guiScript = getGUIScriptPath();
      if (pythonBin && guiScript) {
        const umuLogPath = path.join(logsPath, "umu.log");
        const child = spawn(pythonBin, [guiScript, "--tail", umuLogPath], {
          stdio: ["ignore", "ignore", "pipe"],
          detached: true,
        });
        child.unref();
        child.on("error", (err) => {
          console.error("[run-wine-tool] Failed to spawn Python log GUI:", err);
        });
        child.stderr?.on("data", (data) => {
          console.error("[run-wine-tool] Python GUI stderr:", data.toString());
        });
        logOperation("runWineTool", "success", { shop, objectId, tool, duration_ms: Date.now() - _start });
        return true;
      }
      console.error("[run-wine-tool] Python or script not found:", { pythonBin, guiScript });
      logOperation("runWineTool", "error", { shop, objectId, tool, error: "Python or script not found", duration_ms: Date.now() - _start });
      return false;
    }

    const runner = await createWineToolRunner({
      shop,
      objectId,
    });

    const result = await runner.run(tool as WineTool);
    logOperation("runWineTool", result.success ? "success" : "error", {
      shop, objectId, tool, duration_ms: Date.now() - _start,
    });
    return result.success;
  } catch (error) {
    console.error("Failed to run wine tool:", error);
    logOperation("runWineTool", "error", { shop, objectId, tool, error: String(error), duration_ms: Date.now() - _start });
    return false;
  }
};

registerEvent("runWineTool", runWineTool);
