import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { getVenvPythonPath } from "@prefix/core/venv";

export interface PythonResult {
  success: boolean
  stdout: string
  stderr: string
  returncode: number
}

function getCliPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "python", "cli.py")
    : path.join(app.getAppPath(), "tools", "prefix", "python", "cli.py");
}

export async function runPythonCommand(
  pyCommand: string,
  pyArgs: string[],
  env?: Record<string, string>,
): Promise<PythonResult> {
  const pythonBin = getVenvPythonPath();
  if (!pythonBin) {
    return { success: false, stdout: "", stderr: "Python bin not found", returncode: -1 };
  }

  const cliPath = getCliPath();
  if (!fs.existsSync(cliPath)) {
    return { success: false, stdout: "", stderr: `CLI not found: ${cliPath}`, returncode: -1 };
  }

  return new Promise(resolve => {
    const child = spawn(pythonBin, [cliPath, pyCommand, ...pyArgs], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        returncode: code ?? -1,
      });
    });

    child.on("error", (err) => {
      resolve({ success: false, stdout, stderr: err.message, returncode: -1 });
    });
  });
}
