export default function Topbar({ title, userName = 'Admin', onNovaCotacao }) {
  const initials = (userName || 'A')
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onNovaCotacao}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Nova Cotação
        </button>

        <button
          type="button"
          aria-label="Notificações"
          className="relative rounded-full p-2 text-status-gray hover:bg-gray-100"
        >
          <span aria-hidden="true" className="text-lg">🔔</span>
        </button>

        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
            {initials}
          </div>
          <span className="text-sm font-medium text-ink">{userName}</span>
        </div>
      </div>
    </header>
  );
}
