export interface RemoteFile {
  name: string;
  path: string;
  sizeBytes: number;
  lastModified: string;
}

export interface CloudProvider {
  readonly name: string;
  upload(localPath: string, destPath: string): Promise<void>;
  download(remotePath: string, localPath: string): Promise<void>;
  listFiles(prefix: string): Promise<RemoteFile[]>;
  deleteFile(path: string): Promise<void>;
}
