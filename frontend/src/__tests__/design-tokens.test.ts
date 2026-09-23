import { describe, it, expect } from 'vitest';
// @ts-expect-error Tailwind config is a JS file without ambient typings
import tailwindConfig from '../../tailwind.config.js';

describe('Design Tokens — Celestial Cyan, Cobalt & Cosmic Ivory', () => {
  const colors = tailwindConfig.theme.extend.colors;

  it('defines the 5 core Horizon color tokens correctly', () => {
    expect(colors.cosmic.DEFAULT).toBe('#FFF8E7');
    expect(colors.celestial.DEFAULT).toBe('#8CC1E9');
    expect(colors.cerulean.DEFAULT).toBe('#438BC4');
    expect(colors.cobalt.DEFAULT).toBe('#0055A0');
    expect(colors.navy.DEFAULT).toBe('#12284B');
  });

  it('defines dark carbon palette for satin sheen surfaces', () => {
    expect(colors.carbon[950]).toBe('#07080a');
    expect(colors.carbon[900]).toBe('#090a0d');
    expect(colors.carbon[850]).toBe('#0e1117');
    expect(colors.carbon[800]).toBe('#12151c');
  });

  it('defines multi-stop shimmer animations', () => {
    const animation = tailwindConfig.theme.extend.animation;
    expect(animation.shimmer).toBeDefined();
    expect(animation['gemini-pulse']).toBeDefined();
    expect(animation['flash-success']).toBeDefined();
  });
});
