import { fal } from "@fal-ai/client";

import type { FalWorkflowInput } from "@/lib/generation";

const workflowPath = process.env.FAL_WORKFLOW_PATH || "workflows/erdenizkorkmaz1/cover-generator";

if (!workflowPath) {
  throw new Error("FAL_WORKFLOW_PATH is not defined.");
}

let falConfigured = false;

function ensureFalConfigured() {
  if (falConfigured) {
    return;
  }

  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("FAL_API_KEY is not configured.");
  }

  fal.config({
    credentials: apiKey,
  });
  falConfigured = true;
}

export type FalExecutionResult = {
  requestId: string;
  response: unknown;
};

export async function runFalWorkflow(input: FalWorkflowInput) {
  ensureFalConfigured();
  console.log("input", input);
  const stream = await fal.stream(workflowPath, {
    input,
  });

  for await (const event of stream) {
    if (process.env.NODE_ENV === "development") {
      console.debug("[fal.stream] event", event);
    }
  }

  const response = await stream.done();
  return <FalExecutionResult>{
    requestId: stream.requestId,
    response,
  };
}

