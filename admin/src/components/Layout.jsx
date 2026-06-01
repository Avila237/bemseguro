import Sidebar from './Sidebar.jsx';

// Shell do painel: Sidebar fixa + coluna de conteúdo. Cada página (via <Page>)
// renderiza sua própria Topbar com as ações específicas da tela.
export default function Layout({ children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
