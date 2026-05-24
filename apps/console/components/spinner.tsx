export function Spinner({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className={`inline-block animate-spin rounded-full border-2 border-muted border-t-primary ${className}`}
    />
  );
}
