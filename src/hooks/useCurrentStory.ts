import { useStorybookApi, useStorybookState } from "storybook/internal/manager-api";

type StoryInfo = {
  storyId: string | null;
  storyTitle: string | null;
  storyFilePath: string | null;
};

export function useCurrentStory(): StoryInfo {
  const api = useStorybookApi();
  const state = useStorybookState();

  // state.storyId is reactively updated by Storybook when the story changes
  const currentStoryId = state?.storyId;

  if (!currentStoryId) {
    return { storyId: null, storyTitle: null, storyFilePath: null };
  }

  const data = api?.getData(currentStoryId);

  if (!data || !("id" in data)) {
    return { storyId: null, storyTitle: null, storyFilePath: null };
  }

  const importPath = (data as any).importPath as string | undefined;

  return {
    storyId: data.id as string,
    storyTitle: data.title as string,
    storyFilePath: importPath || null,
  };
}
