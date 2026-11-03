import { THEME_DEFINITIONS } from '~/lib/theme/theme-tokens';
import { getSharePalette, SHARE_PALETTES, SHARE_THEME_IDS } from './share-palettes';

describe('sharing palettes', () => {
  test.each(SHARE_THEME_IDS)('projects %s directly from theme tokens', (id) => {
    const definition = THEME_DEFINITIONS.find((theme) => theme.id === id)!;
    const palette = SHARE_PALETTES.find((candidate) => candidate.id === id)!;
    expect(palette).toMatchObject({
      background: definition.tokens['--color-background'],
      foreground: definition.tokens['--color-foreground'],
      border: definition.tokens['--color-border'],
      accent: definition.tokens['--color-accent'],
    });
  });

  test('achievement cards can project an active theme outside the entry grid', () => {
    expect(getSharePalette('ocean').id).toBe('ocean');
  });
});
