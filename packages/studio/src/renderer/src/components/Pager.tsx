import { FormattedMessage, useIntl } from "react-intl";
import { Icon } from "./Icon";

/** Rows per page in long lists (translations, problems, assets): enough to work in, few enough to draw at once. */
export const PAGE_SIZE = 100;

/** "201–300 of 36,655" with previous/next: long lists are drawn a page at a time. */
export function Pager({ page, total, onPage, size = PAGE_SIZE }: { page: number; total: number; onPage: (page: number) => void; size?: number }) {
  const intl = useIntl();
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  const p = Math.min(page, pages - 1);
  return (
    <div className="pager">
      <button className="icon-button" disabled={p === 0} onClick={() => onPage(p - 1)} aria-label={intl.formatMessage({ id: "pager.previous" })} title={intl.formatMessage({ id: "pager.previous" })}>
        <Icon name="back" size={14} />
      </button>
      <span className="muted small">
        <FormattedMessage id="pager.range" values={{ from: p * size + 1, to: Math.min(total, (p + 1) * size), total }} />
      </span>
      <button className="icon-button" disabled={p >= pages - 1} onClick={() => onPage(p + 1)} aria-label={intl.formatMessage({ id: "pager.next" })} title={intl.formatMessage({ id: "pager.next" })}>
        <Icon name="chevron" size={14} />
      </button>
    </div>
  );
}

/** Folders and files of a set of paths, for "only this route" filters: "script/route_03/" first, then its files. */
export function pathChoices(files: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) out.add(`${parts.slice(0, i).join("/")}/`);
    out.add(f);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}
