import React from "react";

export interface ButtonProps {
  /** Button label text */
  children: React.ReactNode;
  /** Visual style variant */
  variant?: "primary" | "secondary" | "destructive";
  /** Size of the button */
  size?: "sm" | "md" | "lg";
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Click handler */
  onClick?: () => void;
}

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
}: ButtonProps) => {
  const baseStyles: React.CSSProperties = {
    border: "none",
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "sans-serif",
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: "6px 12px", fontSize: 13 },
    md: { padding: "8px 16px", fontSize: 14 },
    lg: { padding: "12px 24px", fontSize: 16 },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "#0066ff", color: "white" },
    secondary: { backgroundColor: "#e5e7eb", color: "#111" },
    destructive: { backgroundColor: "#dc2626", color: "white" },
  };

  return (
    <button
      style={{ ...baseStyles, ...sizeStyles[size], ...variantStyles[variant] }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
