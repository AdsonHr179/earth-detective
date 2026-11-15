import type { ReactNode } from 'react';
import StatusIcon from './StatusIcon';

export type NoticeTone = 'info' | 'warn' | 'error';

type StateNoticeProps = {
  tone?: NoticeTone;
  title: string;
  children?: ReactNode;
  /** 'alert' for failures that need immediate attention, 'status' for everything else. */
  role?: 'alert' | 'status';
  actions?: ReactNode;
};

const ICON = { info: 'diamond', warn: 'triangle', error: 'cross' } as const;

/** A message block with a left bar, an icon and a title: colour is never the only signal. */
export default function StateNotice({ tone = 'info', title, children, role = 'status', actions }: StateNoticeProps) {
  return (
    <section className={`notice notice--${tone}`} role={role}>
      <h2 className="notice-title">
        <StatusIcon name={ICON[tone]} /> {title}
      </h2>
      {children ? <div className="notice-body">{children}</div> : null}
      {actions ? <div className="notice-actions">{actions}</div> : null}
    </section>
  );
}
