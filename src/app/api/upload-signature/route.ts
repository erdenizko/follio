import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

import { auth } from "@/lib/auth";

// Configure route
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER ?? "cover-generator";

function ensureCloudinaryConfigured() {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({ secure: true });
    return;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Missing Cloudinary configuration");
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/**
 * Generate Cloudinary upload signature for client-side uploads
 * This allows large files to be uploaded directly to Cloudinary from the browser,
 * bypassing Vercel's body size limits
 */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    ensureCloudinaryConfigured();

    const folder = `${DEFAULT_FOLDER}/${session.user.id}`;
    const timestamp = Math.round(Date.now() / 1000);
    
    // Sign ALL parameters that will be sent (except: file, cloud_name, resource_type, api_key)
    // Cloudinary requires all sent parameters to be included in the signature
    // Use string values to match exactly what the client sends in form data
    // Parameters are sorted alphabetically by the SDK automatically
    const uploadParams = {
      folder,
      overwrite: "false",
      timestamp,
      unique_filename: "true",
      use_filename: "true",
    };

    // Generate signature
    const signature = cloudinary.utils.api_sign_request(
      uploadParams,
      process.env.CLOUDINARY_API_SECRET || cloudinary.config().api_secret!
    );

    // Return all necessary data for client-side upload
    return NextResponse.json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || cloudinary.config().cloud_name,
      apiKey: process.env.CLOUDINARY_API_KEY || cloudinary.config().api_key,
      folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME || cloudinary.config().cloud_name}/image/upload`,
    });
  } catch (error) {
    console.error("[upload-signature] failed", error);
    return NextResponse.json(
      {
        error: "SignatureGenerationFailed",
        details: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 }
    );
  }
}

