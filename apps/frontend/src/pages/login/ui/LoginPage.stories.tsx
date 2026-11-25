import { LoginPage } from './LoginPage.js';

import type { Meta, StoryObj } from '@storybook/react-vite';


const meta = {
  title: 'Pages/Login',
  component: LoginPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
