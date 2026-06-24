import { Smile } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { FeedbackComment, FeedbackReaction } from '@repo/contracts/feedback';

import { useSession } from '@/features/auth-by-email';
import {
  useDeleteFeedbackCommentMutation,
  useRemoveFeedbackReactionMutation,
  useSetFeedbackReactionMutation,
  useUpdateFeedbackCommentMutation,
} from '@/entities/feedback';
import { formatDate } from '@/i18n/formatters';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover.js';

import { ReactionPicker } from './ReactionPicker.js';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface FeedbackCommentProps {
  comment: FeedbackComment;
  threadId: string;
  /** Called when the user clicks Reply on this comment. */
  onReply: (commentId: string) => void;
  /** Indent depth — `0` is top-level. */
  depth: number;
  /** Replies rendered by the parent thread (already recursed). */
  children?: React.ReactNode;
}

interface ReactionBucket {
  reaction: FeedbackReaction;
  count: number;
  userReacted: boolean;
}

/**
 * Single comment row + its reaction chip strip + its action buttons.
 * Replies of a comment are rendered as the `children` prop by the
 * thread tree so the recursion stays in one place.
 */
export function FeedbackComment({
  comment,
  threadId,
  onReply,
  depth,
  children,
}: FeedbackCommentProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const userId = session.data?.user.id ?? null;

  const isAuthor = !!userId && userId === comment.authorId;
  const isDeleted = comment.body === '[deleted]';
  const ageMs = Date.now() - new Date(comment.createdAt).getTime();
  const withinEditWindow = ageMs <= EDIT_WINDOW_MS;
  const canModify = isAuthor && withinEditWindow && !isDeleted;
  const wasEdited = comment.createdAt !== comment.updatedAt;

  const [editing, setEditing] = React.useState(false);
  const [editBody, setEditBody] = React.useState(comment.body);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [reactionOpen, setReactionOpen] = React.useState(false);

  const updateMut = useUpdateFeedbackCommentMutation();
  const deleteMut = useDeleteFeedbackCommentMutation();
  const setReactionMut = useSetFeedbackReactionMutation();
  const removeReactionMut = useRemoveFeedbackReactionMutation();

  // Group raw reactions into one bucket per reaction type, with a
  // `userReacted` flag for the actor.
  const buckets = React.useMemo<ReactionBucket[]>(() => {
    const map = new Map<FeedbackReaction, ReactionBucket>();
    for (const r of comment.reactions) {
      const existing = map.get(r.reaction) ?? {
        reaction: r.reaction,
        count: 0,
        userReacted: false,
      };
      existing.count += 1;
      if (userId && r.userId === userId) existing.userReacted = true;
      map.set(r.reaction, existing);
    }
    return Array.from(map.values());
  }, [comment.reactions, userId]);

  const onSelectReaction = (reaction: FeedbackReaction): void => {
    setReactionOpen(false);
    const existing = buckets.find((b) => b.reaction === reaction);
    if (existing?.userReacted) {
      removeReactionMut.mutate({ commentId: comment.id, threadId });
    } else {
      setReactionMut.mutate({ commentId: comment.id, reaction, threadId });
    }
  };

  const onChipClick = (reaction: FeedbackReaction, userReacted: boolean): void => {
    if (userReacted) {
      removeReactionMut.mutate({ commentId: comment.id, threadId });
    } else {
      setReactionMut.mutate({ commentId: comment.id, reaction, threadId });
    }
  };

  const onSaveEdit = (): void => {
    if (!editBody.trim()) return;
    updateMut.mutate(
      { commentId: comment.id, input: { body: editBody } },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <div
      className={[
        'flex flex-col gap-2 rounded-md',
        comment.instructorOnly ? 'bg-secondary-container/40' : '',
        depth > 0
          ? 'border-l-2 border-outline-variant pl-3'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex flex-col gap-1 p-2">
        <div className="flex flex-wrap items-baseline gap-2 text-sm">
          <span className="font-medium">
            {isDeleted ? t('feedback.deleted') : (comment.authorName ?? '—')}
          </span>
          <span className="text-xs text-on-surface-variant">
            {formatDate(comment.createdAt, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
          {wasEdited && !isDeleted ? (
            <span className="text-xs text-on-surface-variant">
              ({t('feedback.edited')})
            </span>
          ) : null}
          {comment.instructorOnly ? (
            <Badge variant="secondary" className="text-xs">
              {t('feedback.instructorOnly')}
            </Badge>
          ) : null}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              lang={i18n.language}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditBody(comment.body);
                }}
                disabled={updateMut.isPending}
              >
                {t('feedback.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onSaveEdit}
                disabled={updateMut.isPending || !editBody.trim()}
              >
                {t('feedback.save')}
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={[
              'whitespace-pre-wrap text-sm',
              isDeleted ? 'italic text-on-surface-variant' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {comment.body}
          </p>
        )}

        {buckets.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {buckets.map((b) => (
              <Button
                key={b.reaction}
                type="button"
                variant={b.userReacted ? 'default' : 'outline'}
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => onChipClick(b.reaction, b.userReacted)}
              >
                <span aria-hidden>{t(`feedback.reactions.${b.reaction}`)}</span>
                <span>{b.count}</span>
              </Button>
            ))}
          </div>
        ) : null}

        {!isDeleted && !editing ? (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onReply(comment.id)}
            >
              {t('feedback.reply')}
            </Button>
            <Popover open={reactionOpen} onOpenChange={setReactionOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  aria-label={t('feedback.react')}
                >
                  <Smile className="size-3.5" aria-hidden />
                  {t('feedback.react')}
                </Button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="p-1">
                <ReactionPicker onSelect={onSelectReaction} />
              </PopoverContent>
            </Popover>
            {canModify ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setEditing(true)}
                >
                  {t('feedback.edit')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t('feedback.delete')}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {children}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('feedback.confirmDelete')}</DialogTitle>
            <DialogDescription>{t('feedback.editWindow')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('feedback.cancel')}
            </Button>
            <Button
              onClick={() =>
                deleteMut.mutate(comment.id, {
                  onSuccess: () => setConfirmDelete(false),
                })
              }
              disabled={deleteMut.isPending}
            >
              {t('feedback.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
