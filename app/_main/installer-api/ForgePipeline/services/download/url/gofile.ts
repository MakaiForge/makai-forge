export function parseGofileUri(uri: string): {
  id: string;
  password: string | undefined;
} {
  let normalizedUri = uri.trim();

  if (
    !normalizedUri.startsWith("http://") &&
    !normalizedUri.startsWith("https://")
  ) {
    normalizedUri = `https://${normalizedUri}`;
  }

  try {
    const parsed = new URL(normalizedUri);
    const segments = parsed.pathname.split("/").filter(Boolean);

    if (parsed.hostname.endsWith(".gofile.io") && segments[0] === "download") {
      const id = segments[2];
      const password = parsed.searchParams.get("password") || undefined;
      return { id, password };
    }

    const id = segments.pop() || "";
    const password = parsed.searchParams.get("password") || undefined;

    return {
      id,
      password,
    };
  } catch {
    const id =
      normalizedUri.split("?")[0].split("/").filter(Boolean).pop() || "";
    return {
      id,
      password: undefined,
    };
  }
}
