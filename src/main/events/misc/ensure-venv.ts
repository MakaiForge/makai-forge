import { ensureVenv } from "@bootstrap/venv";
import { registerEvent } from "../register-event";

const handleEnsureVenv = async (): Promise<boolean> => {
  return ensureVenv();
};

registerEvent("ensureVenv", handleEnsureVenv);
