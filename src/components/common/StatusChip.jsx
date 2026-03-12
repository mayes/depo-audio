export default function StatusChip({ status }) {
  const map = { waiting:['chip','Waiting'], queued:['chip','Queued'], converting:['chip chip--active','● Processing'], done:['chip chip--done','✓ Done'], error:['chip chip--error','✗ Failed'] }
  const [cls, label] = map[status] || map.waiting
  return <span className={cls}>{label}</span>
}
