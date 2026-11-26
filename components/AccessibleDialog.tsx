"use client";

import { useEffect, useRef, type ReactNode } from "react";
import "./accessible-dialog.css";

type AccessibleDialogProps = {
  labelledBy: string;
  backdropClassName: string;
  className: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** Mount only while open. Native modality contains focus and makes the page inert. */
export default function AccessibleDialog({ labelledBy, backdropClassName, className, busy = false, onClose, children }: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  return <dialog
    ref={dialogRef}
    className={`cgp-accessible-dialog ${backdropClassName}`}
    aria-labelledby={labelledBy}
    aria-busy={busy}
    dir="rtl"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose(); }}
    onKeyDown={event => {
      // Do not open the background search dialog while this modal owns focus.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); event.stopPropagation();
      }
    }}
  >
    <section className={className}>{children}</section>
  </dialog>;
}
