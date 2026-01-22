import React from 'react';
import type { MermaidDirection } from '../../utils/inlineDirectionCommand';
import type { MermaidLook } from '../../utils/inlineLookCommand';
import type { FlowchartEdgeStyle, FlowchartEdgeStyleUpdate } from '../../utils/flowchartArrowStyle';
import type { FlowchartLinkStylePresetId } from '../../utils/flowchartLinkStyle';
import type { FlowchartCurve } from '../../utils/flowchartCurveConfig';
import type { MermaidThemePresetId } from '../../utils/mermaidThemePreset';
import PanelHeader from '../ui/PanelHeader';
import HeaderRow from '../ui/HeaderRow';
import HeaderSection from '../ui/HeaderSection';
import PreviewToolsRow from './PreviewToolsRow';
import PreviewHeaderPinnedMode from './PreviewHeaderPinnedMode';
import PreviewHeaderStyleMenu from './PreviewHeaderStyleMenu';
import PreviewHeaderScrollSyncToggle from './PreviewHeaderScrollSyncToggle';

interface PreviewHeaderControlsProps {
  isBuildDocsMode: boolean;
  isMarkdownMode: boolean;
  showNotebookExcalidrawToggle: boolean;
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
  pinnedMode: 'mermaid' | 'ed';
  pinnedCanEd: boolean;
  pinnedDirty: boolean;
  pinnedEdDisabledReason: string | null;
  onSetPinnedMode: (next: 'mermaid' | 'ed') => void;
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
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  showScrollSyncToggle: boolean;
  isScrollSyncEnabled: boolean;
  onToggleScrollSync: () => void;
  svgMarkup: string;
  isExporting: boolean;
  onExportSvg: () => void;
  onExportPng: () => void;
  zoomPercent: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitToViewport: () => void;
}

const PreviewHeaderControls: React.FC<PreviewHeaderControlsProps> = ({
  isBuildDocsMode,
  isMarkdownMode,
  showNotebookExcalidrawToggle,
  isNotebookExcalidrawMode,
  onToggleNotebookExcalidraw,
  showWhiteboardToggle,
  isWhiteboardMode,
  isWhiteboardDirty,
  isWhiteboardAutoSync,
  onToggleWhiteboard,
  onWhiteboardSyncFromCode,
  onToggleWhiteboardAutoSync,
  showExcalidrawThemeControl,
  excalidrawTheme,
  onSetExcalidrawTheme,
  pinnedMode,
  pinnedCanEd,
  pinnedDirty,
  pinnedEdDisabledReason,
  onSetPinnedMode,
  showThemeControl,
  showDirectionControl,
  showLookControl,
  showArrowControl,
  directionOptions,
  selectedThemePreset,
  isThemePresetMixed,
  selectedInlineDirection,
  selectedInlineLook,
  onSetThemePreset,
  onSetInlineDirection,
  onSetInlineLook,
  flowchartEdgeStyle,
  onSetFlowchartEdgeStyle,
  flowchartLinkStylePreset,
  onSetFlowchartLinkStylePreset,
  flowchartCurve,
  isFlowchartCurveMixed,
  onSetFlowchartCurve,
  codeForRender,
  isFullScreen,
  onToggleFullScreen,
  showScrollSyncToggle,
  isScrollSyncEnabled,
  onToggleScrollSync,
  svgMarkup,
  isExporting,
  onExportSvg,
  onExportPng,
  zoomPercent,
  onZoomOut,
  onZoomIn,
  onFitToViewport,
}) => {
  const canNotebookExcalidrawToggle = !isBuildDocsMode && isMarkdownMode && showNotebookExcalidrawToggle;

  return (
    <PanelHeader className="relative h-24 flex flex-col gap-2">
      <HeaderSection tone="primary" className="uppercase">
        <HeaderRow
          left={
            <PreviewHeaderPinnedMode
              pinnedMode={pinnedMode}
              pinnedCanEd={pinnedCanEd}
              pinnedDirty={pinnedDirty}
              pinnedEdDisabledReason={pinnedEdDisabledReason}
              onSetPinnedMode={onSetPinnedMode}
            />
          }
          right={
            <PreviewToolsRow
              isBuildDocsMode={isBuildDocsMode}
              isMarkdownMode={isMarkdownMode}
              svgMarkup={svgMarkup}
              isExporting={isExporting}
              onExportSvg={onExportSvg}
              onExportPng={onExportPng}
              canNotebookExcalidrawToggle={canNotebookExcalidrawToggle}
              isNotebookExcalidrawMode={isNotebookExcalidrawMode}
              onToggleNotebookExcalidraw={onToggleNotebookExcalidraw}
              showWhiteboardToggle={showWhiteboardToggle}
              isWhiteboardMode={isWhiteboardMode}
              isWhiteboardDirty={isWhiteboardDirty}
              isWhiteboardAutoSync={isWhiteboardAutoSync}
              onToggleWhiteboard={onToggleWhiteboard}
              onWhiteboardSyncFromCode={onWhiteboardSyncFromCode}
              onToggleWhiteboardAutoSync={onToggleWhiteboardAutoSync}
              showExcalidrawThemeControl={showExcalidrawThemeControl}
              excalidrawTheme={excalidrawTheme}
              onSetExcalidrawTheme={onSetExcalidrawTheme}
              isFullScreen={isFullScreen}
              onToggleFullScreen={onToggleFullScreen}
            />
          }
        />
      </HeaderSection>

      <HeaderSection tone="secondary">
        <HeaderRow
          left={
            <PreviewHeaderStyleMenu
              isBuildDocsMode={isBuildDocsMode}
              isMarkdownMode={isMarkdownMode}
              showThemeControl={showThemeControl}
              showDirectionControl={showDirectionControl}
              showLookControl={showLookControl}
              showArrowControl={showArrowControl}
              directionOptions={directionOptions}
              selectedThemePreset={selectedThemePreset}
              isThemePresetMixed={isThemePresetMixed}
              selectedInlineDirection={selectedInlineDirection}
              selectedInlineLook={selectedInlineLook}
              flowchartEdgeStyle={flowchartEdgeStyle}
              flowchartLinkStylePreset={flowchartLinkStylePreset}
              flowchartCurve={flowchartCurve}
              isFlowchartCurveMixed={isFlowchartCurveMixed}
              onSetThemePreset={onSetThemePreset}
              onSetInlineDirection={onSetInlineDirection}
              onSetInlineLook={onSetInlineLook}
              onSetFlowchartEdgeStyle={onSetFlowchartEdgeStyle}
              onSetFlowchartLinkStylePreset={onSetFlowchartLinkStylePreset}
              onSetFlowchartCurve={onSetFlowchartCurve}
              codeForRender={codeForRender}
            />
          }
          right={
            <PreviewHeaderScrollSyncToggle
              isBuildDocsMode={isBuildDocsMode}
              showScrollSyncToggle={showScrollSyncToggle}
              isScrollSyncEnabled={isScrollSyncEnabled}
              onToggleScrollSync={onToggleScrollSync}
            />
          }
        />
      </HeaderSection>
    </PanelHeader>
  );
};

export default PreviewHeaderControls;
