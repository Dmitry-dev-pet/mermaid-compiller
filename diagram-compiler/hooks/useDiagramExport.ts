import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import mermaid from 'mermaid';
import { exportDiagramAsPng, exportDiagramAsSvg } from '../services/exportService';
import { insertDirectiveAfterLeadingDirectives } from '../utils/mermaidDirectives';
import { extractInlineThemeCommand } from '../utils/inlineThemeCommand';
import { applyInlineDirectionCommand } from '../utils/inlineDirectionCommand';
import { extractInlineLookCommand } from '../utils/inlineLookCommand';

const OFFSCREEN_EXPORT_ID = 'dc-export-svg-mount';

type UseDiagramExportArgs = {
  svgRef: React.RefObject<SVGSVGElement | null>;
  code: string;
  theme: 'light' | 'dark';
};

const sanitizeFilenameToken = (value: string): string => {
  const safe = value.replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').slice(0, 24);
  return safe || 'mermaid';
};

export const useDiagramExport = ({ svgRef, code, theme }: UseDiagramExportArgs) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filenameBase = useMemo(() => {
    const trimmed = code.trim();
    const firstToken = (trimmed.split(/\s+/)[0] ?? '').trim();
    const token = sanitizeFilenameToken(firstToken || 'diagram');
    return `diagram-${token}-${Date.now()}`;
  }, [code]);

  useEffect(() => {
    if (!exportError) return;
    const timer = setTimeout(() => setExportError(null), 4000);
    return () => clearTimeout(timer);
  }, [exportError]);

  const renderPngCompatibleSvg = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) throw new Error('No diagram to export');

    const withDirection = applyInlineDirectionCommand(trimmed).code;
    const extracted = extractInlineThemeCommand(withDirection);
    const lookExtracted = extractInlineLookCommand(extracted.codeWithoutCommand);
    const effectiveTheme = extracted.theme ?? (theme === 'dark' ? 'dark' : 'default');
    const base = extracted.theme || lookExtracted.look ? lookExtracted.codeWithoutCommand : withDirection;

    const init: Record<string, unknown> = {
      theme: effectiveTheme,
      securityLevel: 'loose',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      sequence: { htmlLabels: false },
    };
    if (lookExtracted.look) init.look = lookExtracted.look;

    const initDirective = `%%{init: ${JSON.stringify(init)}}%%`;
    const codeForExport = insertDirectiveAfterLeadingDirectives(base, initDirective);

    const { svg } = await mermaid.render(`mermaid-export-${Date.now()}`, codeForExport);
    if (!svg || !svg.includes('<svg')) throw new Error('Mermaid returned empty SVG');

    let mount = document.getElementById(OFFSCREEN_EXPORT_ID) as HTMLDivElement | null;
    if (!mount) {
      mount = document.createElement('div');
      mount.id = OFFSCREEN_EXPORT_ID;
      mount.style.position = 'fixed';
      mount.style.left = '-10000px';
      mount.style.top = '-10000px';
      mount.style.width = '0';
      mount.style.height = '0';
      mount.style.overflow = 'hidden';
      mount.style.pointerEvents = 'none';
      document.body.appendChild(mount);
    }

    mount.innerHTML = svg;
    const svgEl = mount.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl) throw new Error('Mermaid returned empty SVG');
    if (svgEl.querySelector('foreignObject')) {
      throw new Error('PNG export is not supported for this diagram (HTML labels). Export SVG instead.');
    }

    return svgEl;
  }, [code, theme]);

  const exportSvg = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    setIsExporting(true);
    setExportError(null);
    try {
      await exportDiagramAsSvg(svg, filenameBase);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportError(message);
      console.error('SVG export failed', error);
    } finally {
      setIsExporting(false);
    }
  }, [filenameBase, svgRef]);

  const exportPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const svgForExport = svg.querySelector('foreignObject') ? await renderPngCompatibleSvg() : svg;
      await exportDiagramAsPng(svgForExport, { filenameBase, backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExportError(message);
      console.error('PNG export failed', error);
    } finally {
      setIsExporting(false);
    }
  }, [filenameBase, renderPngCompatibleSvg, svgRef, theme]);

  return {
    exportSvg,
    exportPng,
    isExporting,
    exportError,
    filenameBase,
  };
};
