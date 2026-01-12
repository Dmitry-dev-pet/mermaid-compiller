import { describe, expect, it } from 'vitest';
import { augmentMermaidErrorForAutoFix } from './mermaidAutoFixHints';

describe('mermaidAutoFixHints', () => {
  it('adds architecture-beta hint for -> parse errors', () => {
    const msg = 'Parsing failed: unexpected character: ->[<- at offset: 249, skipped 1 characters.';
    const out = augmentMermaidErrorForAutoFix('architecture', msg);
    expect(out).toContain('Hint: для `architecture-beta` нельзя использовать');
    expect(out).toContain('A:R -- L:B');
  });

  it('leaves other diagram types unchanged', () => {
    const msg = 'Parse error on line 3: ...';
    const out = augmentMermaidErrorForAutoFix('flowchart', msg);
    expect(out).toBe(msg);
  });
});

