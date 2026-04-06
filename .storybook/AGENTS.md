# Storybook Draft Story Authoring — Agent Guide

You are editing a single Storybook story file (CSF 3.0 format) inside this repository. Your output must compile and render without errors in the running Storybook dev server. Broken imports, missing providers, or unknown exports will crash HMR and block the user.


## Using `@vibe/core` (monday.com Vibe Design System)

### Required setup — import tokens CSS

Vibe requires its design tokens stylesheet to be loaded for components to render correctly. **Every story file that uses Vibe components must import the tokens CSS at the top of the file:**

```tsx
import "@vibe/core/tokens";
```

This is a plain CSS side-effect import — it has no named exports and only needs to appear once per file. Without it, Vibe components render with broken colors, spacing, and typography.

### No ThemeProvider required (for default theme)

Unlike Chakra or MUI, Vibe does **not** require wrapping your tree in a provider for the default light theme to work. `ThemeProvider` is exported from `@vibe/core` but it is **optional** and only needed if you want a custom theme. For draft stories, skip it and just use components directly.

### Minimal example

```tsx
import "@vibe/core/tokens";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { <Component> } from "@vibe/core";


const meta: Meta<typeof LoginForm> = { title: "AI Drafts/Demo", component: LoginForm };
export default meta;
type Story = StoryObj<typeof LoginForm>;

export const Default: Story = {};
```

