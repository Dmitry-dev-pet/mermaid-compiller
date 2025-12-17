import type { StudioActionsDeps } from './studio/actionsContext';
import { createStudioContext } from './studio/actionsContext';
import { createBuildHandler } from './studio/build';
import { createChatHandler } from './studio/chat';
import { createAnalyzeHandler, createFixSyntaxHandler, createRecompileHandler } from './studio/compile';

export const createStudioActions = (deps: StudioActionsDeps) => {
  const ctx = createStudioContext(deps);

  return {
    handleChatMessage: createChatHandler(ctx),
    handleBuildFromPrompt: createBuildHandler(ctx),
    handleRecompile: createRecompileHandler(ctx),
    handleFixSyntax: createFixSyntaxHandler(ctx),
    handleAnalyze: createAnalyzeHandler(ctx),
  };
};

