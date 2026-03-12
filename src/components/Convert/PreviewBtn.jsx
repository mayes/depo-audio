export default function PreviewBtn({ onClick, loading, playing, disabled, color, label }) {
  const cls = [
    'preview-btn',
    loading ? 'preview-btn--loading' : '',
    playing ? 'preview-btn--playing' : '',
    label   ? 'preview-btn--labeled' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      className={cls}
      onClick={onClick}
      disabled={disabled || loading}
      title={loading ? 'Generating preview…' : playing ? 'Stop preview' : label || 'Preview channel'}
      aria-label={loading ? 'Generating preview' : playing ? 'Stop preview' : label || 'Preview channel'}
      style={color && !playing ? { '--preview-color': color } : undefined}
    >
      {loading ? (
        <svg className="preview-spinner" width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeDasharray="20 14" strokeLinecap="round" />
        </svg>
      ) : playing ? (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="2" y="2" width="3" height="8" rx="1" fill="currentColor"/>
          <rect x="7" y="2" width="3" height="8" rx="1" fill="currentColor"/>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M3 1.5l7 4.5-7 4.5V1.5z" fill="currentColor"/>
        </svg>
      )}
      {label && <span className="preview-btn-label">{label}</span>}
    </button>
  )
}
