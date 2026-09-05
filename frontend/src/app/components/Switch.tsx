/**
 * An on/off switch. Built as a <button role="switch"> rather than a styled <div>, so
 * it's reachable by keyboard and announced with its state — the settings screen
 * previously drew these as plain divs with `cursor-pointer` and no handler at all.
 */
export function Switch({checked,onChange,label,describedBy,disabled}:{
  checked:boolean;
  onChange:(next:boolean)=>void;
  /** Accessible name, used when the visible label sits elsewhere in the row. */
  label:string;
  describedBy?:string;
  disabled?:boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={()=>onChange(!checked)}
      className={`relative shrink-0 w-12 h-6 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${checked?"bg-primary border-primary":"bg-muted border-border"}`}>
      <span
        aria-hidden="true"
        className={`absolute top-0.5 w-5 h-5 bg-white transition-transform ${checked?"translate-x-[26px]":"translate-x-0.5"}`}/>
    </button>
  );
}
