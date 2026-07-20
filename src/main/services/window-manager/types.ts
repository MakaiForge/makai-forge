export interface ExecutableSelectData {
  shop: string;
  objectId: string;
  candidates: { path: string; name: string; size: number }[];
  suggestedDir: string | null;
  prefixDriveCPath: string;
  gameTitle: string;
  gameKey: string;
}

export interface FolderItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface FileSelectData {
  folderPath: string;
  items: FolderItem[];
  prefixPath: string;
  protonPath: string;
  gameId: string;
  shop: string;
  objectId: string;
}
