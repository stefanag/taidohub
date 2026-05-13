import type { Meta, StoryObj } from '@storybook/react';

import { PostsPage } from './PostsPage.js';

const meta = {
  title: 'Pages/Posts',
  component: PostsPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PostsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
