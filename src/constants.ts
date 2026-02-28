export const ADDON_ID = "loracle/design-agent";
export const PANEL_ID = `${ADDON_ID}/panel`;

export const EVENTS = {
  PROMPT_SUBMIT: `${ADDON_ID}/prompt-submit`,
  STREAM_START: `${ADDON_ID}/stream-start`,
  STREAM_CHUNK: `${ADDON_ID}/stream-chunk`,
  STREAM_END: `${ADDON_ID}/stream-end`,
  STREAM_ERROR: `${ADDON_ID}/stream-error`,
  FILE_CHANGED: `${ADDON_ID}/file-changed`,
} as const;
