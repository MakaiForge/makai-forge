import http from "node:http";
import { BrowserWindow } from "electron";
import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";

const PROVIDER_CONFIG: Record<
  string,
  { authUrl: string; tokenUrl: string; clientId: string; clientSecret: string }
> = {
  dropbox: {
    authUrl: "https://www.dropbox.com/oauth2/authorize",
    tokenUrl: "https://api.dropbox.com/oauth2/token",
    clientId: "6ndfc2ow8386f93",
    clientSecret: "mpflgofewmtarrj",
  },
  appbox: {
    authUrl: "https://account.box.com/api/oauth2/authorize",
    tokenUrl: "https://api.box.com/oauth2/token",
    clientId: "dmxyxj9aa18ppoy16hqnxbfkx8lm8ml8",
    clientSecret: "3PB7YP0jtzIpWJsNcXPm0eSGBMj5c60t",
  },
};

const FIXED_PORT = 49891;
const REDIRECT_URI = `http://127.0.0.1:${FIXED_PORT}/callback`;

const oauthLogin = async (
  _event: Electron.IpcMainInvokeEvent,
  provider: string
): Promise<{ success: boolean; email?: string; error?: string }> => {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return { success: false, error: `Provedor "${provider}" não suportado` };

  return new Promise((resolve) => {
    let resolved = false;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const errorParam = url.searchParams.get("error");

        if (errorParam || !code) {
          resolved = true;
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h2>Erro na autenticação</h2><p>Você pode fechar esta janela.</p>");
          server.close();
          resolve({
            success: false,
            error: errorParam || "Autorização negada",
          });
          return;
        }

        try {
          const body = new URLSearchParams({
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code",
          });

          const tokenRes = await fetch(config.tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });

          const tokenData = await tokenRes.json();

          if (!tokenRes.ok) {
            resolved = true;
            const errMsg =
              tokenData.error_description ||
              tokenData.error ||
              `HTTP ${tokenRes.status}`;
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`<h2>Erro na autenticação</h2><p>${errMsg}</p><p>Você pode fechar esta janela.</p>`);
            server.close();
            resolve({ success: false, error: errMsg });
            return;
          }

          const authData = {
            provider,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
            expiresAt: tokenData.expires_at
              ? parseInt(tokenData.expires_at)
              : Date.now() + (tokenData.expires_in || 14400) * 1000,
            connectedAt: Date.now(),
          };

          await db.put(storeKeys.backupAuth, authData);

          resolved = true;
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h2>Autenticado com sucesso!</h2><p>Você pode fechar esta janela.</p>");
          server.close();
          resolve({
            success: true,
            email:
              tokenData.email ||
              tokenData.account_id ||
              tokenData.access_token?.substring(0, 10) ||
              provider,
          });
        } catch (err: any) {
          resolved = true;
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`<h2>Erro na autenticação</h2><p>${err.message}</p><p>Você pode fechar esta janela.</p>`);
          server.close();
          resolve({ success: false, error: err.message });
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(FIXED_PORT, "127.0.0.1", () => {
      const authParams = new URLSearchParams({
        client_id: config.clientId,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
      });

      if (provider === "dropbox") {
        authParams.set("token_access_type", "offline");
      }

      const win = new BrowserWindow({
        width: 800,
        height: 700,
        title: `Login - ${provider}`,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      win.loadURL(`${config.authUrl}?${authParams.toString()}`);

      win.on("closed", () => {
        if (!resolved) {
          server.close();
          resolve({ success: false, error: "Login cancelado" });
        }
      });
    });
  });
};

registerEvent("backupOAuthLogin", oauthLogin);
