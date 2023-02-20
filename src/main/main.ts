/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import Hyperswarm from 'hyperswarm';
import Corestore from 'corestore';
import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import goodbye from 'graceful-goodbye';
import { Node } from 'hyperbee/lib/messages.js'
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

require('dotenv').config();

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;
const conns = [];

// ipcMain.on('ipc-example', async (event, arg) => {
//   const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
//   console.log(msgTemplate(arg));
//   event.reply('ipc-example', msgTemplate(arg));
// });

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  const store = new Corestore('./storage');

  const swarm = new Hyperswarm();
  goodbye(() => swarm.destroy());

  swarm.on('connection', (conn) => {
    store.replicate(conn);
    const name = b4a.toString(conn.remotePublicKey, 'hex');
    console.log('*Got Connection:', name, '*');
    conns.push(conn);
  });

  const core = store.get({ key: b4a.from(process.env.KEY, 'hex') });

  const bee = new Hyperbee(core, {
    keyEncoding: 'utf-8',
    valueEncoding: 'utf-8',
  });

  await core.ready();

  const foundPeers = store.findingPeers();
  swarm.join(core.discoveryKey);
  swarm.flush().then(() => foundPeers());

  await core.update();
  if (isDebug) {
    await installExtensions();
  }

  


  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  core.on('append', () => {
    const seq = core.length - 1;
    core.get(seq).then((block) => {
      const buffer = Node.decode(block)
      const data = JSON.parse(buffer.value.toString())
      console.log("buffer", buffer);
      console.log(`Decoded Block ${seq}`, data)
      // mainWindow.webContents.send("contract:list", [data]);
    });
  });

  ipcMain.on('contract:add', async (event, message) => {
    // console.log("message", message);
    for (const conn of conns) {
      conn.write(`contractAdd${message}`);
    }
  });

  // ipcMain.on('contract:list', async (event, message) => {
  //   console.log('message1', message);
  // });
  const oldValue = []
  for await (const { key, value } of bee.createReadStream()) {
    oldValue.push(JSON.parse(value))
  }
  // console.log("oldValue: ", oldValue)
  mainWindow.webContents.send("contract:list", oldValue);
  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
