const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { WebSocket } = require("ws");

let wsClient = null;
let pingInterval = null;
let tray = null;
const mascotWindows = new Map();

function storeGet(key) {
  try {
    const p = path.join(app.getPath("userData"), "store.json");
    return JSON.parse(fs.readFileSync(p, "utf8"))[key];
  } catch {
    return null;
  }
}
function storeSet(key, value) {
  const p = path.join(app.getPath("userData"), "store.json");
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  data[key] = value;
  fs.writeFileSync(p, JSON.stringify(data));
}
function storeDelete(key) {
  const p = path.join(app.getPath("userData"), "store.json");
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  delete data[key];
  fs.writeFileSync(p, JSON.stringify(data));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.whenReady().then(() => {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient("mastop", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient("mastop");
  }

  createTray();
  createMascotWindow("temp-user");

  const token = storeGet("jwt");
  if (token) connectWebSocket(token);
});

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("mastop");

  const menu = Menu.buildFromTemplate([
    { label: "친구 추가 / 관리", click: () => openSettingsWindow("friends") },
    {
      label: "전체 알림 설정",
      click: () => openSettingsWindow("notifications"),
    },
    { label: "앱 설정", click: () => openSettingsWindow("settings") },
    { type: "separator" },
    { label: "종료", click: () => app.quit() },
  ]);

  tray.on("click", () => tray.popUpContextMenu(menu));
  tray.on("right-click", () => tray.popUpContextMenu(menu));
}

function createMascotWindow(userId) {
  const win = new BrowserWindow({
    width: 200,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadFile("pages/mascot.html");
  mascotWindows.set(userId, win);
  return win;
}

function openSettingsWindow(page) {
  const win = new BrowserWindow({ width: 400, height: 500 });
  win.loadFile(`pages/${page}.html`);
}

let loginWindow = null;

ipcMain.on("open-login", () => {
  if (loginWindow) return;

  const mascotWin = mascotWindows.get("temp-user");
  if (mascotWin) mascotWin.setAlwaysOnTop(false);

  loginWindow = new BrowserWindow({ width: 500, height: 600 });
  loginWindow.loadURL("http://localhost:3000/auth/google");
  loginWindow.on("closed", () => {
    loginWindow = null;
    if (mascotWin) mascotWin.setAlwaysOnTop(true);
  });
});

ipcMain.on("hide-mascot", (_e, { userId }) => {
  const win = mascotWindows.get(userId);
  if (win) win.hide();
});

ipcMain.on("open-menu", (_e, { userId }) => {
  const win = mascotWindows.get(userId);
  if (!win) return;

  const [x, y] = win.getPosition();
  const menu = new BrowserWindow({
    width: 140,
    height: 160,
    x: x + 80,
    y: y,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  menu.loadFile("pages/menu.html");
  menu.once("blur", () => menu.close());
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on("second-instance", (_event, argv) => {
  const url = argv.find((arg) => arg.startsWith("mastop://"));
  if (url) handleDeepLink(url);
});

function handleDeepLink(url) {
  const token = new URL(url).searchParams.get("token");
  if (token) {
    storeSet("jwt", token);
    connectWebSocket(token);
    if (loginWindow) {
      loginWindow.close();
      loginWindow = null;
    }
    const win = mascotWindows.get("temp-user");
    if (win) win.webContents.send("login-success");
  }
}

function connectWebSocket(token) {
  if (!token) return;

  if (wsClient) {
    wsClient.removeAllListeners();
    try {
      wsClient.terminate();
    } catch (_) {}
  }
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }

  wsClient = new WebSocket("ws://localhost:3000");

  wsClient.on("error", (err) => {
    console.log("WS error:", err.message);
  });

  wsClient.on("open", () => {
    console.log("WS connected!");
    wsClient.send(JSON.stringify({ type: "authenticate", token }));
    pingInterval = setInterval(() => {
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
  });

  wsClient.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "new_message") {
      const win = mascotWindows.get("temp-user");
      if (win)
        win.webContents.send("show-bubble", {
          text: msg.content,
          fromUserId: msg.fromUserId,
        });
    }
    if (msg.type === "auth_error") storeDelete("jwt");
  });

  wsClient.on("close", () => {
    const savedToken = storeGet("jwt");
    if (savedToken) setTimeout(() => connectWebSocket(savedToken), 3000);
  });
}

app.on("window-all-closed", (e) => e.preventDefault());
