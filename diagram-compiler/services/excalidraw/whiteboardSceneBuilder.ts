import type { AppState, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';

import { renderMermaidToExcalidrawElements } from './mermaidToExcalidrawRenderer';
import { detectMermaidDiagramTypeHint } from './mermaidToExcalidrawService';
import { applyMermaidThemeToExcalidrawElements } from './excalidrawTheme';
import { normalizeTheme, type MermaidLanggraphSceneGenerator } from './whiteboardSceneMeta';
import { extractFrontmatterThemeVariables } from '../../utils/mermaidFrontmatterThemeVariables';
import { extractMermaidSvgBackgroundColor } from '../../utils/mermaidSvgBackground';

export const buildSceneFromMermaidCode = async (args: {
  mermaidCode: string;
  svgMarkup: string;
  theme: 'light' | 'dark';
  backgroundColor: string | null;
  debug?: boolean;
  buildSceneFromSvgVectors: (args: {
    svgMarkup: string;
    theme: 'light' | 'dark';
    backgroundColor: string | null;
  }) => Promise<ExcalidrawInitialDataState | null>;
  buildSceneFromSvgMarkup: (args: {
    svgMarkup: string;
    theme: 'light' | 'dark';
    backgroundColor: string | null;
  }) => Promise<ExcalidrawInitialDataState | null>;
}): Promise<{ scene: ExcalidrawInitialDataState; generator: MermaidLanggraphSceneGenerator; mermaidToExcalidrawError?: string } | null> => {
  const themeVars = extractFrontmatterThemeVariables(args.mermaidCode);
  const themeVariables = {
    ...(themeVars ?? {}),
    // Keep font size consistent and avoid huge labels.
    fontSize: '16px',
  };
  const backgroundCandidate =
    (args.backgroundColor?.trim() ?? '')
    || (typeof themeVars?.background === 'string' ? themeVars.background.trim() : '')
    || extractMermaidSvgBackgroundColor(args.svgMarkup)
    || null;

  const trySvgVectors = async () => {
    const svgVectors = await args.buildSceneFromSvgVectors({
      svgMarkup: args.svgMarkup,
      theme: args.theme,
      backgroundColor: backgroundCandidate,
    });
    if (!svgVectors) return null;
    const themed = applyMermaidThemeToExcalidrawElements((svgVectors.elements ?? []) as unknown[], {
      backgroundColor: backgroundCandidate,
      themeVariables: themeVars,
      uiTheme: args.theme,
    }) as unknown as ExcalidrawInitialDataState['elements'];
    return {
      scene: {
        ...svgVectors,
        elements: themed,
        appState: {
          ...(svgVectors.appState ?? {}),
          theme: normalizeTheme(args.theme),
          viewBackgroundColor: backgroundCandidate ?? undefined,
        } as Partial<AppState>,
      },
      generator: 'svg-vectors' as const,
    };
  };

  const diagramTypeHintLocal = detectMermaidDiagramTypeHint(args.mermaidCode);

  try {
    const { elements: converted, files } = await renderMermaidToExcalidrawElements({
      mermaidCode: args.mermaidCode,
      diagramTypeHint: diagramTypeHintLocal,
      themeVariables,
      timeoutMs: 12000,
    });
    const themed = applyMermaidThemeToExcalidrawElements(converted, {
      backgroundColor: backgroundCandidate,
      themeVariables: themeVars,
      uiTheme: args.theme,
    });

    if (themed.length > 0) {
      return {
        generator: 'mermaid-to-excalidraw',
        scene: {
          type: 'excalidraw',
          version: 2,
          source: 'mermaid-langgraph',
          elements: themed,
          files,
          scrollToContent: true,
          appState: {
            theme: normalizeTheme(args.theme),
            viewBackgroundColor: backgroundCandidate ?? undefined,
          } as Partial<AppState>,
        },
      };
    }
    if (args.debug) {
      console.warn('[whiteboard] mermaid-to-excalidraw returned 0 elements; falling back to svg-vectors');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.debug) {
      console.warn('[whiteboard] mermaid-to-excalidraw failed; falling back to svg-vectors', message);
    }
    const svgVectors = await trySvgVectors();
    if (svgVectors) return { ...svgVectors, mermaidToExcalidrawError: message };
    // Fall back to SVG snapshot.
    const svgImage = await args.buildSceneFromSvgMarkup({
      svgMarkup: args.svgMarkup,
      theme: args.theme,
      backgroundColor: backgroundCandidate,
    });
    return svgImage ? { scene: svgImage, generator: 'svg-image', mermaidToExcalidrawError: message } : null;
  }

  // Fallback: parse the rendered Mermaid SVG into basic Excalidraw elements.
  const svgVectors = await trySvgVectors();
  if (svgVectors) return svgVectors;

  // Last resort: import the rendered Mermaid SVG as a single image so it always stays visible.
  const svgImage = await args.buildSceneFromSvgMarkup({
    svgMarkup: args.svgMarkup,
    theme: args.theme,
    backgroundColor: backgroundCandidate,
  });
  return svgImage ? { scene: svgImage, generator: 'svg-image' } : null;
};
