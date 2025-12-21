import { describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './exportService';

describe('exportService', () => {
  it('downloadBlob creates an object URL and clicks an anchor', () => {
    const click = vi.fn();
    const anchor = { href: '', download: '', rel: '', style: { display: '' }, click };
    const appendChild = vi.fn();
    const removeChild = vi.fn();

    const doc = {
      createElement: vi.fn(() => anchor),
      body: { appendChild, removeChild },
    } as unknown as Document;

    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    const setTimeoutImmediate = vi.fn((callback: () => void) => {
      callback();
      return 0;
    });

    downloadBlob(new Blob(['x']), 'diagram.svg', {
      document: doc,
      createObjectURL,
      revokeObjectURL,
      setTimeout: setTimeoutImmediate as unknown as (callback: () => void, ms: number) => unknown,
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.href).toBe('blob:mock');
    expect(anchor.download).toBe('diagram.svg');
    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('downloadBlob throws when Document is not available', () => {
    expect(() => downloadBlob(new Blob(['x']), 'diagram.svg', { document: undefined })).toThrow(
      'Document is not available',
    );
  });
});

