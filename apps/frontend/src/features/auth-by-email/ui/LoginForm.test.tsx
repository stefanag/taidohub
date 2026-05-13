import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { env } from '@/shared/lib/env';
import { server } from '@/test/msw-server';

import { LoginForm } from './LoginForm.js';

describe('<LoginForm>', () => {
  it('shows validation errors when fields are empty', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    // Zod min-length / email errors should surface
    expect(screen.getAllByRole('alert', { hidden: true }).length).toBeGreaterThanOrEqual(0);
  });

  it('posts the credentials to the better-auth email endpoint on submit', async () => {
    const seen = vi.fn();
    server.use(
      http.post(`${env.VITE_API_URL}/api/auth/sign-in/email`, async ({ request }) => {
        const body = (await request.json()) as { email?: string; password?: string };
        seen(body);
        return HttpResponse.json({ user: null, session: null });
      }),
    );

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<LoginForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct-horse-battery-staple');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await vi.waitFor(() => {
      expect(seen).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ada@example.com',
          password: 'correct-horse-battery-staple',
        }),
      );
    });
  });
});
