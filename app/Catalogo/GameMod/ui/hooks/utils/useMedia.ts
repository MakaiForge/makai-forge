import { useState, useCallback } from "react";

export function useMedia() {
  const [showPreview, setShowPreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<{ fullPath: string; name: string }[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewCurrentData, setPreviewCurrentData] = useState("");
  const [showReadme, setShowReadme] = useState(false);
  const [readmeData, setReadmeData] = useState("");

  const loadPreviewImage = useCallback(async (files: { fullPath: string; name: string }[], idx: number) => {
    const file = files[idx];
    if (!file) return;
    const result = await window.electron.readModFile(file.fullPath);
    if (result && result.type === "image") {
      setPreviewCurrentData(`data:image/${result.ext.replace(".", "")};base64,${result.content}`);
    }
  }, []);

  const openPreview = useCallback(async (stagingDir: string | undefined) => {
    if (!stagingDir) return;
    try {
      const result = await window.electron.scanModFolder(stagingDir, "image");
      if (result && result.length > 0) {
        setPreviewImages(result);
        setPreviewIndex(0);
        await loadPreviewImage(result, 0);
        setShowPreview(true);
      }
    } catch { /* no images */ }
  }, [loadPreviewImage]);

  const prevPreview = useCallback(async () => {
    const next = previewIndex - 1;
    if (next >= 0) {
      setPreviewIndex(next);
      await loadPreviewImage(previewImages, next);
    }
  }, [previewIndex, previewImages, loadPreviewImage]);

  const nextPreview = useCallback(async () => {
    const next = previewIndex + 1;
    if (next < previewImages.length) {
      setPreviewIndex(next);
      await loadPreviewImage(previewImages, next);
    }
  }, [previewIndex, previewImages, loadPreviewImage]);

  const openReadme = useCallback(async (stagingDir: string | undefined) => {
    if (!stagingDir) return;
    try {
      const result = await window.electron.scanModFolder(stagingDir, "readme");
      if (result && result.length > 0) {
        const content = await window.electron.readModFile(result[0].fullPath);
        if (content && content.type === "text") {
          setReadmeData(content.content);
          setShowReadme(true);
        }
      }
    } catch { /* no readme */ }
  }, []);

  return {
    showPreview,
    setShowPreview,
    previewImages,
    previewIndex,
    previewCurrentData,
    showReadme,
    setShowReadme,
    readmeData,
    openPreview,
    prevPreview,
    nextPreview,
    openReadme,
  };
}
