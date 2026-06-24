import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_ENTITY_TYPES,
  FEEDBACK_REACTIONS,
} from '@repo/contracts/feedback';

import {
  feedbackEntityType,
  feedbackReactionType,
} from '../../infrastructure/database/schema/feedback.js';

describe('Feedback enum alignment between @repo/contracts and the Drizzle schema', () => {
  it('feedback_entity_type matches FEEDBACK_ENTITY_TYPES', () => {
    expect([...feedbackEntityType.enumValues].sort()).toEqual(
      [...FEEDBACK_ENTITY_TYPES].sort(),
    );
  });

  it('feedback_reaction_type matches FEEDBACK_REACTIONS', () => {
    expect([...feedbackReactionType.enumValues].sort()).toEqual(
      [...FEEDBACK_REACTIONS].sort(),
    );
  });
});
