# Cloud Sync, Sharing & E2EE

[← Back to Index](./) | [← Prev: Local Storage](storage-local.md)

## Storage providers

1.  **Local**: browser-only.
2.  **Hosted (Supabase)**: sync via the official cloud.
3.  **BYO Supabase**: bring your own Supabase instance.

## E2EE (End-to-end encryption)

You can enable encryption for cloud sync.
- **Algorithm**: AES-GCM
- **Key derivation**: derived from your passphrase (PBKDF2)
- **Guarantee**: the server only sees an encrypted blob; without the passphrase, data cannot be recovered.

## Sharing
- **Viewer link**: view-only.
- **Editor link**: collaborative editing.

---
[← Back to Index](./)
