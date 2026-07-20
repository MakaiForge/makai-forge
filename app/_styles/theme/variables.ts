export const THEME_VARIABLES: Record<string, { type: string; default: string }> = {
  '--app-bg':               { type: 'color',    default: '#0c0c12' },
  '--app-bg-dark':          { type: 'color',    default: '#08080a' },
  '--app-bg-image':         { type: 'string',   default: 'none' },
  '--app-bg-blur':          { type: 'length',   default: '0px' },
  '--app-content-opacity':  { type: 'number',   default: '1' },
  '--app-bg-overlay-color': { type: 'color',    default: 'rgba(0,0,0,0)' },
  '--app-bg-overlay-blur':  { type: 'length',   default: '0px' },

  '--text-primary':         { type: 'color',    default: '#f0f1f7' },
  '--text-secondary':       { type: 'color',    default: '#b0b1b7' },
  '--text-muted':           { type: 'color',    default: 'rgba(255,255,255,0.45)' },

  '--accent':               { type: 'color',    default: '#6366f1' },
  '--accent-hover':         { type: 'color',    default: '#4f46e5' },
  '--accent-gradient':      { type: 'gradient', default: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
  '--accent-gradient-hover':{ type: 'gradient', default: 'linear-gradient(135deg, #4f46e5, #7c3aed)' },
  '--accent-secondary':     { type: 'gradient', default: 'linear-gradient(135deg, #16b195, #3e62c0)' },

  '--border-color':         { type: 'color',    default: 'rgba(255,255,255,0.06)' },

  '--sidebar-width':        { type: 'length',   default: '250px' },
  '--sidebar-bg':           { type: 'color',    default: '#0a0a0e' },
  '--sidebar-opacity':      { type: 'number',   default: '1' },
  '--sidebar-border':       { type: 'color',    default: 'rgba(255,255,255,0.06)' },
  '--sidebar-text':         { type: 'color',    default: 'rgba(255,255,255,0.55)' },
  '--sidebar-text-hover':   { type: 'color',    default: 'rgba(255,255,255,0.85)' },
  '--sidebar-item-hover':   { type: 'color',    default: 'rgba(255,255,255,0.06)' },
  '--sidebar-item-active':  { type: 'color',    default: 'rgba(255,255,255,0.08)' },
  '--sidebar-section-text': { type: 'color',    default: 'rgba(255,255,255,0.35)' },

  '--title-bar-height':     { type: 'length',   default: '35px' },
  '--title-bar-bg':         { type: 'color',    default: '#0a0a0e' },
  '--title-bar-border':     { type: 'color',    default: 'rgba(255,255,255,0.06)' },
  '--title-bar-text':       { type: 'color',    default: '#f0f1f7' },

  '--header-height':        { type: 'length',   default: '0px' },
  '--header-bg':            { type: 'color',    default: '#0a0a0e' },
  '--header-border':        { type: 'color',    default: 'rgba(255,255,255,0.06)' },
  '--header-text':          { type: 'color',    default: '#f0f1f7' },

  '--bottom-panel-height':  { type: 'length',   default: '36px' },
  '--bottom-panel-bg':      { type: 'color',    default: '#0c0c12' },
  '--bottom-panel-border':  { type: 'color',    default: 'rgba(255,255,255,0.06)' },
  '--bottom-panel-text':    { type: 'color',    default: '#b0b1b7' },

  '--card-radius':          { type: 'length',   default: '8px' },
  '--card-bg':              { type: 'color',    default: 'rgba(255,255,255,0.04)' },
  '--card-border':          { type: 'color',    default: 'rgba(255,255,255,0.06)' },
  '--card-glow':            { type: 'string',   default: 'none' },
  '--card-hover-transform': { type: 'string',   default: 'translateY(-4px)' },
  '--card-hover-shadow':    { type: 'shadow',   default: '0 8px 24px rgba(99,102,241,0.15)' },

  '--glass-bg':             { type: 'color',    default: 'rgba(12,12,18,0.65)' },
  '--glass-blur':           { type: 'length',   default: '20px' },
  '--glass-border':         { type: 'color',    default: 'rgba(255,255,255,0.06)' },
};

export function getDefaultThemeVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, cfg] of Object.entries(THEME_VARIABLES)) {
    vars[key] = cfg.default;
  }
  return vars;
}
