import type { ReactElement, SVGProps } from 'react';

export type IconName =
  | 'plus'
  | 'trash'
  | 'archive'
  | 'image'
  | 'grid'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'undo'
  | 'redo'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'eyedropper'
  | 'pan'
  | 'layers'
  | 'eye'
  | 'eye-off'
  | 'lock'
  | 'unlock'
  | 'up'
  | 'down'
  | 'download'
  | 'folder'
  | 'check'
  | 'close'
  | 'edit'
  | 'note'
  | 'chevron'
  | 'settings'
  | 'search'
  | 'reset'
  | 'save'
  | 'pencil'
  | 'text'
  | 'magnifier'
  | 'swap'
  | 'palette'
  | 'shape-line'
  | 'shape-curve'
  | 'shape-rect'
  | 'shape-ellipse'
  | 'shape-triangle'
  | 'shape-round-rect'
  | 'shape-polygon'
  | 'sun'
  | 'moon'
  | 'menu'
  | 'ruler'
  | 'bot'
  | 'info'
  | 'crop';

const paths: Record<IconName, ReactElement> = {
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v12h14V8M10 12h4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15-4.5-4.5L7 20" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  'zoom-in': (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4-4M11 8v6M8 11h6" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4-4M8 11h6" />
    </>
  ),
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-4" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h4" />
    </>
  ),
  brush: (
    <>
      <path d="M9.5 14.5 3 21s4 .5 5.5-1c1-1 1-3-1-3.5" />
      <path d="M14 3.5 20.5 10 11 19.5l-3-3z" />
    </>
  ),
  eraser: (
    <>
      <path d="m7 21-4-4 10-10 8 8-4 4z" />
      <path d="M9 21h12" />
    </>
  ),
  fill: (
    <>
      <path d="m5 11 8-8 8 8-8 8z" />
      <path d="M19 16c1.5 2 1.5 3.5 0 3.5S17.5 18 19 16z" />
    </>
  ),
  eyedropper: (
    <>
      <path d="m14 4 6 6-9 9-3-3z" />
      <path d="m12 6-2-2a2 2 0 0 0-3 0l-1 1a2 2 0 0 0 0 3l2 2" />
      <path d="m5 21 3-1" />
    </>
  ),
  pan: (
    <>
      <path d="M6 9V6a1.5 1.5 0 0 1 3 0v3" />
      <path d="M9 6V4.5a1.5 1.5 0 0 1 3 0V6" />
      <path d="M12 6v-.5a1.5 1.5 0 0 1 3 0V7" />
      <path d="M15 8V7.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.5A6.5 6.5 0 0 1 4 13.5V13a1.5 1.5 0 0 1 3 0" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M10.5 5.2A10.5 10.5 0 0 1 22 12a17 17 0 0 1-3 3.8M6.5 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9" />
      <path d="m3 3 18 18" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-2" />
    </>
  ),
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  folder: <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  check: <path d="m4 12 5 5L20 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  edit: (
    <>
      <path d="M4 20h4L20 8l-4-4L4 16z" />
      <path d="m14 6 4 4" />
    </>
  ),
  note: (
    <>
      <path d="M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M9 9h6M9 13h4" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4-4" />
    </>
  ),
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  save: (
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7M8 20v-6h8v6" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l4.6-1.2L20 7.3a1.7 1.7 0 0 0 0-2.4l-.9-.9a1.7 1.7 0 0 0-2.4 0L5.2 15.4z" />
      <path d="M15 6.5 17.5 9" />
      <path d="M4 20l3-.9" />
    </>
  ),
  text: (
    <>
      <path d="M5 5h14" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </>
  ),
  magnifier: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 5 5" />
      <path d="M10 7.5v5M7.5 10h5" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z" />
      <circle cx="8.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  'shape-line': <path d="M4 19 20 5" />,
  'shape-curve': <path d="M4 18C8 5 16 5 20 18" />,
  'shape-rect': <rect x="4" y="6" width="16" height="12" rx="1" />,
  'shape-ellipse': <ellipse cx="12" cy="12" rx="8" ry="6" />,
  'shape-triangle': <path d="M12 4 21 19H3z" />,
  'shape-round-rect': <rect x="4" y="6" width="16" height="12" rx="4" />,
  'shape-polygon': <path d="M12 3 20 9 17.5 19h-11L4 9z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  bot: (
    <>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <path d="M12 8V5M9 5h6" />
      <circle cx="9" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1.2" fill="currentColor" stroke="none" />
      <path d="M9.5 16.5h5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.6v.1" />
    </>
  ),
  crop: (
    <>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M2 6h14a2 2 0 0 1 2 2v14" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  ruler: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="1" transform="rotate(-20 12 12)" />
      <path d="M8 9l1 2M12 8l1 2M16 7l1 2" />
    </>
  ),
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
