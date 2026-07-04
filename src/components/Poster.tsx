import { IMG } from '../lib/tmdb'

export function Poster({
  path,
  alt,
  size = 'w342',
  className = '',
}: {
  path: string | null
  alt: string
  size?: 'w200' | 'w342' | 'w500'
  className?: string
}) {
  const src = IMG(path, size)
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-700 text-2xl text-slate-500 ${className}`}
        aria-label={alt}
      >
        🎬
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />
}
