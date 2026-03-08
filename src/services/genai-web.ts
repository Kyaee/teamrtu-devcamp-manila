// genai-web.ts
//
// Local shim that imports directly from the @google/genai web bundle.
//
// Why this exists:
//   Metro does not honour package.json "exports" conditions, so a bare
//   `import … from '@google/genai'` resolves to dist/index.mjs whose
//   CrossWebSocketFactory.create() always throws:
//
//     "This feature requires the web or Node specific @google/genai
//      implementation …"
//
//   The sub-path `@google/genai/web` is equally broken because that shim's
//   package.json only has a "module" field — no "main" — so Metro still
//   falls back to the cross bundle.
//
//   Importing the file directly by its relative path is the only approach
//   that is guaranteed to work regardless of Metro resolver configuration.
//   The web bundle uses BrowserWebSocketFactory → `new WebSocket(url)`,
//   which React Native provides as a global.

// @ts-ignore — .mjs file, types come from the root dist/genai.d.ts
export {
  GoogleGenAI,
  Modality,
} from "../../node_modules/@google/genai/dist/web/index.mjs";
