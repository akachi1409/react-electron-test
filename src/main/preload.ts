// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels = 'ipc-example';
export type AddContract = 'contract:add';
export type ListContract = 'contract:list';
const electronHandler = {
  ipcRenderer: {
    addContract(channel: AddContract, data: string) {
      console.log('data', data);
      ipcRenderer.send(channel, data);
    },
    sendMessage(channel: Channels, args: unknown[]) {
      ipcRenderer.send(channel, args);
    },
    // listContract(channel: ListContract, func: (...data: unknown[]) => void) {
    //   console.log('--test');
    //   ipcRenderer.once(channel, (_event, ...args) => func(...args));
    // },
    listContract(channel: ListContract, func: (...args: any[]) => void) {
      console.log('testssfdafdasfsda');
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
