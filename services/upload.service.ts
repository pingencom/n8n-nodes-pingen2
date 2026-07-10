import type { IExecuteFunctions } from 'n8n-workflow';
import { USER_AGENT } from '../utils/constants';
import { getPingenHeaders } from './auth.service';
import { pingenRequest, pingenRawRequest } from './http.service';
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
  credentialsType: string,
): Promise<UploadResult> {
  const binaryData = ctx.helpers.assertBinaryData(itemIndex, binaryPropertyName);
  const fileBuffer = await ctx.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

  const uploadRaw = await pingenRequest(ctx, credentialsType, {
    method: 'GET',
    url: `${apiUrl}/file-upload`,
    headers: getPingenHeaders(),
  });
  const { url: signedUrl, url_signature: signature } = parseFileUploadResponse(uploadRaw);

  // The pre-signed storage URL authenticates via its own query signature, so this PUT goes
  // out WITHOUT the Pingen bearer token (hence pingenRawRequest, not pingenRequest).
  await pingenRawRequest(ctx, {
    method: 'PUT',
    url: signedUrl,
    body: fileBuffer,
    headers: { 'Content-Type': contentTypeOrDefault(binaryData.mimeType), 'User-Agent': USER_AGENT },
  });

  return { signedUrl, signature };
}
