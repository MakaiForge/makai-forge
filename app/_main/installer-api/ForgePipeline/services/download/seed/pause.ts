import { PythonRPC } from "@main/services/python-rpc";

export async function pauseSeeding(downloadKey: string): Promise<void> {
  await PythonRPC.rpc.call("action", {
    action: "pause_seeding",
    game_id: downloadKey,
  });
}
