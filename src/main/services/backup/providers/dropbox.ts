import fs from "node:fs";
import path from "node:path";
import { CloudProvider, RemoteFile } from "../cloud-provider";

const DROPBOX_API = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT = "https://content.dropboxapi.com/2";
const DROPBOX_TOKEN_URL = "https://api.dropbox.com/oauth2/token";
const CLIENT_ID = "6ndfc2ow8386f93";
const CLIENT_SECRET = "mpflgofewmtarrj";

export class DropboxProvider implements CloudProvider {
  readonly name = "dropbox";
  private accessToken: string;
  private refreshToken: string | null;
  private expiresAt: number;
  private onTokenRefreshed?: (newToken: string) => void;

  constructor(
    auth: { accessToken: string; refreshToken?: string | null; expiresAt?: number },
    onTokenRefreshed?: (newToken: string) => void,
  ) {
    this.accessToken = auth.accessToken;
    this.refreshToken = auth.refreshToken || null;
    this.expiresAt = auth.expiresAt || 0;
    this.onTokenRefreshed = onTokenRefreshed;
  }

  private async ensureToken(): Promise<void> {
    if (Date.now() < this.expiresAt - 60000) return;

    if (!this.refreshToken) {
      throw new Error("Token expirado e sem refresh token disponível. Faça login novamente.");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const res = await fetch(DROPBOX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Falha ao renovar token Dropbox: ${data.error || res.status}`);
    }

    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in || 14400) * 1000;
    if (data.refresh_token) this.refreshToken = data.refresh_token;

    if (this.onTokenRefreshed) this.onTokenRefreshed(this.accessToken);
  }

  private async request(
    url: string,
    options: RequestInit & { body?: any }
  ): Promise<any> {
    await this.ensureToken();

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dropbox API error: ${res.status} ${err}`);
    }

    return res.json();
  }

  async upload(localPath: string, destPath: string): Promise<void> {
    await this.ensureToken();
    const content = fs.readFileSync(localPath);

    const res = await fetch(
      `${DROPBOX_CONTENT}/files/upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: `/${destPath}`,
            mode: "overwrite",
          }),
          "Content-Type": "application/octet-stream",
        },
        body: content,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dropbox upload error: ${res.status} ${err}`);
    }
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.ensureToken();
    const res = await fetch(
      `${DROPBOX_CONTENT}/files/download`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Dropbox-API-Arg": JSON.stringify({ path: `/${remotePath}` }),
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dropbox download error: ${res.status} ${err}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
  }

  async listFiles(prefix: string): Promise<RemoteFile[]> {
    const data = await this.request(
      `${DROPBOX_API}/files/list_folder`,
      {
        method: "POST",
        body: JSON.stringify({
          path: `/${prefix}`,
          recursive: false,
        }),
      }
    );

    return (data.entries || [])
      .filter((e: any) => e[".tag"] === "file")
      .map((e: any) => ({
        name: e.name,
        path: e.path_lower,
        sizeBytes: e.size,
        lastModified: e.server_modified,
      }));
  }

  async deleteFile(remotePath: string): Promise<void> {
    await this.request(`${DROPBOX_API}/files/delete`, {
      method: "POST",
      body: JSON.stringify({ path: `/${remotePath}` }),
    });
  }
}
