const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { fetch } = require('node-fetch'); // Or native fetch in Node 18+
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8000;
const ROOT = path.join(__dirname, 'public');

// Configuration
const DEFAULT_DOCS_CONFIG = {
    version: "10.2.4",
    github: {
        repo: "mermaid-js/mermaid",
        ref: "develop",
        package_path: "package.json",
        docs_subpath: ["packages", "mermaid", "src", "docs"],
        archive_url: "",
    },
    local: {
        base_dir: "mermaid-docs",
        syntax_subpath: ["syntax"],
    },
};

const DIAGRAM_DOCS_MAP = {
    "flowchart": "flowchart.md",
    "sequence": "sequenceDiagram.md",
    "class": "classDiagram.md",
    "state": "stateDiagram.md",
    "er": "entityRelationshipDiagram.md",
    "entity": "entityRelationshipDiagram.md",
    "gantt": "gantt.md",
    "mindmap": "mindmap.md",
    "pie": "pie.md",
    "gitgraph": "gitgraph.md",
    "journey": "userJourney.md",
    "timeline": "timeline.md",
    "zenuml": "zenuml.md",
    "sankey": "sankey.md",
    "xy": "xyChart.md",
    "block": "block.md",
    "quadrant": "quadrantChart.md",
    "requirement": "requirementDiagram.md",
    "c4": "c4.md",
    "kanban": "kanban.md",
    "architecture": "architecture.md",
    "packet": "packet.md",
    "radar": "radar.md",
    "treemap": "treemap.md",
    "config": "../config/configuration.md",
    "configuration": "../config/configuration.md",
    "directives": "../config/directives.md",
    "theme": "../config/theming.md",
    "theming": "../config/theming.md",
    "styling": "../config/theming.md",
};

// Utils
function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target) {
            Object.assign(source[key], deepMerge(target[key], source[key]));
        }
    }
    Object.assign(target || {}, source);
    return target;
}

function loadDocsConfig() {
    let config = JSON.parse(JSON.stringify(DEFAULT_DOCS_CONFIG));
    const configPath = path.join(__dirname, 'docs.config.json');
    
    if (fs.existsSync(configPath)) {
        try {
            const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            config = deepMerge(config, userConfig);
        } catch (e) {
            console.error(`[Docs] Failed to read docs.config.json: ${e.message}`);
        }
    }
    return config;
}

async function downloadDocsArchive(targetDir, config) {
    const githubCfg = config.github || {};
    const repo = githubCfg.repo || "mermaid-js/mermaid";
    const ref = githubCfg.ref || "develop";
    const docsSubpath = githubCfg.docs_subpath || [];
    const archiveUrl = githubCfg.archive_url || `https://codeload.github.com/${repo}/zip/refs/heads/${ref}`;

    console.log(`[Docs] Downloading from ${archiveUrl}...`);

    try {
        const response = await fetch(archiveUrl, { headers: { "User-Agent": "mermaid-langgraph" } });
        if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const zip = new AdmZip(buffer);
        const zipEntries = zip.getEntries();
        
        // Find the root directory inside zip (usually repo-ref)
        if (zipEntries.length === 0) throw new Error("Archive is empty");
        const rootDirName = zipEntries[0].entryName.split('/')[0];
        
        const sourcePathPrefix = [rootDirName, ...docsSubpath].join('/');
        
        // Extract specific folder
        const tempDir = path.join(require('os').tmpdir(), 'mermaid_docs_' + Date.now());
        
        zipEntries.forEach(entry => {
            if (entry.entryName.startsWith(sourcePathPrefix) && !entry.isDirectory) {
                const relativePath = entry.entryName.substring(sourcePathPrefix.length);
                const fullDestPath = path.join(targetDir, relativePath);
                const destDir = path.dirname(fullDestPath);
                
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                fs.writeFileSync(fullDestPath, entry.getData());
            }
        });
        
        console.log(`[Docs] Downloaded Mermaid docs from ${repo}@${ref} into ${targetDir}`);
    } catch (e) {
        console.error(`[Docs] Failed to download Mermaid docs archive: ${e.message}`);
    }
}

async function ensureLocalDocsDir(config) {
    if (process.env.MERMAID_DOCS_ROOT && fs.existsSync(process.env.MERMAID_DOCS_ROOT)) {
        return process.env.MERMAID_DOCS_ROOT;
    }

    const localCfg = config.local || {};
    const baseOverride = process.env.MERMAID_DOCS_BASE;
    const baseDir = baseOverride ? baseOverride : path.join(__dirname, localCfg.base_dir || "mermaid-docs");
    const version = process.env.MERMAID_DOCS_VERSION || config.version || "latest";
    const targetDir = path.join(baseDir, version);

    if (fs.existsSync(targetDir)) {
        return targetDir;
    }

    await downloadDocsArchive(targetDir, config);
    return targetDir;
}

function searchMermaidDocsLocal(query, docsRoot) {
    const queryLower = query.toLowerCase();
    console.log(`[DEBUG] Docs search query: '${query}'`);
    
    const results = [];
    const seenFiles = new Set();

    // 1. Try to find explicit diagram type in query
    for (const [key, filename] of Object.entries(DIAGRAM_DOCS_MAP)) {
        // Correctly using word boundaries for regex
        const regex = new RegExp('\\b' + key + '\\b', 'i');
        if (regex.test(queryLower)) {
            if (seenFiles.has(filename)) continue;
            
            console.log(`[DEBUG] Match found for key '${key}': ${filename}`);
            
            // Determine if file is in syntax/ or config/ (based on relative path in MAP)
            let filePath;
            if (filename.startsWith("..")) {
                // It's a relative path from syntax/ (e.g. ../config/directives.md)
                filePath = path.join(docsRoot, filename);
            } else {
                // It's a file in syntax/
                filePath = path.join(docsRoot, filename);
            }

            console.log(`[DEBUG] Checking file path: ${filePath}`);

            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const snippet = content.substring(0, 8000);
                    console.log(`[DEBUG] Read ${content.length} chars, returning snippet of ${snippet.length}`);
                    
                    results.push({
                        file: filename,
                        source: "local_docs",
                        snippet: snippet
                    });
                    seenFiles.add(filename);
                } catch (e) {
                    console.error(`Error reading docs file ${filePath}: ${e.message}`);
                }
            } else {
                console.log(`[DEBUG] File does not exist: ${filePath}`);
            }
        }
    }

    // 2. Mandatory Core Docs Injection
    // Always inject these if not already present, to ensure LLM knows about config/styling
    const CORE_DOCS = [
        "../config/directives.md",
        "../config/theming.md"
    ];

    for (const coreFile of CORE_DOCS) {
        if (!seenFiles.has(coreFile)) {
             const filePath = path.join(docsRoot, coreFile);
             if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    // Lower priority, append to end
                    results.push({
                        file: coreFile,
                        source: "core_docs",
                        snippet: content.substring(0, 8000)
                    });
                    seenFiles.add(coreFile);
                } catch (e) {
                    // ignore
                }
             }
        }
    }

    // 3. Fallback (only if absolutely nothing found)
    if (results.length === 0 && queryLower.includes("basics")) {
        const fallbackFile = "examples.md";
        if (fs.existsSync(path.join(docsRoot, fallbackFile))) {
             try {
                const content = fs.readFileSync(path.join(docsRoot, fallbackFile), 'utf8');
                results.push({
                    file: fallbackFile,
                    source: "local_docs",
                    snippet: content.substring(0, 8000)
                });
             } catch (e) {
                 // ignore
             }
        }
    }

    if (results.length === 0) {
        console.log("[DEBUG] No matching file found in map.");
    }

    return results.slice(0, 5); // Increased limit to fit specific docs + core docs
}

async function normalizeDocsQuery(query, modelId) {
    const trimmed = (query || "").trim();
    const result = { search_query: trimmed, style_prefs: "" };
    
    if (!trimmed) return result;

    const baseUrl = (process.env.CLIPROXY_BASE_URL || "http://localhost:8317").replace(/\/$/, "");
    const targetModelId = modelId || process.env.CLIPROXY_NORMALIZER_MODEL || "";
    const apiKey = process.env.CLIPROXY_API_KEY || "test";

    if (!targetModelId) return result;

    const systemPrompt = 
        "You normalize user requests (possibly in Russian) for generating Mermaid diagrams. " +
        "Respond with a strict JSON object only, no extra text:\n" +
        "{\n" +
        '  "search_topic": "short English phrase for documentation search about the diagram intent",\n' +
        '  "style_prefs": "short English description of visual styling preferences (colors, layout, theme, shapes) or empty if none"\n' +
        "}\n" +
        "Do not explain anything, do not add comments or markdown.";

    const payload = {
        model: targetModelId,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: trimmed },
        ],
        temperature: 0.0,
    };

    try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            timeout: 15000 // 15s
        });

        if (!response.ok) return result;
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (content) {
            try {
                const obj = JSON.parse(content.trim());
                if (obj.search_topic) result.search_query = String(obj.search_topic).trim();
                if (obj.style_prefs) result.style_prefs = String(obj.style_prefs).trim();
            } catch (e) {
                // Ignore JSON parse error
            }
        }
    } catch (e) {
        // Ignore fetch errors
    }
    return result;
}

// Main
(async () => {
    const docsConfig = loadDocsConfig();
    const docsDir = await ensureLocalDocsDir(docsConfig);
    const syntaxSubpath = docsConfig.local?.syntax_subpath || ["syntax"];
    const docsRoot = path.join(docsDir, ...syntaxSubpath);

    if (!fs.existsSync(docsRoot)) {
        console.warn(`[Docs] Warning: syntax docs directory '${docsRoot}' not found`);
    }

    // Serve static files
    app.use(express.static(ROOT));

    // API Route
    app.get('/docs/search', async (req, res) => {
        const query = (req.query.q || "").trim();
        const modelId = (req.query.model || "").trim();

        if (!query) {
            return res.json({
                query,
                search_query: query,
                style_prefs: "",
                results: []
            });
        }

        const normalized = await normalizeDocsQuery(query, modelId);
        const searchQuery = normalized.search_query || query;
        const stylePrefs = normalized.style_prefs || "";

        const results = searchMermaidDocsLocal(searchQuery, docsRoot);

        res.json({
            query,
            search_query: searchQuery,
            style_prefs: stylePrefs,
            results
        });
    });

    app.listen(PORT, () => {
        console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
    });
})();