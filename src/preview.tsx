import React, { useEffect, useRef, useState } from "react";
import type { Renderer, ProjectAnnotations } from "storybook/internal/types";
import { addons } from "storybook/internal/preview-api";
import { EVENTS } from "./constants";

const OVERLAY_STYLES = `
  .loracle-gen-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    pointer-events: none;
  }
  .loracle-gen-overlay__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.6);
    transition: opacity 0.4s ease;
  }
  @media (prefers-color-scheme: dark) {
    .loracle-gen-overlay__backdrop {
      background: rgba(0, 0, 0, 0.5);
    }
  }
  @keyframes loracle-spin {
    to { transform: rotate(360deg); }
  }
  .loracle-gen-spinner {
    position: relative;
    width: 32px;
    height: 32px;
    border: 3px solid rgba(59, 130, 246, 0.2);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: loracle-spin 0.8s linear infinite;
    transition: opacity 0.4s ease;
  }
`;

let styleInjected = false;
function ensureStyles() {
  if (styleInjected) return;
  if (typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = OVERLAY_STYLES;
  style.setAttribute("data-loracle-gen", "");
  document.head.appendChild(style);
  styleInjected = true;
}

function GenerationOverlay({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ensureStyles();

    const channel = addons.getChannel();

    const handleStart = () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      setLoading(true);
      setVisible(true);
    };

    const handleEnd = () => {
      // Fade out, then unmount
      setVisible(false);
      fadeTimerRef.current = setTimeout(() => {
        setLoading(false);
        fadeTimerRef.current = null;
      }, 400);
    };

    channel.on(EVENTS.STREAM_START, handleStart);
    channel.on(EVENTS.STREAM_END, handleEnd);
    channel.on(EVENTS.STREAM_ERROR, handleEnd);

    return () => {
      channel.off(EVENTS.STREAM_START, handleStart);
      channel.off(EVENTS.STREAM_END, handleEnd);
      channel.off(EVENTS.STREAM_ERROR, handleEnd);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {children}
      {loading && (
        <div className="loracle-gen-overlay">
          <div
            className="loracle-gen-overlay__backdrop"
            style={{ opacity: visible ? 1 : 0 }}
          />
          <div
            className="loracle-gen-spinner"
            style={{ opacity: visible ? 1 : 0 }}
          />
        </div>
      )}
    </div>
  );
}

const preview: ProjectAnnotations<Renderer> = {
  decorators: [
    (storyFn) => <GenerationOverlay>{storyFn()}</GenerationOverlay>,
  ],
};

export default preview;
