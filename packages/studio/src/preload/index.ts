/**
 * The preload bridge: the only door between the sandboxed renderer and main.
 * It exposes `window.himawari` (the StudioApi) and nothing else: no ipcRenderer,
 * no Node.
 */
import { type IpcRendererEvent, contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type MethodName, type StudioApi } from "../shared/api.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (method: MethodName) => (...args: unknown[]): Promise<any> => ipcRenderer.invoke(CHANNELS.invoke, method, args);

function listen<A extends unknown[]>(channel: string) {
  return (listener: (...args: A) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, ...args: unknown[]) => listener(...(args as A));
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

const api: StudioApi = {
  app: { info: call("app.info"), openExternal: call("app.openExternal"), reveal: call("app.reveal") },
  settings: { get: call("settings.get"), set: call("settings.set") },
  dialog: { pickFolder: call("dialog.pickFolder"), pickFile: call("dialog.pickFile"), saveFile: call("dialog.saveFile") },
  project: {
    create: call("project.create"),
    open: call("project.open"),
    openBundled: call("project.openBundled"),
    close: call("project.close"),
    write: call("project.write"),
    remove: call("project.remove"),
    rename: call("project.rename"),
    writeAsset: call("project.writeAsset"),
    readExternal: call("project.readExternal"),
    build: call("project.build"),
    exportGame: call("project.exportGame"),
    onChanged: listen(CHANNELS.projectChanged),
  },
  preview: {
    start: call("preview.start"),
    stop: call("preview.stop"),
    command: call("preview.command"),
    setBounds: call("preview.setBounds"),
    onEvent: listen(CHANNELS.previewEvent),
  },
  proposals: { list: call("proposals.list"), decide: call("proposals.decide"), onChanged: listen(CHANNELS.proposalsChanged) },
  mcp: { status: call("mcp.status"), writeClaudeCodeConfig: call("mcp.writeClaudeCodeConfig") },
  assistant: {
    keyStatus: call("assistant.keyStatus"),
    setKey: call("assistant.setKey"),
    send: call("assistant.send"),
    cancel: call("assistant.cancel"),
    reset: call("assistant.reset"),
    onEvent: listen(CHANNELS.assistantEvent),
  },
};

contextBridge.exposeInMainWorld("himawari", api);
