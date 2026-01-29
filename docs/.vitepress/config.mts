import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Mermaid Compiler",
  description: "AI Diagramming IDE with Local Privacy",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide-basic' },
      { text: 'AI Strategies', link: '/ai-overview' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Web Setup', link: '/setup-web' },
          { text: 'Desktop Setup', link: '/setup-desktop' }
        ]
      },
      {
        text: 'User Guides',
        items: [
          { text: 'Basic Workflow', link: '/guide-basic' },
          { text: 'Markdown Notebooks', link: '/guide-notebooks' },
          { text: 'Whiteboard', link: '/guide-whiteboard' },
          { text: 'Export & Share', link: '/guide-export' },
          { text: 'Troubleshooting', link: '/guide-troubleshooting' }
        ]
      },
      {
        text: 'AI & Integrations',
        items: [
          { text: 'Overview', link: '/ai-overview' },
          { text: 'CLIProxyAPI', link: '/ai-cliproxy' },
          { text: 'Mermaid Agent', link: '/ai-agent' },
          { text: 'Prompt Engineering', link: '/ai-prompts' }
        ]
      },
      {
        text: 'Data & Storage',
        items: [
          { text: 'Local Storage', link: '/storage-local' },
          { text: 'Cloud Sync (E2EE)', link: '/storage-sync' }
        ]
      },
      {
        text: 'Internals',
        collapsed: true,
        items: [
          { text: 'Architecture', link: '/internal-architecture' },
          { text: 'Mermaid Core', link: '/internal-mermaid' },
          { text: 'Testing', link: '/internal-testing' },
          { text: 'Docs Update', link: '/internal-docs-update' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/dmitry-brazhenko/mermaid-langgraph' }
    ]
  }
})
