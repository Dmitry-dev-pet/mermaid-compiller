# Export & Sharing

[← Back to Index](./) | [← Prev: Whiteboard](guide-whiteboard.md)

## Image export

Export buttons are available in the preview header.

### SVG
Exports a vector version of the diagram.
- Great for embedding into web pages or editing in vector tools.
- Zooms without quality loss.

### PNG
Exports a raster image.
- Uses the current theme (Dark/Light) as the background.
- Inlines external resources (fonts, icons) so the export matches preview.
- “Tainted Canvas” protection: uses a safe export pipeline even when `foreignObject` is present.

## Cloud sharing

If you use **Hosted** or **BYO Supabase** storage:
1. Click **Share** in the Project menu.
2. Choose access mode:
   - **Viewer**: view-only link
   - **Editor**: collaborative editing link
3. Copy the link and share it.

*If E2EE is enabled, recipients will need your passphrase.*

## Project Bundle

For a full backup, use **Export Bundle** in the Projects menu. This creates a `.json` file that contains:
- Project metadata
- Full steps history
- All code revisions
- Whiteboard scenes

Restore via **Import Bundle**.

---
[← Back to Index](./)
