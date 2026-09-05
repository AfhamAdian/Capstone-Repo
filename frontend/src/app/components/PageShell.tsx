import type { ReactNode } from "react";

/**
 * The single page measure. Every screen renders through this, so the content edge
 * stops moving when you navigate between Dashboard, Surveys, Actions and Settings.
 *
 * `page-measure` (styles/theme.css) resolves to --page-measure / --page-gutter, and
 * the gutter tightens on small screens where 32px of padding is most of the viewport.
 */
export function PageShell({children, className=""}:{children:ReactNode;className?:string;}) {
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className={`page-measure max-sm:px-4 py-8 max-sm:py-6 ${className}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * One page title treatment. Condensed uppercase needs positive tracking to stay
 * readable, which is why nothing here uses `tracking-tight`.
 */
export function PageHeader({title,description,breadcrumb,actions}:{
  title:ReactNode;
  description?:ReactNode;
  /** Back link or breadcrumb trail, rendered above the title. */
  breadcrumb?:ReactNode;
  /** Primary/secondary buttons, right-aligned on wide screens and wrapped below the title on narrow ones. */
  actions?:ReactNode;
}) {
  return (
    <header className="mb-8">
      {breadcrumb}
      <div className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-3xl uppercase tracking-[0.03em] font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1.5">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
      </div>
    </header>
  );
}

/** A heading for a block within a page. Sentence case, so it reads a step below the uppercase page title. */
export function SectionHeading({children,className=""}:{children:ReactNode;className?:string;}) {
  return <h2 className={`text-lg font-semibold text-foreground mb-4 ${className}`}>{children}</h2>;
}

/** The heading inside a bordered card. */
export function CardHeading({children,className=""}:{children:ReactNode;className?:string;}) {
  return <h3 className={`text-base font-semibold text-foreground ${className}`}>{children}</h3>;
}

/**
 * A bordered search/filter box. The wrapper is the control a person sees, so it owns
 * the focus ring (`.field-shell` in theme.css) rather than the bare <input> inside it.
 */
export function FieldShell({children,className=""}:{children:ReactNode;className?:string;}) {
  return (
    <div className={`field-shell flex items-center gap-2 bg-card border border-border px-3 py-2.5 ${className}`}>
      {children}
    </div>
  );
}
