import type { Download } from "@types";
import { PythonRPC } from "@main/services/python-rpc";
import { storeKeys } from "@main/store";

export async function resumeSeeding(download: Download): Promise<void> {
  await PythonRPC.rpc.call("action", {
    action: "resume_seeding",
    game_id: storeKeys.game(download.shop, download.objectId),
    url: download.uri,
    save_path: download.downloadPath,
  });
}
