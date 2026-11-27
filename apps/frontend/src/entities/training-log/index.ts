export type {
  SaveTrainingSessionInput,
  TrainingGoal,
  TrainingSession,
  TrainingSessionItem,
  TrainingSessionKind,
} from '@repo/contracts/training-log';
export { TRAINING_SESSION_KINDS } from '@repo/contracts/training-log';

export {
  createTrainingSession,
  deleteTrainingSession,
  getTrainingGoal,
  listTrainingSessions,
  saveTrainingGoal,
  updateTrainingSession,
} from './api/training-log.api.js';
export {
  trainingLogKeys,
  useTrainingGoalQuery,
  useTrainingLogMutation,
  useTrainingSessionsQuery,
} from './lib/hooks.js';
export { countSessionsThisWeek, weekStart } from './lib/week.js';
