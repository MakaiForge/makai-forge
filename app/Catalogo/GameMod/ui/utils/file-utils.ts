import { IMAGE_EXTENSIONS, TEXT_EXTENSIONS, README_PATTERNS } from "./constants";

export function getFileExtension(filePath: string): string {
  return filePath.split(".").pop()?.toLowerCase() ?? "";
}

export function isImageFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().split(".").pop();
  return ext ? IMAGE_EXTENSIONS.has(`.${ext}`) : false;
}

export function isTextFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().split(".").pop();
  return ext ? TEXT_EXTENSIONS.has(`.${ext}`) : false;
}

export function isReadmeFile(filePath: string): boolean {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  const nameNoExt = name.replace(/\.[^.]+$/, "");
  const parentDir = filePath.split("/").slice(-2, -1)[0]?.toLowerCase() ?? "";
  return README_PATTERNS.some(p => nameNoExt.includes(p) || parentDir.includes(p));
}

export function isPluginFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().split(".").pop();
  return ext === "esp" || ext === "esm" || ext === "esl";
}

export function getPluginType(filePath: string): "ESP" | "ESM" | "ESL" {
  const ext = filePath.toLowerCase().split(".").pop();
  if (ext === "esm") return "ESM";
  if (ext === "esl") return "ESL";
  return "ESP";
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function base64ToDataUrl(base64: string, ext: string): string {
  const mime = ext === "png" ? "image/png" :
               ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
               ext === "webp" ? "image/webp" :
               ext === "gif" ? "image/gif" : "image/bmp";
  return `data:${mime};base64,${base64}`;
}
