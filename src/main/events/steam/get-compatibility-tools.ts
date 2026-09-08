import { registerEvent } from "../register-event";
import { getCompatibilityTools } from "@main/services/compatibility-tools";

const getCompatibilityToolsHandler = async () => {
  return getCompatibilityTools();
};

registerEvent("getCompatibilityTools", getCompatibilityToolsHandler);
