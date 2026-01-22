import React, { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import MarkdownIt from 'markdown-it';
import { DIAGRAM_TYPES } from '../../utils/diagramTypes';

type MarkdownSection = {
  title: string;
  body: string;
  level: number;
};

type Props = {
  rawText: string;
  isLatest: boolean;
};

const parseMarkdownSections = (raw: string) => {
  const lines = raw.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  const prelude: string[] = [];
  let currentTitle = '';
  let currentLevel = 2;
  let currentBody: string[] = [];
  let inFence = false;
  const flush = () => {
    if (!currentTitle) return;
    sections.push({
      title: currentTitle,
      body: currentBody.join('\n').trim(),
      level: currentLevel,
    });
    currentTitle = '';
    currentLevel = 2;
    currentBody = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
    }
    const match = !inFence ? line.match(/^(#{1,6})\s+(.*)$/) : null;
    if (match) {
      if (currentTitle) flush();
      currentTitle = match[2].trim();
      currentLevel = match[1].length;
      continue;
    }
    if (currentTitle) {
      currentBody.push(line);
    } else {
      prelude.push(line);
    }
  }
  flush();

  return { preludeText: prelude.join('\n').trim(), sections };
};

const promoteDiagramTypesInMarkdown = (markdown: string) => {
  const lines = markdown.split(/\r?\n/);
  const typeSet = new Set(DIAGRAM_TYPES.map((type) => type.toLowerCase()));
  const promoted = lines.map((line) => {
    const match = line.match(/^(\s*(?:\d+\.)\s+|\s*-\s+)(.+)$/);
    if (!match) return line;
    const marker = match[1];
    const content = match[2];
    const parts = content.split(/\s+—\s+/);
    if (parts.length < 3) return line;
    const typeCandidate = parts[1].trim();
    if (!typeSet.has(typeCandidate.toLowerCase())) return line;
    const title = parts[0].trim();
    const rest = parts.slice(2).join(' — ').trim();
    return `${marker}${typeCandidate} — ${title}${rest ? ` — ${rest}` : ''}`;
  });
  return promoted.join('\n');
};

const highlightDiagramTypes = (html: string) => {
  const patternMiddle = new RegExp(`(\\s—\\s)(${DIAGRAM_TYPES.join('|')})(\\s—\\s)`, 'gi');
  const patternStart = new RegExp(`(>\\s*)(${DIAGRAM_TYPES.join('|')})(\\s—\\s)`, 'gi');
  return html
    .replace(patternMiddle, '$1<span class="chat-diagram-type">$2</span>$3')
    .replace(patternStart, '$1<span class="chat-diagram-type">$2</span>$3');
};

type InnerProps = Props & { markdownRenderer: MarkdownIt };

const ChatMarkdownTabsInner: React.FC<InnerProps> = ({ rawText, isLatest, markdownRenderer }) => {
  const [openTitle, setOpenTitle] = useState<string | null>(null);
  const { preludeText, sections } = useMemo(() => parseMarkdownSections(rawText), [rawText]);
  const hasSections = sections.length > 0;
  const allEmpty = sections.every((section) => !section.body.trim());

  const renderMarkdownHtml = (raw: string) => markdownRenderer.render(raw);
  const renderMarkdownInline = (raw: string) => markdownRenderer.renderInline(raw);

  if (!hasSections) {
    return (
      <div
        className="markdown-body chat-markdown"
        dangerouslySetInnerHTML={{ __html: highlightDiagramTypes(renderMarkdownHtml(rawText)) }}
      />
    );
  }

  const defaultTitle = isLatest
    ? sections.find((item) =>
        ['summary', 'diagrams', 'сводка', 'диаграммы'].includes(item.title.trim().toLowerCase())
      )?.title ?? sections[0].title
    : null;
  const resolvedOpenTitle = openTitle ?? defaultTitle;

  const renderTabs = () => (
    <div className="chat-md-tabs">
      <Button
        type="button"
        variant="ghost"
        className={`chat-md-tab ${resolvedOpenTitle === '__all__' ? 'chat-md-tab-active' : ''}`}
        onClick={() => setOpenTitle(resolvedOpenTitle === '__all__' ? null : '__all__')}
        title="Show all"
        aria-label="Show all sections"
      >
        ▼
      </Button>
      <span className="chat-md-divider">|</span>
      {sections.map((section, index) => {
        const title = section.title || 'Section';
        const isActive = resolvedOpenTitle === title;
        return (
          <React.Fragment key={`tab-${title}`}>
            <Button
              type="button"
              variant="ghost"
              className={`chat-md-tab ${isActive ? 'chat-md-tab-active' : ''}`}
              onClick={() => setOpenTitle(isActive ? null : title)}
              title={title}
            >
              <span dangerouslySetInnerHTML={{ __html: renderMarkdownInline(title) }} />
            </Button>
            {index < sections.length - 1 && <span className="chat-md-divider">|</span>}
          </React.Fragment>
        );
      })}
    </div>
  );

  const renderSectionBody = (section: MarkdownSection) => {
    if (!section.body) return null;
    const isDiagramsSection = ['diagrams', 'диаграммы'].includes(section.title.trim().toLowerCase());
    const body = isDiagramsSection ? promoteDiagramTypesInMarkdown(section.body) : section.body;
    return (
      <div
        className="markdown-body chat-markdown"
        dangerouslySetInnerHTML={{ __html: highlightDiagramTypes(renderMarkdownHtml(body)) }}
      />
    );
  };

  return (
    <div className="chat-markdown">
      {preludeText && (
        <div
          className="chat-md-prelude"
          dangerouslySetInnerHTML={{ __html: renderMarkdownInline(preludeText) }}
        />
      )}
      {renderTabs()}
      {!allEmpty && resolvedOpenTitle === '__all__' && (
        <div className="mt-1 space-y-2">
          {sections.map((section) => (
            <div key={`section-${section.title}`}>
              <div
                className="markdown-body chat-markdown"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdownHtml(`**${section.title}**`),
                }}
              />
              {renderSectionBody(section)}
            </div>
          ))}
        </div>
      )}
      {!allEmpty && resolvedOpenTitle !== '__all__' && (
        <div className="mt-1">
          {renderSectionBody(
            sections.find((section) => section.title === resolvedOpenTitle) ?? sections[0]
          )}
        </div>
      )}
    </div>
  );
};

const ChatMarkdownTabs: React.FC<Props> = ({ rawText, isLatest }) => {
  const markdownRenderer = useMemo(
    () => new MarkdownIt({ html: false, linkify: true, typographer: false }),
    []
  );
  // Remount tabs on content changes so open state doesn't need an effect reset.
  const contentKey = useMemo(() => `${rawText.length}:${rawText.slice(0, 64)}`, [rawText]);
  return (
    <ChatMarkdownTabsInner
      key={contentKey}
      rawText={rawText}
      isLatest={isLatest}
      markdownRenderer={markdownRenderer}
    />
  );
};

export default ChatMarkdownTabs;
