import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('shows the full AI电网投标助手 product name', () => {
    render(<LoginPage />);

    expect(screen.getByText('AI电网投标助手')).toBeInTheDocument();
    expect(screen.getByText('登录AI电网投标助手')).toBeInTheDocument();
  });

  it('submits the visible login form without storing credentials itself', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    await user.type(screen.getByLabelText('邮箱'), 'manager@example.com');
    await user.type(screen.getByLabelText('密码'), 'safe-password');
    await user.click(screen.getByRole('button', { name: '登录' }));

    expect(onLogin).toHaveBeenCalledWith({
      email: 'manager@example.com',
      password: 'safe-password',
      remember: true,
    });
  });

  it('switches to the intentionally unavailable registration state', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('tab', { name: '注册' }));

    expect(screen.getByText('注册入口将在企业管理员审核后开放。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交注册申请' })).toBeDisabled();
  });
});
