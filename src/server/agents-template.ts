export const AGENTS_MD_TEMPLATE = `# Loracle Design Agent — Storybook Instructions

## Scope — CRITICAL

- You MUST only edit the **current story file** provided in context. Do NOT create new files.
- All changes — new stories, new compositions, new variants — go as **named exports** in the current file.
- **Single-file architecture**: All generated code (component + stories) lives in one \`.stories.tsx\` file.
- If the user asks for something unrelated to the current component, build it as a story composition within the current file using the existing component plus any additional Penny components.
- **Never read or edit files in \`.temp/\` directories.** These are internal staging files managed by the addon.

## Convention

- **Single-file stories**: Each component lives in a single \`.stories.tsx\` file under \`src/\` or \`__ai_drafts__/\`.
- **File naming**: Use \`ComponentName.stories.tsx\` format.

## MCP Tools

### \`get_components\`
Search the design system for existing UI components by natural-language query.
Use this to discover available Penny components, their props, and documentation.
**Always call this before writing code** to find the right components for what you see in the image.
Make multiple targeted queries (e.g. "form text input", "navigation tabs", "data table") rather than one broad query.

Example:
\`\`\`
get_components({ query: "button with loading state" })
get_components({ query: "form text field with label" })
get_components({ query: "page layout with sidebar" })
\`\`\`

## Type-Checking

- Always use TypeScript with strict mode
- Import types from the component library, do not re-declare
- Use \`satisfies\` for story type checking: \`const meta = { ... } satisfies Meta<typeof Component>\`
- Run \`tsc --noEmit\` mentally before finalizing code

## Image Handling

- Uploaded images are saved to \`__ai_drafts__/.uploads/\` and referenced by file path in the prompt
- When the user uploads an image, it appears as \`<uploaded_image path="..." />\`
- **Use the \`Read\` tool to view the image** — you have native vision and can see image files directly
- After viewing the image, use \`get_components\` with targeted queries to find matching Penny components
- Do NOT use \`analyze_ui\` — compose the code directly from what you see in the image + the component documentation from \`get_components\`

## Design System — @melio/penny

This project uses the **@melio/penny** design system as its primary component library.
All UI work MUST use Penny components instead of raw HTML or third-party UI libraries.

### Installation

\`@melio/penny\` is already installed. Do not add alternative UI libraries.

### Global Providers (already configured)

\`PennyProvider\` (with Chakra theme, icons, logos, illustrations) and \`IntlProvider\` are configured as **global decorators** in \`.storybook/preview.tsx\`. You do NOT need to add decorators for these in individual stories.

**Do NOT add per-story decorators for \`ChakraProvider\`, \`PennyProvider\`, or \`IntlProvider\`** — they are already applied globally.

### Import Pattern

\`\`\`tsx
// Component names vary — always verify via get_components before importing.
import { ComponentName } from "@melio/penny";
\`\`\`

### Key Component Props

- Use \`get_components\` MCP tool to discover available Penny components and their exact props — do not assume component names or props from memory

## Forms — useMelioForm + Penny Form

Penny's \`Form\` components (\`Form.TextField\`, \`Form.Select\`, etc.) use \`react-hook-form\` internally via \`useController\`. They **require** \`control\` and \`name\` props which come from Penny's \`useMelioForm\` hook.

### CRITICAL: Always use \`useMelioForm\` with \`registerField\` for Form.* components

\`\`\`tsx
import { Form, Button, useMelioForm } from "@melio/penny";

const MyFormStory = () => {
  const { registerField, formProps } = useMelioForm({
    onSubmit: (data) => console.log(data),
    defaultValues: { email: "", password: "" },
  });
  return (
    <>
      <Form {...formProps} columns={1}>
        <Form.TextField
          {...registerField("email")}
          labelProps={{ label: "Email" }}
          placeholder="you@example.com"
          isRequired
        />
      </Form>
      <Button label="Submit" variant="primary" />
    </>
  );
};

export const MyForm: Story = {
  render: () => <MyFormStory />,
};
\`\`\`

### Rules

- **NEVER** use \`Form.TextField\`, \`Form.Select\`, or any \`Form.*\` subcomponent without \`useMelioForm\` + \`registerField\`
- Always spread \`formProps\` onto the \`<Form>\` component: \`<Form {...formProps}>\`
- Always spread \`registerField("fieldName")\` onto each \`Form.*\` input — this provides the required \`control\` and \`name\` props
- Always pass \`defaultValues\` with keys matching every field name used in \`registerField()\`
- Since hooks cannot be called inside \`render:\` arrow functions directly, extract form stories into a named component (e.g., \`const MyFormRender = () => { ... }\`) and reference it from \`render: () => <MyFormRender />\`
- \`useMelioForm\` is exported from \`@melio/penny\` — do NOT import \`useForm\` from \`react-hook-form\` for Penny forms

## Styling

- Penny components handle their own styling via Chakra UI theme tokens
- Use Tailwind CSS utility classes (v4 syntax) only for layout and spacing around Penny components
- Use the project's \`cn()\` utility from \`@/lib/utils\` for class merging when needed
- Do NOT override Penny component styles with Tailwind

## Story Structure

\`\`\`tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@melio/penny";

const meta: Meta<typeof Button> = {
  title: "Penny/Button",
  component: Button,
  argTypes: { /* controls */ },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { label: "Click me", variant: "primary", size: "medium" },
};
\`\`\`

## Security Boundaries

- You do NOT have Bash/shell access. Do not attempt to run shell commands.
- You can only edit the current story file. Attempts to write to other files will be denied.
- Available tools: Read, Glob, Grep, Write, Edit, and MCP tools (get_components).

## Validation Required

You MUST typecheck the story file before completing any generation or modification. Fix any errors found.
`;
