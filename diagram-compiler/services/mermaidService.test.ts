import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(),
  },
}));

import mermaid from 'mermaid';
import { extractMermaidCode, validateMermaid } from './mermaidService';

describe('mermaidService', () => {
  const mermaidMock = mermaid as unknown as { initialize: any; parse: any };

  beforeEach(() => {
    mermaidMock.parse.mockReset();
  });

  it('extractMermaidCode returns fenced mermaid content', () => {
    const input = '```mermaid\ngraph TD\nA-->B\n```';
    expect(extractMermaidCode(input)).toBe('graph TD\nA-->B');
  });

  it('extractMermaidCode returns generic fenced content', () => {
    const input = '```\nflowchart TD\nA-->B\n```';
    expect(extractMermaidCode(input)).toBe('flowchart TD\nA-->B');
  });

  it('extractMermaidCode returns raw mermaid when it starts with keywords', () => {
    const input = 'sequenceDiagram\nAlice->>Bob: Hi';
    expect(extractMermaidCode(input)).toBe(input);
  });

  it('extractMermaidCode returns empty string for non-mermaid text', () => {
    expect(extractMermaidCode('just text')).toBe('');
  });

  it('validateMermaid marks empty code as valid', async () => {
    const result = await validateMermaid('   ');
    expect(result.isValid).toBe(true);
    expect(result.status).toBe('empty');
  });

  it('validateMermaid returns valid status on parse success', async () => {
    mermaidMock.parse.mockResolvedValueOnce(true);
    const result = await validateMermaid('graph TD\nA-->B');
    expect(result.isValid).toBe(true);
    expect(result.status).toBe('valid');
    expect(result.lastValidCode).toBe('graph TD\nA-->B');
  });

  it('validateMermaid extracts line from parser error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mermaidMock.parse.mockRejectedValueOnce(new Error('Parse error on line 3'));
    const result = await validateMermaid('bad code');
    expect(result.isValid).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.errorLine).toBe(3);
    errorSpy.mockRestore();
  });
});
