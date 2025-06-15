const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendTerminalInput: (data) => ipcRenderer.send('terminal:input', data),
    onTerminalData: (callback) => ipcRenderer.on('terminal:data', (event, data) => callback(data)),
    resizeTerminal: (cols, rows) => ipcRenderer.send('terminal:resize', cols, rows),
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    maximizeWindow: () => ipcRenderer.send('window:maximize'),
    closeWindow: () => ipcRenderer.send('window:close'),
    getProcessInfo: () => ipcRenderer.invoke('getProcessInfo'),
    getDiskInfo: () => ipcRenderer.invoke('getDiskInfo')
});