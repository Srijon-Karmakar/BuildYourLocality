import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './icons';
import { useMediaQuery } from './useMediaQuery';

const KEY = 'apnagali.panel.';

const read = (id: string) => {
  try {
    return localStorage.getItem(KEY + id) === '1';
  } catch {
    return false;
  }
};

interface Props {
  /** Remembers collapsed / open between visits. */
  id: string;
  /** Which screen edge the panel hugs: it folds away towards that edge. */
  side: 'left' | 'right';
  title: string;
  onClose?: () => void;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * A floating side panel with a header (title, optional close) and, on screens wide enough to have
 * side panels, a fold-away button. Folded, it shrinks to a small pill on the same edge.
 */
export function SidePanel({ id, side, title, onClose, className, style, children }: Props) {
  const wide = useMediaQuery('(min-width: 640px)');
  const [collapsed, setCollapsed] = useState(() => read(id));
  const set = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(KEY + id, v ? '1' : '0');
    } catch {
      /* private mode: the panel just won't remember */
    }
  };

  if (wide && collapsed) {
    const pos = side === 'left' ? 'left-4 top-1/2 -translate-y-1/2' : 'right-4 top-20';
    return (
      <button
        onClick={() => set(false)}
        title={`Show ${title}`}
        aria-label={`Show ${title}`}
        className={`pointer-events-auto absolute ${pos} flex h-10 items-center gap-1.5 rounded-full bg-black/40 px-3.5 text-xs text-white backdrop-blur-[6px] transition hover:bg-black/55`}
      >
        {side === 'right' && <Icon name="chevronLeft" />}
        {title}
        {side === 'left' && <Icon name="chevronRight" />}
      </button>
    );
  }

  return (
    <div className={className} style={style}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-1 text-lg text-white/60">
          {wide && (
            <button
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 hover:text-white"
              onClick={() => set(true)}
              title="Fold away"
              aria-label="Fold panel away"
            >
              <Icon name={side === 'right' ? 'chevronRight' : 'chevronLeft'} />
            </button>
          )}
          {onClose && (
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full hover:text-white sm:h-7 sm:w-7 sm:text-base sm:hover:bg-white/10"
              onClick={onClose}
              title="Close (Esc)"
              aria-label="Close"
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
