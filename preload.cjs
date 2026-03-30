const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  openMenu: (userId) => ipcRenderer.send("open-menu", { userId }),
  onShowBubble: (callback) =>
    ipcRenderer.on("show-bubble", (e, data) => callback(data)),
  hideMascot: (userId) => ipcRenderer.send("hide-mascot", { userId }),
});