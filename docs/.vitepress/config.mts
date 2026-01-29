import { defineConfig } from 'vitepress'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const base = process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/'
const repoUrl = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : 'https://github.com/dmitry-dev-pet/mermaid-compiller'

const navEn = (prefix: string) => ([
  { text: 'Home', link: `${prefix}/` },
  { text: 'Guide', link: `${prefix}/guide-basic` },
  { text: 'AI Strategies', link: `${prefix}/ai-overview` },
]);

const sidebarEn = (prefix: string) => ([
  {
    text: 'Getting Started',
    items: [
      { text: 'Web Setup', link: `${prefix}/setup-web` },
      { text: 'Desktop Setup', link: `${prefix}/setup-desktop` }
    ]
  },
  {
    text: 'User Guides',
    items: [
      { text: 'Basic Workflow', link: `${prefix}/guide-basic` },
      { text: 'Markdown Notebooks', link: `${prefix}/guide-notebooks` },
      { text: 'Whiteboard', link: `${prefix}/guide-whiteboard` },
      { text: 'Export & Share', link: `${prefix}/guide-export` },
      { text: 'Troubleshooting', link: `${prefix}/guide-troubleshooting` }
    ]
  },
  {
    text: 'AI & Integrations',
    items: [
      { text: 'Overview', link: `${prefix}/ai-overview` },
      { text: 'CLIProxyAPI', link: `${prefix}/ai-cliproxy` },
      { text: 'Mermaid Agent', link: `${prefix}/ai-agent` },
      { text: 'Prompt Engineering', link: `${prefix}/ai-prompts` }
    ]
  },
  {
    text: 'Data & Storage',
    items: [
      { text: 'Local Storage', link: `${prefix}/storage-local` },
      { text: 'Cloud Sync (E2EE)', link: `${prefix}/storage-sync` }
    ]
  },
  {
    text: 'Internals',
    collapsed: true,
    items: [
      { text: 'Architecture', link: `${prefix}/internal-architecture` },
      { text: 'Mermaid Core', link: `${prefix}/internal-mermaid` },
      { text: 'Testing', link: `${prefix}/internal-testing` },
      { text: 'Docs Update', link: `${prefix}/internal-docs-update` }
    ]
  }
]);

const navRu = (prefix: string) => ([
  { text: 'Главная', link: `${prefix}/` },
  { text: 'Гайд', link: `${prefix}/guide-basic` },
  { text: 'ИИ', link: `${prefix}/ai-overview` },
]);

const sidebarRu = (prefix: string) => ([
  {
    text: 'Начало',
    items: [
      { text: 'Веб-версия', link: `${prefix}/setup-web` },
      { text: 'Desktop-версия', link: `${prefix}/setup-desktop` }
    ]
  },
  {
    text: 'Гайды',
    items: [
      { text: 'Базовый рабочий цикл', link: `${prefix}/guide-basic` },
      { text: 'Markdown Notebooks', link: `${prefix}/guide-notebooks` },
      { text: 'Whiteboard', link: `${prefix}/guide-whiteboard` },
      { text: 'Экспорт и шеринг', link: `${prefix}/guide-export` },
      { text: 'Troubleshooting', link: `${prefix}/guide-troubleshooting` }
    ]
  },
  {
    text: 'ИИ и интеграции',
    items: [
      { text: 'Обзор', link: `${prefix}/ai-overview` },
      { text: 'CLIProxyAPI', link: `${prefix}/ai-cliproxy` },
      { text: 'Mermaid Agent', link: `${prefix}/ai-agent` },
      { text: 'Промпты и контекст', link: `${prefix}/ai-prompts` }
    ]
  },
  {
    text: 'Данные и хранение',
    items: [
      { text: 'Локальное хранение', link: `${prefix}/storage-local` },
      { text: 'Синхронизация (E2EE)', link: `${prefix}/storage-sync` }
    ]
  },
  {
    text: 'Внутренности',
    collapsed: true,
    items: [
      { text: 'Архитектура', link: `${prefix}/internal-architecture` },
      { text: 'Mermaid Core', link: `${prefix}/internal-mermaid` },
      { text: 'Тестирование', link: `${prefix}/internal-testing` },
      { text: 'Обновление доков', link: `${prefix}/internal-docs-update` }
    ]
  }
]);

export default defineConfig({
  base,
  title: "Mermaid Compiler",
  description: "AI Diagramming IDE with Local Privacy",
  ignoreDeadLinks: true,
  locales: {
    root: {
      label: 'EN',
      lang: 'en-US',
      themeConfig: {
        nav: navEn(''),
        sidebar: sidebarEn(''),
      }
    },
    ru: {
      label: 'RU',
      lang: 'ru-RU',
      link: '/ru/',
      themeConfig: {
        nav: navRu('/ru'),
        sidebar: sidebarRu('/ru'),
        outlineTitle: 'На этой странице',
        lastUpdatedText: 'Обновлено',
        docFooter: { prev: 'Предыдущая страница', next: 'Следующая страница' },
      }
    }
  },
  themeConfig: {
    socialLinks: [
      { icon: 'github', link: repoUrl }
    ]
  }
})
