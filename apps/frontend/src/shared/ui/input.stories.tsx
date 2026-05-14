import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from './input.js';

const meta = {
  title: 'Shared/Input',
  component: Input,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'New' } };

export const Cleanauth: Story = {
  args: { variant: 'cleanuth', children: 'Secondary' },
};
