import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, SearchIcon } from "@primer/octicons-react";
import { Modal, Button } from "@components";

interface SuggestedExe {
  path: string;
  fileName: string;
  fileSize: number;
}

interface ExecutableSelectionModalProps {
  visible: boolean;
  suggestedExes: SuggestedExe[];
  prefixDriveCPath: string;
  onSelect: (path: string) => void;
  onBrowse: () => void;
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExecutableSelectionModal({
  visible,
  suggestedExes,
  prefixDriveCPath,
  onSelect,
  onBrowse,
  onClose,
}: Readonly<ExecutableSelectionModalProps>) {
  const { t } = useTranslation("downloads");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    suggestedExes.length > 0 ? 0 : null
  );

  const handleConfirm = useCallback(() => {
    if (selectedIndex !== null && suggestedExes[selectedIndex]) {
      onSelect(suggestedExes[selectedIndex].path);
    }
  }, [selectedIndex, suggestedExes, onSelect]);

  const getRelativePath = (fullPath: string) => {
    if (!prefixDriveCPath) return fullPath;
    const rel = fullPath.replace(prefixDriveCPath, "");
    return rel.startsWith("/") || rel.startsWith("\\") ? rel.slice(1) : rel;
  };

  return (
    <Modal
      visible={visible}
      title={t("select_executable_title", "Select Game Executable")}
      description={t(
        "select_executable_description",
        "Select which executable should be used to launch this game."
      )}
      onClose={onClose}
    >
      {suggestedExes.length > 0 && (
        <>
          <p
            style={{
              fontSize: 13,
              color: "#999",
              marginBottom: 12,
            }}
          >
            {t(
              "select_executable_suggestions",
              "We found these executables in the Wine prefix. Select the game's main executable:"
            )}
          </p>

          <div className="downloads__exe-selection-list">
            {suggestedExes.map((exe, index) => (
              <button
                key={exe.path}
                type="button"
                className={`downloads__exe-option ${
                  selectedIndex === index ? "downloads__exe-option--selected" : ""
                }`}
                onClick={() => setSelectedIndex(index)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    minWidth: 0,
                  }}
                >
                  <FileDirectoryIcon size={20} />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {exe.fileName}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#888",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {getRelativePath(exe.path)}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "#666", whiteSpace: "nowrap" }}>
                    {formatFileSize(exe.fileSize)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {suggestedExes.length === 0 && (
        <p
          style={{
            fontSize: 13,
            color: "#999",
            marginBottom: 12,
          }}
        >
          {t(
            "select_executable_no_suggestions",
            "No executables were found automatically. Use the browse button to locate the game's main executable manually."
          )}
        </p>
      )}

      <div className="downloads__exe-selection-actions">
        <Button theme="outline" onClick={onBrowse}>
          <SearchIcon size={14} />
          <span style={{ marginLeft: 6 }}>
            {t("browse_manually", "Browse Manually")}
          </span>
        </Button>
        <Button
          theme="primary"
          onClick={handleConfirm}
          disabled={suggestedExes.length === 0 || selectedIndex === null}
        >
          {t("confirm_executable", "Confirm")}
        </Button>
      </div>
    </Modal>
  );
}
