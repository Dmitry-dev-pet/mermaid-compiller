import { useMemo } from 'react';
import {
  extractFlowchartEdgeStyle,
  type FlowchartEdgeStyle,
} from '../../utils/flowchartArrowStyle';
import {
  extractFlowchartLinkStylePreset,
  type FlowchartLinkStylePresetId,
} from '../../utils/flowchartLinkStyle';
import { extractFlowchartCurve, type FlowchartCurve } from '../../utils/flowchartCurveConfig';
import { extractFrontmatterThemeVariables } from '../../utils/mermaidFrontmatterThemeVariables';
import {
  extractMermaidThemePreset,
  type MermaidThemePresetId,
} from '../../utils/mermaidThemePreset';
import { extractInlineDirectionCommand } from '../../utils/inlineDirectionCommand';
import { extractInlineLookCommand } from '../../utils/inlineLookCommand';
import {
  DIAGRAM_TYPE_SUPPORTS_INLINE_DIRECTION,
  DIAGRAM_TYPE_SUPPORTS_INLINE_LOOK,
  getInlineDirectionOptions,
} from '../../utils/diagramTypeMeta';
import type { MermaidMarkdownBlock } from '../../services/mermaidService';
import { detectMermaidDiagramType } from '../../services/mermaidService';

type UseMarkdownPreviewMetaArgs = {
  codeForRender: string;
  isMarkdownMode: boolean;
  isMarkdownMermaidMode: boolean;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  activeMarkdownBlock: MermaidMarkdownBlock | null;
};

export const useMarkdownPreviewMeta = ({
  codeForRender,
  isMarkdownMode,
  isMarkdownMermaidMode,
  markdownMermaidBlocks,
  activeMarkdownBlock,
}: UseMarkdownPreviewMetaArgs) => {
  const activeDiagramType = useMemo(() => {
    if (isMarkdownMermaidMode) {
      return activeMarkdownBlock?.diagramType ?? (codeForRender ? detectMermaidDiagramType(codeForRender) : null);
    }
    return codeForRender ? detectMermaidDiagramType(codeForRender) : null;
  }, [activeMarkdownBlock?.diagramType, codeForRender, isMarkdownMermaidMode]);

  const supportsInlineTheme = Boolean(activeDiagramType);
  const supportsInlineDirection = Boolean(
    activeDiagramType && DIAGRAM_TYPE_SUPPORTS_INLINE_DIRECTION[activeDiagramType]
  );
  const supportsInlineLook = Boolean(activeDiagramType && DIAGRAM_TYPE_SUPPORTS_INLINE_LOOK[activeDiagramType]);
  const directionOptions = useMemo(() => getInlineDirectionOptions(activeDiagramType), [activeDiagramType]);

  const flowchartBlocksCount = useMemo(() => {
    if (!isMarkdownMode) return 0;
    return markdownMermaidBlocks.filter((block) => block.diagramType === 'flowchart').length;
  }, [isMarkdownMode, markdownMermaidBlocks]);

  const selectedFlowchartEdgeStyle = useMemo<FlowchartEdgeStyle | null>(() => {
    if (isMarkdownMermaidMode) return extractFlowchartEdgeStyle(codeForRender);
    if (!isMarkdownMode) return extractFlowchartEdgeStyle(codeForRender);

    const flowchartBlocks = markdownMermaidBlocks.filter((block) => block.diagramType === 'flowchart');
    if (!flowchartBlocks.length) return null;
    const extracted = flowchartBlocks
      .map((block) => extractFlowchartEdgeStyle(block.code))
      .filter(Boolean) as FlowchartEdgeStyle[];
    if (!extracted.length) return null;

    const pick = <K extends keyof FlowchartEdgeStyle>(key: K): FlowchartEdgeStyle[K] => {
      const values = new Set(extracted.map((value) => value[key]).filter((value) => value !== null));
      if (!values.size) return null;
      if (values.size === 1) return Array.from(values)[0] as FlowchartEdgeStyle[K];
      return null;
    };

    return {
      lineStyle: pick('lineStyle'),
      endCap: pick('endCap'),
      direction: pick('direction'),
      length: pick('length'),
    };
  }, [codeForRender, isMarkdownMermaidMode, isMarkdownMode, markdownMermaidBlocks]);

  const selectedFlowchartLinkStylePreset = useMemo<FlowchartLinkStylePresetId | null>(() => {
    if (isMarkdownMermaidMode) return extractFlowchartLinkStylePreset(codeForRender);
    if (!isMarkdownMode) return extractFlowchartLinkStylePreset(codeForRender);

    const flowchartBlocks = markdownMermaidBlocks.filter((block) => block.diagramType === 'flowchart');
    if (!flowchartBlocks.length) return null;
    const presets = new Set(
      flowchartBlocks
        .map((block) => extractFlowchartLinkStylePreset(block.code))
        .filter((value): value is FlowchartLinkStylePresetId => Boolean(value))
    );
    return presets.size === 1 ? (Array.from(presets)[0] ?? null) : null;
  }, [codeForRender, isMarkdownMermaidMode, isMarkdownMode, markdownMermaidBlocks]);

  const selectedFlowchartCurve = useMemo<FlowchartCurve | null>(() => {
    if (isMarkdownMermaidMode) return extractFlowchartCurve(codeForRender);
    if (!isMarkdownMode) return extractFlowchartCurve(codeForRender);

    const flowchartBlocks = markdownMermaidBlocks.filter((block) => block.diagramType === 'flowchart');
    if (!flowchartBlocks.length) return null;
    const curves = new Set(
      flowchartBlocks
        .map((block) => extractFlowchartCurve(block.code))
        .filter((value): value is FlowchartCurve => Boolean(value))
    );
    return curves.size === 1 ? (Array.from(curves)[0] ?? null) : null;
  }, [codeForRender, isMarkdownMermaidMode, isMarkdownMode, markdownMermaidBlocks]);

  const isFlowchartCurveMixed = useMemo(() => {
    if (isMarkdownMermaidMode) return false;
    if (!isMarkdownMode) return false;
    const flowchartBlocks = markdownMermaidBlocks.filter((block) => block.diagramType === 'flowchart');
    if (!flowchartBlocks.length) return false;
    const curves = new Set(flowchartBlocks.map((block) => extractFlowchartCurve(block.code) ?? null));
    return curves.size > 1;
  }, [isMarkdownMermaidMode, isMarkdownMode, markdownMermaidBlocks]);

  const selectedThemePreset = useMemo<MermaidThemePresetId | null>(() => {
    if (!isMarkdownMode) {
      const vars = extractFrontmatterThemeVariables(codeForRender);
      return extractMermaidThemePreset(codeForRender, { themeVariables: vars });
    }
    if (!markdownMermaidBlocks.length) return null;
    const values = new Set(
      markdownMermaidBlocks.map((block) => {
        const vars = extractFrontmatterThemeVariables(block.code);
        return extractMermaidThemePreset(block.code, { themeVariables: vars });
      })
    );
    return values.size === 1 ? (Array.from(values)[0] ?? null) : null;
  }, [codeForRender, isMarkdownMode, markdownMermaidBlocks]);

  const isThemePresetMixed = useMemo(() => {
    if (!isMarkdownMode) return false;
    if (!markdownMermaidBlocks.length) return false;
    const values = new Set(
      markdownMermaidBlocks.map((block) => {
        const vars = extractFrontmatterThemeVariables(block.code);
        return extractMermaidThemePreset(block.code, { themeVariables: vars });
      })
    );
    return values.size > 1;
  }, [isMarkdownMode, markdownMermaidBlocks]);

  const selectedInlineDirection = useMemo(() => {
    return extractInlineDirectionCommand(codeForRender).direction ?? '';
  }, [codeForRender]);

  const selectedInlineLook = useMemo(() => {
    if (!isMarkdownMode) {
      return extractInlineLookCommand(codeForRender).look ?? '';
    }
    if (!markdownMermaidBlocks.length) return '';
    const looks = markdownMermaidBlocks.map((block) => extractInlineLookCommand(block.code).look ?? '');
    const first = looks[0] ?? '';
    return looks.every((value) => value === first) ? first : '';
  }, [codeForRender, isMarkdownMode, markdownMermaidBlocks]);

  return {
    activeDiagramType,
    supportsInlineTheme,
    supportsInlineDirection,
    supportsInlineLook,
    directionOptions,
    flowchartBlocksCount,
    selectedFlowchartEdgeStyle,
    selectedFlowchartLinkStylePreset,
    selectedFlowchartCurve,
    isFlowchartCurveMixed,
    selectedThemePreset,
    isThemePresetMixed,
    selectedInlineDirection,
    selectedInlineLook,
  };
};
