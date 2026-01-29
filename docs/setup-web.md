# Web Setup & Installation

[← Back to Index](./)

This guide explains how to run the web version of Mermaid Diagram Compiler.

## Requirements
- **Node.js**: v20 or newer
- **npm**: v10 or newer

This repository contains two `package.json` files. Install dependencies from the repo root:

```bash
# In the project root
npm install
npm --prefix diagram-compiler install
```

## Run (Dev)

```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

## Build (Production)

```bash
npm run build
```
Build output will be in `diagram-compiler/dist`.

## Typecheck & tests

```bash
npm run typecheck
npm test
```

---
[← Back to Index](./) | [Next: Desktop Setup →](setup-desktop.md)
