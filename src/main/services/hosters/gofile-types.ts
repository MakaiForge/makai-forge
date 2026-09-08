export interface GofileAccountsReponse {
  id: string;
  token: string;
}

export interface GofileContentChild {
  id: string;
  type: string;
  name?: string;
  link?: string;
  canAccess?: boolean;
}

export interface GofileContentsResponse {
  id: string;
  type: string;
  name?: string;
  link?: string;
  children?: Record<string, GofileContentChild>;
  canAccess?: boolean;
  password?: boolean;
  passwordStatus?: string;
  public?: boolean;
  expire?: number;
}

export interface GofileContentMetadata {
  page?: number;
  totalPages?: number;
  pageSize?: number;
}

interface GofileGuestTokenCache {
  version: number;
  token: string;
  createdAt: number;
}

export type { GofileGuestTokenCache };
