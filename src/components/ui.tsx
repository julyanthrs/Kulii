import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import type { Availability, Priority, Status, User } from "../data/types";
import { cx, initials, PRIORITY_LABEL, STATUS_LABEL } from "../lib/utils";

/* ---------------- Avatar ---------------- */

const PRESENCE: Record<Availability, string> = {
  available: "#5DB16C",
  busy: "#D9804A",
  away: "#D8B64A",
  offline: "#A7A29A",
};

export function Avatar({ user, size = 26, presence = false, title }: { user?: User | null; size?: number; presence?: boolean; title?: string }) {
  if (!user) return <span className="avatar avatar-more" style={{ "--s": `${size}px` } as CSSProperties}>?</span>;
  const h = user.hue;
  const style = {
    "--s": `${size}px`,
    background: `linear-gradient(145deg, hsl(${h} 30% 62%), hsl(${(h + 20) % 360} 26% 44%))`,
  } as CSSProperties;
  return (
    <span className="avatar" style={style} title={title ?? user.name}>
      {initials(user.name)}
      {presence && <i className="presence" style={{ background: PRESENCE[user.availability] }} />}
    </span>
  );
}

export function AvatarStack({ users, max = 3, size = 22 }: { users: (User | undefined)[]; max?: number; size?: number }) {
  const list = users.filter(Boolean) as User[];
  const extra = list.length - max;
  return (
    <span className="avatar-stack">
      {list.slice(0, max).map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {extra > 0 && (
        <span className="avatar avatar-more" style={{ "--s": `${size}px` } as CSSProperties}>
          +{extra}
        </span>
      )}
    </span>
  );
}

export const presenceLabel: Record<Availability, string> = {
  available: "Available",
  busy: "Busy",
  away: "Away",
  offline: "Offline",
};
export const presenceColor = PRESENCE;

/* ---------------- Indicators ---------------- */

export function PriorityDot({ p, withLabel }: { p: Priority; withLabel?: boolean }) {
  return withLabel ? (
    <span className="row" style={{ gap: 6 }}>
      <i className={cx("pdot", p)} />
      <span>{PRIORITY_LABEL[p]}</span>
    </span>
  ) : (
    <i className={cx("pdot", p)} title={`${PRIORITY_LABEL[p]} priority`} />
  );
}

export function StatusLabel({ s }: { s: Status }) {
  return <span className={cx("status", s)}>{STATUS_LABEL[s]}</span>;
}

export function Checkbox({ on, onChange, round, size = 18, label }: { on: boolean; onChange?: () => void; round?: boolean; size?: number; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label ?? "Toggle"}
      className={cx("check", on && "on", round && "round")}
      style={{ width: size, height: size }}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.();
      }}
    >
      <Check size={size * 0.62} strokeWidth={3} />
    </button>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={cx("toggle", on && "on")}
      style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
      onClick={() => onChange(!on)}
    />
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  size?: "sm";
}) {
  return (
    <div className={cx("seg", size)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={cx(value === o.value && "on")} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 6, label, sub }: { value: number; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--inset-strong)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {(label || sub) && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", textAlign: "center", lineHeight: 1.1 }}>
          {label}
          {sub}
        </div>
      )}
    </div>
  );
}

export function Bar({ value, accent }: { value: number; accent?: boolean }) {
  return (
    <div className={cx("bar", accent && "accent")}>
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <b>{title}</b>
      {children && <div>{children}</div>}
    </div>
  );
}

/* ---------------- Popover / Menu ---------------- */

type Pos = { top?: number; bottom?: number; left?: number; right?: number };

export function usePopover() {
  const ref = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return { ref, open, setOpen, toggle, close };
}

export function Popover({
  anchor,
  open,
  onClose,
  children,
  align = "start",
  width,
  className,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  width?: number;
  className?: string;
}) {
  const [pos, setPos] = useState<Pos>({});
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const p: Pos = {};
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow < 280 && r.top > spaceBelow) p.bottom = window.innerHeight - r.top + 6;
    else p.top = r.bottom + 6;
    if (align === "end") p.right = Math.max(8, window.innerWidth - r.right);
    else p.left = Math.min(r.left, window.innerWidth - (width ?? 200) - 8);
    setPos(p);
  }, [open, anchor, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div ref={popRef} className={cx("popover", className)} style={{ ...pos, width, transformOrigin: pos.bottom !== undefined ? "bottom" : "top" }} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

export function Menu({
  trigger,
  children,
  align = "end",
  width,
}: {
  trigger: (p: { ref: React.RefObject<any>; onClick: (e: React.MouseEvent) => void; open: boolean }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  width?: number;
}) {
  const pop = usePopover();
  return (
    <>
      {trigger({
        ref: pop.ref,
        open: pop.open,
        onClick: (e) => {
          e.stopPropagation();
          pop.toggle();
        },
      })}
      <Popover anchor={pop.ref} open={pop.open} onClose={pop.close} align={align} width={width}>
        {typeof children === "function" ? children(pop.close) : children}
      </Popover>
    </>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  end,
  disabled,
  title,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  end?: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button className={cx("menu-item", danger && "danger")} onClick={onClick} disabled={disabled} title={title}>
      {icon}
      <span className="grow ellipsis">{children}</span>
      {end && <span className="end">{end}</span>}
    </button>
  );
}

/* ---------------- Modal ---------------- */

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx("modal", wide && "wide")} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {sub && <div className="page-sub">{sub}</div>}
          </div>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Page scaffold ---------------- */

export function Page({
  title,
  sub,
  actions,
  crumbs,
  children,
  bodyClass,
  noScroll,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  crumbs?: ReactNode;
  children: ReactNode;
  bodyClass?: string;
  noScroll?: boolean;
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          {crumbs && <div className="crumbs">{crumbs}</div>}
          <h1 className="page-title">{title}</h1>
          {sub && <div className="page-sub">{sub}</div>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      <div className={cx("page-body", bodyClass)} style={noScroll ? { overflow: "hidden", display: "flex", flexDirection: "column" } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function StatusOptions() {
  return (
    <>
      {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </>
  );
}
