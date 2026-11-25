import { AdminAuditLogPage } from './AdminAuditLogPage.js';

import type { Meta, StoryObj } from '@storybook/react-vite';


const meta = {
  title: 'Pages/AdminAuditLog',
  component: AdminAuditLogPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AdminAuditLogPage>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
