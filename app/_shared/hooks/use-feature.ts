import { useEffect, useState, useCallback } from "react";

enum Feature {
  CheckDownloadWritePermission = "CHECK_DOWNLOAD_WRITE_PERMISSION",
  Nimbus = "NIMBUS",
  NimbusPreview = "NIMBUS_PREVIEW",
}

export function useFeature() {
  const [features, setFeatures] = useState<string[] | null>(null);

  useEffect(() => {
    window.electron.forgerApi
      .get<string[]>("/features", { needsAuth: false })
      .then((features) => {
        localStorage.setItem("features", JSON.stringify(features || []));
        setFeatures(features || []);
      });
  }, []);

  const isFeatureEnabled = useCallback(
    (feature: Feature) => {
      const stored = features ?? JSON.parse(localStorage.getItem("features") ?? "[]");
      if (!Array.isArray(stored)) return false;
      return stored.includes(feature);
    },
    [features]
  );

  return {
    isFeatureEnabled,
    Feature,
  };
}
