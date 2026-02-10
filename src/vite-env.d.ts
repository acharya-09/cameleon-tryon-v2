/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DECART_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Allow importing image assets (Vite resolves these at build time)
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}

/* ──────────────────────────────────────────
   Decart AI SDK Type Declarations
   Install: npm install @decartai/sdk
   ────────────────────────────────────────── */
declare module '@decartai/sdk' {
  export interface DecartClient {
    realtime: {
      connect(
        stream: MediaStream,
        options: {
          model: any;
          onRemoteStream: (stream: MediaStream) => void;
        }
      ): Promise<RealtimeClient>;
    };
  }

  export interface RealtimeClient {
    setImage(file: File): Promise<void>;
    setPrompt(prompt: string): void;
    disconnect(): void;
    on(event: 'error', handler: (error: any) => void): void;
  }

  export function createDecartClient(config: { apiKey: string }): DecartClient;

  export const models: {
    realtime(name: string): any;
  };
}
