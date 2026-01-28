export type CliproxyAuthFile = {
  id: string;
  provider: string;
  name?: string;
  label?: string;
  status?: string;
  email?: string;
  disabled?: boolean;
  unavailable?: boolean;
  runtimeOnly?: boolean;
  authIndex?: string;
  idToken?: unknown;
  metadata?: unknown;
  attributes?: unknown;
  account?: unknown;
  planType?: unknown;
};

