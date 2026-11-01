import type { SVGProps } from 'react';

/** Brand mark: practice frame + voice bars + rising curve + record dot */
export function BrandMark({ size = 24, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <rect x="4" y="4" width="92" height="92" rx="20" stroke="currentColor" strokeWidth="8" />
      <rect x="22" y="44" width="7" height="22" rx="3.5" fill="currentColor" />
      <rect x="33" y="34" width="7" height="42" rx="3.5" fill="currentColor" />
      <rect x="44" y="26" width="7" height="58" rx="3.5" fill="currentColor" />
      <rect x="55" y="36" width="7" height="38" rx="3.5" fill="currentColor" />
      <path
        d="M66 60 C74 60 78 44 86 34 C90 29 94 26 98 24"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="28" cy="74" r="6" fill="currentColor" />
    </svg>
  );
}
