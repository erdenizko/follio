import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logRequest } from "@/lib/request-logger";
import { historyQuerySchema } from "@/lib/validation/generate";

const HISTORY_MODEL_ID = "history";

export async function GET(request: Request) {
  const startedAt = Date.now();
  let status = 500;
  let userId: string | undefined;

  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.session || !session?.user) {
      status = 401;
      return NextResponse.json({ error: "Unauthorized" }, { status });
    }

    userId = session.user.id;

    const searchParams = Object.fromEntries(new URL(request.url).searchParams);
    const { limit, offset } = historyQuerySchema.parse(searchParams);

    const jobs = await prisma.thumbnailJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        status: true,
        aspectRatioId: true,
        aspectRatioString: true,
        customWidth: true,
        customHeight: true,
        falResultUrl: true,
        falResultUrls: true,
        falRequestId: true,
        createdAt: true,
        updatedAt: true,
        inputImagesMetadata: true,
      },
    });

    status = 200;
    return NextResponse.json({ jobs }, { status });
  } catch (error) {
    console.error("[history] failed", error);
    if (error instanceof ZodError) {
      status = 400;
      return NextResponse.json(
        { error: "ValidationError", details: error.flatten() },
        { status },
      );
    }

    status = status === 401 ? status : 500;
    return NextResponse.json(
      {
        error: "InternalServerError",
        details:
          error instanceof Error ? error.message : "Unable to fetch history.",
      },
      { status },
    );
  } finally {
    const latency = Date.now() - startedAt;
    try {
      await logRequest({
        userId,
        endpoint: "/api/history",
        modelId: HISTORY_MODEL_ID,
        aspectRatioId: undefined,
        responseStatus: status,
        responseTimeMs: latency,
        inputImageCount: 0,
        falRequestId: undefined,
        requestPayloadSummary: {},
      });
    } catch (logError) {
      console.error("[history] failed to log request", logError);
    }
  }
}

