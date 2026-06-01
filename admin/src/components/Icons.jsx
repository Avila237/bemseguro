import { createElement } from 'react';

// Set de ícones stroke (estilo lucide), portado do design system do Bem Seguro
// Hub. Cada ícone herda currentColor; tamanho via prop `size` (ou width/height).
const C = (cx, cy, r) => ['circle', { cx, cy, r }];
const R = (x, y, w, h, rx) => ['rect', { x, y, width: w, height: h, rx }];
const L = (x1, y1, x2, y2) => ['line', { x1, y1, x2, y2 }];

function makeIcon(defs) {
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
        {defs.map((d, i) =>
          typeof d === 'string'
            ? createElement('path', { key: i, d })
            : createElement(d[0], { key: i, ...d[1] })
        )}
      </svg>
    );
  }
  return Icon;
}

const DEFS = {
  grid: [R(3, 3, 7, 7, 1.5), R(14, 3, 7, 7, 1.5), R(3, 14, 7, 7, 1.5), R(14, 14, 7, 7, 1.5)],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', L(3.5, 6, 3.6, 6), L(3.5, 12, 3.6, 12), L(3.5, 18, 3.6, 18)],
  plus: ['M12 5v14', 'M5 12h14'],
  shield: ['M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'],
  key: [C(7.5, 15.5, 3.5), 'M10 13l8.5-8.5', 'M16 6.5l2 2', 'M14 8.5l1.6 1.6'],
  activity: ['M3 12h4l2.5-7 5 14 2.5-7H21'],
  bell: ['M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9', 'M10.5 20a2 2 0 0 0 3 0'],
  search: [C(11, 11, 7), 'M21 21l-4.3-4.3'],
  chevDown: ['M6 9l6 6 6-6'],
  chevRight: ['M9 6l6 6-6 6'],
  chevLeft: ['M15 6l-6 6 6 6'],
  arrowRight: ['M5 12h14', 'M13 5l7 7-7 7'],
  arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
  arrowDown: ['M12 5v14', 'M5 12l7 7 7-7'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.3', 'M21 4v4h-4'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  checkCircle: [C(12, 12, 9), 'M8.5 12l2.5 2.5L15.5 9'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  xCircle: [C(12, 12, 9), 'M9 9l6 6', 'M15 9l-6 6'],
  alert: ['M12 3l9.5 16.5H2.5z', 'M12 10v4', L(12, 17.3, 12.01, 17.3)],
  clock: [C(12, 12, 9), 'M12 7.5V12l3 2'],
  user: [C(12, 8, 3.6), 'M5 20c1-3.5 4-5 7-5s6 1.5 7 5'],
  doc: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', L(9, 13, 15, 13), L(9, 16.5, 15, 16.5)],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 4v4h4', 'M12 8v4l3 2'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  download: ['M12 4v10', 'M8 11l4 4 4-4', 'M5 19h14'],
  filter: ['M3 5h18l-7 8v6l-4 2v-8z'],
  mail: [R(3, 5, 18, 14, 2), 'M3.5 6.5L12 13l8.5-6.5'],
  lock: [R(5, 11, 14, 9, 2), 'M8 11V8a4 4 0 0 1 8 0v3', C(12, 15.5, 0.3)],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', C(12, 12, 3)],
  eyeOff: [
    'M4 4l16 16',
    'M9.5 9.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2',
    'M6.8 6.9C4 8.5 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4-.8',
    'M9.5 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3',
  ],
  inbox: ['M3 12h5l1.5 3h5l1.5-3h5', 'M3 12V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6'],
};

// Mapa de ícones por chave (usado pela Sidebar/Topbar via string).
export const Icon = Object.fromEntries(
  Object.entries(DEFS).map(([nome, defs]) => [nome, makeIcon(defs)])
);

// Exports nomeados usados pelo Login e Dashboard.
export const Shield = Icon.shield;
export const Mail = Icon.mail;
export const Lock = Icon.lock;
export const Eye = Icon.eye;
export const EyeOff = Icon.eyeOff;
export const Refresh = Icon.refresh;
export const ArrowRight = Icon.arrowRight;
