export const FLUSH_TOOL_URL_EVENT = 'pcbplanner:flush-tool-url';

/** Finish a pending URL update before copying, reporting or saving the current design. */
export function currentToolUrl(): string {
  window.dispatchEvent(new Event(FLUSH_TOOL_URL_EVENT));
  return window.location.href;
}
