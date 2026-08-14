type BrandLogoProps = {
  className?: string;
  title?: string;
};

/**
 * Product mark rebuilt as vector geometry so it stays crisp at both the
 * compact sidebar size and the large sign-in composition.
 */
export function BrandLogo({ className, title }: BrandLogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 72 72"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M59.5 20.2A28 28 0 1 0 61.9 47"
        stroke="currentColor"
        strokeWidth="5.2"
        strokeLinecap="round"
      />
      <path
        d="M55.2 11.6a31.4 31.4 0 0 1 7.9 11.3 31.6 31.6 0 0 1 1.7 17.3"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        opacity=".72"
      />
      <path
        d="M39.2 7.8 19.4 39h13.1l-2.7 25.2L53 28.7H39.3l-.1-20.9Z"
        fill="currentColor"
      />
      <path
        d="M11.9 52.2a29 29 0 0 0 37.7 9.7"
        stroke="currentColor"
        strokeWidth="3.1"
        strokeLinecap="round"
        opacity=".58"
      />
    </svg>
  );
}
