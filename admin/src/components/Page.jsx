import Topbar from './Topbar.jsx';

// Wrapper de página: Topbar (com ações da própria tela) + corpo rolável.
// Cada tela renderiza <Page title subtitle actions>conteúdo</Page>.
export default function Page({ title, subtitle, actions, children, max = 1200 }) {
  return (
    <>
      <Topbar title={title} subtitle={subtitle} actions={actions} />
      <div className="scroll" style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: max, margin: '0 auto', padding: '24px 28px 36px' }}>{children}</div>
      </div>
    </>
  );
}
