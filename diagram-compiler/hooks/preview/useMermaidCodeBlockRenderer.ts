import { useEffect } from 'react';
import mermaid from 'mermaid';
import { MERMAID_CODE_BLOCK_SELECTOR } from '../../utils/markdownMermaid';
import { applyInlineMermaidDirectives, validateMermaidDiagramCode } from '../../services/mermaidService';

type MermaidBlockRendererMode = 'interactive' | 'static';

type MermaidBlockRendererArgs = {
  mountRef: React.RefObject<HTMLElement>;
  html: string;
  enabled: boolean;
  idPrefix: string;
  mode: MermaidBlockRendererMode;
  renderMarkdown?: (mount: HTMLElement) => void;
  onBlockClick?: (index: number) => void;
  onBlockHover?: (index: number | null) => void;
  onBlockHoverSync?: (index: number) => void;
  createErrorBlock?: (message: string, index: number) => HTMLElement;
  enrichError?: (code: string, message: string) => string;
  onAfterRender?: () => void;
};

export const useMermaidCodeBlockRenderer = ({
  mountRef,
  html,
  enabled,
  idPrefix,
  mode,
  renderMarkdown,
  onBlockClick,
  onBlockHover,
  onBlockHoverSync,
  createErrorBlock,
  enrichError,
  onAfterRender,
}: MermaidBlockRendererArgs) => {
  useEffect(() => {
    if (!enabled) return;
    const mount = mountRef.current;
    if (!mount) return;

    if (renderMarkdown) {
      renderMarkdown(mount);
    } else {
      mount.innerHTML = html;
    }

    const mermaidBlocks = Array.from(mount.querySelectorAll(MERMAID_CODE_BLOCK_SELECTOR)) as HTMLElement[];
    if (mermaidBlocks.length === 0) return;

    let isCancelled = false;
    const renderBlocks = async () => {
      try {
        for (let i = 0; i < mermaidBlocks.length; i += 1) {
          if (isCancelled) return;
          const block = mermaidBlocks[i];
          const code = block.textContent ?? '';
          if (!code.trim()) continue;
          const id = `${idPrefix}-${Date.now()}-${i}`;
          const validation = await validateMermaidDiagramCode(code, { logError: false });
          if (validation.isValid === false) {
            const pre = block.parentElement;
            if (pre && pre.parentElement && createErrorBlock && enrichError) {
              const errorBlock = createErrorBlock(
                enrichError(code, validation.errorMessage || 'Syntax Error'),
                i
              );
              pre.replaceWith(errorBlock);
            }
            continue;
          }
          try {
            const normalized = applyInlineMermaidDirectives(code);
            const { svg, bindFunctions } = await mermaid.render(id, normalized);
            if (isCancelled || !svg) continue;
            const wrapper = document.createElement('div');
            if (mode === 'interactive') {
              wrapper.className = 'markdown-mermaid-preview markdown-mermaid-block';
              wrapper.setAttribute('role', 'button');
              wrapper.setAttribute('tabindex', '0');
              wrapper.dataset.mermaidIndex = String(i);
            }
            wrapper.innerHTML = svg;
            const pre = block.parentElement;
            if (pre && pre.parentElement) {
              pre.replaceWith(wrapper);
              if (mode === 'interactive') {
                wrapper.addEventListener('click', () => {
                  onBlockClick?.(i);
                });
                wrapper.addEventListener('mouseenter', () => {
                  onBlockHover?.(i);
                  onBlockHoverSync?.(i);
                });
                wrapper.addEventListener('mouseleave', () => {
                  onBlockHover?.(null);
                });
              }
              try {
                bindFunctions?.(wrapper);
              } catch (e) {
                const target = mode === 'interactive' ? 'markdown' : 'build docs preview';
                console.error(`Failed to bind Mermaid interactions in ${target}`, e);
              }
            }
          } catch (e) {
            const pre = block.parentElement;
            if (pre && pre.parentElement && createErrorBlock && enrichError) {
              const message = e instanceof Error ? e.message : 'Syntax Error';
              const errorBlock = createErrorBlock(enrichError(code, message), i);
              pre.replaceWith(errorBlock);
            }
          }
        }
        if (!isCancelled && onAfterRender) {
          requestAnimationFrame(() => onAfterRender());
        }
      } catch {
        // Swallow render errors to avoid crashing the app.
      }
    };

    void renderBlocks();
    return () => {
      isCancelled = true;
    };
  }, [
    createErrorBlock,
    enabled,
    enrichError,
    html,
    idPrefix,
    mode,
    mountRef,
    onAfterRender,
    onBlockClick,
    onBlockHover,
    onBlockHoverSync,
    renderMarkdown,
  ]);
};
