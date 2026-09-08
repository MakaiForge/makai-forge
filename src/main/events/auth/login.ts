import axios from "axios";
import { app } from "electron";
import { registerEvent } from "../register-event";
import { db, storeKeys } from "@main/store";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const authLogin = async (
  _event: Electron.IpcMainInvokeEvent,
  email: string,
  password: string
) => {
  try {
    const response = await axios.post(
      `${SITE_URL}/api/auth/login`,
      { email, password }
    );

    if (response.data.token) {
      const authData = {
        token: response.data.token,
        user: response.data.user,
      };
      await db.put(storeKeys.makaiAuth, authData);
      return { success: true, user: response.data.user };
    }

    return { error: "Invalid response from server" };
  } catch (error: any) {
    if (error?.response?.status === 401) {
      return { error: "Email ou senha inválidos" };
    }
    if (error?.response?.status === 429) {
      return { error: "Muitas tentativas. Tente novamente em 15 minutos." };
    }
    return { error: "Erro ao conectar ao servidor" };
  }
};

registerEvent("authLogin", authLogin);
