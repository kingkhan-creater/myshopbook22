'use server';

import { v2 as cloudinary } from 'cloudinary';

// Using credentials provided by the user for dev environment
const config = {
  cloud_name: 'dp7j6mtdb',
  api_key: '123461125332476',
  api_secret: 'SCJrdaC1xC8EyMJfyGSKcVxYlCs',
};

cloudinary.config(config);

/**
 * Generates a signed upload signature for direct client-side upload to Cloudinary.
 * This is more efficient for large video files than sending them through Next.js server actions.
 */
export async function getCloudinarySignature(folder: string = 'shopbook_videos') {
  const timestamp = Math.round(new Date().getTime() / 1000);
  
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp: timestamp,
      folder: folder,
    },
    config.api_secret
  );

  return {
    signature,
    timestamp,
    cloudName: config.cloud_name,
    apiKey: config.api_key,
    folder,
  };
}
