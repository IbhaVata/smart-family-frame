/**
 * Minimal hand-written types for the one `qrcode` export this app uses (RemoteSharingSection.tsx).
 * Deliberately NOT `@types/qrcode`: that package's .d.ts references `@types/node`, which silently
 * changes the global `setTimeout`/`setInterval` return type for the WHOLE program (DOM's `number`
 * becomes Node's `NodeJS.Timeout`), breaking unrelated browser code elsewhere (FrameMode.tsx,
 * useClock.ts). A tiny local declaration avoids pulling in Node's global lib entirely.
 */
declare module 'qrcode' {
  export interface QRCodeToDataURLOptions {
    width?: number;
    margin?: number;
  }
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
}
