import { IMG } from '../lib/tmdb'

export function Poster({
  path,
  alt,
  size = 'w342',
  className = '',
  rounded = 'rounded-xl',
}: {
  path: string | null
  alt: string
  size?: 'w200' | 'w342' | 'w500'
  className?: string
  rounded?: string
}) {
  const src = IMG(path, size)
  const ring = 'ring-1 ring-line'
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-surface-2 to-surface text-2xl text-faint ${ring} ${rounded} ${className}`}
        aria-label={alt}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
        </svg>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={`bg-surface object-cover ${ring} ${rounded} ${className}`}
    />
  )
}
