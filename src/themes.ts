export interface WindowTheme {
  accentColor: string
  titlebarBackground: string
  titlebarBackgroundEnd: string
  titlebarForeground: string
  sidebarBackground: string
  sidebarForeground: string
  buttonBackground: string
}

export interface TerminalColors {
  background: string
  foreground: string
  cursor: string
  selection: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
}

export interface PresetTheme {
  id: string
  name: string
  window: WindowTheme
  terminal: TerminalColors
}

// --- Color utilities ---

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360
  s /= 100
  l /= 100
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function adjustAccentBrightness(accentHex: string, delta: number): string {
  const [h, s, l] = hexToHsl(accentHex)
  return hslToHex(h, s, Math.max(10, Math.min(90, l + delta)))
}

export function generateWindowTheme(accentHex: string): WindowTheme {
  const [h, s] = hexToHsl(accentHex)
  const cs = Math.min(s, 35) // clamp saturation for backgrounds
  return {
    accentColor: accentHex,
    titlebarBackground: hslToHex(h, cs * 0.8, 8),
    titlebarBackgroundEnd: hslToHex(h, cs * 0.6, 12),
    titlebarForeground: hslToHex(h, Math.min(s, 20), 62),
    sidebarBackground: hslToHex(h, cs * 0.75, 9),
    sidebarForeground: hslToHex(h, Math.min(s, 18), 60),
    buttonBackground: hslToHex(h, cs * 0.7, 17),
  }
}

// --- Terminal themes ---

export const TERMINAL_THEMES: Record<string, TerminalColors> = {
  dark: {
    background: '#0f172a',
    foreground: '#e2e8f0',
    cursor: '#38bdf8',
    selection: 'rgba(56, 189, 248, 0.3)',
    black: '#1e293b',
    red: '#f87171',
    green: '#4ade80',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#f1f5f9',
  },
  light: {
    background: '#f8fafc',
    foreground: '#1e293b',
    cursor: '#0284c7',
    selection: 'rgba(2, 132, 199, 0.2)',
    black: '#334155',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#f1f5f9',
  },
  midnight: {
    background: '#0a0e1a',
    foreground: '#c8d6e5',
    cursor: '#48dbfb',
    selection: 'rgba(72, 219, 251, 0.25)',
    black: '#141a2e',
    red: '#ff6b6b',
    green: '#55efc4',
    yellow: '#feca57',
    blue: '#54a0ff',
    magenta: '#a29bfe',
    cyan: '#00d2d3',
    white: '#dfe6e9',
  },
  ocean: {
    background: '#0b1622',
    foreground: '#b8d4e3',
    cursor: '#00b894',
    selection: 'rgba(0, 184, 148, 0.25)',
    black: '#152238',
    red: '#e17055',
    green: '#00b894',
    yellow: '#fdcb6e',
    blue: '#74b9ff',
    magenta: '#a29bfe',
    cyan: '#81ecec',
    white: '#dfe6e9',
  },
  forest: {
    background: '#0d1a0f',
    foreground: '#b8d4b0',
    cursor: '#2ecc71',
    selection: 'rgba(46, 204, 113, 0.25)',
    black: '#1a2e1c',
    red: '#e74c3c',
    green: '#2ecc71',
    yellow: '#f1c40f',
    blue: '#3498db',
    magenta: '#9b59b6',
    cyan: '#1abc9c',
    white: '#ecf0f1',
  },
  warm: {
    background: '#1a120b',
    foreground: '#d4c5b0',
    cursor: '#e67e22',
    selection: 'rgba(230, 126, 34, 0.25)',
    black: '#2c1e12',
    red: '#e74c3c',
    green: '#27ae60',
    yellow: '#f39c12',
    blue: '#2980b9',
    magenta: '#8e44ad',
    cyan: '#16a085',
    white: '#ecf0f1',
  },
  nord: {
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#88c0d0',
    selection: 'rgba(136, 192, 208, 0.25)',
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
  },
  rose: {
    background: '#1a0d12',
    foreground: '#d4b8c2',
    cursor: '#e84393',
    selection: 'rgba(232, 67, 147, 0.25)',
    black: '#2c1420',
    red: '#fd79a8',
    green: '#55efc4',
    yellow: '#ffeaa7',
    blue: '#74b9ff',
    magenta: '#a29bfe',
    cyan: '#81ecec',
    white: '#ffeef5',
  },
}

export function getTerminalTheme(mode: string): TerminalColors {
  return { ...(TERMINAL_THEMES[mode] || TERMINAL_THEMES.dark) }
}

export function getTerminalThemeNames(): string[] {
  return Object.keys(TERMINAL_THEMES)
}

// --- Preset themes (brightened for better differentiation) ---

export const PRESET_THEMES: PresetTheme[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    window: {
      accentColor: '#38bdf8',
      titlebarBackground: '#0f1a2e',
      titlebarBackgroundEnd: '#162640',
      titlebarForeground: '#8faabe',
      sidebarBackground: '#111b2e',
      sidebarForeground: '#8faabe',
      buttonBackground: '#1c2d4d',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    window: {
      accentColor: '#22d3ee',
      titlebarBackground: '#0b1f2a',
      titlebarBackgroundEnd: '#102e3d',
      titlebarForeground: '#7ec8d8',
      sidebarBackground: '#0c2129',
      sidebarForeground: '#7ec8d8',
      buttonBackground: '#143b4d',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'forest',
    name: 'Forest',
    window: {
      accentColor: '#4ade80',
      titlebarBackground: '#0d2414',
      titlebarBackgroundEnd: '#13331f',
      titlebarForeground: '#80c49a',
      sidebarBackground: '#0e2616',
      sidebarForeground: '#80c49a',
      buttonBackground: '#193d2c',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'sunset',
    name: 'Sunset',
    window: {
      accentColor: '#fb923c',
      titlebarBackground: '#22170c',
      titlebarBackgroundEnd: '#322112',
      titlebarForeground: '#c8a882',
      sidebarBackground: '#24180d',
      sidebarForeground: '#c8a882',
      buttonBackground: '#422c1b',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'lavender',
    name: 'Lavender',
    window: {
      accentColor: '#a78bfa',
      titlebarBackground: '#171328',
      titlebarBackgroundEnd: '#211d3c',
      titlebarForeground: '#a898c0',
      sidebarBackground: '#18152a',
      sidebarForeground: '#a898c0',
      buttonBackground: '#2a2248',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'rose',
    name: 'Rose',
    window: {
      accentColor: '#fb7185',
      titlebarBackground: '#221218',
      titlebarBackgroundEnd: '#321a23',
      titlebarForeground: '#c89aa6',
      sidebarBackground: '#24141a',
      sidebarForeground: '#c89aa6',
      buttonBackground: '#42202e',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'ember',
    name: 'Ember',
    window: {
      accentColor: '#f87171',
      titlebarBackground: '#22100f',
      titlebarBackgroundEnd: '#321616',
      titlebarForeground: '#c89898',
      sidebarBackground: '#241210',
      sidebarForeground: '#c89898',
      buttonBackground: '#421e1e',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'mint',
    name: 'Mint',
    window: {
      accentColor: '#2dd4bf',
      titlebarBackground: '#0b231e',
      titlebarBackgroundEnd: '#12332c',
      titlebarForeground: '#7ec4b8',
      sidebarBackground: '#0d2520',
      sidebarForeground: '#7ec4b8',
      buttonBackground: '#163d36',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'graphite',
    name: 'Graphite',
    window: {
      accentColor: '#94a3b8',
      titlebarBackground: '#1a1a1a',
      titlebarBackgroundEnd: '#222222',
      titlebarForeground: '#909090',
      sidebarBackground: '#1c1c1c',
      sidebarForeground: '#909090',
      buttonBackground: '#303030',
    },
    terminal: TERMINAL_THEMES.dark,
  },
  {
    id: 'gold',
    name: 'Gold',
    window: {
      accentColor: '#fbbf24',
      titlebarBackground: '#221c0c',
      titlebarBackgroundEnd: '#322a12',
      titlebarForeground: '#c8b878',
      sidebarBackground: '#241e0d',
      sidebarForeground: '#c8b878',
      buttonBackground: '#42361b',
    },
    terminal: TERMINAL_THEMES.dark,
  },
]

// --- Emoji set ---

export const PROJECT_EMOJIS = [
  '🚀', '⚡', '🔥', '💎', '🌊', '🌲', '🎯', '🔮',
  '🎨', '🏗️', '🔧', '🧪', '📦', '🎸', '🌙', '☀️',
  '🌈', '❄️', '🍀', '🦊', '🐙', '🦀', '🐍', '🦅',
  '💜', '💙', '💚', '💛', '🧡', '❤️', '🤖', '👾',
  '🎮', '📡', '🔑', '⭐', '🌸', '🍊', '🫐', '🍋',
  '🎵', '🌴', '🦋',
]
