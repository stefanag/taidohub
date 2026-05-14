import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from './badge.js';

const meta = {
  title: 'Shared/Badge',
  component: Badge,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'New' } };

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Secondary' },
};

export const Destructive: Story = {
  args: { variant: 'destructive', children: 'Destructive' },
};

export const Outline: Story = {
  args: { variant: 'outline', children: 'Outline' },
};
