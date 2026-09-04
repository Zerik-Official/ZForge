export interface ApiErrorDetails {
  code: string;
  i18n_key: string;
  params: Record<string, string | number>;
  message: string;
}

export interface ApiResult {
  ok: boolean;
  error: string | null;
  code?: string;
  i18n_key?: string;
  params?: Record<string, string | number>;
  errorDetails?: ApiErrorDetails;
}