// A 5-star control with half-star precision, stored on the 1–10 scale the DB
// uses (each half-star = 1 point). Tap the left or right half of a star.

function Star({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  const id = `half-${Math.random().toString(36).slice(2)}`
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden>
      {fill === 'half' && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.3l-5.81 3.06 1.11-6.47L2.6 9.31l6.5-.95z"
        fill={fill === 'full' ? 'currentColor' : fill === 'half' ? `url(#${id})` : 'transparent'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RatingStars({
  score,
  onChange,
}: {
  score: number | null
  onChange: (score: number | null) => void
}) {
  const current = score ?? 0
  return (
    <div className="flex items-center gap-1 text-amber-400">
      {[1, 2, 3, 4, 5].map((i) => {
        const full = i * 2
        const half = i * 2 - 1
        const fill = current >= full ? 'full' : current >= half ? 'half' : 'empty'
        return (
          <div key={i} className="relative">
            <Star fill={fill} />
            {/* Left half = odd value, right half = even value. */}
            <button
              className="absolute inset-y-0 left-0 w-1/2"
              aria-label={`Rate ${half} of 10`}
              onClick={() => onChange(current === half ? null : half)}
            />
            <button
              className="absolute inset-y-0 right-0 w-1/2"
              aria-label={`Rate ${full} of 10`}
              onClick={() => onChange(current === full ? null : full)}
            />
          </div>
        )
      })}
      {score ? <span className="ml-2 text-sm font-semibold text-ink">{score}/10</span> : null}
    </div>
  )
}
