import React from "react";

export interface CardProps {
  /** Card title */
  title: string;
  /** Card description */
  description?: string;
  /** Card content */
  children?: React.ReactNode;
  /** Whether to show a border */
  bordered?: boolean;
}

export const Card = ({
  title,
  description,
  children,
  bordered = true,
}: CardProps) => (
  <div
    style={{
      border: bordered ? "1px solid #e5e7eb" : "none",
      borderRadius: 8,
      padding: 20,
      fontFamily: "sans-serif",
      maxWidth: 360,
    }}
  >
    <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>{title}</h3>
    {description && (
      <p style={{ margin: "0 0 12px", fontSize: 14, color: "#6b7280" }}>{description}</p>
    )}
    {children}
  </div>
);
