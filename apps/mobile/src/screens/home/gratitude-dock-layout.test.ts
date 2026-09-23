import {
  gratitudeDockHeight,
  gratitudeDockPositionBounds,
} from './gratitude-dock-layout';

function layout(hasPet: boolean, containerHeight = 700, bottomInset = 34) {
  const height = gratitudeDockHeight(hasPet);
  return {
    height,
    ...gratitudeDockPositionBounds(containerHeight, height, 16, bottomInset),
  };
}

describe('gratitude dock positioning', () => {
  it.each([400, 700, 1000])(
    'keeps the default bottom edge at container height %i',
    (height) => {
      const standard = layout(false, height);
      const pet = layout(true, height);
      expect(pet.defaultY - pet.heightDelta + pet.height).toBe(
        standard.defaultY + standard.height,
      );
    },
  );

  it('preserves the bottom anchor for a saved drag position across themes', () => {
    const savedY = 320;
    const bottoms = [false, true, false].map((hasPet) => {
      const dock = layout(hasPet);
      const position = Math.min(dock.maxY, Math.max(dock.minY, savedY));
      return position - dock.heightDelta + dock.height;
    });
    expect(bottoms).toEqual([468, 468, 468]);
  });

  it.each([false, true])(
    'keeps both drag limits within safe bounds (pet: %s)',
    (hasPet) => {
      const dock = layout(hasPet);
      expect(dock.minY - dock.heightDelta).toBe(16);
      expect(dock.maxY - dock.heightDelta + dock.height).toBe(700 - 34 - 16);
    },
  );

  it('clamps an old saved position after the available height shrinks', () => {
    const dock = layout(true, 400);
    const position = Math.min(dock.maxY, Math.max(dock.minY, 550));
    expect(position - dock.heightDelta + dock.height).toBe(350);
  });
});
