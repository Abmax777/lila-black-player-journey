const KEYS = [
  ['+ / =', 'Zoom in'],
  ['− / _', 'Zoom out'],
  ['0', 'Fit the map'],
  ['Arrow keys', 'Pan (hold Shift for bigger steps)'],
  ['Space + drag', 'Pan while the area tool is active'],
  ['M', 'Magnifier'],
  ['I', 'Area inspector'],
  ['?', 'This list'],
]

export default function Shortcuts({ onClose }) {
  return (
    <div className="shortcuts-backdrop" onClick={onClose} role="presentation">
      <div
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-head">
          <h2>Keyboard shortcuts</h2>
          <button className="link" onClick={onClose}>Close</button>
        </div>
        <dl>
          {KEYS.map(([key, what]) => (
            <div key={key}>
              <dt><kbd>{key}</kbd></dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
