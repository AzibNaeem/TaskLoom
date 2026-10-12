import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import styles from './Modal.module.css'

// Native <dialog> gives focus trapping, Escape-to-close and an accessible
// modal role for free.

interface ModalProps {
  open: boolean
  title: string
  onClose(): void
  children: ReactNode
  variant?: 'center' | 'drawer'
}

export function Modal({ open, title, onClose, children, variant = 'center' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${styles[variant]}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className={styles.inner}>
          <header className={styles.header}>
            <h2>{title}</h2>
            <button className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </header>
          <div className={styles.body}>{children}</div>
        </div>
      )}
    </dialog>
  )
}
