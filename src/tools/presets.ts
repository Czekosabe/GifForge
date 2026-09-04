import type { TextLayer } from '../types/project'

type TextPresetPatch = Partial<
  Pick<TextLayer, 'fontFamily' | 'fontSize' | 'fillColor' | 'strokeColor' | 'strokeWidth' | 'align' | 'shadow'>
>

export const TEXT_PRESETS: Record<string, TextPresetPatch> = {
  'Meme Text': {
    fontFamily: 'Impact, "Arial Narrow", sans-serif',
    fontSize: 48,
    fillColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 3,
    align: 'center',
    shadow: null,
  },
  Subtitle: {
    fontFamily: 'Arial, sans-serif',
    fontSize: 28,
    fillColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 1.5,
    align: 'center',
    shadow: null,
  },
  Sticker: {
    fontFamily: '"Comic Sans MS", cursive, sans-serif',
    fontSize: 36,
    fillColor: '#ffe14d',
    strokeColor: '#7a3e00',
    strokeWidth: 2,
    align: 'center',
    shadow: { color: 'rgba(0,0,0,0.5)', blur: 6, offsetX: 2, offsetY: 2 },
  },
  'Clean Caption': {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: 24,
    fillColor: '#111111',
    strokeColor: '#ffffff',
    strokeWidth: 0,
    align: 'left',
    shadow: null,
  },
  'Bold Outline': {
    fontFamily: 'Arial Black, Arial, sans-serif',
    fontSize: 40,
    fillColor: '#ff3b30',
    strokeColor: '#ffffff',
    strokeWidth: 4,
    align: 'center',
    shadow: null,
  },
}

export const FONT_FAMILIES = [
  'Arial, sans-serif',
  'Helvetica, Arial, sans-serif',
  '"Arial Black", Arial, sans-serif',
  'Impact, "Arial Narrow", sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  '"Courier New", Courier, monospace',
  '"Comic Sans MS", cursive, sans-serif',
  'Verdana, sans-serif',
  '"Trebuchet MS", sans-serif',
]
