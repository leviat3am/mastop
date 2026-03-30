const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  openMenu: (userId) => ipcRenderer.send("open-menu", { userId }),
  onShowBubble: (callback) =>
    ipcRenderer.on("show-bubble", (_e, data) => callback(data)),
  hideMascot: (userId) => ipcRenderer.send("hide-mascot", { userId }),
  openLogin: () => ipcRenderer.send("open-login"),
  onLoginSuccess: (callback) =>
    ipcRenderer.on("login-success", () => callback()),
});