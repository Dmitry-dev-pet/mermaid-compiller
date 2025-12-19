import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { detectLanguage, generateId, safeParse, stripMermaidCode } from './utils';

describe('utils', () => {
  it('stripMermaidCode removes only mermaid fenced blocks', () => {
    const input = 'Hello\n```mermaid\ngraph TD\nA-->B\n```\nBye';
    expect(stripMermaidCode(input)).toBe('Hello\n\nBye');

    const nonMermaid = '```js\nconst a = 1;\n```';
    expect(stripMermaidCode(nonMermaid)).toBe(nonMermaid);
  });

  it('detectLanguage detects Cyrillic as Russian', () => {
    expect(detectLanguage('Привет')).toBe('Russian');
    expect(detectLanguage('Hello')).toBe('English');
  });

  it('generateId returns a short non-empty id', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(7);
  });

  describe('safeParse', () => {
    const originalStorage = globalThis.localStorage;
    const store: Record<string, string> = {};

    beforeEach(() => {
      for (const key of Object.keys(store)) delete store[key];
      const mockStorage = {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          for (const key of Object.keys(store)) delete store[key];
        },
        key: (index: number) => Object.keys(store)[index] ?? null,
        length: 0,
      };
      Object.defineProperty(globalThis, 'localStorage', {
        value: mockStorage,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalStorage,
        configurable: true,
      });
    });

    it('returns fallback when no value stored', () => {
      expect(safeParse('missing', { a: 1 })).toEqual({ a: 1 });
    });

    it('merges saved values with fallback', () => {
      store['cfg'] = JSON.stringify({ b: 2 });
      expect(safeParse('cfg', { a: 1, b: 1 })).toEqual({ a: 1, b: 2 });
    });

    it('returns fallback when stored value is invalid JSON', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      store['bad'] = '{nope';
      expect(safeParse('bad', { a: 1 })).toEqual({ a: 1 });
      errorSpy.mockRestore();
    });
  });
});
