import { describe, it, expect } from 'vitest';
// @ts-expect-error Tailwind config is a JS file without ambient typings
import tailwindConfig from '../../tailwind.config.js';

describe('Design Tokens — Celestial Cyan, Cobalt & Cosmic Ivory', () => {
  const colors = tailwindConfig.theme.extend.colors;

  it('defines the 5 core Horizon color tokens correctly', () => {
    expect(colors.cosmic.DEFAULT).toBe('var(--color-cosmic-cream)');
    expect(colors.celestial.DEFAULT).toBe('var(--color-celestial)');
    expect(colors.cerulean.DEFAULT).toBe('var(--color-cerulean)');
    expect(colors.cobalt.DEFAULT).toBe('var(--color-cobalt)');
    expect(colors.navy.DEFAULT).toBe('var(--color-navy)');
  });

  it('defines dark carbon palette for satin sheen surfaces', () => {
    expect(colors.carbon[950]).toBe('var(--color-carbon-950)');
    expect(colors.carbon[900]).toBe('var(--color-carbon-900)');
    expect(colors.carbon[850]).toBe('var(--color-carbon-850)');
    expect(colors.carbon[800]).toBe('var(--color-carbon-800)');
  });

  it('defines multi-stop shimmer animations', () => {
    const animation = tailwindConfig.theme.extend.animation;
    expect(animation.shimmer).toBeDefined();
    expect(animation['gemini-pulse']).toBeDefined();
    expect(animation['flash-success']).toBeDefined();
  });
});
