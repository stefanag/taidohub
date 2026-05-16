export type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  ListOrganisationsResponse,
  Organisation,
  OrganisationType,
  UpdateOrganisationInput,
} from '@repo/contracts/organisations';

export {
  createOrganisation,
  deleteOrganisation,
  getOrganisation,
  listOrganisations,
  updateOrganisation,
} from './api/organisation.api.js';

export {
  listOrganisationsQueryOptions,
  organisationKeys,
  organisationQueryOptions,
  useCreateOrganisation,
  useDeleteOrganisation,
  useUpdateOrganisation,
  type UpdateOrganisationVariables,
} from './model/organisation.queries.js';

export { buildTree, type OrganisationNode } from './lib/buildTree.js';
export { displayName } from './lib/displayName.js';
