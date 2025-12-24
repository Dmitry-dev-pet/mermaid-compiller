import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InteractionEvent, InteractionEventType, InteractionRecorder, InteractionTarget } from '../../types';

const MAX_EVENTS = 5000;

const getTargetText = (el: HTMLElement) => {
  const raw = (el.getAttribute('aria-label') || el.textContent || '').trim();
  if (!raw) return undefined;
  if (raw.length <= 120) return raw;
  return `${raw.slice(0, 117)}...`;
};

const buildTargetPath = (el: HTMLElement) => {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${current.id}` : '';
    const testId = current.getAttribute('data-testid');
    const testIdPart = testId ? `[data-testid="${testId}"]` : '';
    const name = current.getAttribute('name');
    const namePart = !testIdPart && name ? `[name="${name}"]` : '';
    parts.push(`${tag}${id}${testIdPart}${namePart}`);
    current = current.parentElement;
  }
  return parts.join(' > ');
};

const extractTarget = (target: EventTarget | null): InteractionTarget | undefined => {
  if (!target) return undefined;
  if (!(target instanceof HTMLElement)) return undefined;

  const dataset: Record<string, string> = {};
  for (const [key, value] of Object.entries(target.dataset ?? {})) {
    if (typeof value === 'string') dataset[key] = value;
  }

  const ariaLabel = target.getAttribute('aria-label') || undefined;
  const role = target.getAttribute('role') || undefined;

  const base: InteractionTarget = {
    tag: target.tagName.toLowerCase(),
    id: target.id || undefined,
    name: target.getAttribute('name') || undefined,
    type: target.getAttribute('type') || undefined,
    role,
    ariaLabel,
    text: getTargetText(target),
    dataset: Object.keys(dataset).length ? dataset : undefined,
    path: buildTargetPath(target),
  };

  if (target instanceof HTMLInputElement) {
    if (target.type === 'checkbox' || target.type === 'radio') {
      return { ...base, checked: target.checked, value: target.value };
    }
    return { ...base, value: target.value };
  }

  if (target instanceof HTMLTextAreaElement) {
    return { ...base, value: target.value };
  }

  if (target instanceof HTMLSelectElement) {
    return { ...base, value: target.value };
  }

  if (target.isContentEditable) {
    return { ...base, value: target.innerText };
  }

  return base;
};

const makeId = () => {
  const rnd = Math.random().toString(16).slice(2);
  return `${Date.now().toString(16)}-${rnd}`;
};

export const useInteractionRecorder = (): InteractionRecorder => {
  const [isRecording, setIsRecording] = useState(false);
  const [eventCount, setEventCount] = useState(0);

  const eventsRef = useRef<InteractionEvent[]>([]);
  const stateSyncQueuedRef = useRef(false);

  const syncStateSoon = useCallback(() => {
    if (stateSyncQueuedRef.current) return;
    stateSyncQueuedRef.current = true;
    window.requestAnimationFrame(() => {
      stateSyncQueuedRef.current = false;
      setEventCount(eventsRef.current.length);
    });
  }, []);

  const addEvent = useCallback((type: InteractionEventType, event: Event, data?: Record<string, unknown>) => {
    const next: InteractionEvent = {
      id: makeId(),
      ts: Date.now(),
      type,
      url: window.location.href,
      target: extractTarget(event.target),
      data,
    };

    eventsRef.current.push(next);
    if (eventsRef.current.length > MAX_EVENTS) {
      eventsRef.current.splice(0, eventsRef.current.length - MAX_EVENTS);
    }
    syncStateSoon();
  }, [syncStateSoon]);

  useEffect(() => {
    if (!isRecording) return;

    const onClick = (e: MouseEvent) => {
      addEvent('click', e, { button: e.button, x: e.clientX, y: e.clientY });
    };
    const onDblClick = (e: MouseEvent) => {
      addEvent('dblclick', e, { button: e.button, x: e.clientX, y: e.clientY });
    };
    const onPointerDown = (e: PointerEvent) => {
      addEvent('pointerdown', e, { button: e.button, x: e.clientX, y: e.clientY, pointerType: e.pointerType });
    };
    const onPointerUp = (e: PointerEvent) => {
      addEvent('pointerup', e, { button: e.button, x: e.clientX, y: e.clientY, pointerType: e.pointerType });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      addEvent('keydown', e, {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        repeat: e.repeat,
      });
    };
    const onInput = (e: Event) => {
      addEvent('input', e);
    };
    const onChange = (e: Event) => {
      addEvent('change', e);
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDblClick, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onChange, true);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('dblclick', onDblClick, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('change', onChange, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [addEvent, isRecording]);

  const start = useCallback(() => setIsRecording(true), []);
  const stop = useCallback(() => setIsRecording(false), []);
  const toggle = useCallback(() => setIsRecording((prev) => !prev), []);

  const clear = useCallback(() => {
    eventsRef.current = [];
    setEventCount(0);
  }, []);

  const exportJson = useCallback((pretty?: boolean) => {
    return JSON.stringify(eventsRef.current, null, pretty ? 2 : 0);
  }, []);

  const copyJson = useCallback(async (pretty?: boolean) => {
    const text = exportJson(pretty);
    await navigator.clipboard.writeText(text);
  }, [exportJson]);

  return useMemo(() => {
    return {
      isRecording,
      eventCount,
      start,
      stop,
      toggle,
      clear,
      exportJson,
      copyJson,
    };
  }, [clear, copyJson, eventCount, exportJson, isRecording, start, stop, toggle]);
};

