import { registerEvent } from "../register-event";
import axios from "axios";
import { app } from "electron";
import { db, storeKeys } from "@main/store";

const SITE_URL = app.isPackaged
  ? "https://makai-forge.store"
  : "http://localhost:8788";

async function getAuthHeaders() {
  const stored = await db.get<any>(storeKeys.makaiAuth).catch(() => null);
  if (!stored) return {};
  try {
    // Handle double-serialized data from previous bug
    const data = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!data.token) return {};
    return { Authorization: `Bearer ${data.token}` };
  } catch {
    await db.del(storeKeys.makaiAuth).catch(() => {});
    return {};
  }
}

const toggleScriptLike = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: number
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${SITE_URL}/api/scripts/${scriptId}/like`,
      {},
      { headers }
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 401) return { error: "Not authenticated" };
    if (error?.response?.status === 403) return { error: error.response.data?.error || "Ação não permitida" };
    return { error: "Erro ao curtir" };
  }
};

const toggleScriptDislike = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: number
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${SITE_URL}/api/scripts/${scriptId}/dislike`,
      {},
      { headers }
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 401) return { error: "Not authenticated" };
    if (error?.response?.status === 403) return { error: error.response.data?.error || "Ação não permitida" };
    return { error: "Erro ao dar dislike" };
  }
};

const getScriptComments = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: number
) => {
  try {
    const response = await axios.get(
      `${SITE_URL}/api/scripts/${scriptId}/comments`
    );
    return response.data;
  } catch {
    return { error: "Failed to fetch comments" };
  }
};

const postScriptComment = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: number,
  body: string,
  parentId?: number
) => {
  try {
    const headers = await getAuthHeaders();
    const payload: any = { body };
    if (parentId) payload.parent_id = parentId;
    const response = await axios.post(
      `${SITE_URL}/api/scripts/${scriptId}/comments`,
      payload,
      { headers }
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 401) return { error: "Not authenticated" };
    if (error?.response?.status === 400) return { error: "Comment cannot be empty" };
    return { error: "Failed to post comment" };
  }
};

const deleteScriptComment = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: number,
  commentId: number
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.delete(
      `${SITE_URL}/api/scripts/${scriptId}/comments/${commentId}`,
      { headers }
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 401) return { error: "Not authenticated" };
    if (error?.response?.status === 403) return { error: "Not authorized" };
    return { error: "Failed to delete comment" };
  }
};

const toggleCommentLike = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: number,
  commentId: number
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${SITE_URL}/api/scripts/${scriptId}/comments/${commentId}/like`,
      {},
      { headers }
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 401) return { error: "Not authenticated" };
    if (error?.response?.status === 403) return { error: error.response.data?.error || "Ação não permitida" };
    return { error: "Erro ao curtir comentário" };
  }
};

const toggleCommentDislike = async (
  _event: Electron.IpcMainInvokeEvent,
  scriptId: number,
  commentId: number
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${SITE_URL}/api/scripts/${scriptId}/comments/${commentId}/dislike`,
      {},
      { headers }
    );
    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 401) return { error: "Not authenticated" };
    if (error?.response?.status === 403) return { error: error.response.data?.error || "Ação não permitida" };
    return { error: "Erro ao dar dislike em comentário" };
  }
};

registerEvent("toggleScriptLike", toggleScriptLike);
registerEvent("toggleScriptDislike", toggleScriptDislike);
registerEvent("getScriptComments", getScriptComments);
registerEvent("postScriptComment", postScriptComment);
registerEvent("deleteScriptComment", deleteScriptComment);
registerEvent("toggleCommentLike", toggleCommentLike);
registerEvent("toggleCommentDislike", toggleCommentDislike);
