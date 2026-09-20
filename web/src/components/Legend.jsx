import { CATEGORY, CATEGORY_ORDER, PATH, HEAT_RAMP_HEX } from '../lib/palette.js'
import { COVERAGE_TINT_HEX, COVERAGE_MODES } from '../lib/coverage.js'

/**
 * Always visible: the category hues carry a CVD warning on one pair, so
 * identity must never rest on colour alone.
 */
export default function Legend({
  categories, onToggle, showPaths, showHumans, showBots,
  heatmapLabel, coverage, coverageMode, showTerminals,
}) {
  return (
    <div className="legend">
      <div className="legend-group">
        {CATEGORY_ORDER.map((id) => {
          const c = CATEGORY[id]
          const on = categories.has(id)
          return (
            <button
              key={id}
              className={`legend-item${on ? '' : ' off'}`}
              onClick={() => onToggle(id)}
              title={`Toggle ${c.label} markers`}
            >
              <Glyph shape={c.shape} hex={c.hex} />
              {c.label}
            </button>
          )
        })}
      </div>
      {coverage && (
        <div className="legend-group heat">
          <span className="legend-item static">{COVERAGE_MODES[coverageMode].label}</span>
          <span
            className="heat-scale coverage-scale"
            style={{ background: `linear-gradient(90deg, ${COVERAGE_TINT_HEX}, transparent)` }}
          />
          <span className="legend-item static muted-text">
            {coverageMode === 'gradient' ? 'untouched → heavily used' : 'no run has entered'}
          </span>
        </div>
      )}
      {heatmapLabel && (
        <div className="legend-group heat">
          <span className="legend-item static">{heatmapLabel} density</span>
          <span className="heat-scale" style={{ background: `linear-gradient(90deg, ${HEAT_RAMP_HEX.join(',')})` }} />
          <span className="legend-item static muted-text">low → high</span>
        </div>
      )}
      {showTerminals && (
        <div className="legend-group muted">
          <span className="legend-item static">
            <span className="ring" style={{ borderColor: '#9ec5f4' }} />Start
          </span>
          <span className="legend-item static">
            <span className="ring" style={{ borderColor: '#d95926' }} />End
          </span>
        </div>
      )}
      {showPaths && (
        <div className="legend-group muted">
          {showHumans && <span className="legend-item static">
            <span className="line" style={{ background: PATH.human.hex, height: 2 }} />Human path
          </span>}
          {showBots && <span className="legend-item static">
            <span className="line" style={{ background: PATH.bot.hex, height: 1 }} />Bot path
          </span>}
        </div>
      )}
    </div>
  )
}

function Glyph({ shape, hex }) {
  const common = { fill: hex, stroke: 'rgba(13,13,13,0.85)', strokeWidth: 1.2 }
  return (
    <svg width="13" height="13" viewBox="-7 -7 14 14" aria-hidden="true">
      {shape === 'circle' && <circle r="4.6" {...common} />}
      {shape === 'triangle' && <polygon points="0,-5 4.6,3.6 -4.6,3.6" {...common} />}
      {shape === 'diamond' && <polygon points="0,-5 5,0 0,5 -5,0" {...common} />}
      {shape === 'cross' && (
        <polygon points="-5,-2.1 -2.1,-5 0,-1.3 2.1,-5 5,-2.1 1.3,0 5,2.1 2.1,5 0,1.3 -2.1,5 -5,2.1 -1.3,0"
          {...common} />
      )}
    </svg>
  )
}
