import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Circle, Copy, Layers, Moon, Palette, PenLine, SquarePen } from 'lucide-react';
import type { MermaidDirection } from '../../utils/inlineDirectionCommand';
import type { MermaidLook } from '../../utils/inlineLookCommand';
import type { FlowchartEdgeStyle, FlowchartEdgeStyleUpdate } from '../../utils/flowchartArrowStyle';
import type { FlowchartLinkStylePresetId } from '../../utils/flowchartLinkStyle';
import { FLOWCHART_CURVES } from '../../utils/flowchartCurveConfig';
import type { FlowchartCurve } from '../../utils/flowchartCurveConfig';
import type { MermaidThemePresetId } from '../../utils/mermaidThemePreset';
import { CONTROL_BASE } from '../../utils/uiControlStyles';
import { Button } from '../ui/Button';

type PreviewHeaderStyleMenuProps = {
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

const PreviewHeaderStyleMenu: React.FC<PreviewHeaderStyleMenuProps> = ({
  isBuildDocsMode,
  isMarkdownMode,
  showThemeControl,
  showDirectionControl,
  showLookControl,
  showArrowControl,
  directionOptions,
  selectedThemePreset,
  isThemePresetMixed,
  selectedInlineDirection,
  selectedInlineLook,
  flowchartEdgeStyle,
  flowchartLinkStylePreset,
  flowchartCurve,
  isFlowchartCurveMixed,
  onSetThemePreset,
  onSetInlineDirection,
  onSetInlineLook,
  onSetFlowchartEdgeStyle,
  onSetFlowchartLinkStylePreset,
  onSetFlowchartCurve,
  codeForRender,
}) => {
  const [isStyleOpen, setIsStyleOpen] = useState(false);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isStyleOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (styleMenuRef.current?.contains(target)) return;
      setIsStyleOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsStyleOpen(false);
    };

    window.document.addEventListener('mousedown', onPointerDown, true);
    window.document.addEventListener('touchstart', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.document.removeEventListener('mousedown', onPointerDown, true);
      window.document.removeEventListener('touchstart', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isStyleOpen]);

  const selectedEdgeStyle = flowchartEdgeStyle ?? null;
  const styleLabel = selectedEdgeStyle?.lineStyle ?? null;
  const endCapLabel = selectedEdgeStyle?.endCap ?? null;
  const lengthLabel = selectedEdgeStyle?.length ?? null;
  const directionLabel = selectedEdgeStyle?.direction ?? null;
  const lookLabel = selectedInlineLook || '(none)';
  const curveLabel = isFlowchartCurveMixed
    ? '(mixed)'
    : flowchartCurve
      ? flowchartCurve
      : '(none)';

  const controlTitle = useMemo(() => {
    const parts = [
      styleLabel ? `style=${styleLabel}` : 'style=mixed',
      endCapLabel ? `cap=${endCapLabel}` : 'cap=mixed',
      lengthLabel ? `len=${lengthLabel}` : 'len=mixed',
      directionLabel ? `dir=${directionLabel}` : 'dir=mixed',
    ];
    return `Flowchart edges (${parts.join(', ')})`;
  }, [directionLabel, endCapLabel, lengthLabel, styleLabel]);

  const themeOptions = useMemo(() => {
    return [
      { id: '' as const, label: '(auto)', icon: Circle },
      { id: 'lightPlus' as const, label: 'Light+', icon: Palette },
      { id: 'darkPlus' as const, label: 'Dark+', icon: Moon },
      { id: 'abyss' as const, label: 'Abyss', icon: Layers },
    ];
  }, []);

  const themeLabel = useMemo(() => {
    if (isThemePresetMixed) return '(mixed)';
    const currentId = selectedThemePreset ?? '';
    return themeOptions.find((opt) => opt.id === currentId)?.label ?? '(auto)';
  }, [isThemePresetMixed, selectedThemePreset, themeOptions]);

  const lookOptions = useMemo(() => {
    return [
      { id: '' as const, label: '(none)', icon: Circle },
      { id: 'classic' as const, label: 'classic', icon: SquarePen },
      { id: 'handDrawn' as const, label: 'handDrawn', icon: PenLine },
    ];
  }, []);

  const themeIcon = useMemo(() => {
    const currentId = isThemePresetMixed ? '' : (selectedThemePreset ?? '');
    const found = themeOptions.find((opt) => opt.id === currentId);
    return found?.icon ?? Circle;
  }, [isThemePresetMixed, selectedThemePreset, themeOptions]);

  const lookIcon = useMemo(() => {
    const found = lookOptions.find((opt) => opt.id === (selectedInlineLook || ''));
    return (found?.icon ?? (selectedInlineLook ? SquarePen : Circle));
  }, [lookOptions, selectedInlineLook]);

  const copyTemplate = async (template: string) => {
    try {
      await navigator.clipboard.writeText(template);
    } catch {
      // ignore
    }
  };

  const chip = (value: string) => (
    <span className="inline-flex items-center justify-center w-7 h-6 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-mono text-[10px] tabular-nums">
      {value}
    </span>
  );

  const hasStyleControls =
    !isBuildDocsMode && (showThemeControl || showDirectionControl || showLookControl || showArrowControl);

  if (!hasStyleControls) return null;

  return (
    <div className="relative" ref={styleMenuRef}>
      <Button
        type="button"
        onClick={() => setIsStyleOpen((prev) => !prev)}
        disabled={!codeForRender.trim()}
        aria-label="Open style menu"
        aria-haspopup="menu"
        aria-expanded={isStyleOpen}
        title="Style (theme, look, flowchart controls)"
      >
        <Palette size={12} className="opacity-80" aria-hidden />
        <span>Style</span>
        <span className="inline-flex items-center gap-2 text-[var(--control-muted-text)]">
          <span className="inline-flex items-center gap-1">
            {React.createElement(themeIcon, { size: 12, className: 'opacity-70' })}
            <span className="text-[10px] font-mono">{themeLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            {React.createElement(lookIcon, { size: 12, className: 'opacity-70' })}
            <span className="text-[10px] font-mono">{lookLabel}</span>
          </span>
          {showArrowControl && (
            <span className="inline-flex items-center gap-1" title={`curve=${curveLabel}`}>
              <span className="text-[10px] text-[var(--control-muted-text)] font-semibold uppercase tracking-wide">
                Curve
              </span>
              <span className="text-[10px] font-mono">{curveLabel}</span>
            </span>
          )}
        </span>
        <ChevronDown
          size={12}
          className={`opacity-70 transition-transform ${isStyleOpen ? 'rotate-180' : ''}`}
        />
      </Button>

      {isStyleOpen && (
        <div
          className="absolute left-0 top-full z-50 mt-1 w-[min(28rem,90vw)] rounded-md border border-[var(--panel-border)] bg-[var(--menu-bg)] shadow-lg"
          role="menu"
          aria-label="Style"
        >
          <div className="px-2 py-2 space-y-3 normal-case tracking-normal">
            {showThemeControl && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                    Theme
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{themeLabel}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {themeOptions.map((item) => {
                    const isSelected = !isThemePresetMixed && (selectedThemePreset ?? '') === item.id;
                    return (
                      <Button
                        key={item.id || 'none'}
                        type="button"
                        onClick={() => onSetThemePreset((item.id || null) as MermaidThemePresetId | null)}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                            : CONTROL_BASE
                        }`}
                      >
                        <span className="inline-flex items-center justify-between w-full gap-2">
                          <span className="inline-flex items-center gap-2 min-w-0">
                            {React.createElement(item.icon, { size: 14, className: 'opacity-80 shrink-0' })}
                            <span className="font-medium truncate">{item.label}</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {item.id || 'none'}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {showLookControl && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                    Look
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{lookLabel}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {lookOptions.map((item) => {
                    const isSelected = (selectedInlineLook || '') === item.id;
                    return (
                      <Button
                        key={item.id || 'none'}
                        type="button"
                        onClick={() => onSetInlineLook((item.id || null) as MermaidLook | null)}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                            : CONTROL_BASE
                        }`}
                      >
                        <span className="inline-flex items-center justify-between w-full gap-2">
                          <span className="inline-flex items-center gap-2 min-w-0">
                            {React.createElement(item.icon, { size: 14, className: 'opacity-80 shrink-0' })}
                            <span className="font-medium truncate">{item.label}</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {item.id || 'none'}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {showDirectionControl && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                    Direction
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {selectedInlineDirection || '(none)'}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-5 gap-1.5">
                  <Button
                    type="button"
                    onClick={() => onSetInlineDirection(null)}
                    disabled={isMarkdownMode}
                    className={`rounded border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      !selectedInlineDirection
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                        : CONTROL_BASE
                    }`}
                    title={isMarkdownMode ? 'Direction is disabled in markdown mode' : undefined}
                  >
                    <span className="font-mono">(none)</span>
                  </Button>
                  {directionOptions.map((dir) => {
                    const isSelected = selectedInlineDirection === dir;
                    return (
                      <Button
                        key={dir}
                        type="button"
                        onClick={() => onSetInlineDirection(dir)}
                        disabled={isMarkdownMode}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                            : CONTROL_BASE
                        }`}
                        title={isMarkdownMode ? 'Direction is disabled in markdown mode' : undefined}
                      >
                        <span className="font-mono">{dir}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {showArrowControl && (
              <>
                <div className="border-t border-[var(--panel-border)]" />

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      Flowchart edges
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400" title={controlTitle}>
                      {chip(styleLabel === 'thick' ? '==' : styleLabel === 'dotted' ? '-.' : styleLabel === 'normal' ? '--' : '?')}
                      {chip(endCapLabel === 'arrow' ? '>' : endCapLabel === 'none' ? '-' : endCapLabel === 'circle' ? 'o' : endCapLabel === 'cross' ? 'x' : '?')}
                    </span>
                  </div>

                  <div className="mt-2 space-y-2">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      End cap
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          { cap: 'arrow' as const, label: 'Arrow', sample: '-->' },
                          { cap: 'none' as const, label: 'Line', sample: '---' },
                          { cap: 'circle' as const, label: 'Circle', sample: '--o' },
                          { cap: 'cross' as const, label: 'Cross', sample: '--x' },
                        ] as const
                      ).map((item) => {
                        const isSelected = endCapLabel === item.cap;
                        return (
                          <Button
                            key={item.cap}
                            type="button"
                            onClick={() => onSetFlowchartEdgeStyle({ endCap: item.cap })}
                            className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                                : CONTROL_BASE
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{item.label}</span>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                {item.sample}
                              </span>
                            </div>
                          </Button>
                        );
                      })}
                    </div>

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      Line style
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { style: 'normal' as const, label: 'Normal', sample: '--' },
                          { style: 'thick' as const, label: 'Thick', sample: '==' },
                          { style: 'dotted' as const, label: 'Dotted', sample: '-.' },
                        ] as const
                      ).map((item) => {
                        const isSelected = styleLabel === item.style;
                        const isDisabled = endCapLabel === 'circle' || endCapLabel === 'cross';
                        return (
                          <Button
                            key={item.style}
                            type="button"
                            onClick={() => onSetFlowchartEdgeStyle({ lineStyle: item.style })}
                            disabled={isDisabled}
                            className={`rounded border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                                : CONTROL_BASE
                            }`}
                            title={isDisabled ? 'Circle/Cross caps use normal lines' : undefined}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{item.label}</span>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                {item.sample}
                              </span>
                            </div>
                          </Button>
                        );
                      })}
                    </div>

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      Length
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([1, 2, 3] as const).map((len) => {
                        const isSelected = lengthLabel === len;
                        return (
                          <Button
                            key={len}
                            type="button"
                            onClick={() => onSetFlowchartEdgeStyle({ length: len })}
                            className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                                : CONTROL_BASE
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{len}</span>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                {endCapLabel === 'none'
                                  ? len === 1 ? '---' : len === 2 ? '----' : '-----'
                                  : endCapLabel === 'circle'
                                    ? len === 1 ? '--o' : len === 2 ? '---o' : '----o'
                                    : endCapLabel === 'cross'
                                      ? len === 1 ? '--x' : len === 2 ? '---x' : '----x'
                                      : styleLabel === 'thick'
                                        ? len === 1 ? '==>' : len === 2 ? '===>' : '====>'
                                        : styleLabel === 'dotted'
                                          ? len === 1 ? '-.->' : len === 2 ? '-..->' : '-...->'
                                          : len === 1 ? '-->' : len === 2 ? '--->' : '---->'}
                              </span>
                            </div>
                          </Button>
                        );
                      })}
                    </div>

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      Direction
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { dir: 'forward' as const, label: 'Forward', sample: '→' },
                          { dir: 'bidirectional' as const, label: 'Both', sample: '↔' },
                        ] as const
                      ).map((item) => {
                        const isSelected = directionLabel === item.dir;
                        const isDisabled = endCapLabel !== 'arrow';
                        return (
                          <Button
                            key={item.dir}
                            type="button"
                            onClick={() => onSetFlowchartEdgeStyle({ direction: item.dir })}
                            disabled={isDisabled}
                            className={`rounded border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                                : CONTROL_BASE
                            }`}
                            title={isDisabled ? 'Direction applies only to arrow caps' : undefined}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{item.label}</span>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                {item.sample}
                              </span>
                            </div>
                          </Button>
                        );
                      })}
                    </div>

                    <div className="my-2 border-t border-[var(--panel-border)]" />

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      Curve
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <Button
                        type="button"
                        onClick={() => onSetFlowchartCurve(null)}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                          !isFlowchartCurveMixed && !flowchartCurve
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                            : CONTROL_BASE
                        }`}
                      >
                        <span className="font-mono">(none)</span>
                      </Button>
                      {FLOWCHART_CURVES.map((curve) => {
                        const isSelected = !isFlowchartCurveMixed && flowchartCurve === curve;
                        return (
                          <Button
                            key={curve}
                            type="button"
                            onClick={() => onSetFlowchartCurve(curve)}
                            className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                                : CONTROL_BASE
                            }`}
                            title={`curve: ${curve}`}
                          >
                            <span className="font-mono">{curve}</span>
                          </Button>
                        );
                      })}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                      current: {curveLabel}
                    </div>

                    <div className="my-2 border-t border-[var(--panel-border)]" />

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      Link style
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'none' as const, label: 'None', sample: '(default)' },
                          { id: 'thin' as const, label: 'Thin', sample: '1px' },
                          { id: 'normal' as const, label: 'Normal', sample: '2px' },
                          { id: 'thick' as const, label: 'Thick', sample: '4px' },
                        ] as const
                      ).map((item) => {
                        const isSelected = flowchartLinkStylePreset === item.id;
                        return (
                          <Button
                            key={item.id}
                            type="button"
                            onClick={() => onSetFlowchartLinkStylePreset(item.id)}
                            className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                                : CONTROL_BASE
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{item.label}</span>
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                {item.sample}
                              </span>
                            </div>
                          </Button>
                        );
                      })}
                      <Button
                        type="button"
                        onClick={() => onSetFlowchartLinkStylePreset('accent')}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                          flowchartLinkStylePreset === 'accent'
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                            : CONTROL_BASE
                        }`}
                        title="stroke:#3b82f6, stroke-width:2px"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">Accent</span>
                          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            blue
                          </span>
                        </div>
                      </Button>
                      <Button
                        type="button"
                        disabled={flowchartLinkStylePreset !== 'custom'}
                        className="rounded border border-[var(--panel-border)] bg-[var(--control-bg)] px-2 py-1 text-[11px] text-[var(--control-muted-text)] disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Custom linkStyle detected in code"
                      >
                        Custom
                      </Button>
                    </div>

                    <div className="my-2 border-t border-[var(--panel-border)]" />

                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">
                      Templates
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        type="button"
                        onClick={() => void copyTemplate('-- label -->')}
                        className="rounded border border-[var(--panel-border)] bg-[var(--control-bg)] px-2 py-1.5 text-[11px] text-[var(--control-text)] hover:bg-[var(--control-bg-hover)] inline-flex items-center justify-between gap-2"
                        title="Copy: -- label -->"
                      >
                        <span className="font-mono">-- label --&gt;</span>
                        <Copy size={12} className="opacity-70" />
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void copyTemplate('-->|label|-->')}
                        className="rounded border border-[var(--panel-border)] bg-[var(--control-bg)] px-2 py-1.5 text-[11px] text-[var(--control-text)] hover:bg-[var(--control-bg-hover)] inline-flex items-center justify-between gap-2"
                        title="Copy: -->|label|-->"
                      >
                        <span className="font-mono">--&gt;|label|--&gt;</span>
                        <Copy size={12} className="opacity-70" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewHeaderStyleMenu;
