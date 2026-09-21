import { useRef, useState } from 'react'
import { importDataset } from '../lib/import/index.js'

/**
 * Load a capture from disk.
 *
 * Everything happens in the page: the files are read, not uploaded, and
 * nothing leaves the machine. That is worth saying out loud, because "pick a
 * folder" in a browser usually means the opposite.
 */
export default function ImportPanel({ imported, onImported, onReset }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null)

  const run = async (fileList) => {
    setError(null)
    setReport(null)
    setBusy({ phase: 'reading', done: 0, total: 0 })
    try {
      const result = await importDataset(fileList, setBusy)
      onImported(result)
      setReport({
        maps: Object.keys(result.manifest.maps),
        events: result.manifest.totals.events,
        matches: result.matches.length,
        skipped: result.skipped,
        unreadable: result.unreadable,
      })
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(null)
    }
  }

  const label = busy
    ? busy.phase === 'reading'
      ? `Reading ${busy.done || 0}/${busy.total || 0} files${busy.rows ? ` · ${busy.rows.toLocaleString()} events` : ''}`
      : busy.phase === 'mask' ? `Tracing ${busy.mapId}…` : 'Calibrating…'
    : null

  return (
    <div className="import-panel">
      <input
        ref={inputRef}
        type="file"
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.length) run(e.target.files) }}
      />
      <button
        className="import-button"
        onClick={() => inputRef.current?.click()}
        disabled={Boolean(busy)}
      >
        {busy ? label : 'Load a capture…'}
      </button>

      {!busy && !imported && (
        <p className="import-hint">
          Pick a <code>player_data</code> folder. It is read in this tab — nothing is uploaded.
        </p>
      )}

      {imported && (
        <p className="import-hint">
          Showing imported data.{' '}
          <button className="link-button" onClick={onReset}>Back to the sample capture</button>
        </p>
      )}

      {error && <p className="import-error">{error}</p>}

      {report && (
        <div className="import-report">
          <p>
            {report.events.toLocaleString()} events · {report.matches.toLocaleString()} matches ·{' '}
            {report.maps.length} map{report.maps.length === 1 ? '' : 's'}
          </p>
          {report.skipped.length > 0 && (
            <ul>
              {report.skipped.map((s) => (
                <li key={s.mapId}>
                  <strong>{s.mapId}</strong> skipped — {s.reason}
                  {' '}({s.events.toLocaleString()} events)
                </li>
              ))}
            </ul>
          )}
          {report.unreadable.length > 0 && (
            <p>{report.unreadable.length} file{report.unreadable.length === 1 ? '' : 's'} could not be read.</p>
          )}
        </div>
      )}
    </div>
  )
}
