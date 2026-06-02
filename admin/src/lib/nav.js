// Itens do menu lateral. Compartilhado entre Sidebar (links) e Topbar (título
// da pagina atual). `icon` é a chave do mapa em components/Icons.jsx.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'grid', end: true },
  { to: '/ordens', label: 'Ordens de Serviço', icon: 'list' },
  { to: '/nova-cotacao', label: 'Nova Cotação', icon: 'plus' },
  { to: '/seguradoras', label: 'Seguradoras', icon: 'shield' },
  { to: '/monitoring', label: 'Monitoring', icon: 'activity' },
  { to: '/api-keys', label: 'API Keys', icon: 'key' },
  { to: '/audit-log', label: 'Audit Log', icon: 'history' },
  { to: '/ajuda', label: 'Ajuda & Docs', icon: 'help' },
];

// Resolve o título da página a partir do pathname (sem o basename /admin).
export function tituloDaRota(pathname) {
  const item = NAV_ITEMS.find(i => i.to === pathname);
  return item ? item.label : 'Dashboard';
}
