import type { ReactNode } from 'react';

interface IconButtonProps {
  /** Accessible name / tooltip for the button */
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/** Compact square button wrapping a small inline SVG icon. */
export default function IconButton({
  label,
  onClick,
  disabled = false,
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
