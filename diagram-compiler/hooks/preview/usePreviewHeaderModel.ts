import type { MermaidDirection } from '../../utils/inlineDirectionCommand';
import type { MermaidLook } from '../../utils/inlineLookCommand';
import type { FlowchartEdgeStyle, FlowchartEdgeStyleUpdate } from '../../utils/flowchartArrowStyle';
import type { FlowchartLinkStylePresetId } from '../../utils/flowchartLinkStyle';
import type { FlowchartCurve } from '../../utils/flowchartCurveConfig';
import type { MermaidThemePresetId } from '../../utils/mermaidThemePreset';

export type PreviewHeaderPinnedModel = {
  pinnedMode: 'mermaid' | 'ed';
  pinnedCanEd: boolean;
  pinnedDirty: boolean;
  pinnedEdDisabledReason: string | null;
  onSetPinnedMode: (next: 'mermaid' | 'ed') => void;
};

export type PreviewHeaderToolsModel = {
  isBuildDocsMode: boolean;
  isMarkdownMode: boolean;
  svgMarkup: string;
  isExporting: boolean;
  onExportSvg: () => void;
  onExportPng: () => void;
  canNotebookExcalidrawToggle: boolean;
  isNotebookExcalidrawMode: boolean;
  onToggleNotebookExcalidraw: () => void;
  showWhiteboardToggle: boolean;
  isWhiteboardMode: boolean;
  isWhiteboardDirty: boolean;
  isWhiteboardAutoSync: boolean;
  onToggleWhiteboard: () => void;
  onWhiteboardSyncFromCode: () => void;
  onToggleWhiteboardAutoSync: () => void;
  showExcalidrawThemeControl: boolean;
  excalidrawTheme: 'light' | 'dark';
  onSetExcalidrawTheme: (nextTheme: 'light' | 'dark') => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
};

export type PreviewHeaderStyleModel = {
  isBuildDocsMode: boolean;
  isMarkdownMode: boolean;
  showThemeControl: boolean;
  showDirectionControl: boolean;
  showLookControl: boolean;
  showArrowControl: boolean;
  directionOptions: MermaidDirection[];
  selectedThemePreset: MermaidThemePresetId | null;
  isThemePresetMixed: boolean;
  selectedInlineDirection: string;
  selectedInlineLook: string;
  flowchartEdgeStyle: FlowchartEdgeStyle | null;
  flowchartLinkStylePreset: FlowchartLinkStylePresetId | null;
  flowchartCurve: FlowchartCurve | null;
  isFlowchartCurveMixed: boolean;
  onSetThemePreset: (presetId: MermaidThemePresetId | null) => void;
  onSetInlineDirection: (direction: MermaidDirection | null) => void;
  onSetInlineLook: (look: MermaidLook | null) => void;
  onSetFlowchartEdgeStyle: (update: FlowchartEdgeStyleUpdate) => void;
  onSetFlowchartLinkStylePreset: (presetId: FlowchartLinkStylePresetId) => void;
  onSetFlowchartCurve: (curve: FlowchartCurve | null) => void;
  codeForRender: string;
};

export type PreviewHeaderScrollSyncModel = {
  isBuildDocsMode: boolean;
  showScrollSyncToggle: boolean;
  isScrollSyncEnabled: boolean;
  onToggleScrollSync: () => void;
};

export type PreviewHeaderModel = {
  pinned: PreviewHeaderPinnedModel;
  tools: PreviewHeaderToolsModel;
  style: PreviewHeaderStyleModel;
  scrollSync: PreviewHeaderScrollSyncModel;
};

type UsePreviewHeaderModelArgs = PreviewHeaderModel;

export const usePreviewHeaderModel = (args: UsePreviewHeaderModelArgs): PreviewHeaderModel => args;
