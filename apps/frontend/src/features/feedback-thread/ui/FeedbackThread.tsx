import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type {
  FeedbackComment as FeedbackCommentType,
  FeedbackEntityType,
} from '@repo/contracts/feedback';

import { useSession } from '@/features/auth-by-email';
import {
  useCreateFeedbackCommentMutation,
  useCreateFeedbackThreadMutation,
  useFeedbackCommentsQuery,
  useFeedbackThreadQuery,
  useMarkFeedbackThreadReadMutation,
} from '@/entities/feedback';
import { FeatureFlag } from '@/shared/lib/feature-flags';
import { Button } from '@/shared/ui';

import { FeedbackComment } from './FeedbackComment.js';

export interface FeedbackThreadProps {
  entityType: FeedbackEntityType;
  entityId: string;
  studentId: string;
}

/**
 * Reusable conversation component. Looks up the existing thread by
 * `(entityType, entityId, studentId)`, loads its comments when the
 * thread exists, and renders a composer + the comment tree. Thread
 * creation is lazy: the first POST comment also POSTs the thread when
 * none yet exists.
 *
 * Gated by the `instructor-feedback` feature flag — when off the
 * outer `<FeatureFlag>` short-circuits before the inner
 * `FeedbackThreadContent` mounts, so no queries run, no react-query
 * keys get cached, and the backend never sees a flag-disabled
 * request.
 */
export function FeedbackThread(props: FeedbackThreadProps): React.ReactElement {
  return (
    <FeatureFlag code="instructor-feedback">
      <FeedbackThreadContent {...props} />
    </FeatureFlag>
  );
}

function FeedbackThreadContent({
  entityType,
  entityId,
  studentId,
}: FeedbackThreadProps): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const userId = session.data?.user.id ?? null;
  const isStudent = userId === studentId;

  const threadQuery = useFeedbackThreadQuery({ entityType, entityId, studentId });
  const thread = threadQuery.data ?? null;

  const commentsQuery = useFeedbackCommentsQuery(thread?.id ?? null);
  const comments: FeedbackCommentType[] = commentsQuery.data ?? [];

  const markRead = useMarkFeedbackThreadReadMutation();
  // Mark the thread read whenever its id changes and the comments
  // payload has resolved — once is enough, no need to retry on every
  // refetch.
  const readForThreadId = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!thread) return;
    if (commentsQuery.isPending) return;
    if (readForThreadId.current === thread.id) return;
    readForThreadId.current = thread.id;
    markRead.mutate(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, commentsQuery.isPending]);

  const createThread = useCreateFeedbackThreadMutation();
  const createComment = useCreateFeedbackCommentMutation();
  const pending = createThread.isPending || createComment.isPending;

  const [body, setBody] = React.useState('');
  const [instructorOnly, setInstructorOnly] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<string | null>(null);

  // Build the reply tree once per comments change.
  const { topLevel, replies } = React.useMemo(() => {
    const tl: FeedbackCommentType[] = [];
    const map = new Map<string, FeedbackCommentType[]>();
    for (const c of comments) {
      if (c.parentId === null) {
        tl.push(c);
      } else {
        const bucket = map.get(c.parentId) ?? [];
        bucket.push(c);
        map.set(c.parentId, bucket);
      }
    }
    return { topLevel: tl, replies: map };
  }, [comments]);


  const post = async (): Promise<void> => {
    const trimmed = body.trim();
    if (!trimmed) return;
    let activeThreadId = thread?.id ?? null;
    if (!activeThreadId) {
      const created = await createThread.mutateAsync({
        entityType,
        entityId,
        studentId,
      });
      activeThreadId = created.id;
    }
    const finalBody = trimmed;
    const finalReplyTo = replyTo;
    const finalInstructorOnly = isStudent ? false : instructorOnly;
    setBody('');
    setReplyTo(null);
    setInstructorOnly(false);
    await createComment.mutateAsync({
      threadId: activeThreadId,
      input: {
        body: finalBody,
        parentId: finalReplyTo ?? null,
        instructorOnly: finalInstructorOnly,
      },
    });
  };

  const renderTree = (node: FeedbackCommentType, depth: number): React.ReactNode => {
    const kids = replies.get(node.id) ?? [];
    return (
      <FeedbackComment
        key={node.id}
        comment={node}
        threadId={thread!.id}
        onReply={(id) => setReplyTo(id)}
        depth={depth}
      >
        {kids.length > 0 ? (
          <div className="flex flex-col gap-2 pl-3">
            {kids.map((k) => renderTree(k, depth + 1))}
          </div>
        ) : null}
      </FeedbackComment>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {threadQuery.isPending || (thread && commentsQuery.isPending) ? (
        <p className="text-sm text-on-surface-variant">{t('feedback.loading')}</p>
      ) : topLevel.length === 0 ? (
        <p className="text-sm text-on-surface-variant">{t('feedback.noComments')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {topLevel.map((c) => renderTree(c, 0))}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-outline-variant pt-3">
        {replyTo ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span>{t('feedback.replyingTo')}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setReplyTo(null)}
            >
              {t('feedback.cancel')}
            </Button>
          </div>
        ) : null}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={
            replyTo
              ? t('feedback.replyPlaceholder', { defaultValue: 'Write a reply…' })
              : t('feedback.placeholder', { defaultValue: 'Write a comment…' })
          }
          className="w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!isStudent ? (
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={instructorOnly}
                onChange={(e) => setInstructorOnly(e.target.checked)}
              />
              {t('feedback.instructorOnlyToggle')}
            </label>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={() => void post()}
            disabled={pending || !body.trim()}
            size="sm"
          >
            {t('feedback.post')}
          </Button>
        </div>
      </div>
    </div>
  );
}
