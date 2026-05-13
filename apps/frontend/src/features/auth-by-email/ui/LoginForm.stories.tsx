import type { Meta, StoryObj } from '@storybook/react';

import { LoginForm } from './LoginForm.js';

const meta = {
  title: 'Features/Auth/LoginForm',
  component: LoginForm,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof LoginForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
