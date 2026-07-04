// App logo: a cinema clapperboard on a warm sunset-orange → crimson gradient.
// Used on the sign-in / welcome screens; mirrors public/favicon.svg.
export function Logo({ className = 'h-16 w-16' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="TV Tracker logo"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="cineLogo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a3d" />
          <stop offset="1" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#cineLogo)" />
      {/* clapperboard body + play triangle */}
      <rect x="13" y="29" width="38" height="21" rx="3" fill="#fff" />
      <path d="M28.5 35.5v8l7-4z" fill="#e11d48" />
      {/* hinged, angled clapper bar with diagonal teeth */}
      <g transform="rotate(-11 15 28)">
        <rect x="13" y="19" width="38" height="9" rx="2" fill="#fff" />
        <g fill="#e11d48">
          <path d="M17 19h4l-4 9h-4z" />
          <path d="M25 19h4l-4 9h-4z" />
          <path d="M33 19h4l-4 9h-4z" />
          <path d="M41 19h4l-4 9h-4z" />
          <path d="M49 19h2l-4 9h-2z" />
        </g>
      </g>
    </svg>
  )
}
