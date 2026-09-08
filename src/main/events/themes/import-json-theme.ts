import { dialog } from "electron";
import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { WindowManager } from "@main/services";
import { themesStore } from "@main/store";
import { registerEvent } from "../register-event";
import type { Theme } from "@types";

const importJsonTheme = async (_event: Electron.IpcMainInvokeEvent) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(
    WindowManager.mainWindow!,
    {
      title: "Import Theme",
      filters: [{ name: "Theme Files", extensions: ["json", "makaitheme"] }],
      properties: ["openFile"],
    }
  );

  if (canceled || filePaths.length === 0) {
    return null;
  }

  const filePath = filePaths[0];
  const content = await readFile(filePath, "utf-8");
  const json = JSON.parse(content);

  const name = json.name || "Imported Theme";
  const vars: Record<string, string> = json.vars || {};
  const css = json.css || "";

  const varEntries = Object.entries(vars).filter(
    ([, value]) => value && value.trim() !== ""
  );

  let generatedCss = `:root {\n`;
  for (const [key, value] of varEntries) {
    generatedCss += `  ${key}: ${value};\n`;
  }
  generatedCss += `}\n`;

  if (css) {
    generatedCss += `\n${css}`;
  }

  const theme: Theme = {
    id: randomUUID(),
    name,
    author: undefined,
    authorName: undefined,
    isActive: false,
    code: generatedCss,
    vars,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await themesStore.put(theme.id, theme);

  return theme;
};

registerEvent("importJsonTheme", importJsonTheme);
