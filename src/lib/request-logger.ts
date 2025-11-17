import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type RequestLogParams = {
  userId?: string | null;
  endpoint: string;
  modelId: string;
  aspectRatioId?: string;
  responseStatus: number;
  responseTimeMs: number;
  falRequestId?: string;
  inputImageCount: number;
  requestPayloadSummary: Record<string, unknown>;
};

export async function logRequest({
  userId,
  endpoint,
  modelId,
  aspectRatioId,
  responseStatus,
  responseTimeMs,
  falRequestId,
  inputImageCount,
  requestPayloadSummary,
}: RequestLogParams) {
  try {
    await prisma.requestLog.create({
      data: {
        userId: userId ?? undefined,
        endpoint,
        modelId,
        aspectRatioId,
        responseStatus,
        responseTimeMs,
        falRequestId,
        inputImageCount,
        requestPayloadSummary: requestPayloadSummary as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("[requestLog] Failed to persist request log", error);
  }
}

