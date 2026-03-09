import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/manager.ts"],
    format: ["esm"],
    dts: true,
    platform: "browser",
    outDir: "dist",
    external: ["react", "react-dom", "storybook"],
    clean: false,
  },
  {
    entry: ["src/preview.tsx"],
    format: ["esm"],
    dts: true,
    platform: "browser",
    outDir: "dist",
    external: ["react", "react-dom", "storybook"],
    clean: false,
  },
  {
    entry: ["src/preset.ts"],
    format: ["esm"],
    dts: true,
    platform: "node",
    outDir: "dist",
    external: ["express"],
    clean: false,
  },
]);
