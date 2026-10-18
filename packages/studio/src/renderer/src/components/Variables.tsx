import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { positionOf } from "../model";
import { useStudio } from "../store";
import { RenameDialog } from "./FileEditor";
import { Icon } from "./Icon";

const NAME = /^[a-z_][a-z0-9_]*$/;
type VarType = "int" | "bool" | "str";

/** Variables (plan §11.3): declarations in himawari.json, and where each is read and written. */
export function Variables() {
  const intl = useIntl();
  const model = useStudio((s) => s.model);
  const files = useStudio((s) => s.files);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<VarType>("bool");
  const [def, setDef] = useState("false");
  const [scope, setScope] = useState<"save" | "global">("save");
  const vars = model?.check.manifest?.variables ?? {};

  const uses = useMemo(() => {
    const out = new Map<string, { file: string; offset: number; write: boolean }[]>();
    for (const [file, r] of model?.check.parsed ?? []) {
      for (const ref of r.refs) {
        if (ref.kind !== "variable") continue;
        const list = out.get(ref.name) ?? [];
        list.push({ file, offset: ref.span.start, write: ref.assign === true });
        out.set(ref.name, list);
      }
    }
    return out;
  }, [model]);

  const writeManifest = (mutate: (m: { variables?: Record<string, unknown> }) => void, label: { id: string; values: Record<string, string> }) => {
    const text = files["himawari.json"];
    if (!text) return;
    let m: { variables?: Record<string, unknown> };
    try {
      m = JSON.parse(text) as typeof m;
    } catch {
      return;
    }
    mutate(m);
    useStudio.getState().edit("himawari.json", `${JSON.stringify(m, null, 2)}\n`, "you", label);
  };

  const parsedDefault = (): number | boolean | string | null => {
    if (type === "bool") return def === "true";
    if (type === "int") return /^-?\d+$/.test(def.trim()) ? Number(def.trim()) : null;
    return def;
  };
  const canAdd = NAME.test(name) && !(name in vars) && parsedDefault() !== null;
  const add = () => {
    const d = parsedDefault();
    if (!canAdd || d === null) return;
    writeManifest((m) => (m.variables = { ...(m.variables ?? {}), [name]: { type, default: d, scope } }), { id: "history.addedVariable", values: { name } });
    setName("");
  };

  return (
    <div className="tool-page">
      <h2>
        <FormattedMessage id="tool.variables" />
      </h2>
      <p className="muted small">
        <FormattedMessage id="variables.hint" />
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>
              <FormattedMessage id="variables.name" />
            </th>
            <th>
              <FormattedMessage id="variables.type" />
            </th>
            <th>
              <FormattedMessage id="variables.default" />
            </th>
            <th>
              <FormattedMessage id="variables.scope" />
            </th>
            <th>
              <FormattedMessage id="variables.used" />
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Object.entries(vars).map(([n, v]) => {
            const list = uses.get(n) ?? [];
            const writes = list.filter((u) => u.write);
            const reads = list.filter((u) => !u.write);
            return (
              <tr key={n}>
                <td>
                  <code>{n}</code>
                </td>
                <td>{intl.formatMessage({ id: `variables.typeName.${v.type}` })}</td>
                <td>
                  <code>{JSON.stringify(v.default)}</code>
                  {v.enum && <span className="muted small">{` (${v.enum.join(" | ")})`}</span>}
                </td>
                <td>
                  <FormattedMessage id={`variables.scope.${v.scope}`} />
                </td>
                <td>
                  {list.length === 0 ? (
                    <span className="badge">
                      <FormattedMessage id="variables.unused" />
                    </span>
                  ) : (
                    <span className="uses">
                      <FormattedMessage id="variables.counts" values={{ reads: reads.length, writes: writes.length }} />
                      {list.slice(0, 6).map((u, i) => (
                        <button key={i} className="link-chip" onClick={() => useStudio.getState().revealAt(u.file, u.offset)}>
                          {intl.formatMessage({ id: "variables.at" }, { file: u.file.replace(/^script\//, ""), line: positionOf(files[u.file] ?? "", u.offset).line, kind: u.write ? "write" : "read" })}
                        </button>
                      ))}
                    </span>
                  )}
                </td>
                <td className="right">
                  <button className="small-button" onClick={() => setRenaming(n)}>
                    <FormattedMessage id="explorer.rename" />
                  </button>
                  {list.length === 0 && (
                    <button
                      className="icon-button"
                      aria-label={intl.formatMessage({ id: "common.delete" })}
                      title={intl.formatMessage({ id: "common.delete" })}
                      onClick={() =>
                        writeManifest(
                          (m) => {
                            if (m.variables) delete m.variables[n];
                          },
                          { id: "history.deletedVariable", values: { name: n } },
                        )
                      }
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {Object.keys(vars).length === 0 && (
        <p className="muted">
          <FormattedMessage id="variables.none" />
        </p>
      )}
      <form
        className="card row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder={intl.formatMessage({ id: "variables.name" })} aria-invalid={name !== "" && !NAME.test(name)} />
        <select
          value={type}
          onChange={(e) => {
            const t = e.target.value as VarType;
            setType(t);
            setDef(t === "bool" ? "false" : t === "int" ? "0" : "");
          }}
          aria-label={intl.formatMessage({ id: "variables.type" })}
        >
          {(["bool", "int", "str"] as const).map((t) => (
            <option key={t} value={t}>
              {intl.formatMessage({ id: `variables.typeName.${t}` })}
            </option>
          ))}
        </select>
        {type === "bool" ? (
          <select value={def} onChange={(e) => setDef(e.target.value)} aria-label={intl.formatMessage({ id: "variables.default" })}>
            <option value="false">{intl.formatMessage({ id: "variables.false" })}</option>
            <option value="true">{intl.formatMessage({ id: "variables.true" })}</option>
          </select>
        ) : (
          <input value={def} onChange={(e) => setDef(e.target.value)} aria-label={intl.formatMessage({ id: "variables.default" })} placeholder={intl.formatMessage({ id: "variables.default" })} />
        )}
        <select value={scope} onChange={(e) => setScope(e.target.value as "save" | "global")} aria-label={intl.formatMessage({ id: "variables.scope" })}>
          <option value="save">{intl.formatMessage({ id: "variables.scope.save" })}</option>
          <option value="global">{intl.formatMessage({ id: "variables.scope.global" })}</option>
        </select>
        <button type="submit" className="primary" disabled={!canAdd}>
          <FormattedMessage id="variables.add" />
        </button>
      </form>
      {renaming && <RenameDialog kind="variable" from={renaming} onClose={() => setRenaming(null)} />}
    </div>
  );
}
