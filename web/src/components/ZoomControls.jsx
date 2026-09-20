/**
 * Map tool strip.
 *
 * deck.gl already supports scroll-to-zoom and drag-to-pan, but neither is
 * reachable without a mouse wheel and a steady hand. These give the same
 * control to a keyboard or a trackpad, and make the affordance visible.
 *
 * Icons rather than words: "Loupe" and "Area" are jargon and were overrunning
 * their buttons. Each keeps its name in a hover tooltip and in its accessible
 * name, so the label is there on demand without living on the control.
 */
function Tool({ label, hint, onClick, pressed, disabled, children }) {
  return (
    <button
      className={`tool${pressed ? ' on' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
    >
      {children}
      <span className="tool-tip" role="tooltip">
        {label}{hint && <em>{hint}</em>}
      </span>
    </button>
  )
}

export default function ZoomControls({
  zoom, minZoom, maxZoom, onZoom, onReset,
  magnifier, onToggleMagnifier,
  inspectMode, onToggleInspect,
  onShowShortcuts,
}) {
  return (
    <div className="zoom-controls" role="group" aria-label="Map tools">
      <Tool label="Zoom in" hint="+" onClick={() => onZoom(1)} disabled={zoom >= maxZoom}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
      </Tool>
      <Tool label="Zoom out" hint="−" onClick={() => onZoom(-1)} disabled={zoom <= minZoom}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
      </Tool>
      <Tool label="Fit the map" hint="0" onClick={onReset}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3" />
        </svg>
      </Tool>

      <span className="tool-sep" />

      <Tool label="Magnifier" hint="M" onClick={onToggleMagnifier} pressed={magnifier}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2L13.5 13.5" />
        </svg>
      </Tool>
      <Tool label="Inspect an area" hint="I" onClick={onToggleInspect} pressed={inspectMode}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 5V2.5H5M11 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11" />
          <rect x="5.5" y="5.5" width="5" height="5" strokeDasharray="1.6 1.4" />
        </svg>
      </Tool>

      <span className="tool-sep" />

      <Tool label="Keyboard shortcuts" hint="?" onClick={onShowShortcuts}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6 6a2 2 0 1 1 2.6 1.9c-.5.2-.6.6-.6 1V9.5" />
          <circle cx="8" cy="12" r="0.4" fill="currentColor" stroke="none" />
        </svg>
      </Tool>
    </div>
  )
}
