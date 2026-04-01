import Image from "next/image";

type SiteLogoProps = {
  className?: string;
  /** Pixel size of the mark (square). */
  size?: number;
  /** Show “Dead Code” next to the icon. */
  showWordmark?: boolean;
  /** Larger wordmark (e.g. marketing hero). */
  wordmarkClassName?: string;
};

export function SiteLogo({
  className = "",
  size = 40,
  showWordmark = true,
  wordmarkClassName = "text-base font-semibold tracking-tight text-zinc-900",
}: SiteLogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src="/deadcode-logo.png"
          alt=""
          fill
          className="object-contain"
          sizes={`${size}px`}
          priority
          aria-hidden
        />
      </span>
      {showWordmark && (
        <span className={wordmarkClassName}>Dead Code</span>
      )}
    </span>
  );
}
