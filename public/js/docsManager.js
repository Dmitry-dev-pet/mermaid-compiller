
const DOCS_CONFIG = {
    owner: 'mermaid-js',
    repo: 'mermaid',
    ref: 'develop', // Default ref
    paths: [
        'packages/mermaid/src/docs/syntax',
        'packages/mermaid/src/docs/config',
        'packages/mermaid/src/docs/intro' // Add intro docs
    ],
    cacheKeyPrefix: 'mermaid_docs_index_', // Prefix for cache keys
    cacheDuration: 24 * 60 * 60 * 1000 // 24 hours
};

class DocsManager {
    constructor() {
        this.index = null;
        this.fileCache = new Map();
        this.currentRef = DOCS_CONFIG.ref;
    }

    getCacheKey() {
        return `${DOCS_CONFIG.cacheKeyPrefix}${this.currentRef}`;
    }

    /**
     * Fetches the latest tags from GitHub releases, filtering for main package versions.
     */
    async fetchVersions() {
        try {
            const url = `https://api.github.com/repos/${DOCS_CONFIG.owner}/${DOCS_CONFIG.repo}/releases?per_page=15`;
            const response = await fetch(url);
            if (!response.ok) return ['develop'];
            
            const releases = await response.json();
            
            const validVersions = [];
            
            releases.forEach(r => {
                const tag = r.tag_name;
                // Support old style "v10.x.x" and new style "mermaid@11.x.x"
                // We ignore other packages like "@mermaid-js/tiny@..." or "@mermaid-js/parser@..."
                if (tag.startsWith('v')) {
                    validVersions.push(tag);
                } else if (tag.startsWith('mermaid@')) {
                     // Keep full tag for internal fetch logic, but maybe show cleaner name in UI?
                     // Actually, for fetching files via raw.githubusercontent, we MUST use the exact tag name.
                     validVersions.push(tag);
                }
            });

            // Deduplicate and take top 5
            const uniqueVersions = [...new Set(validVersions)].slice(0, 5);

            // Ensure 'develop' is always first
            return ['develop', ...uniqueVersions];
        } catch (e) {
            console.warn('[Docs] Failed to fetch versions:', e);
            return ['develop'];
        }
    }

    /**
     * Sets the documentation version and clears/reloads index
     */
    async setVersion(ref) {
        if (this.currentRef === ref && this.index) return;
        
        console.log(`[Docs] Switching version to ${ref}`);
        this.currentRef = ref;
        this.index = null;
        this.fileCache.clear();
        await this.init();
    }

    /**
     * Инициализация: загружает индекс файлов (из кэша или GitHub API)
     */
    async init() {
        if (this.index) return;

        const cacheKey = this.getCacheKey();

        // 1. Попытка загрузить из LocalStorage
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < DOCS_CONFIG.cacheDuration) {
                    console.log(`[Docs] Loaded index for ${this.currentRef} from cache`);
                    this.index = data;
                    return;
                } else {
                    console.log('[Docs] Cache expired');
                }
            } catch (e) {
                console.warn('[Docs] Failed to parse cache', e);
            }
        }

        // 2. Загрузка с GitHub API
        console.log(`[Docs] Fetching index for ${this.currentRef} from GitHub API...`);
        this.index = {};

        try {
            for (const path of DOCS_CONFIG.paths) {
                const url = `https://api.github.com/repos/${DOCS_CONFIG.owner}/${DOCS_CONFIG.repo}/contents/${path}?ref=${this.currentRef}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
                        console.warn('[Docs] GitHub API rate limit exceeded. Docs might be unavailable.');
                    }
                    console.error(`[Docs] Failed to fetch ${path}: ${response.statusText}`);
                    continue;
                }

                const files = await response.json();
                
                if (Array.isArray(files)) {
                    files.forEach(file => {
                        if (file.type === 'file' && file.name.endsWith('.md')) {
                            // Ключ - имя файла без расширения (flowchart, sequenceDiagram, theming)
                            const key = file.name.replace('.md', '').toLowerCase();
                            
                            // Упрощение ключей для популярных диаграмм
                            let simplifiedKey = key;
                            if (key === 'sequencediagram') simplifiedKey = 'sequence';
                            if (key === 'entityrelationshipdiagram') simplifiedKey = 'er';
                            if (key === 'classdiagram') simplifiedKey = 'class';
                            if (key === 'statediagram') simplifiedKey = 'state';

                            this.index[simplifiedKey] = {
                                name: file.name,
                                url: file.download_url, // raw URL
                                path: file.path
                            };
                            
                            if (simplifiedKey !== key) {
                                this.index[key] = this.index[simplifiedKey];
                            }
                        }
                    });
                }
            }

            // Сохраняем в кэш
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: this.index
            }));
            console.log(`[Docs] Index built with ${Object.keys(this.index).length} entries. Keys:`, Object.keys(this.index));

        } catch (e) {
            console.error('[Docs] Initialization failed:', e);
        }
    }

    /**
     * Ищет подходящие файлы документации по ключевым словам
     * @param {string} query - поисковый запрос пользователя
     * @returns {Promise<Array<{file: string, content: string}>>}
     */
    async searchDocs(query) {
        if (!this.index) await this.init();
        
        const queryLower = query.toLowerCase();
        console.log(`[Docs] Searching for '${queryLower}' in index...`);
        
        const results = [];
        const seenUrls = new Set();

        // 1. Основные диаграммы (поиск по ключам индекса)
        // Проверяем, содержит ли запрос название ключа (например, "flowchart")
        // Используем границы слова для точного поиска (чтобы "class" не матчилось в "classification")
        const keywords = Object.keys(this.index);
        
        for (const keyword of keywords) {
            // Создаем регулярное выражение для поиска целого слова
            // Экранируем спецсимволы в ключе, если они есть (хотя наши ключи простые)
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            const isMatch = regex.test(queryLower);
            
            if (isMatch) {
                console.log(`[Docs] Match found: keyword '${keyword}' in query`);
                const doc = this.index[keyword];
                if (doc && !seenUrls.has(doc.url)) {
                    results.push(doc);
                    seenUrls.add(doc.url);
                }
            }
        }
        
        // 2. Всегда добавляем конфигурацию и стили, если найден хоть один результат или запрос про настройки
        const coreKeywords = ['theming', 'directives', 'configuration'];
        const needsCore = results.length > 0 || coreKeywords.some(k => queryLower.includes(k));

        if (needsCore) {
             console.log('[Docs] Adding core docs (theming, directives, etc.)');
             coreKeywords.forEach(k => {
                 if (this.index[k] && !seenUrls.has(this.index[k].url)) {
                     // Добавляем в конец, чтобы специфичные диаграммы были первыми
                     results.push(this.index[k]);
                     seenUrls.add(this.index[k].url);
                 }
             });
        }

        // Fallback: if no specific docs found, but query is generic enough, add general docs
        if (results.length === 0 && (queryLower.includes('mermaid') || queryLower.includes('diagram'))) {
            console.log('[Docs] No specific docs found, adding general Mermaid docs.');
            const generalDocsKeys = ['configuration', 'getting-started']; // 'configuration' is key for configuration.md
            generalDocsKeys.forEach(k => {
                if (this.index[k] && !seenUrls.has(this.index[k].url)) {
                    results.push(this.index[k]);
                    seenUrls.add(this.index[k].url);
                }
            });
        }
        
        console.log(`[Docs] Found ${results.length} documents to fetch.`);

        // 3. Загружаем контент
        const docsContent = [];
        for (const doc of results) {
            const content = await this.fetchDocContent(doc.url);
            if (content) {
                docsContent.push({
                    file: doc.name,
                    source: 'github_raw',
                    snippet: content.substring(0, 15000) // Лимит символов
                });
            }
        }

        return docsContent;
    }

    /**
     * Downloads ALL documentation files referenced in the index to the cache.
     * This ensures offline capability (via browser cache) and instant access.
     */
    async downloadAll(onProgress) {
        if (!this.index) await this.init();
        
        const urls = new Set();
        Object.values(this.index).forEach(doc => urls.add(doc.url));
        
        const total = urls.size;
        let loaded = 0;
        console.log(`[Docs] Starting bulk download of ${total} files...`);

        // Use a concurrency limit to avoid hitting rate limits or browser connection limits too hard
        // simple approach: Promise.all
        const promises = Array.from(urls).map(async (url) => {
            try {
                await this.fetchDocContent(url);
            } catch (e) {
                console.error(`[Docs] Failed to preload ${url}`, e);
            } finally {
                loaded++;
                if (onProgress) onProgress(loaded, total);
            }
        });

        await Promise.all(promises);
        console.log(`[Docs] Bulk download complete.`);
    }

    /**
     * Checks if all indexed files are currently present in the memory cache.
     */
    isFullyCached() {
        if (!this.index) return false;
        const urls = new Set();
        Object.values(this.index).forEach(doc => urls.add(doc.url));
        
        for (const url of urls) {
            if (!this.fileCache.has(url)) return false;
        }
        return true;
    }

    /**
     * Скачивает raw-контент файла
     */
    async fetchDocContent(url) {
        if (this.fileCache.has(url)) {
            return this.fileCache.get(url);
        }

        try {
            console.log(`[Docs] Downloading ${url}...`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            this.fileCache.set(url, text);
            return text;
        } catch (e) {
            console.error(`[Docs] Failed to load content from ${url}`, e);
            return null;
        }
    }
}

export const docsManager = new DocsManager();
