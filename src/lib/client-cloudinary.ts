/**
 * Client-side Cloudinary upload utilities
 * This allows large files to be uploaded directly to Cloudinary from the browser,
 * bypassing Vercel's serverless function body size limits (4.5MB)
 */

type UploadSignatureResponse = {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
  uploadUrl: string;
};

type CloudinaryUploadResponse = {
  secure_url: string;
  public_id: string;
  bytes: number;
  width: number;
  height: number;
  format: string;
  resource_type: string;
};

/**
 * Get upload signature from the server
 */
async function getUploadSignature(): Promise<UploadSignatureResponse> {
  const response = await fetch('/api/upload-signature', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to get upload signature' }));
    throw new Error(error.error || 'Failed to get upload signature');
  }

  return response.json();
}

/**
 * Upload a file directly to Cloudinary from the browser
 * @param file - The file to upload
 * @param onProgress - Optional callback for upload progress (0-100)
 * @returns The Cloudinary upload response with secure_url
 */
export async function uploadToCloudinary(
  file: File,
  onProgress?: (progress: number) => void
): Promise<CloudinaryUploadResponse> {
  // Get upload signature from server
  const signatureData = await getUploadSignature();

  // Create form data for Cloudinary upload
  const formData = new FormData();
  formData.append('file', file);
  formData.append('signature', signatureData.signature);
  formData.append('timestamp', signatureData.timestamp.toString());
  formData.append('api_key', signatureData.apiKey);
  formData.append('folder', signatureData.folder);

  // Upload directly to Cloudinary with progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(Math.round(percentComplete));
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response: CloudinaryUploadResponse = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (error) {
          reject(new Error('Failed to parse Cloudinary response'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error?.message || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.open('POST', signatureData.uploadUrl);
    xhr.send(formData);
  });
}

/**
 * Upload multiple files to Cloudinary
 * @param files - Array of files to upload
 * @param onProgress - Optional callback for overall progress
 * @returns Array of Cloudinary upload responses
 */
export async function uploadMultipleToCloudinary(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<CloudinaryUploadResponse[]> {
  const results: CloudinaryUploadResponse[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const result = await uploadToCloudinary(file);
    results.push(result);
    
    if (onProgress) {
      onProgress(i + 1, files.length);
    }
  }

  return results;
}

/**
 * Convert a base64 data URL to a File object
 */
export function dataURLtoFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0]?.match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new File([u8arr], filename, { type: mime });
}

