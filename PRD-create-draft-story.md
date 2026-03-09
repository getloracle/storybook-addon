# PRD: Create New Draft Story

## Problem

Users cannot create a new story from the Storybook addon UI. The chat panel only works in the context of an already-existing story selected in the sidebar. To prototype a brand-new component, a user must manually create a stub `.stories.tsx` file in `__ai_drafts__/`, wait for Storybook HMR to pick it up, navigate to it, and only then start chatting. This friction defeats the purpose of an AI-powered prototyping tool.

## Goal

Let users describe a new component in the chat panel and have the addon scaffold a draft story file in `__ai_drafts__/`, register it with Storybook, and navigate to it — all without leaving the UI.

## User Flow

1. User clicks a **"+ New Draft"** button in the addon panel (visible when no story is selected, or always visible in the status bar).
2. A dialog appears with:
   - **Component name** — text input (e.g. "LoginForm"). Used to derive the filename `LoginForm.stories.tsx`.
   - **Description** (optional) — textarea for initial prompt (e.g. "A login form with email, password, and submit button"). If provided, generation starts immediately after creation.
3. User clicks **"Create"**.
4. Backend:
   a. Validates the component name (alphanumeric, PascalCase).
   b. Writes a minimal scaffold file to `__ai_drafts__/<ComponentName>.stories.tsx`.
   c. Storybook's file watcher (already configured via `../__ai_drafts__/**/*.stories.@(ts|tsx)` in `main.ts`) picks up the new file.
   d. Returns the new story ID and file path.
5. Frontend navigates Storybook to the new story using `api.selectStory()`.
6. If an initial description was provided, the chat panel automatically sends it as the first prompt, triggering AI generation.

## Scaffold Template

The minimal file written to disk:

```tsx
import type { Meta, StoryObj } from "@storybook/react";

const ComponentName = () => <div>ComponentName</div>;

const meta: Meta<typeof ComponentName> = {
  title: "AI Drafts/ComponentName",
  component: ComponentName,
};

export default meta;
type Story = StoryObj<typeof ComponentName>;

export const Default: Story = {};
```

Key decisions:
- **`title: "AI Drafts/ComponentName"`** — groups all drafts under an "AI Drafts" folder in the sidebar for clear separation from production stories.
- Inline placeholder component — keeps the single-file architecture consistent with `AGENTS.md` conventions.
- Minimal boilerplate — Claude will replace the entire file content on the first generation anyway.

## API

### `POST /loracle-api/create-draft`

**Request body:**
```json
{
  "componentName": "LoginForm",
  "description": "A login form with email and password"
}
```

**Validation:**
- `componentName` is required, must match `/^[A-Z][a-zA-Z0-9]*$/` (PascalCase).
- Returns 409 if `__ai_drafts__/<componentName>.stories.tsx` already exists.

**Response (201):**
```json
{
  "created": true,
  "filePath": "__ai_drafts__/LoginForm.stories.tsx",
  "storyId": "ai-drafts-loginform--default"
}
```

The `storyId` follows Storybook's convention: kebab-case of `title` + `--` + export name. This is deterministic from the title `"AI Drafts/LoginForm"` → `ai-drafts-loginform--default`.

## UI Components

### NewDraftButton (StatusBar addition)

- A **"+ New"** button added to the right side of the existing `StatusBar`.
- Always visible regardless of current story context.
- Opens the `NewDraftDialog`.

### NewDraftDialog

Similar pattern to the existing `PromoteDialog`:

- Overlay + centered dialog.
- Fields: Component name (required), Description (optional textarea).
- Buttons: Cancel, Create.
- On submit: calls `POST /loracle-api/create-draft`, then navigates to the new story.
- Loading state while waiting for Storybook to register the story (poll `api.getData(storyId)` until it resolves, with a timeout).

### ChatPanel Changes

- After navigation to the new draft, if `description` was provided, auto-send it as the first chat message.
- No changes to existing chat flow — the new story is just a regular story file in `__ai_drafts__/`.

## Backend Changes

### middleware.ts

Add the `POST /loracle-api/create-draft` route.

### file-manager.ts

Add a `createDraftScaffold(componentName: string): string` method that:
1. Ensures `__ai_drafts__/` directory exists.
2. Writes the scaffold file using `atomicWrite`.
3. Returns the relative file path.

### prompt-builder.ts

No changes. The existing `scope_constraint` and file-reading logic already handle the new file once it exists.

### agents-template.ts

No changes. The `AGENTS.md` already instructs Claude to work within the current file.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Name conflict (`LoginForm.stories.tsx` already exists) | Return 409, show error in dialog: "A draft with this name already exists." |
| Invalid name (lowercase, spaces, special chars) | Client-side validation + 400 from server. Hint: "Use PascalCase (e.g. LoginForm)." |
| Storybook doesn't pick up the file (HMR delay) | Poll for up to 5s. If not found, show the file path and instruct user to refresh. |
| User creates draft but never sends a prompt | File persists as a valid placeholder story. No different from any other story. |
| User cancels dialog | No file created, no side effects. |

## Out of Scope

- **Delete/clear draft** — tracked separately, not part of this feature.
- **Bulk draft management** (list, rename, organize) — future iteration.
- **Custom target directory** — drafts always go to `__ai_drafts__/`. Use Promote to move them.
- **Nested folders within `__ai_drafts__/`** — flat structure for simplicity.

## Implementation Order

1. `FileManager.createDraftScaffold()` — scaffold generation logic.
2. `POST /loracle-api/create-draft` — middleware route.
3. `NewDraftDialog` component — form UI.
4. `StatusBar` — add "+ New" button.
5. `ChatPanel` — auto-send description, navigate after creation.
6. Test end-to-end: create → navigate → chat → promote.
