const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
} = require("electron");
const path = require("path");
const Store = require("electron-store").default;
const WebSocket = require("ws");

let wsClient = null;

const store = new Store();
let tray = null;
const mascotWindows = new Map();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.whenReady().then(() => {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient("mastop", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient("mastop");
  }
  createTray();

  // 저장된 JWT 있으면 바로 시작
  const token = store.get("jwt");
  if (token) {
    console.log("trying auto login...");
  }

  createMascotWindow("temp-user");
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
      preload: path.join(__dirname, "preload.js"),
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

// 캐릭터 클릭 시 팝업 메뉴
ipcMain.on("open-menu", (e, { userId }) => {
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
      preload: path.join(__dirname, "preload.js"),
    },
  });
  menu.loadFile("pages/menu.html");
  menu.once("blur", () => menu.close());
});

// macOS
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows
app.on("second-instance", (event, argv) => {
  const url = argv.find((arg) => arg.startsWith("mastop://"));
  if (url) handleDeepLink(url);
});

function handleDeepLink(url) {
  const token = new URL(url).searchParams.get("token");
  if (token) {
    store.set("jwt", token);
    console.log("JWT saved!");
    connectWebSocket(token);
  }
}

function connectWebSocket(token) {
  if (wsClient) wsClient.terminate();

  wsClient = new WebSocket("ws://localhost:3000");

  wsClient.on("open", () => {
    console.log("WS connected!");
    wsClient.send(JSON.stringify({ type: "authenticate", token }));
  });

  wsClient.on("message", (data) => {
    const msg = JSON.parse(data);

    if (msg.type === "auth_success") {
      console.log("WS auth success!");
    }

    // if (msg.type === "new_message") {
    //   const win = mascotWindows.get("temp-user");
    //   if (win) {
    //     win.webContents.send("show-bubble", {
    //       text: msg.content,
    //       fromUserId: msg.fromUserId,
    //     });
    //   }
    // }

    if (msg.type === "new_message") {
      console.log("new_message 수신:", msg);
      const win = mascotWindows.get("temp-user");
      console.log("win:", win);
      if (win) {
        win.webContents.send("show-bubble", {
          text: msg.content,
          fromUserId: msg.fromUserId,
        });
      }
    }

    if (msg.type === "auth_error") {
      store.delete("jwt");
      console.log("JWT expired!");
    }
  });

  wsClient.on("close", () => {
    console.log("WS disconnected. reconnecting...");
    setTimeout(() => connectWebSocket(store.get("jwt")), 3000);
  });

  // ping 30초마다
  setInterval(() => {
    if (wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(JSON.stringify({ type: "ping" }));
    }
  }, 30000);
}

app.on("window-all-closed", (e) => e.preventDefault());
