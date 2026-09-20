/**
 * Colour and mark specification.
 *
 * The four event categories are drawn as scattered marks over a photographic
 * minimap, so every pair must stay separable in any spatial arrangement
 * (an "all-pairs" requirement, not merely adjacent-pairs).
 *
 * This set was chosen by running a CVD/contrast validator over candidate
 * 4-colour subsets: it is the best-scoring one available. It still carries a
 * CVD warning on death-vs-loot, which is why hue is never the only channel:
 * every category also has a distinct glyph shape and radius, the legend is
 * always visible, and hovering any mark names it. See ARCHITECTURE.md.
 */

export const SURFACE = {
  page: '#0d0d0d',
  panel: '#1a1a19',
  panelRaised: '#232321',
  border: 'rgba(255,255,255,0.10)',
  ink: '#ffffff',
  inkSecondary: '#c3c2b7',
  inkMuted: '#898781',
}

/** Event categories. `shape` is the secondary identity channel. */
export const CATEGORY = {
  kill: { id: 'kill', label: 'Kill', hex: '#199e70', rgb: [25, 158, 112], shape: 'triangle', radius: 3.4 },
  death: { id: 'death', label: 'Death', hex: '#e66767', rgb: [230, 103, 103], shape: 'cross', radius: 3.8 },
  loot: { id: 'loot', label: 'Loot', hex: '#c98500', rgb: [201, 133, 0], shape: 'diamond', radius: 2.4 },
  storm: { id: 'storm', label: 'Storm death', hex: '#3987e5', rgb: [57, 135, 229], shape: 'circle', radius: 4.6 },
}

export const CATEGORY_ORDER = ['kill', 'death', 'loot', 'storm']

/** Raw event name -> category. Names not listed here are movement samples. */
export const EVENT_CATEGORY = {
  Kill: 'kill',
  BotKill: 'kill',
  Killed: 'death',
  BotKilled: 'death',
  Loot: 'loot',
  KilledByStorm: 'storm',
}

export const POSITION_EVENTS = new Set(['Position', 'BotPosition'])

/**
 * Journey paths. Humans and bots are separated by lightness and weight rather
 * than hue, so the four category hues above stay unambiguous on top of them.
 */
export const PATH = {
  human: { hex: '#f2f0ea', rgb: [242, 240, 234], width: 2.0, opacity: 150 },
  bot: { hex: '#8a8780', rgb: [138, 135, 128], width: 1.4, opacity: 90 },
}

/**
 * Heatmap density ramp: ONE hue, low -> high, never a rainbow.
 *
 * Steps are the blue sequential scale. On a dark minimap the visible end of
 * the scale is the light end, so the ramp runs dark+transparent (low) to
 * light+opaque (high) -- the reverse of the same ramp on a light surface.
 */
export const HEAT_RAMP = [
  [16, 79, 149, 0],
  [37, 106, 191, 78],
  [57, 135, 229, 128],
  [109, 167, 236, 168],
  [158, 197, 244, 194],
  [205, 226, 251, 214],
]

/** Hex mirror of HEAT_RAMP, for the CSS gradient in the legend. */
export const HEAT_RAMP_HEX = ['#104281', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb']

export const OOB = { hex: '#ffffff', rgb: [255, 255, 255] }
