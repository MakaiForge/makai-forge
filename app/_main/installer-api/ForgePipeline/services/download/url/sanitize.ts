export function sanitizeFilename(filename: string): string {
  return filename.replaceAll(/[<>:"/\\|?*]/g, "_");
}

export function sanitizeRelativePath(pathValue: string): string {
  return pathValue
    .split(/[\\/]+/)
    .map((segment) => sanitizeFilename(segment))
    .filter(Boolean)
    .join("/");
}
