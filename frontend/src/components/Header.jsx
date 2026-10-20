import { Icon } from './Icon'

// The green app bar used on every screen.
export function Header({ subtitle, onBack, backLabel = 'Back', children }) {
  return (
    <header class="app-header">
      {onBack && (
        <button class="back-btn" onClick={onBack} aria-label={backLabel}>
          <Icon name="back" size={22} />
        </button>
      )}
      <div class="brand-mark" aria-hidden="true">HR</div>
      <div class="app-header-text">
        <div class="app-header-name">Hillingdon ReportHub</div>
        {subtitle && <div class="app-header-status">{subtitle}</div>}
      </div>
      {children}
    </header>
  )
}
