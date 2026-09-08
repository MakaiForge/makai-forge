import fs from "node:fs";
import path from "node:path";
import { CloudProvider, RemoteFile } from "../cloud-provider";

const BOX_API = "https://api.box.com/2.0";
const BOX_UPLOAD = "https://upload.box.com/api/2.0";

export class AppBoxProvider implements CloudProvider {
  readonly name = "appbox";
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request(url: string, options: RequestInit = {}): Promise<any> {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AppBox API error: ${res.status} ${err}`);
    }

    return res.json();
  }

  private async ensureFolder(folderPath: string): Promise<string> {
    const parts = folderPath.split("/").filter(Boolean);
    let parentId = "0";

    for (const part of parts) {
      const data = await this.request(
        `${BOX_API}/folders/${parentId}/items?limit=500`
      );
      const existing = (data.entries || []).find(
        (e: any) => e.type === "folder" && e.name === part
      );
      if (existing) {
        parentId = existing.id;
      } else {
        const newFolder = await this.request(`${BOX_API}/folders`, {
          method: "POST",
          body: JSON.stringify({
            name: part,
            parent: { id: parentId },
          }),
        });
        parentId = newFolder.id;
      }
    }

    return parentId;
  }

  async upload(localPath: string, destPath: string): Promise<void> {
    const dir = path.dirname(destPath);
    const fileName = path.basename(destPath);
    const folderId = await this.ensureFolder(dir);

    const content = fs.readFileSync(localPath);
    const formData = new FormData();
    formData.append("attributes", JSON.stringify({ name: fileName, parent: { id: folderId } }));
    formData.append("file", new Blob([content]), fileName);

    const data = await this.request(
      `${BOX_API}/folders/${folderId}/items?limit=500`
    );
    const existing = (data.entries || []).find(
      (e: any) => e.type === "file" && e.name === fileName
    );

    const url = existing
      ? `${BOX_UPLOAD}/files/${existing.id}/content`
      : `${BOX_UPLOAD}/files/content`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AppBox upload error: ${res.status} ${err}`);
    }
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const dir = path.dirname(remotePath);
    const fileName = path.basename(remotePath);
    const folderId = await this.ensureFolder(dir);

    const data = await this.request(
      `${BOX_API}/folders/${folderId}/items?limit=500`
    );
    const file = (data.entries || []).find(
      (e: any) => e.type === "file" && e.name === fileName
    );
    if (!file) throw new Error(`File not found: ${remotePath}`);

    const res = await fetch(`${BOX_API}/files/${file.id}/content`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`AppBox download error: ${res.status} ${err}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
  }

  async listFiles(prefix: string): Promise<RemoteFile[]> {
    const folderId = await this.ensureFolder(prefix);
    const data = await this.request(
      `${BOX_API}/folders/${folderId}/items?fields=type,id,name,size,modified_at&limit=500`
    );

    const results: RemoteFile[] = [];

    for (const e of (data.entries || [])) {
      if (e.type !== "file") continue;

      let size = Number(e.size);
      if (!size) {
        try {
          const fileInfo = await this.request(`${BOX_API}/files/${e.id}?fields=size`);
          size = Number(fileInfo.size) || 0;
        } catch { }
      }

      results.push({
        name: e.name,
        path: `${prefix}/${e.name}`,
        sizeBytes: size,
        lastModified: e.modified_at,
      });
    }

    return results;
  }

  async deleteFile(remotePath: string): Promise<void> {
    const dir = path.dirname(remotePath);
    const fileName = path.basename(remotePath);
    const folderId = await this.ensureFolder(dir);

    const data = await this.request(
      `${BOX_API}/folders/${folderId}/items?limit=500`
    );
    const file = (data.entries || []).find(
      (e: any) => e.type === "file" && e.name === fileName
    );
    if (!file) throw new Error(`File not found: ${remotePath}`);

    await fetch(`${BOX_API}/files/${file.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
  }
}
