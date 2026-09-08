import { useAppSelector, useAppDispatch } from "./redux";

export function useDownload() {
  const dispatch = useAppDispatch();
  const lastPacket = useAppSelector((state: any) => state.download?.lastPacket ?? null);
  const progress = useAppSelector((state: any) => state.download?.progress ?? 0);
  const downloadSpeed = useAppSelector((state: any) => state.download?.downloadSpeed ?? 0);
  const eta = useAppSelector((state: any) => state.download?.timeRemaining ?? -1);
  const isGameDeleting = useAppSelector((state: any) => state.download?.isGameDeleting ?? false);

  return {
    lastPacket,
    progress,
    downloadSpeed,
    eta,
    isGameDeleting,
    clearDownload: () => dispatch({ type: "download/clearDownload" }),
    setLastPacket: (packet: any) => dispatch({ type: "download/setLastPacket", payload: packet }),
    startDownload: (payload: any) => dispatch({ type: "download/startDownload", payload }),
    addGameToQueue: (payload: any) => dispatch({ type: "download/addGameToQueue", payload }),
  };
}
