import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { getApiUrl, normalizeEnvironment } from '../utils/constants';
import { credentialNameForEnvironment, getPingenHeaders } from './auth.service';
import { safeParseJson } from '../utils/response';

// Shared by both the Pingen action node and the trigger to populate the "Organisation"
// dropdown. Reads the environment currently selected on the node and lists organisations
// the authenticated credential can see.
export async function loadOrganisationOptions(ctx: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
  const env = normalizeEnvironment((ctx.getCurrentNodeParameter('environment') as string | undefined) ?? 'production');
  const res = await ctx.helpers.httpRequestWithAuthentication.call(ctx, credentialNameForEnvironment(env), {
    method: 'GET',
    url: `${getApiUrl(env)}/organisations`,
    headers: getPingenHeaders(),
  });
  const parsed = safeParseJson<{
    data: Array<{
      id: string;
      type: string;
      attributes: { name: string; status: string; plan: string };
    }>;
  }>(res, 'organisations');
  return parsed.data.map((org) => {
    const { name, status } = org.attributes;
    const suffix = status === 'active' ? '' : ` [${status}]`;
    return { name: `${name}${suffix}`, value: org.id };
  });
}
