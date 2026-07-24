// Shared className for native <input>/<select>/<textarea> elements so every
// form across the app has the same compact, thin-border, enterprise look.
export const inputClass =
  'w-full px-2.5 py-1.5 rounded-md bg-gray-700 border border-gray-600 text-[13px] text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30'

export default function FormField({ label, required, error, hint, children, htmlFor }) {
  return (
    <div>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-gray-300 block mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  )
}
