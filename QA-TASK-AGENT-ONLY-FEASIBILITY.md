# QA Task: Validate agent-only image-to-code feasibility (without `analyze_ui`)

## Thesis to validate or disprove

> **A coding agent (Claude) that can see an image natively and has access to the `get_components` MCP tool can produce working Storybook stories from UI screenshots at comparable quality to the current `analyze_ui` pipeline — without needing the image to be sent to the MCP server.**

Currently, when a user uploads a UI screenshot in the storybook addon, the image is base64-encoded and embedded as raw text in the agent's prompt. The agent then calls `analyze_ui` (a remote MCP tool) passing the base64, which runs a multi-step vision pipeline and returns a component tree. This approach is broken for large images because the base64 text exceeds prompt limits ("Prompt is too long" error).

The proposed alternative: remove `analyze_ui` from the agent's workflow entirely. Instead, the agent uses its native vision (via the `Read` tool) to see the image, then calls `get_components` to find the right design system components, and writes the code directly. This eliminates the image transport problem.

**Your job is to test whether this actually works in practice.**

## Background

- The storybook addon spawns a Claude CLI agent with restricted tools: `Read`, `Edit`, `Write`, `Glob`, `Grep`, `mcp__loracle__get_components`, `mcp__loracle__analyze_ui`
- The agent's job: take a UI screenshot + user prompt, and produce a working Storybook story file using components from the Penny design system
- `get_components` is a natural language search tool over the design system — you describe what you need, it returns matching components with props and documentation
- `analyze_ui` is a vision pipeline that takes a base64 image and returns a structured component tree — we want to determine if this step is necessary
- The agent code lives in `packages/storybook-addon/`

## What to do

### Step 1: Modify the storybook addon to remove `analyze_ui` and use native vision

Make these changes to the storybook addon:

1. **`packages/storybook-addon/src/server/prompt-builder.ts`**: Remove the base64 embedding from the prompt. Instead, include only the image file path so the agent can `Read` it:
   ```
   // REMOVE this:
   parts.push(`<uploaded_image path="${opts.image.path}" mimeType="${opts.image.mimeType}" base64="${opts.image.base64}" />`);

   // REPLACE with:
   parts.push(`<uploaded_image path="${opts.image.path}" />`);
   ```

2. **`packages/storybook-addon/src/server/agents-template.ts`**: Update the AGENTS.md instructions to tell the agent:
   - Use the `Read` tool to view uploaded images (Claude can see images natively via Read)
   - Use `get_components` to search for design system components that match what it sees
   - Do NOT use `analyze_ui` — compose the code directly from the image + component documentation

3. **`packages/storybook-addon/src/server/cli-adapter.ts`**: Remove `mcp__loracle__analyze_ui` from the `allowedTools` list so the agent can only use `get_components`.

4. **Ensure `.mcp.json` in the project root points to the local visual analyzer** at `http://localhost:3002` (not the remote `https://mcp.getloracle.com`).

### Step 2: Run the local visual analyzer service

```bash
cd packages/visual-analyzer-service
npm run dev
```

This starts the MCP server on port 3002. Verify with `curl http://localhost:3002/health`.

### Step 3: Run Storybook and test with multiple images

Start Storybook:
```bash
cd packages/developer-portal-web
npm run storybook
```

Test with at least 5 different UI screenshots of varying complexity. Source them from real product UIs (Dribbble, existing apps, or screenshots from the Penny design system's own documentation). Suggested test cases:

1. **Simple**: A login form (email input, password input, submit button, heading)
2. **Medium**: A settings page with tabs, form fields, toggle switches
3. **Complex**: A data table dashboard with filters, search, pagination, status badges (use the image at `packages/developer-portal-web/.storybook/ai-sessions/ai-drafts-testdashboard--default.chat.json` — extract the base64 from message 0's `image.base64` field and decode it)
4. **Card layout**: A grid of product/info cards with images, text, and action buttons
5. **Empty state**: A page with an illustration, heading, description, and CTA button

For each test:
1. Upload the screenshot in the storybook addon chat
2. Prompt: "Implement the following design using loracle mcp"
3. Wait for the agent to complete
4. Check if the story renders in Storybook without errors

### Step 4: Evaluate results

For each test case, record:

#### A. Component selection accuracy
- List every component the agent chose
- List what the correct components should be (based on the Penny design system)
- Score: what percentage of components were correctly identified?
- Note any components the agent missed or hallucinated (used a component that doesn't exist in Penny)

#### B. Layout accuracy
- Does the visual structure match the screenshot? (vertical/horizontal arrangement, nesting, spacing)
- Did the agent find and use the right layout components (Group, Layout, Container, etc.) via `get_components`?
- Score 1-5: 1 = completely wrong layout, 5 = matches screenshot closely

#### C. Code quality
- Does the story compile without errors?
- Does it render in Storybook?
- Are props used correctly (based on the component documentation returned by `get_components`)?
- Is the code idiomatic React/Storybook?

#### D. `get_components` effectiveness
- How many times did the agent call `get_components`?
- Were the queries reasonable for what was in the image?
- Did `get_components` return the right components for those queries?
- Note any queries where the agent couldn't find what it needed

### Step 5: Comparison baseline (optional but valuable)

If time allows, for 1-2 of the test images, also test the ORIGINAL flow (with `analyze_ui` still enabled, using a small enough image that doesn't trigger "Prompt is too long"). Compare the quality of the output. This gives a direct baseline comparison.

To do this: revert the code changes from Step 1, keep `analyze_ui` in the allowed tools, and use a small image (under 100KB base64, roughly 400x300px JPEG).

## Success criteria

The thesis is **validated** if:
- The agent successfully produces rendering Storybook stories for at least 3 of 5 test cases
- Component selection accuracy is >70% on average
- Layout accuracy averages 3+ out of 5
- The agent effectively uses `get_components` to discover components (doesn't hallucinate Penny component names)

The thesis is **disproved** if:
- The agent fails to produce rendering code for more than 2 of 5 test cases
- The agent consistently hallucinates component names instead of using `get_components`
- Layout is fundamentally broken (score 1-2) on most test cases
- `get_components` consistently fails to return useful results for the agent's queries

## Test credentials

- **MCP endpoint (local)**: `http://localhost:3002`
- **MCP endpoint (remote)**: `https://mcp.getloracle.com`
- **API key**: `Bearer sk_live_4QMh4AimDMcjRYCyQ5HuWQ` (from `.mcp.json` in project root)
- **Project**: determined server-side from the API key

## Deliverable

A markdown report with:
1. Pass/fail verdict on the thesis
2. Results table for each test case (component accuracy, layout score, code quality notes)
3. `get_components` query log with effectiveness notes
4. Specific failure patterns observed (if any)
5. Recommendations: what would need to improve for this approach to work reliably
