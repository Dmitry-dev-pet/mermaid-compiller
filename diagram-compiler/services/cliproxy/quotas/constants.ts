export const cliproxyQuotaHeaders = {
  codex: {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
    'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal',
  },
  geminiCli: {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
  },
  antigravity: {
    Authorization: 'Bearer $TOKEN$',
    'Content-Type': 'application/json',
    // Match Antigravity client requests to get the correct model/quota catalog from Cloud Code Assist.
    // (Based on public Antigravity auth tooling; not a secret.)
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/1.15.8 Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36',
    'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
    'Client-Metadata': '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
  },
} as const;

export const cliproxyQuotaEndpoints = {
  codexUsage: 'https://chatgpt.com/backend-api/wham/usage',
  geminiCliQuota: 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
  antigravityFetchAvailableModels: 'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
} as const;
