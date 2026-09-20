/**
 * Zoom, reset and magnifier controls.
 *
 * deck.gl already supports scroll-to-zoom and drag-to-pan, but neither is
 * reachable without a mouse wheel and a steady hand. These give the same
 * control a keyboard, a trackpad or a shaky hand can operate, and they make
 * the affordance visible instead of hidden.
 */
export default function ZoomControls({
  zoom, minZoom, maxZoom, onZoom, onReset, magnifier, onToggleMagnifier,
  inspectMode, onToggleInspect,
}) {
  const pct = Math.round(2 ** zoom * 100)
  return (
    <div className="zoom-controls" role="group" aria-label="Map zoom">
      <button
        onClick={() => onZoom(+1)}
        disabled={zoom >= maxZoom}
        aria-label="Zoom in"
        title="Zoom in  (+)"
      >
        +
      </button>
      <span className="zoom-level" aria-live="polite" aria-atomic="true">
        {pct}%
      </span>
      <button
        onClick={() => onZoom(-1)}
        disabled={zoom <= minZoom}
        aria-label="Zoom out"
        title="Zoom out  (−)"
      >
        −
      </button>
      <button onClick={onReset} aria-label="Reset view to fit map" title="Fit map  (0)" className="wide">
        Fit
      </button>
      <button
        onClick={onToggleMagnifier}
        aria-pressed={magnifier}
        className={`wide${magnifier ? ' on' : ''}`}
        title="Magnifier  (M)"
      >
        Loupe
      </button>
      <button
        onClick={onToggleInspect}
        aria-pressed={inspectMode}
        className={`wide${inspectMode ? ' on' : ''}`}
        title="Inspect an area  (I)"
        aria-label="Inspect an area"
      >
        Area
      </button>
    </div>
  )
}
