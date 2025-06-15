const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');
const si = require('systeminformation');

let mainWindow;
let shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
let ptyProcess;
let processUpdateInterval;

async function getProcessInfo() {
    try {
        const processes = await si.processes();
        return processes.list.map(proc => ({
            name: proc.name,
            pid: proc.pid,
            cpu: proc.cpu,
            memory: proc.mem,
            command: proc.command
        }));
    } catch (error) {
        console.error('Failed to get process info:', error);
        return [];
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        opacity: 0.9
    });

    mainWindow.loadFile('index.html');
    mainWindow.setAlwaysOnTop(true);

    ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });

    ptyProcess.onData(data => {
        mainWindow.webContents.send('terminal:data', data);
    });

    ipcMain.on('terminal:input', (event, data) => {
        ptyProcess.write(data);
    });

    ipcMain.on('terminal:resize', (event, cols, rows) => {
        ptyProcess.resize(cols, rows);
    });

    ipcMain.on('window:minimize', () => {
        mainWindow.minimize();
    });

    ipcMain.on('window:maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });

    ipcMain.on('window:close', () => {
        mainWindow.close();
    });

    ipcMain.handle('getProcessInfo', async () => {
        return await getProcessInfo();
    });

    processUpdateInterval = setInterval(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            const processes = await getProcessInfo();
            mainWindow.webContents.send('processInfo:update', processes);
        }
    }, 2000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    if (processUpdateInterval) {
        clearInterval(processUpdateInterval);
    }
});