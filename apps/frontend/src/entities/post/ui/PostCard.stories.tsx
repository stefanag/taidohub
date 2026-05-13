import type { Meta, StoryObj } from '@storybook/react-vite';

import { PostCard } from './PostCard.js';

const meta = {
  title: 'Entities/Post/PostCard',
  component: PostCard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof PostCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Published: Story = {
  args: {
    post: {
      id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
      authorId: '4a3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
      title: 'Hello, world!',
      content: 'My first post.',
      published: true,
      createdAt: '2025-04-02T08:00:00.000Z',
      updatedAt: '2025-04-02T08:00:00.000Z',
    },
  },
};

export const Draft: Story = {
  args: {
    post: {
      ...Published.args!.post,
      title: 'A draft post',
      content: 'Still writing this one…',
      published: false,
    },
  },
};
