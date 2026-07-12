import { patchState } from "./storage.js";
import { setIcon } from "./icon.js";

export async function setUiState(state) {
  await patchState({ state });
}

export async function setConnectingFlow(tag) {
  await setUiState("connecting");
  setIcon("connecting");
  return tag;
}

export async function setConnectedFlow(tag) {
  await setUiState("success");
  setIcon("connected");
  return tag;
}

export async function setDisconnectedFlow() {
  await setUiState("disconnect");
  setIcon("ready");
}

export async function setNoConnectionFlow() {
  await setUiState("error");
  setIcon("noConnection");
}
