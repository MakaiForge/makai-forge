import { registerEvent } from "@main/events/register-event";
import { spawn } from "node:child_process";
import path from "node:path";
import { app } from "electron";
import { getVenvPythonPath } from "@prefix/core/venv";

registerEvent("eslify", async (_event, pluginPath: string, dryRun: boolean = false, safeCheck: boolean = true) => {
  try {
    const venvPython = getVenvPythonPath();
    if (!venvPython) {
      return { success: false, error: "Venv Python não encontrado. Execute 'npm run reinstall' para configurar o ambiente Python." };
    }

    const script = path.join(
      app.getAppPath(), "data", "install-api", "proton_recommended", "python", "Utils", "eslifier.py"
    );

    const args = [script, pluginPath];
    if (dryRun) args.push("--dry-run");
    if (!safeCheck) args.push("--no-safe-check");

    return await new Promise<{ success: boolean; error?: string; is_esl?: boolean; safe?: boolean; new_path?: string; max_formid?: number }>((resolve) => {
      const proc = spawn(venvPython, args);
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code !== 0) {
          resolve({ success: false, error: stderr || `Process exited with code ${code}` });
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ success: false, error: `Invalid output: ${stdout}` });
        }
      });
      proc.on("error", (err) => resolve({ success: false, error: err.message }));
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});
