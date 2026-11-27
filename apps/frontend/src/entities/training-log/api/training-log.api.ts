import { TrainingLogRoutes } from '@repo/contracts/routes';
import {
  TrainingGoalSchema,
  TrainingSessionSchema,
  type ListTrainingSessionsQuery,
  type SaveTrainingSessionInput,
  type TrainingGoal,
  type TrainingSession,
} from '@repo/contracts/training-log';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

export async function listTrainingSessions(
  range: ListTrainingSessionsQuery = {},
): Promise<TrainingSession[]> {
  const raw = await httpClient(TrainingLogRoutes.sessions, {
    query: { from: range.from, to: range.to },
  });
  return z.array(TrainingSessionSchema).parse(raw);
}

export async function createTrainingSession(
  input: SaveTrainingSessionInput,
): Promise<TrainingSession> {
  const raw = await httpClient(TrainingLogRoutes.sessions, { method: 'POST', body: input });
  return TrainingSessionSchema.parse(raw);
}

export async function updateTrainingSession(args: {
  id: string;
  input: SaveTrainingSessionInput;
}): Promise<TrainingSession> {
  const raw = await httpClient(TrainingLogRoutes.session(args.id), {
    method: 'PUT',
    body: args.input,
  });
  return TrainingSessionSchema.parse(raw);
}

export async function deleteTrainingSession(id: string): Promise<void> {
  await httpClient(TrainingLogRoutes.session(id), { method: 'DELETE' });
}

export async function getTrainingGoal(): Promise<TrainingGoal> {
  return TrainingGoalSchema.parse(await httpClient(TrainingLogRoutes.goal));
}

export async function saveTrainingGoal(input: TrainingGoal): Promise<TrainingGoal> {
  return TrainingGoalSchema.parse(
    await httpClient(TrainingLogRoutes.goal, { method: 'PUT', body: input }),
  );
}
