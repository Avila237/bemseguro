// Ícones stroke (estilo lucide), portados do design system do Bem Seguro Hub.
// Cada ícone herda currentColor; tamanho via prop `size` (ou width/height).
function makeIcon(children) {
  function Icon({ size = 18, width, height, ...props }) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        width={width ?? size}
        height={height ?? size}
        {...props}
      >
        {children}
      </svg>
    );
  }
  return Icon;
}

export const Shield = makeIcon(<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />);

export const Mail = makeIcon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5L12 13l8.5-6.5" />
  </>
);

export const Lock = makeIcon(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="0.3" />
  </>
);

export const Eye = makeIcon(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>
);

export const EyeOff = makeIcon(
  <>
    <path d="M4 4l16 16" />
    <path d="M9.5 9.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2" />
    <path d="M6.8 6.9C4 8.5 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4-.8" />
    <path d="M9.5 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3" />
  </>
);

export const Refresh = makeIcon(
  <>
    <path d="M21 12a9 9 0 1 1-2.6-6.3" />
    <path d="M21 4v4h-4" />
  </>
);

export const ArrowRight = makeIcon(
  <>
    <path d="M5 12h14" />
    <path d="M13 5l7 7-7 7" />
  </>
);
