import axios from "axios";
import fs from "node:fs";
import path from "node:path";

export interface DownloadProgress {
  bytes: number;
  total: number | null;
  percent: number | null;
}

export type ProgressCallback = (status: string, detail?: string) => void;

export async function downloadFile(
  url: string,
  destDir: string,
  folderName: string,
  onProgress?: ProgressCallback
): Promise<{ archivePath: string; destDir: string }> {
  fs.mkdirSync(destDir, { recursive: true });

  const urlPath = new URL(url).pathname;
  const originalName = path.basename(urlPath) || "installer.exe";
  const archiveName = `_download_${originalName}`;
  const archivePath = path.join(destDir, archiveName);

  if (fs.existsSync(archivePath)) {
    onProgress?.("download_ok", "Arquivo já existe");
    return { archivePath, destDir };
  }

  onProgress?.("download", url);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 300000,
  });

  const totalLength = response.headers["content-length"]
    ? Number(response.headers["content-length"])
    : null;
  let downloadedBytes = 0;

  const writer = fs.createWriteStream(archivePath);
  response.data.on("data", (chunk: Buffer) => {
    downloadedBytes += chunk.length;
    if (totalLength) {
      const pct = Math.round((downloadedBytes / totalLength) * 100);
      onProgress?.("download_progress", `${pct}%`);
    } else {
      onProgress?.("download_progress", `${Math.round(downloadedBytes / 1024 / 1024)} MB`);
    }
  });

  response.data.pipe(writer);
  await new Promise<void>((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  onProgress?.("download_ok", "Download concluído");
  return { archivePath, destDir };
}
