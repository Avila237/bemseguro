import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../lib/nav.js';

export default function Sidebar() {
  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-gray-100">
      {/* Logo no topo, com fundo laranja escuro */}
      <div className="bg-primary-dark px-5 py-4">
        <div className="text-lg font-bold leading-tight text-white">
          BemSeguro HUB
        </div>
        <div className="text-xs font-semibold uppercase tracking-widest text-orange-100">
          Admin
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white',
              ].join(' ')
            }
          >
            <span aria-hidden="true" className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
