import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders one complete circular ring around the lightning mark', () => {
    render(<BrandLogo title="电网投标助手" />);

    const logo = screen.getByRole('img', { name: '电网投标助手' });
    const ring = logo.querySelector('circle');

    expect(ring).toHaveAttribute('cx', '36');
    expect(ring).toHaveAttribute('cy', '36');
    expect(ring).toHaveAttribute('r', '29');
    expect(logo.querySelectorAll('path')).toHaveLength(1);
  });
});
