import { type ReactNode, useEffect } from "react";
import { useStudio } from "../store";

/**
 * A dialog over the workspace. While any is open, the docked game window is
 * hidden: it is a separate native window and would otherwise cover the dialog.
 */
export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const { pushOverlay, popOverlay } = useStudio.getState();
    pushOverlay();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      popOverlay();
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? "modal wide" : "modal"} role="dialog" aria-modal="true">
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
