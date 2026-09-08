import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("setupAPI", {
  onVenvProgress: (cb: (data: { status: string; percent: number }) => void) => {
    const listener = (_event: any, data: any) => cb(data);
    ipcRenderer.on("on-venv-progress", listener);
    return () => ipcRenderer.removeListener("on-venv-progress", listener);
  },
  onResourceProgress: (cb: (data: { status: string; percent: number; detail?: string }) => void) => {
    const listener = (_event: any, data: any) => cb(data);
    ipcRenderer.on("on-resource-progress", listener);
    return () => ipcRenderer.removeListener("on-resource-progress", listener);
  },
  onSetupComplete: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("on-setup-complete", listener);
    return () => ipcRenderer.removeListener("on-setup-complete", listener);
  },
});
