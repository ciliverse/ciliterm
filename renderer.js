const { ipcRenderer } = require('electron');
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');
const os = require('os');
const fs = require('fs');
const path = require('path');
const THREE = require('three');

let waveCanvas;
let waveCtx;
let inWaveData = [];
let outWaveData = [];
const WAVE_POINTS = 100;
const IN_WAVE_COLOR = '#61afef';
const OUT_WAVE_COLOR = '#98c379';
const GRID_COLOR = 'rgba(97, 175, 239, 0.15)';
const ZERO_LINE_COLOR = 'rgba(97, 175, 239, 0.3)';
let lastInNetUsage = 0;
let lastOutNetUsage = 0;
let inPhase = 0;
let outPhase = 0;
let currentPath = process.cwd();
let processList = [];
let diskInfo = {};
let lastTime = 0;
let timeData = new Array(100).fill(0);
let amplitudeData = new Array(100).fill(0);
let loadData = {
    cpu: new Array(60).fill(0),
    memory: new Array(60).fill(0),
    network: new Array(60).fill(0),
    disk: new Array(60).fill(0)
};
let lastNetworkStats = {
    bytesReceived: 0,
    bytesSent: 0,
    timestamp: Date.now()
};
let scene, camera, renderer, globe;
let cpuUsage = 0;
let memoryUsage = 0;
let satellites = [];
let orbits = [];
let prevCpuTimes = null;
function initWaveCanvas() {
    waveCanvas = document.getElementById('waveCanvas');
    waveCtx = waveCanvas.getContext('2d');
    function resizeCanvas() {
        const rect = waveCanvas.getBoundingClientRect();
        waveCanvas.width = rect.width;
        waveCanvas.height = rect.height;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    inWaveData = Array(WAVE_POINTS).fill(0);
    outWaveData = Array(WAVE_POINTS).fill(0);
}
function updateWaveData() {
    inWaveData.shift();
    outWaveData.shift();
    const inNetUsage = parseFloat(document.getElementById('net-in').textContent);
    const outNetUsage = parseFloat(document.getElementById('net-out').textContent);
    const inSpeedChange = Math.abs(inNetUsage - lastInNetUsage);
    const outSpeedChange = Math.abs(outNetUsage - lastOutNetUsage);
    lastInNetUsage = inNetUsage;
    lastOutNetUsage = outNetUsage;
    const normalizedInValue = Math.min(1, Math.log10(inSpeedChange + 1) / 3);
    const normalizedOutValue = Math.min(1, Math.log10(outSpeedChange + 1) / 3);
    const inNoise = (Math.random() - 0.5) * 0.1;
    const outNoise = (Math.random() - 0.5) * 0.1;
    const inValue = Math.max(0, Math.min(1, normalizedInValue + inNoise));
    const outValue = Math.max(0, Math.min(1, normalizedOutValue + outNoise));
    inWaveData.push(inValue);
    outWaveData.push(outValue);
}
function drawWave() {
    const width = waveCanvas.width;
    const height = waveCanvas.height;
    waveCtx.clearRect(0, 0, width, height);
    waveCtx.strokeStyle = GRID_COLOR;
    waveCtx.lineWidth = 1;
    for (let i = 0; i < height; i += height / 8) {
        waveCtx.beginPath();
        waveCtx.moveTo(0, i);
        waveCtx.lineTo(width, i);
        waveCtx.stroke();
    }
    for (let i = 0; i < width; i += width / 20) {
        waveCtx.beginPath();
        waveCtx.moveTo(i, 0);
        waveCtx.lineTo(i, height);
        waveCtx.stroke();
    }
    waveCtx.beginPath();
    waveCtx.strokeStyle = ZERO_LINE_COLOR;
    waveCtx.lineWidth = 1;
    waveCtx.setLineDash([5, 5]);
    waveCtx.moveTo(0, height / 2);
    waveCtx.lineTo(width, height / 2);
    waveCtx.stroke();
    waveCtx.setLineDash([]);
    const segmentWidth = width / (WAVE_POINTS - 1);
    const baseY = height / 2;
    const amplitude = height * 0.35;
    waveCtx.beginPath();
    waveCtx.moveTo(0, baseY);
    for (let i = 0; i < WAVE_POINTS; i++) {
        const x = i * segmentWidth;
        const y = baseY - inWaveData[i] * amplitude;
        waveCtx.lineTo(x, y);
    }
    waveCtx.strokeStyle = IN_WAVE_COLOR;
    waveCtx.lineWidth = 1;
    waveCtx.stroke();
    waveCtx.beginPath();
    waveCtx.moveTo(0, baseY);
    for (let i = 0; i < WAVE_POINTS; i++) {
        const x = i * segmentWidth;
        const y = baseY + outWaveData[i] * amplitude;
        waveCtx.lineTo(x, y);
    }
    waveCtx.strokeStyle = OUT_WAVE_COLOR;
    waveCtx.lineWidth = 1;
    waveCtx.stroke();
    const inGradient = waveCtx.createLinearGradient(0, 0, 0, height);
    inGradient.addColorStop(0, 'rgba(97, 175, 239, 0.2)');
    inGradient.addColorStop(1, 'rgba(97, 175, 239, 0)');
    const outGradient = waveCtx.createLinearGradient(0, 0, 0, height);
    outGradient.addColorStop(0, 'rgba(152, 195, 121, 0.2)');
    outGradient.addColorStop(1, 'rgba(152, 195, 121, 0)');
    waveCtx.beginPath();
    waveCtx.moveTo(0, baseY);
    for (let i = 0; i < WAVE_POINTS; i++) {
        const x = i * segmentWidth;
        const y = baseY - inWaveData[i] * amplitude;
        waveCtx.lineTo(x, y);
    }
    waveCtx.lineTo(width, baseY);
    waveCtx.closePath();
    waveCtx.fillStyle = inGradient;
    waveCtx.fill();
    waveCtx.beginPath();
    waveCtx.moveTo(0, baseY);
    for (let i = 0; i < WAVE_POINTS; i++) {
        const x = i * segmentWidth;
        const y = baseY + outWaveData[i] * amplitude;
        waveCtx.lineTo(x, y);
    }
    waveCtx.lineTo(width, baseY);
    waveCtx.closePath();
    waveCtx.fillStyle = outGradient;
    waveCtx.fill();
}
function animateWave() {
    updateWaveData();
    drawWave();
    requestAnimationFrame(animateWave);
}
function updateFileList() {
    const fileList = document.getElementById('file-list');
    const currentPathElement = document.getElementById('current-path');
    try {
        const files = fs.readdirSync(currentPath);
        currentPathElement.textContent = currentPath;
        fileList.innerHTML = '';
        if (currentPath !== path.parse(currentPath).root) {
            const backItem = document.createElement('div');
            backItem.className = 'file-item directory';
            backItem.innerHTML = `
                <span class="file-icon">📁</span>
                <span class="file-name">..</span>
            `;
            backItem.onclick = () => {
                currentPath = path.dirname(currentPath);
                updateFileList();
            };
            fileList.appendChild(backItem);
        }
        files.forEach(file => {
            const fullPath = path.join(currentPath, file);
            const stats = fs.statSync(fullPath);
            const isDirectory = stats.isDirectory();
            const fileItem = document.createElement('div');
            fileItem.className = `file-item ${isDirectory ? 'directory' : 'file'}`;
            fileItem.innerHTML = `
                <span class="file-icon">${isDirectory ? '📁' : '📄'}</span>
                <span class="file-name">${file}</span>
            `;
            fileItem.onclick = () => {
                if (isDirectory) {
                    currentPath = fullPath;
                    updateFileList();
                }
            };
            fileList.appendChild(fileItem);
        });
    } catch (error) {
        console.error('Error reading directory:', error);
        fileList.innerHTML = '<div class="error">Error reading directory</div>';
    }
}
function updateHardwareInfo() {
    const cpus = os.cpus();
    document.getElementById('cpu-model').textContent = cpus[0].model;
    document.getElementById('cpu-cores').textContent = `${cpus.length} cores`;
    const totalMem = os.totalmem();
    const totalMemGB = (totalMem / (1024 * 1024 * 1024)).toFixed(1);
    document.getElementById('total-memory').textContent = `${totalMemGB} GB`;
    document.getElementById('platform').textContent = os.platform();
    document.getElementById('architecture').textContent = os.arch();
}
function updateSystemMetrics() {
    const cpus = os.cpus();
    const totalCpuTime = cpus.reduce((acc, cpu) => {
        return acc + Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
    }, 0);
    const idleCpuTime = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const cpuUsage = ((1 - idleCpuTime / totalCpuTime) * 100).toFixed(1);
    document.getElementById('cpu-usage').textContent = `${cpuUsage}%`;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = ((1 - freeMem / totalMem) * 100).toFixed(1);
    document.getElementById('mem-usage').textContent = `${memUsage}%`;
    const netUsage = Math.floor(Math.random() * 1000);
    document.getElementById('net-usage').textContent = `${netUsage} KB/s`;
    const uptime = os.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    document.getElementById('uptime').textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Consolas, Monaco, monospace',
    lineHeight: 1.2,
    scrollback: 10000,
    cols: 80,
    rows: 24,
    theme: {
        background: 'rgba(0, 0, 0, 0.7)',
        foreground: '#fff',
        cursor: '#61afef',
        selection: 'rgba(97, 175, 239, 0.3)',
        black: '#000000',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#d19a66',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#d19a66',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff'
    }
});
const fitAddon = new FitAddon();
const webLinksAddon = new WebLinksAddon();
term.loadAddon(fitAddon);
term.loadAddon(webLinksAddon);
term.open(document.getElementById('terminal'));
fitAddon.fit();
term.onData(data => {
    ipcRenderer.send('terminal:input', data);
});
ipcRenderer.on('terminal:data', (event, data) => {
    term.write(data);
});
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const { cols, rows } = term;
        const newSize = fitAddon.proposeDimensions();
        if (newSize) {
            term.resize(newSize.cols, newSize.rows);
            ipcRenderer.send('terminal:resize', newSize.cols, newSize.rows);
        }
    }, 100);
});
document.querySelector('.minimize').addEventListener('click', () => {
    ipcRenderer.send('window:minimize');
});
document.querySelector('.maximize').addEventListener('click', () => {
    ipcRenderer.send('window:maximize');
});
document.querySelector('.close').addEventListener('click', () => {
    ipcRenderer.send('window:close');
});
initWaveCanvas();
animateWave();
updateHardwareInfo();
updateFileList();
setInterval(updateSystemMetrics, 1000);
updateSystemMetrics();
async function initProcessAndDiskInfo() {
    try {
        const processes = await window.electronAPI.getProcessInfo();
        processList = processes;
        updateProcessList();
        const disks = await window.electronAPI.getDiskInfo();
        diskInfo = disks;
        updateDiskInfo();
    } catch (error) {
        console.error('Failed to initialize process and disk info:', error);
    }
}
function updateProcessList() {
    const processListElement = document.getElementById('process-list');
    if (!processListElement) return;
    const topProcesses = processList
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, 5);
    processListElement.innerHTML = topProcesses.map(proc => `
        <div class="process-item">
            <div class="process-name">${proc.name}</div>
            <div class="process-usage">
                <div class="usage-bar" style="--usage: ${proc.cpu}%"></div>
                <span>${proc.cpu.toFixed(1)}%</span>
            </div>
        </div>
    `).join('');
}
ipcRenderer.on('processInfo:update', (event, processes) => {
    processList = processes;
    updateProcessList();
});
function updateDiskInfo() {
    const diskInfoElement = document.getElementById('disk-info');
    if (!diskInfoElement) return;
    diskInfoElement.innerHTML = Object.entries(diskInfo).map(([drive, info]) => `
        <div class="disk-item">
            <div class="disk-name">${drive}</div>
            <div class="disk-usage">
                <div class="usage-bar" style="width: ${info.usagePercent}%"></div>
                <span>${info.usagePercent.toFixed(1)}%</span>
            </div>
            <div class="disk-space">
                ${formatBytes(info.free)} free of ${formatBytes(info.total)}
            </div>
        </div>
    `).join('');
}
function updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3
    });
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const timezoneStr = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.getElementById('current-time').textContent = timeStr;
    document.getElementById('current-date').textContent = dateStr;
    const earthViewTitle = document.querySelector('.globe-section .section-title');
    if (earthViewTitle) {
        earthViewTitle.setAttribute('data-timezone', timezoneStr);
    }
}
function drawWaveform() {
    const canvas = document.getElementById('waveCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    const now = Date.now();
    const deltaTime = now - lastTime;
    lastTime = now;
    timeData.shift();
    amplitudeData.shift();
    const baseAmplitude = height / 4;
    const time = now * 0.001;
    phase += deltaTime * 0.001;
    const amplitude = baseAmplitude * (
        0.5 * Math.sin(phase * 2) +
        0.3 * Math.sin(phase * 3 + 0.5) +
        0.2 * Math.sin(phase * 5 + 1.0) +
        0.1 * Math.sin(phase * 7 + 1.5)
    );
    timeData.push(time);
    amplitudeData.push(amplitude);
    ctx.beginPath();
    ctx.strokeStyle = '#61afef';
    ctx.lineWidth = 2;
    const centerY = height / 2;
    const pointWidth = width / timeData.length;
    for (let i = 0; i < timeData.length; i++) {
        const x = i * pointWidth;
        const y = centerY + amplitudeData[i];
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            const prevX = (i - 1) * pointWidth;
            const prevY = centerY + amplitudeData[i - 1];
            const cp1x = prevX + (x - prevX) * 0.5;
            const cp1y = prevY;
            const cp2x = prevX + (x - prevX) * 0.5;
            const cp2y = y;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        }
    }
    ctx.stroke();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(97, 175, 239, 0.2)');
    gradient.addColorStop(1, 'rgba(97, 175, 239, 0)');
    ctx.fillStyle = gradient;
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'rgba(97, 175, 239, 0.3)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    requestAnimationFrame(drawWaveform);
}
function updateLoadChart() {
    const chart = document.getElementById('load-chart');
    if (!chart) return;
    const ctx = chart.getContext('2d');
    const width = chart.width;
    const height = chart.height;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    const colors = {
        cpu: '#61afef',
        memory: '#98c379',
        network: '#e06c75',
        disk: '#c678dd'
    };
    Object.entries(loadData).forEach(([key, data]) => {
        ctx.beginPath();
        ctx.strokeStyle = colors[key];
        ctx.lineWidth = 2;
        const pointWidth = width / data.length;
        for (let i = 0; i < data.length; i++) {
            const x = i * pointWidth;
            const y = height - (data[i] * height);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    });
}
async function getSystemInfo() {
    try {
        const cpuInfo = os.cpus();
        const totalCores = cpuInfo.length;
        let totalIdle = 0;
        let totalTick = 0;
        cpuInfo.forEach(core => {
            for (let type in core.times) {
                totalTick += core.times[type];
            }
            totalIdle += core.times.idle;
        });
        const cpuUsage = ((totalTick - totalIdle) / totalTick) * 100;
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;
        const networkInterfaces = os.networkInterfaces();
        let networkSpeed = 0;
        for (let interface in networkInterfaces) {
            const interfaces = networkInterfaces[interface];
            for (let i = 0; i < interfaces.length; i++) {
                if (interfaces[i].family === 'IPv4' && !interfaces[i].internal) {
                    networkSpeed += interfaces[i].speed || 0;
                }
            }
        }
        return {
            cpuUsage: cpuUsage,
            memoryUsage: memoryUsage,
            networkSpeed: networkSpeed,
            uptime: os.uptime()
        };
    } catch (error) {
        console.error('Failed to get system info:', error);
        return {
            cpuUsage: 0,
            memoryUsage: 0,
            networkSpeed: 0,
            uptime: 0
        };
    }
}
async function updateSystemInfo() {
    try {
        const cpus = os.cpus();
        const totalCores = cpus.length;
        let totalIdle = 0;
        let totalTick = 0;
        cpus.forEach(core => {
            for (let type in core.times) {
                totalTick += core.times[type];
            }
            totalIdle += core.times.idle;
        });
        const cpuUsage = ((totalTick - totalIdle) / totalTick) * 100;
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;
        const networkInterfaces = os.networkInterfaces();
        let ipAddress = '127.0.0.1';
        let foundValidIP = false;
        for (let interface in networkInterfaces) {
            const interfaces = networkInterfaces[interface];
            for (let i = 0; i < interfaces.length; i++) {
                if (interfaces[i].family === 'IPv4' && !interfaces[i].internal) {
                    ipAddress = interfaces[i].address;
                    foundValidIP = true;
                    break;
                }
            }
            if (foundValidIP) break;
        }
        const cpuModelElement = document.getElementById('cpu-model');
        const cpuCoresElement = document.getElementById('cpu-cores');
        const totalMemoryElement = document.getElementById('total-memory');
        const platformElement = document.getElementById('platform');
        const architectureElement = document.getElementById('architecture');
        if (cpuModelElement) cpuModelElement.textContent = cpus[0].model;
        if (cpuCoresElement) cpuCoresElement.textContent = `${totalCores} cores`;
        if (totalMemoryElement) totalMemoryElement.textContent = formatBytes(totalMemory);
        if (platformElement) platformElement.textContent = os.platform();
        if (architectureElement) architectureElement.textContent = os.arch();
        const ipElement = document.getElementById('ip-address');
        const pingElement = document.getElementById('ping-value');
        if (ipElement) {
            ipElement.textContent = foundValidIP ? ipAddress : 'No IP';
        }
        if (pingElement) {
            updatePing();
        }
        const cpuUsageElement = document.getElementById('cpu-usage');
        const memUsageElement = document.getElementById('mem-usage');
        const netUsageElement = document.getElementById('net-usage');
        const uptimeElement = document.getElementById('uptime');
        if (cpuUsageElement) cpuUsageElement.textContent = `${cpuUsage.toFixed(1)}%`;
        if (memUsageElement) memUsageElement.textContent = `${memoryUsage.toFixed(1)}%`;
        if (netUsageElement) netUsageElement.textContent = formatBytes(0) + '/s';
        if (uptimeElement) uptimeElement.textContent = formatUptime(os.uptime());
        loadData.cpu.shift();
        loadData.memory.shift();
        loadData.network.shift();
        loadData.disk.shift();
        loadData.cpu.push(cpuUsage / 100);
        loadData.memory.push(memoryUsage / 100);
        loadData.network.push(0);
        loadData.disk.push(0);
        updateLoadChart();
    } catch (error) {
        console.error('Error updating system info:', error);
    }
}
async function updateNetworkInfo() {
    try {
        const networkInterfaces = os.networkInterfaces();
        let ipAddress = '127.0.0.1';
        let foundValidIP = false;
        for (let interface in networkInterfaces) {
            const interfaces = networkInterfaces[interface];
            for (let i = 0; i < interfaces.length; i++) {
                if (interfaces[i].family === 'IPv4' && !interfaces[i].internal) {
                    ipAddress = interfaces[i].address;
                    foundValidIP = true;
                    break;
                }
            }
            if (foundValidIP) break;
        }
        const ipElement = document.getElementById('ip-address');
        if (ipElement) {
            ipElement.textContent = foundValidIP ? ipAddress : 'No IP';
        }
        const pingElement = document.getElementById('ping-value');
        if (pingElement) {
            updatePing();
        }
        let totalBytesReceived = 0;
        let totalBytesSent = 0;
        Object.values(networkInterfaces).forEach(interfaces => {
            interfaces.forEach(interface => {
                if (!interface.internal) {
                    totalBytesReceived += Math.random() * 1024 * 10;
                    totalBytesSent += Math.random() * 1024 * 5;
                }
            });
        });
        const now = Date.now();
        const timeDiff = (now - lastNetworkStats.timestamp) / 1000;
        const inSpeed = ((totalBytesReceived - lastNetworkStats.bytesReceived) / timeDiff / 1024).toFixed(1);
        const outSpeed = ((totalBytesSent - lastNetworkStats.bytesSent) / timeDiff / 1024).toFixed(1);
        const netInElement = document.getElementById('net-in');
        const netOutElement = document.getElementById('net-out');
        if (netInElement) netInElement.textContent = `${inSpeed} KB/s`;
        if (netOutElement) netOutElement.textContent = `${outSpeed} KB/s`;
        lastNetworkStats = {
            bytesReceived: totalBytesReceived,
            bytesSent: totalBytesSent,
            timestamp: now
        };
    } catch (error) {
        console.error('Error updating network info:', error);
    }
}
function updatePing() {
    const pingElement = document.getElementById('ping-value');
    if (!pingElement) return;
    const { exec } = require('child_process');
    const targetHost = '8.8.8.8';
    const timeout = 5000;
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Command timeout')), timeout);
    });
    const commandPromise = new Promise((resolve, reject) => {
        exec(`tracert -d -h 1 ${targetHost}`, (error, stdout, stderr) => {
            if (error) {
                exec(`ping -n 1 ${targetHost}`, (pingError, pingStdout, pingStderr) => {
                    if (pingError) {
                        exec(`pathping -n -q 1 -p 50 -w 1000 ${targetHost}`, (pathError, pathStdout, pathStderr) => {
                            if (pathError) {
                                reject(new Error('All network tests failed'));
                                return;
                            }
                            const match = pathStdout.match(/(\d+)\s*ms/);
                            if (match) {
                                resolve(match[1]);
                            } else {
                                reject(new Error('No latency found in pathping output'));
                            }
                        });
                        return;
                    }
                    const patterns = [
                        /时间[=<](\d+)ms/,
                        /time[=<](\d+)ms/,
                        /Average = (\d+)ms/,
                        /平均 = (\d+)ms/
                    ];
                    for (const pattern of patterns) {
                        const match = pingStdout.match(pattern);
                        if (match) {
                            resolve(match[1]);
                            return;
                        }
                    }
                    reject(new Error('No latency found in ping output'));
                });
                return;
            }
            const lines = stdout.split('\n');
            for (const line of lines) {
                const match = line.match(/(\d+)\s*ms/);
                if (match) {
                    resolve(match[1]);
                    return;
                }
            }
            reject(new Error('No latency found in tracert output'));
        });
    });
    Promise.race([commandPromise, timeoutPromise])
        .then(latency => {
            pingElement.textContent = `${latency}ms`;
            pingElement.style.color = '#98c379';
        })
        .catch(error => {
            console.error('Network test error:', error);
            exec('netstat -n', (netstatError, netstatStdout) => {
                if (!netstatError && netstatStdout.includes('ESTABLISHED')) {
                    pingElement.textContent = 'Connected';
                    pingElement.style.color = '#98c379';
                } else {
                    pingElement.textContent = 'N/A';
                    pingElement.style.color = '#e06c75';
                }
            });
        });
}
function initialize() {
    console.log('Initializing application...');
    const ipElement = document.getElementById('ip-address');
    const pingElement = document.getElementById('ping-value');
    console.log('DOM elements found:', {
        ipElement: !!ipElement,
        pingElement: !!pingElement
    });
    updateHardwareInfo();
    initProcessAndDiskInfo();
    setInterval(updateTime, 10);
    setInterval(updateSystemInfo, 1000);
    setInterval(updateNetworkInfo, 1000);
    setInterval(updatePing, 5000);
    updateTime();
    updateSystemInfo();
    updateNetworkInfo();
    updatePing();
    console.log('Initialization complete');
}
if (document.readyState === 'loading') {
    console.log('Document still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    console.log('Document already loaded, initializing immediately...');
    initialize();
}
function initGlobe() {
    const container = document.getElementById('globe-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 2.5;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    const textElement = document.createElement('div');
    textElement.className = 'globe-text';
    textElement.textContent = 'CILITERM';
    container.appendChild(textElement);
    const radius = 0.6;
    const points = [];
    const segments = 32;
    const rings = 16;
    for (let i = 0; i <= rings; i++) {
        const phi = (i / rings) * Math.PI;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        for (let j = 0; j <= segments; j++) {
            const theta = (j / segments) * Math.PI * 2;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);
            const randomOffset = 0.02;
            const x = (radius + (Math.random() - 0.5) * randomOffset) * sinPhi * cosTheta;
            const y = (radius + (Math.random() - 0.5) * randomOffset) * sinPhi * sinTheta;
            const z = (radius + (Math.random() - 0.5) * randomOffset) * cosPhi;
            points.push(new THREE.Vector3(x, y, z));
        }
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.PointsMaterial({
        color: 0x98c379,
        size: 0.02,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });
    globe = new THREE.Points(geometry, material);
    globe.rotation.x = Math.PI / 2;
    scene.add(globe);
    const orbitRadius = 0.5;
    const orbitPoints = [];
    const orbitSegments = 64;
    const dashSize = 0.04;
    const gapSize = 0.02;
    for (let i = 0; i < orbitSegments; i++) {
        const angle = (i / orbitSegments) * Math.PI * 2;
        const x = Math.cos(angle) * orbitRadius;
        const y = Math.sin(angle) * orbitRadius;
        orbitPoints.push(new THREE.Vector3(x, y, 0));
    }
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const orbitMaterial = new THREE.LineDashedMaterial({
        color: 0x98c379,
        transparent: true,
        opacity: 0.3,
        dashSize: dashSize,
        gapSize: gapSize,
        linewidth: 1
    });
    for (let i = 0; i < 3; i++) {
        const orbit = new THREE.Line(orbitGeometry, orbitMaterial);
        orbit.rotation.x = Math.PI / 2 * (i + 1) / 4;
        orbit.rotation.z = Math.PI / 6 * i;
        orbit.computeLineDistances();
        scene.add(orbit);
        orbits.push(orbit);
    }
    const createSatellite = () => {
        const group = new THREE.Group();
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.01, -0.01, 0),
            new THREE.Vector3(0.01, 0.01, 0)
        ]);
        const lineGeometry2 = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.01, 0.01, 0),
            new THREE.Vector3(0.01, -0.01, 0)
        ]);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x61afef,
            transparent: true,
            opacity: 0.9
        });
        const line1 = new THREE.Line(lineGeometry, lineMaterial);
        const line2 = new THREE.Line(lineGeometry2, lineMaterial);
        group.add(line1);
        group.add(line2);
        return group;
    };
    for (let i = 0; i < 6; i++) {
        const satellite = createSatellite();
        const angle = (i * Math.PI * 2) / 6;
        const orbitRadius = 0.5 + (i % 2) * 0.1;
        satellite.position.x = Math.cos(angle) * orbitRadius;
        satellite.position.y = Math.sin(angle) * orbitRadius;
        scene.add(satellite);
        satellites.push({
            mesh: satellite,
            angle: angle,
            speed: 0.005 + (i * 0.003),
            orbitRadius: orbitRadius
        });
    }
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x98c379, 1.5, 100);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    const pointLight2 = new THREE.PointLight(0x98c379, 1, 100);
    pointLight2.position.set(-5, -5, 5);
    scene.add(pointLight2);
    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    });
    animateGlobe();
}
function animateGlobe() {
    requestAnimationFrame(animateGlobe);
    if (globe) {
        globe.rotation.z -= 0.003;
        updateGlobe();
        updateSatellites();
    }
    renderer.render(scene, camera);
}
function updateGlobe() {
    if (globe && globe.material) {
        const intensity = 0.8 + (cpuUsage + memoryUsage) / 400;
        globe.material.opacity = 0.8 * (1 + intensity * 0.2);
    }
}
function updateSatellites() {
    satellites.forEach((satellite, index) => {
        satellite.angle += satellite.speed;
        satellite.mesh.position.x = Math.cos(satellite.angle) * satellite.orbitRadius;
        satellite.mesh.position.y = Math.sin(satellite.angle) * satellite.orbitRadius;
        satellite.mesh.children.forEach(line => {
            line.material.opacity = 0.9;
        });
    });
}
function updateLoadInfo() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(core => {
        for (let type in core.times) {
            totalTick += core.times[type];
        }
        totalIdle += core.times.idle;
    });
    if (prevCpuTimes) {
        const idleDiff = totalIdle - prevCpuTimes.idle;
        const tickDiff = totalTick - prevCpuTimes.tick;
        const cpuLoad = ((1 - idleDiff / tickDiff) * 100);
        cpuUsage = cpuLoad;
        document.getElementById('cpu-usage').textContent = `${cpuLoad.toFixed(1)}%`;
    }
    prevCpuTimes = {
        idle: totalIdle,
        tick: totalTick
    };
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryLoad = ((totalMem - freeMem) / totalMem) * 100;
    memoryUsage = memoryLoad;
    document.getElementById('memory-usage').textContent = `${memoryLoad.toFixed(1)}%`;
}
initGlobe();
setInterval(updateLoadInfo, 1000);