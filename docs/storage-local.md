# Local Storage (IndexedDB)

[← Back to Index](./)

The app is **local-first**. This means your data is stored locally in the browser and remains available even when you’re offline.

## `dc_history` database

We use IndexedDB to store the full history.

### Data model
- **Sessions**: user projects, settings, and metadata.
- **Steps**: history of actions (Chat, Build, Fix). Each step is a point-in-time snapshot.
- **Revisions**: versions of diagram code, so you can roll back to any previous moment.

### Privacy
IndexedDB data never leaves your device unless you enable cloud sync.

---
[← Back to Index](./) | [Next: Cloud Sync →](storage-sync.md)
