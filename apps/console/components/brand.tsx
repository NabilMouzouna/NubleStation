export function NubleIcon({ size = 40 }: { size?: number }) {
  const height = Math.round(size * (95 / 155));
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 155 95"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nuble-icon-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1F4FE0" />
          <stop offset="100%" stopColor="#9B5BFF" />
        </linearGradient>
      </defs>
      <g transform="translate(0, -8)">
        <path
          d="M 30 75 C 8 75, 5 50, 25 45 C 18 18, 55 10, 72 32 C 85 12, 120 18, 120 48 C 142 48, 148 75, 128 75 Z"
          fill="url(#nuble-icon-g)"
        />
        <line x1="5" y1="98" x2="148" y2="98" stroke="url(#nuble-icon-g)" strokeWidth="6" strokeLinecap="round" />
        <line x1="40" y1="78" x2="40" y2="98" stroke="url(#nuble-icon-g)" strokeWidth="3" strokeLinecap="round" />
        <line x1="110" y1="78" x2="110" y2="98" stroke="url(#nuble-icon-g)" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function NubleLogo({ tagline = false }: { tagline?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <NubleIcon size={64} />
      <div className="flex flex-col items-center gap-1">
        <span className="text-2xl font-semibold tracking-tight">
          <span className="text-foreground">Nuble</span>
          <span className="text-muted-foreground">Station</span>
        </span>
        {tagline && (
          <span className="text-xs font-medium tracking-[0.2em] text-muted-foreground">
            PRIVATE · LOCAL · YOURS
          </span>
        )}
      </div>
    </div>
  );
}

export function NubleSidebarHeader() {
  return (
    <div className="flex items-center gap-2.5">
      <NubleIcon size={28} />
      <span className="text-sm font-semibold tracking-tight">
        <span className="text-foreground">Nuble</span>
        <span className="text-muted-foreground">Station</span>
      </span>
    </div>
  );
}
