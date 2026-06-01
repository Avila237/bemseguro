import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import Topbar from '../Topbar.jsx';

describe('Topbar', () => {
  test('exibe o titulo da pagina', () => {
    render(<Topbar title="Seguradoras" />);
    expect(screen.getByRole('heading', { name: 'Seguradoras' })).toBeInTheDocument();
  });

  test('exibe o botao Nova Cotação', () => {
    render(<Topbar title="Dashboard" />);
    expect(screen.getByRole('button', { name: 'Nova Cotação' })).toBeInTheDocument();
  });

  test('exibe o sino de notificacao', () => {
    render(<Topbar title="Dashboard" />);
    expect(screen.getByRole('button', { name: 'Notificações' })).toBeInTheDocument();
  });

  test('exibe o nome do usuario e iniciais no avatar', () => {
    render(<Topbar title="Dashboard" userName="Guilherme Avila" />);
    expect(screen.getByText('Guilherme Avila')).toBeInTheDocument();
    expect(screen.getByText('GA')).toBeInTheDocument();
  });

  test('usa "Admin" como nome padrao', () => {
    render(<Topbar title="Dashboard" />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  test('dispara onNovaCotacao ao clicar no botao', async () => {
    const onNovaCotacao = vi.fn();
    render(<Topbar title="Dashboard" onNovaCotacao={onNovaCotacao} />);
    await userEvent.click(screen.getByRole('button', { name: 'Nova Cotação' }));
    expect(onNovaCotacao).toHaveBeenCalledTimes(1);
  });
});
