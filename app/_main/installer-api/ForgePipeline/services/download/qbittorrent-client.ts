import axios, { AxiosInstance } from "axios";
import { logger } from "@main/services/logger";

export class QBittorrentClient {
  private axios: AxiosInstance;
  private sid: string | null = null;

  constructor(
    private host = "http://localhost",
    private port = 8080,
    private username = "admin",
    private password = ""
  ) {
    this.axios = axios.create({
      baseURL: `${host}:${port}/api/v2`,
      withCredentials: true,
      timeout: 15000,
    });

    this.axios.interceptors.request.use((config) => {
      if (this.sid) {
        config.headers.set("Cookie", this.sid);
      }
      config.headers.set("Referer", `${host}:${port}/`);
      config.headers.set("Origin", `${host}:${port}`);
      return config;
    });

    this.axios.interceptors.response.use(null, async (error) => {
      if (error.response?.status === 401 && this.sid) {
        this.sid = null;
        await this.login();
        if (this.sid && error.config) {
          error.config.headers.set("Cookie", this.sid);
          return this.axios.request(error.config);
        }
      }
      return Promise.reject(error);
    });
  }

  async login(): Promise<boolean> {
    try {
      const response = await this.axios.post(
        "/auth/login",
        `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
        }
      );

      const raw = response.headers["set-cookie"]?.[0] || "";
      this.sid = raw.split(";")[0] || null;
      logger.log(
        `[QBittorrentClient] Login (${response.status}), SID: ${this.sid}`
      );
      return this.sid !== null;
    } catch (e: any) {
      logger.warn(
        `[QBittorrentClient] Login failed: ${e.message}, proceeding without auth`
      );
      return false;
    }
  }

  async ensureLoggedIn() {
    if (!this.sid) {
      await this.login();
    }
  }

  async getTorrents() {
    await this.ensureLoggedIn();
    const res = await this.axios.get("/torrents/info");
    return res.data as any[];
  }

  async addMagnet(magnet: string, savePath?: string) {
    await this.ensureLoggedIn();
    const response = await this.axios.post(
      "/torrents/add",
      `urls=${encodeURIComponent(magnet)}&savepath=${encodeURIComponent(savePath || "")}&category=ProtonForge`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
      }
    );
    return response.data;
  }

  async start(hash: string) {
    await this.ensureLoggedIn();
    const res = await this.axios.post("/torrents/start", `hashes=${hash}`, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
    });
    logger.log(`[QBittorrentClient] Start ${hash}: ${res.status}`);
  }

  async stop(hash: string) {
    await this.ensureLoggedIn();
    const res = await this.axios.post("/torrents/stop", `hashes=${hash}`, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
    });
    logger.log(`[QBittorrentClient] Stop ${hash}: ${res.status}`);
  }

  async delete(hash: string, deleteFiles = false) {
    await this.ensureLoggedIn();
    const res = await this.axios.post(
      "/torrents/delete",
      `hashes=${hash}&deleteFiles=${deleteFiles}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
      }
    );
    logger.log(`[QBittorrentClient] Delete ${hash}: ${res.status}`);
  }

  async forceStart(hash: string) {
    await this.ensureLoggedIn();
    const res = await this.axios.post(
      "/torrents/forceStart",
      `hashes=${hash}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
      }
    );
    logger.log(`[QBittorrentClient] ForceStart ${hash}: ${res.status}`);
  }

  async getProperties(hash: string) {
    await this.ensureLoggedIn();
    const res = await this.axios.get(`/torrents/properties?hash=${hash}`);
    return res.data;
  }

  public getConnectionInfo() {
    return {
      host: this.host,
      port: this.port,
      url: `${this.host}:${this.port}`,
    };
  }
}

export function mapQbitStateToStatus(state: string): number {
  const s = state.toLowerCase();
  if (["downloading", "forceddl", "stalleddl"].includes(s)) return 3;
  if (["uploading", "forcedup", "stalledup", "seeding"].includes(s)) return 5;
  if (["metadl", "forcedmetadl"].includes(s)) return 2;
  if (
    ["checkingdl", "checkingup", "checkingresumedata", "allocating"].includes(s)
  )
    return 1;
  if (["completed", "pausedup"].includes(s)) return 4;
  return 0;
}
