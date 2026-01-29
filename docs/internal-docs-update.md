# Updating Mermaid Documentation

[← Back to Index](./) | [← Prev: Mermaid Core](internal-mermaid.md)

To improve generation quality, the app ships with a local snapshot of Mermaid documentation.

## Update process

1. Download the latest Mermaid docs from the official site.
2. Place files into `diagram-compiler/public/mermaid-docs/`.
3. Update file mapping in `services/docsContextService.ts`.
4. Update the `MERMAID_VERSION` constant in `constants.ts`.

---
[← Back to Index](./)
