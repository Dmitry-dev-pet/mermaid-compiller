
const DOCS_CONFIG = {
    owner: 'mermaid-js',
    repo: 'mermaid',
    ref: 'develop', // Можно вынести в настройки UI
    paths: [
        'packages/mermaid/src/docs/syntax',
        'packages/mermaid/src/docs/config'
    ],
    cacheKey: 'mermaid_docs_index_v1',
    cacheDuration: 24 * 60 * 60 * 1000 // 24 часа
};

class DocsManager {
    constructor() {
        this.index = null;
        this.fileCache = new Map(); // Кэш содержимого файлов в памяти
    }

    /**
     * Инициализация: загружает индекс файлов (из кэша или GitHub API)
     */
    async init() {
        if (this.index) return;

        // 1. Попытка загрузить из LocalStorage
        const cached = localStorage.getItem(DOCS_CONFIG.cacheKey);
        if (cached) {
            try {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < DOCS_CONFIG.cacheDuration) {
                    console.log('[Docs] Loaded index from cache');
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
        console.log('[Docs] Fetching index from GitHub API...');
        this.index = {};

        try {
            for (const path of DOCS_CONFIG.paths) {
                const url = `https://api.github.com/repos/${DOCS_CONFIG.owner}/${DOCS_CONFIG.repo}/contents/${path}?ref=${DOCS_CONFIG.ref}`;
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
                            // sequenceDiagram -> sequence
                            // entityRelationshipDiagram -> er
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
                            
                            // Сохраняем и под оригинальным ключом тоже, если отличается
                            if (simplifiedKey !== key) {
                                this.index[key] = this.index[simplifiedKey];
                            }
                        }
                    });
                }
            }

            // Сохраняем в кэш
            localStorage.setItem(DOCS_CONFIG.cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: this.index
            }));
            console.log(`[Docs] Index built with ${Object.keys(this.index).length} entries`);

        } catch (e) {
            console.error('[Docs] Initialization failed:', e);
            // Fallback: если API недоступен, можно попробовать хардкодный список, 
            // но для начала оставим пустым.
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
        const results = [];
        const seenUrls = new Set();

        // 1. Основные диаграммы (поиск по ключам индекса)
        // Проверяем, содержит ли запрос название ключа (например, "flowchart")
        // Используем границы слова для точного поиска (чтобы "class" не матчилось в "classification")
        const keywords = Object.keys(this.index);
        
        for (const keyword of keywords) {
            // Создаем регулярное выражение для поиска целого слова
            const regex = new RegExp(`\b${keyword}\b`, 'i');
            if (regex.test(queryLower)) {
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
             coreKeywords.forEach(k => {
                 if (this.index[k] && !seenUrls.has(this.index[k].url)) {
                     // Добавляем в конец, чтобы специфичные диаграммы были первыми
                     results.push(this.index[k]);
                     seenUrls.add(this.index[k].url);
                 }
             });
        }

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
