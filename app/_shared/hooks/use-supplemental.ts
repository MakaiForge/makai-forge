import { useEffect, useRef, useState } from "react";
import { useToast } from "@hooks";

const SEQUENCE_LENGTH = 10;

export function useSupplemental() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showTabs, setShowTabs] = useState(false);
  const bufferRef = useRef<number[]>([]);
  const { showSuccessToast } = useToast();

  useEffect(() => {
    window.electron.getFeatureState().then(({ unlocked }) => {
      if (unlocked) {
        setIsUnlocked(true);
        setShowTabs(true);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      bufferRef.current.push(e.keyCode);

      if (bufferRef.current.length > SEQUENCE_LENGTH) {
        bufferRef.current = bufferRef.current.slice(-SEQUENCE_LENGTH);
      }

      if (bufferRef.current.length === SEQUENCE_LENGTH) {
        const buffer = [...bufferRef.current];
        bufferRef.current = [];

        window.electron.checkSequence(buffer).then(({ unlocked }) => {
          if (unlocked) {
            setIsUnlocked(true);
            setShowTabs(true);
            window.dispatchEvent(new CustomEvent("supplemental-unlocked"));
            showSuccessToast(
              "Conquista desbloqueada: Hacker Man!\nCatálogo e Downloads liberados!"
            );
          }
        }).catch(() => {});
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSuccessToast]);

  return { isUnlocked, showTabs };
}
