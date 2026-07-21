import { registerEvent } from "@main/events/register-event";
import { openGame } from "./open-game";

registerEvent("openGame", openGame);
