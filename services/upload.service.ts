import type { IExecuteFunctions } from 'n8n-workflow';
import { USER_AGENT } from '../utils/constants';
import { pingenRequest } from './http.service';
import { contentTypeOrDefault, parseFileUploadResponse } from '../utils/response';

export interface UploadResult {
  signedUrl: string;
  signature: string;
}

export async function uploadBinaryToPingen(
  ctx: IExecuteFunctions,
  itemIndex: number,
  binaryPropertyName: string,
  apiUrl: string,
  headers: Record<string, string>,
): Promise<UploadResult> {
  const binaryData = ctx.helpers.assertBinaryData(itemIndex, binaryPropertyName);
  const fileBuffer = await ctx.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

  const uploadRaw = await pingenRequest(ctx, {
    method: 'GET',
    url: `${apiUrl}/file-upload`,
    headers,
  });
  const { url: signedUrl, url_signature: signature } = parseFileUploadResponse(uploadRaw);

  await pingenRequest(ctx, {
    method: 'PUT',
    url: signedUrl,
    body: fileBuffer,
    headers: { 'Content-Type': contentTypeOrDefault(binaryData.mimeType), 'User-Agent': USER_AGENT },
  });

  return { signedUrl, signature };
}
