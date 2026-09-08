import { useEffect, useState } from "react";

export function useSupplemental() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showTabs, setShowTabs] = useState(false);

  // O desbloqueio por Konami Code foi desativado — as funcionalidades
  // (catálogo, downloads) ficam sempre liberadas via getFeatureState.
  useEffect(() => {
    window.electron
      .getFeatureState()
      .then(({ unlocked }) => {
        if (unlocked) {
          setIsUnlocked(true);
          setShowTabs(true);
        }
      })
      .catch(() => {});
  }, []);

  return { isUnlocked, showTabs };
}
