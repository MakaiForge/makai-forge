import axios from "axios";
import { app } from "electron";
import { registerEvent } from "../register-event";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

const authRegister = async (
  _event: Electron.IpcMainInvokeEvent,
  username: string,
  email: string,
  password: string
) => {
  try {
    const response = await axios.post(
      `${SITE_URL}/api/auth/register`,
      { username, email, password }
    );

    if (response.data.success) {
      return { success: true };
    }

    return { error: "Invalid response from server" };
  } catch (error: any) {
    if (error?.response?.status === 409) {
      return { error: "Usuário ou email já existe" };
    }
    if (error?.response?.status === 400) {
      return { error: error.response.data.error || "Dados inválidos" };
    }
    return { error: "Erro ao conectar ao servidor" };
  }
};

registerEvent("authRegister", authRegister);
