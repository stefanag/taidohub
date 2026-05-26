import { describe, expect, it } from 'vitest';

import { getBeltVisuals } from './belt-visuals.js';

describe('getBeltVisuals — kyu', () => {
  it('level 0 (Mukyu) → white, no badge', () => {
    expect(getBeltVisuals('kyu', 0)).toEqual({ gradient: 'white', badge: false });
  });

  it('level 1 (Kukyu) → yellow, no badge (odd levels = no badge)', () => {
    expect(getBeltVisuals('kyu', 1)).toEqual({ gradient: 'yellow', badge: false });
  });

  it('level 2 (Hachikyu) → yellow with badge (even non-zero = badge)', () => {
    expect(getBeltVisuals('kyu', 2)).toEqual({ gradient: 'yellow', badge: true });
  });

  it('level 5 (Gokyu) → green, no badge', () => {
    expect(getBeltVisuals('kyu', 5)).toEqual({ gradient: 'green', badge: false });
  });

  it('level 8 (Ikkyu) → brown with badge', () => {
    expect(getBeltVisuals('kyu', 8)).toEqual({ gradient: 'brown', badge: true });
  });
});

describe('getBeltVisuals — dan', () => {
  it('plain dan → black, no overlay', () => {
    expect(getBeltVisuals('dan', 1)).toEqual({ gradient: 'black', overlayTopHalf: undefined });
  });

  it('dan + renshi → black with magenta top half', () => {
    expect(getBeltVisuals('dan', 4, 'renshi')).toEqual({
      gradient: 'black',
      overlayTopHalf: 'magenta',
    });
  });

  it('dan + kyoshi → black with green top half', () => {
    expect(getBeltVisuals('dan', 6, 'kyoshi')).toEqual({
      gradient: 'black',
      overlayTopHalf: 'green',
    });
  });

  it('dan + hanshi → black with brown top half', () => {
    expect(getBeltVisuals('dan', 7, 'hanshi')).toEqual({
      gradient: 'black',
      overlayTopHalf: 'brown',
    });
  });
});

describe('getBeltVisuals — mon', () => {
  it('level 1 (pos 0 of magenta group) → white base, magenta gradient mid-line, no stripe', () => {
    expect(getBeltVisuals('mon', 1)).toEqual({
      gradient: 'white',
      midLine: 'magenta',
      midLineGradient: true,
      stripe: undefined,
    });
  });

  it('level 2 (pos 1) → white base, magenta gradient mid-line, black stripe', () => {
    expect(getBeltVisuals('mon', 2)).toEqual({
      gradient: 'white',
      midLine: 'magenta',
      midLineGradient: true,
      stripe: 'black',
    });
  });

  it('level 3 (pos 2) → magenta base, white flat mid-line, no stripe', () => {
    expect(getBeltVisuals('mon', 3)).toEqual({
      gradient: 'magenta',
      midLine: 'white',
      midLineGradient: false,
      stripe: undefined,
    });
  });

  it('level 12 (pos 3 of brown group) → brown base, white flat mid-line, black stripe', () => {
    expect(getBeltVisuals('mon', 12)).toEqual({
      gradient: 'brown',
      midLine: 'white',
      midLineGradient: false,
      stripe: 'black',
    });
  });
});

describe('getBeltVisuals — fallback', () => {
  it('unknown system → plain white', () => {
    expect(getBeltVisuals('unknown', 5)).toEqual({ gradient: 'white' });
  });
});
