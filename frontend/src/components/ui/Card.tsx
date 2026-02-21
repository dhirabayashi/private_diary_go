interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-stone-200 bg-white shadow-sm transition-shadow
        ${onClick ? 'cursor-pointer hover:shadow-md' : ''}
        ${className}`}
    >
      {children}
    </div>
  )
}
