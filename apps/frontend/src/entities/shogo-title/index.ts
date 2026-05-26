export type {
  ShogoTitle,
  CreateShogoTitleInput,
  UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';

export {
  createShogoTitle,
  deleteShogoTitle,
  getShogoTitles,
  updateShogoTitle,
} from './api/shogo-title.api.js';

export {
  shogoTitleKeys,
  listShogoTitlesQueryOptions,
  shogoTitleQueryOptions,
  useCreateShogoTitle,
  useDeleteShogoTitle,
  useUpdateShogoTitle,
} from './model/shogo-title.queries.js';
