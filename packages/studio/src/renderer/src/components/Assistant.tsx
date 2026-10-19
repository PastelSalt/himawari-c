import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, FormattedNumber, useIntl } from "react-intl";
import { RECIPES, expandCommand } from "@himawari/tools/recipes";
import type { AssistantKeyStatus } from "../../../shared/api";
import { studio } from "../api";
import { useStudio } from "../store";
import { Icon } from "./Icon";

const MENTION = /@(scene|character|line):([a-z0-9_]+)/g;

/** The built-in assistant (Mode B, plan §10.9): chat with your own API key; writes arrive as proposals. */
export function Assistant() {
  const intl = useIntl();
  const chat = useStudio((s) => s.chat);
  const center = useStudio((s) => s.center);
  const model = useStudio((s) => s.model);
  const settings = useStudio((s) => s.settings);
  const [key, setKey] = useState<AssistantKeyStatus | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void studio.assistant.keyStatus().then(setKey);
  }, [center]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [chat.items]);
  useEffect(() => {
    if (chat.draft) input.current?.focus();
  }, [chat.draft]);

  // @mention candidates: scenes and characters.
  const candidates = useMemo(() => {
    const out: { token: string; label: string }[] = [];
    for (const s of model?.scenes ?? []) out.push({ token: `@scene:${s.id}`, label: s.id });
    for (const c of model?.check.characters.values() ?? []) out.push({ token: `@character:${c.id}`, label: c.displayName });
    return out;
  }, [model]);
  // Slash commands (recipes): /continuity, /translate, /playtest, …
  const commandQuery = /^\/([a-z]*)$/.exec(chat.draft)?.[1];
  const commands = commandQuery === undefined ? [] : RECIPES.filter((r) => r.command.startsWith(commandQuery));
  const matches = mentionQuery === null ? [] : candidates.filter((c) => c.label.toLowerCase().includes(mentionQuery.toLowerCase()) || c.token.includes(mentionQuery)).slice(0, 8);

  const send = () => {
    const text = chat.draft.trim();
    if (!text || chat.running) return;
    const s = useStudio.getState();
    const command = expandCommand(text);
    if (text.startsWith("/") && (!command || "missing" in command)) {
      const message = command
        ? intl.formatMessage({ id: "assistant.commandNeeds" }, { command: `/${command.recipe.command}`, args: command.missing.map((a) => `<${a}>`).join(" ") })
        : intl.formatMessage({ id: "assistant.commandUnknown" }, { command: text.split(/\s/)[0] ?? text });
      useStudio.setState((st) => ({ chat: { ...st.chat, items: [...st.chat.items, { kind: "error", turn: "", message }] } }));
      return;
    }
    const mentions = [...text.matchAll(MENTION)].map((m) => `${m[1]}:${m[2]}`);
    void s.askAssistant(text, {
      ...(center?.kind === "file" ? { openFile: center.file } : {}),
      ...(s.chat.selection ? { selection: s.chat.selection.text } : {}),
      mentions,
    });
  };

  const pickCommand = (command: string) => {
    const r = RECIPES.find((x) => x.command === command);
    useStudio.getState().setDraft(`/${command}${r?.args.some((a) => a.required) ? " " : ""}`);
    input.current?.focus();
  };

  const insertMention = (token: string) => {
    const d = chat.draft.replace(/@[\w:]*$/, `${token} `);
    useStudio.getState().setDraft(d);
    setMentionQuery(null);
    input.current?.focus();
  };

  return (
    <div className="assistant">
      <div className="pane-head">
        <Icon name="assistant" />
        <span className="pane-title">
          <FormattedMessage id="tool.assistant" />
        </span>
        <span className="muted small ellipsis">{settings ? intl.formatMessage({ id: `assistant.model.${settings.ai.model}`, defaultMessage: settings.ai.model }) : ""}</span>
        <div className="grow" />
        {chat.session.cost > 0 && (
          <span className="cost-meter small muted" title={intl.formatMessage({ id: "assistant.costHint" }, { input: chat.session.inputTokens, output: chat.session.outputTokens, cached: chat.session.cacheReadTokens })}>
            <FormattedMessage
              id="assistant.cost"
              values={{
                last: <FormattedNumber value={chat.last?.cost ?? 0} style="currency" currency="USD" maximumFractionDigits={4} />,
                session: <FormattedNumber value={chat.session.cost} style="currency" currency="USD" maximumFractionDigits={4} />,
              }}
            />
          </span>
        )}
        <button className="icon-button" title={intl.formatMessage({ id: "assistant.newChat" })} aria-label={intl.formatMessage({ id: "assistant.newChat" })} onClick={() => void useStudio.getState().resetChat()}>
          <Icon name="plus" />
        </button>
      </div>

      {key && !key.hasKey ? (
        <div className="assistant-empty">
          <p>
            <FormattedMessage id="assistant.noKey" />
          </p>
          <button onClick={() => useStudio.getState().open({ kind: "tool", tool: "settings" })}>
            <FormattedMessage id="assistant.openSettings" />
          </button>
          <p className="muted small">
            <FormattedMessage id="assistant.modeAHint" />
          </p>
        </div>
      ) : (
        <>
          <div className="chat-log" ref={log}>
            {chat.items.length === 0 && (
              <p className="muted small chat-hint">
                <FormattedMessage id="assistant.hint" />
              </p>
            )}
            {chat.items.map((item, i) => {
              switch (item.kind) {
                case "user":
                  return (
                    <div key={i} className="chat-msg user">
                      {item.text}
                    </div>
                  );
                case "assistant":
                  return (
                    <div key={i} className="chat-msg assistant">
                      {item.text}
                    </div>
                  );
                case "tool":
                  return (
                    <div key={i} className="chat-tool small">
                      <Icon name="settings" size={12} />
                      <code>{item.name}</code>
                      <span className="muted ellipsis">{item.summary}</span>
                    </div>
                  );
                case "thinking":
                  return (
                    <div key={i} className="chat-tool small muted">
                      <span className="spinner" />
                      <FormattedMessage id="assistant.working" />
                    </div>
                  );
                case "refusal":
                  return (
                    <div key={i} className="chat-msg error">
                      <FormattedMessage id="assistant.refusal" />
                    </div>
                  );
                case "error":
                  return (
                    <div key={i} className="chat-msg error">
                      {item.message}
                    </div>
                  );
              }
            })}
            {chat.running && !chat.items.some((x) => x.kind === "thinking" && x.turn === chat.running) && chat.items[chat.items.length - 1]?.kind === "user" && (
              <div className="chat-tool small muted">
                <span className="spinner" />
                <FormattedMessage id="assistant.working" />
              </div>
            )}
          </div>
          {chat.selection && (
            <div className="chat-selection small">
              <FormattedMessage id="assistant.aboutSelection" values={{ file: chat.selection.file, chars: chat.selection.text.length }} />
              <button className="icon-button" aria-label={intl.formatMessage({ id: "common.close" })} onClick={() => useStudio.setState((s) => ({ chat: { ...s.chat, selection: null } }))}>
                <Icon name="close" size={11} />
              </button>
            </div>
          )}
          <div className="chat-input">
            {commands.length > 0 && (
              <div className="mention-menu">
                {commands.map((r) => (
                  <button key={r.command} className="sp-attr-option command-option" onMouseDown={(e) => (e.preventDefault(), pickCommand(r.command))}>
                    <code>
                      /{r.command}
                      {r.args
                        .filter((a) => a.required)
                        .map((a) => ` <${a.name}>`)
                        .join("")}
                    </code>
                    <span className="muted">{intl.formatMessage({ id: `assistant.command.${r.command}` })}</span>
                  </button>
                ))}
              </div>
            )}
            {matches.length > 0 && (
              <div className="mention-menu">
                {matches.map((m) => (
                  <button key={m.token} className="sp-attr-option" onMouseDown={(e) => (e.preventDefault(), insertMention(m.token))}>
                    <code>{m.token}</code>
                    <span className="muted">{m.label}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={input}
              rows={3}
              value={chat.draft}
              placeholder={intl.formatMessage({ id: "assistant.placeholder" })}
              aria-label={intl.formatMessage({ id: "assistant.placeholder" })}
              onChange={(e) => {
                useStudio.getState().setDraft(e.target.value);
                const m = /@([\w:]*)$/.exec(e.target.value);
                setMentionQuery(m ? (m[1] ?? "") : null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (commands.length > 0 && !RECIPES.some((r) => `/${r.command}` === chat.draft && r.args.every((a) => !a.required))) pickCommand(commands[0]!.command);
                  else if (matches.length > 0 && mentionQuery !== null) insertMention(matches[0]!.token);
                  else send();
                }
                if (e.key === "Escape") setMentionQuery(null);
              }}
            />
            {chat.running ? (
              <button onClick={() => void studio.assistant.cancel()} title={intl.formatMessage({ id: "assistant.stop" })} aria-label={intl.formatMessage({ id: "assistant.stop" })}>
                <Icon name="stop" />
              </button>
            ) : (
              <button className="primary" onClick={send} disabled={!chat.draft.trim()} title={intl.formatMessage({ id: "assistant.send" })} aria-label={intl.formatMessage({ id: "assistant.send" })}>
                <Icon name="send" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
