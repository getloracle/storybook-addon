import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: [
    "../stories/**/*.stories.@(ts|tsx)",
    "../__ai_drafts__/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-essentials", "@loracle-js/storybook-addon"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
