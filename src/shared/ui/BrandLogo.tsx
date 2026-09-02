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
      <circle
        cx="36"
        cy="36"
        r="29"
        stroke="currentColor"
        strokeWidth="5.2"
      />
      <path
        d="M39.2 7.8 19.4 39h13.1l-2.7 25.2L53 28.7H39.3l-.1-20.9Z"
        fill="currentColor"
      />
    </svg>
  );
}
