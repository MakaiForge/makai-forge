/**
 * Install Orchestrator — Tipos compartilhados
 *
 * Define todos os tipos para o fluxo de instalação de mods:
 * reading_archive → extracting → verifying → analyzing → saving → ready
 */

// ── Stages ──────────────────────────────────────────────────────────────────

export type InstallStage =
  | "idle"
  | "reading_archive"
  | "extracting"
  | "verifying"
  | "analyzing"
  | "saving"
  | "ready"
  | "error";

// ── Archive Info ────────────────────────────────────────────────────────────

export interface ArchiveEntry {
  /** Caminho relativo dentro do archive (ex: "meshes/dds.dds") */
  path: string;
  /** Tamanho descompactado em bytes */
  size: number;
  /** Tamanho compactado em bytes */
  compressedSize: number;
  /** Se é diretório */
  isDirectory: boolean;
  /** CRC32 hash (quando disponível) */
  crc32?: string;
}

export interface ArchiveInfo {
  /** Caminho completo do archive no disco */
  path: string;
  /** Nome do arquivo (ex: "RaceMenu v3.4.5.7z") */
  name: string;
  /** Tamanho total descompactado em bytes */
  totalSize: number;
  /** Total de arquivos (excluindo diretórios) */
  totalFiles: number;
  /** Tamanho total compactado em bytes */
  compressedSize: number;
  /** Formato do archive */
  format: "zip" | "7z" | "rar" | "fomod" | "tar.gz";
  /** Se o archive é protegido por senha */
  isPasswordProtected: boolean;
  /** Lista de todos os arquivos/diretórios no archive */
  entries: ArchiveEntry[];
}

// ── Extracted File ──────────────────────────────────────────────────────────

export interface ExtractedFile {
  /** Caminho relativo dentro do staging (ex: "RaceMenu/meshes/dds.dds") */
  relativePath: string;
  /** Caminho absoluto no disco */
  absolutePath: string;
  /** Tamanho esperado (do archive) em bytes */
  expectedSize: number;
  /** Tamanho real no disco em bytes */
  actualSize: number;
  /** CRC32 esperado (do archive) */
  expectedCrc32?: string;
  /** CRC32 real (computado) */
  actualCrc32?: string;
  /** Se o arquivo passou na verificação */
  verified: boolean;
}

// ── Progress ────────────────────────────────────────────────────────────────

export interface InstallProgress {
  /** Stage atual da instalação */
  stage: InstallStage;
  /** Percentual de progresso (0-100) */
  percent: number;
  /** Mensagem traduzida para exibir ao usuário */
  message: string;
  /** Nome do mod sendo instalado */
  modName: string;
  /** Info do archive (disponível após reading_archive) */
  archiveInfo?: ArchiveInfo;
  /** Arquivos extraídos (disponível após extracting) */
  extractedFiles?: ExtractedFile[];
  /** Arquivo sendo processado atualmente */
  currentFile?: string;
  /** Número de arquivos processados */
  filesProcessed: number;
  /** Total de arquivos */
  filesTotal: number;
  /** Bytes processados */
  bytesProcessed: number;
  /** Total de bytes */
  bytesTotal: number;
  /** Timestamp do início da instalação */
  startTime: number;
  /** Tempo decorrido em milissegundos */
  elapsedMs: number;
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface InstallResult {
  /** Se a instalação foi bem-sucedida */
  success: boolean;
  /** Nome do mod instalado */
  modName: string;
  /** Nome do jogo (display name do GameModule) */
  gameName: string;
  /** ID do jogo */
  gameId: string;
  /** Diretório de staging onde o mod foi extraído */
  stagingDir: string;
  /** Informações do archive */
  archiveInfo: ArchiveInfo;
  /** Arquivos extraídos */
  extractedFiles: ExtractedFile[];
  /** Se todos os arquivos foram verificados */
  verified: boolean;
  /** Plugins detectados (.esp, .esm, .esl) */
  plugins: string[];
  /** Se o mod tem FOMOD */
  hasFomod: boolean;
  /** Se o mod tem BAIN */
  hasBain: boolean;
  /** Se o mod tem script extender (SKSE, etc) */
  hasSkse: boolean;
  /** Categoria do mod */
  category: string;
  /** Mensagem de erro (se success = false) */
  error?: string;
  /** Duração total em milissegundos */
  durationMs: number;
  /** Se o mod já existe no staging (requer decisão do usuário) */
  alreadyExists?: boolean;
  /** Resultado do deploy (symlinks staging→jogo) */
  deployed?: boolean;
  /** Log do deploy */
  deployLog?: string[];
}

// ── Config ──────────────────────────────────────────────────────────────────

export interface InstallConfig {
  /** ID do jogo (ex: "skyrim_se") */
  gameId: string;
  /** Nome do perfil (ex: "Default") */
  profile: string;
  /** Diretório de staging base (ex: "~/Mods/skyrim-se/staging") */
  stagingDir: string;
  /** Se deve sobrescrever mod existente */
  overwriteExisting: boolean;
  /** Se deve verificar integridade pós-extração */
  verifyAfterExtract: boolean;
  /** Número máximo de tentativas em caso de falha */
  maxRetries: number;
  /** Timeout em milissegundos */
  timeoutMs: number;
  /** Senha do archive (opcional, para archives protegidos) */
  password?: string;
  /** Se deve gravar metadata (meta.ini) */
  writeMetadata?: boolean;
}

// ── Verification ────────────────────────────────────────────────────────────

export interface VerificationError {
  /** Arquivo com erro */
  file: string;
  /** Tipo do erro */
  type: "size_mismatch" | "crc_mismatch" | "empty_file" | "missing_file" | "corrupted";
  /** Valor esperado */
  expected: string;
  /** Valor encontrado */
  actual: string;
}

export interface VerificationResult {
  /** Se todos os arquivos são válidos */
  allValid: boolean;
  /** Total de arquivos verificados */
  filesChecked: number;
  /** Arquivos válidos */
  filesValid: number;
  /** Arquivos inválidos */
  filesInvalid: number;
  /** Lista de erros */
  errors: VerificationError[];
}
