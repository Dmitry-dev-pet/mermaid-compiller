import { describe, expect, it } from 'vitest';
import {
  resolveExcalidrawStoredCanvasColor,
  resolveExcalidrawVisibleCanvasColor,
} from './excalidrawCanvasFilter';

describe('excalidrawCanvasFilter', () => {
  it('roundtrips visible->stored->visible in dark theme', () => {
    const samples = [
      '#ffffff',
      '#000000',
      '#1e1e1e',
      '#0f172a',
      '#e5e7eb',
      '#f3f4f6',
      'rgb(30, 30, 30)',
      'rgb(229, 231, 235)',
    ];

    for (const input of samples) {
      const stored1 = resolveExcalidrawStoredCanvasColor(input, 'dark');
      expect(stored1).not.toBeNull();
      const visible1 = resolveExcalidrawVisibleCanvasColor(stored1!, 'dark');
      expect(visible1).not.toBeNull();
      expect(visible1).toMatch(/^#[0-9a-f]{6}$/i);

      // A second roundtrip should converge to the same visible color.
      const stored2 = resolveExcalidrawStoredCanvasColor(visible1!, 'dark');
      expect(stored2).not.toBeNull();
      const visible2 = resolveExcalidrawVisibleCanvasColor(stored2!, 'dark');
      expect(visible2).toBe(visible1);
    }
  });

  it('is identity in light theme', () => {
    const colors = ['#fff', '#ffffff', '#1e1e1e', '#0f172a', 'rgb(30, 30, 30)'];
    for (const c of colors) {
      const stored = resolveExcalidrawStoredCanvasColor(c, 'light');
      const visible = resolveExcalidrawVisibleCanvasColor(c, 'light');
      expect(stored).toBe(c.trim());
      expect(visible).toBe(c.trim());
    }
  });
});
