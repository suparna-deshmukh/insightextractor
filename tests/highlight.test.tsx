import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Highlight } from '@/components/ui/Highlight';

const marks = (container: HTMLElement) => Array.from(container.querySelectorAll('mark'));

describe('Highlight', () => {
  it('wraps matches for multiple terms', () => {
    const { container } = render(<Highlight text="Late delivery and pricing complaints" terms={['delivery', 'pricing']} />);
    expect(marks(container).map((m) => m.textContent)).toEqual(['delivery', 'pricing']);
  });

  it('is case-insensitive', () => {
    const { container } = render(<Highlight text="LATE Delivery happened" terms={['late']} />);
    expect(marks(container).map((m) => m.textContent)).toEqual(['LATE']);
  });

  it('handles overlapping terms (longest wins)', () => {
    const { container } = render(<Highlight text="app and applications" terms={['app', 'applications']} />);
    expect(marks(container).map((m) => m.textContent)).toEqual(['app', 'applications']);
  });

  it('escapes regex characters in terms', () => {
    const { container } = render(<Highlight text="price is 100% (off) today" terms={['100%', '(off)']} />);
    expect(marks(container).map((m) => m.textContent)).toEqual(['100%', '(off)']);
  });

  it('ignores terms under 3 characters', () => {
    const { container } = render(<Highlight text="ai apps for ios" terms={['ai', 'io', 'apps']} />);
    expect(marks(container).map((m) => m.textContent)).toEqual(['apps']);
  });

  it('caps at 12 terms', () => {
    const terms = Array.from({ length: 20 }, (_, i) => `term${i}x`);
    const text = terms.map((t) => t).join(', ');
    const { container } = render(<Highlight text={text} terms={terms} />);
    expect(container.querySelectorAll('mark').length).toBeLessThanOrEqual(12);
  });

  it('renders plain text when there are no terms', () => {
    const { container } = render(<Highlight text="nothing to mark" terms={[]} />);
    expect(container.querySelector('mark')).toBeNull();
  });
});
