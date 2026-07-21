export function extractFilename(
  url: string,
  originalUrl?: string
): string | undefined {
  if (originalUrl?.includes("#")) {
    const hashPart = originalUrl.split("#")[1];
    if (hashPart && !hashPart.startsWith("http") && hashPart.includes(".")) {
      return hashPart;
    }
  }

  if (url.includes("#")) {
    const hashPart = url.split("#")[1];
    if (hashPart && !hashPart.startsWith("http") && hashPart.includes(".")) {
      return hashPart;
    }
  }

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const pathParts = pathname.split("/");
    const filename = pathParts.at(-1);

    if (filename?.includes(".") && filename.length > 0) {
      return decodeURIComponent(filename);
    }
  } catch {
    // Invalid URL
  }

  return undefined;
}
