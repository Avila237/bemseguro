// Itens do menu lateral. Compartilhado entre Sidebar (links) e Topbar (titulo
// da pagina atual). As paginas em si serao adicionadas depois em src/pages/.
export const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊', end: true },
  { to: '/ordens', label: 'Ordens de Serviço', icon: '📋' },
  { to: '/nova-cotacao', label: 'Nova Cotação', icon: '➕' },
  { to: '/seguradoras', label: 'Seguradoras', icon: '🏢' },
  { to: '/monitoring', label: 'Monitoring', icon: '📈' },
  { to: '/api-keys', label: 'API Keys', icon: '🔑' },
  { to: '/audit-log', label: 'Audit Log', icon: '📜' },
];

// Resolve o titulo da pagina a partir do pathname (sem o basename /admin).
export function tituloDaRota(pathname) {
  const item = NAV_ITEMS.find(i => i.to === pathname);
  return item ? item.label : 'Dashboard';
}
