import type { IExecuteFunctions } from 'n8n-workflow';
import { requireNonEmpty } from './validation';

export function readEncodedIdParam(
  ctx: IExecuteFunctions,
  itemIndex: number,
  paramName: string,
  humanLabel: string,
): string {
  return encodeURIComponent(requireNonEmpty(ctx.getNodeParameter(paramName, itemIndex) as string, humanLabel));
}
