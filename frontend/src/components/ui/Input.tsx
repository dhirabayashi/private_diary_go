import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const baseClass =
  'block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder-stone-400 shadow-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-500 sm:text-sm'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`${baseClass} ${className}`} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea ref={ref} className={`${baseClass} ${className}`} rows={8} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

interface LabelProps {
  children: React.ReactNode
  htmlFor?: string
  required?: boolean
}
export function Label({ children, htmlFor, required }: LabelProps) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-stone-700 mb-1">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-sm text-red-600">{message}</p>
}
