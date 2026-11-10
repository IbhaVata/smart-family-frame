import type { SVGProps } from 'react';

export type IconName =
  | 'frame' | 'photo' | 'calendar' | 'note' | 'bell' | 'schedule' | 'settings' | 'heart' | 'heart-filled'
  | 'trash' | 'pin' | 'plus' | 'play' | 'pause' | 'prev' | 'next' | 'close' | 'upload' | 'check' | 'fullscreen'
  | 'exit' | 'edit' | 'moon' | 'sun' | 'clock' | 'eye' | 'download' | 'restore' | 'warning' | 'dashboard' | 'household' | 'chevron-left' | 'chevron-right';

const paths: Record<IconName, string> = {
  frame: 'M3 5h18v14H3z M7 9h10v6H7z',
  photo: 'M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M15 9h.01',
  calendar: 'M4 6h16v14H4z M8 3v5 M16 3v5 M4 11h16',
  note: 'M6 3h9l5 5v13H6z M14 3v6h6 M9 13h6 M9 17h6',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4z M10 21h4',
  schedule: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 7v5l3 2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z',
  'heart-filled': 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z',
  trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
  pin: 'M12 17v5 M8 3h8l-1 7 3 3H6l3-3z',
  plus: 'M12 5v14 M5 12h14',
  play: 'M6 4l14 8-14 8z',
  pause: 'M7 4h4v16H7z M13 4h4v16h-4z',
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  close: 'M18 6L6 18 M6 6l12 12',
  upload: 'M12 16V4 M6 10l6-6 6 6 M4 20h16',
  check: 'M20 6L9 17l-5-5',
  fullscreen: 'M8 3H3v5 M16 3h5v5 M8 21H3v-5 M16 21h5v-5',
  exit: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  download: 'M12 4v12 M6 10l6 6 6-6 M4 20h16',
  restore: 'M3 12a9 9 0 1 0 3-6.7 M3 3v5h5',
  warning: 'M12 3l10 18H2z M12 10v4 M12 18h.01',
  dashboard: 'M3 4h8v7H3z M13 4h8v4h-8z M13 11h8v9h-8z M3 14h8v6H3z',
  household: 'M3 11l9-8 9 8 M5 10v11h14V10 M9 21v-7h6v7',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
};

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const filled = name === 'heart-filled' || name === 'play' || name === 'pause';
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
