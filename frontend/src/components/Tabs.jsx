import { useId } from "react";

/** Accessible tab strip. tabs: [{id, label}]. The caller renders the active panel. */
export default function Tabs({ tabs, active, onChange, label }) {
  const base = useId();
  const move = (e, index) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    document.getElementById(`${base}-${tabs[next].id}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, i) => (
        <button key={tab.id} id={`${base}-${tab.id}`} role="tab" type="button" aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} onKeyDown={(e) => move(e, i)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
