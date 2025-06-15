<template>
  <div class="app-container">
    <div class="background-animation"></div>
    <div class="content">
      <div class="titlebar">
        <div class="titlebar-drag">
          <span class="app-title">希里安CILLIAN</span>
          <div class="system-stats">
            <div class="stat-item">
              <span class="stat-label">CPU</span>
              <div class="stat-value">{{ cpuUsage }}%</div>
            </div>
            <div class="stat-item">
              <span class="stat-label">MEM</span>
              <div class="stat-value">{{ memoryUsage }}%</div>
            </div>
            <div class="stat-item">
              <span class="stat-label">NET</span>
              <div class="stat-value">{{ networkSpeed }}</div>
            </div>
          </div>
        </div>
        <div class="window-controls">
          <button class="minimize" @click="minimizeWindow">─</button>
          <button class="maximize" @click="maximizeWindow">□</button>
          <button class="close" @click="closeWindow">×</button>
        </div>
      </div>
      
      <div class="main-content">
        <div class="sidebar">
          <div class="sidebar-header">
            <h3>System Info</h3>
          </div>
          <div class="system-info">
            <div class="info-item">
              <span class="info-label">OS</span>
              <span class="info-value">{{ osInfo }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Hostname</span>
              <span class="info-value">{{ hostname }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Uptime</span>
              <span class="info-value">{{ uptime }}</span>
            </div>
          </div>
          <div class="resource-charts">
            <LineChart :chart-data="cpuChartData" :options="chartOptions" />
            <LineChart :chart-data="memoryChartData" :options="chartOptions" />
          </div>
        </div>
        
        <div class="terminal-container">
          <div id="terminal"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { LineChart } from 'vue-chartjs';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { gsap } from 'gsap';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default {
  name: 'App',
  components: {
    LineChart
  },
  setup() {
    const cpuUsage = ref(0);
    const memoryUsage = ref(0);
    const networkSpeed = ref('0 KB/s');
    const osInfo = ref('');
    const hostname = ref('');
    const uptime = ref('');

    const cpuChartData = ref({
      labels: Array(20).fill(''),
      datasets: [{
        label: 'CPU Usage',
        data: Array(20).fill(0),
        borderColor: '#61afef',
        tension: 0.4,
        fill: true,
        backgroundColor: 'rgba(97, 175, 239, 0.1)'
      }]
    });

    const memoryChartData = ref({
      labels: Array(20).fill(''),
      datasets: [{
        label: 'Memory Usage',
        data: Array(20).fill(0),
        borderColor: '#98c379',
        tension: 0.4,
        fill: true,
        backgroundColor: 'rgba(152, 195, 121, 0.1)'
      }]
    });

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: '#abb2bf'
          }
        },
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: '#abb2bf'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    };

    let term;
    let fitAddon;
    let updateInterval;

    const initTerminal = () => {
      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Consolas, Monaco, monospace',
        theme: {
          background: 'rgba(0, 0, 0, 0.8)',
          foreground: '#fff',
          cursor: '#fff',
          selection: 'rgba(255, 255, 255, 0.3)',
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

      fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(document.getElementById('terminal'));
      fitAddon.fit();
    };

    const updateSystemInfo = () => {
      cpuUsage.value = Math.floor(Math.random() * 100);
      memoryUsage.value = Math.floor(Math.random() * 100);
      networkSpeed.value = `${Math.floor(Math.random() * 1000)} KB/s`;

      cpuChartData.value.datasets[0].data.shift();
      cpuChartData.value.datasets[0].data.push(cpuUsage.value);
      memoryChartData.value.datasets[0].data.shift();
      memoryChartData.value.datasets[0].data.push(memoryUsage.value);
    };

    onMounted(() => {
      initTerminal();
      updateInterval = setInterval(updateSystemInfo, 1000);
      
      gsap.to('.background-animation', {
        backgroundPosition: '200% 0',
        duration: 20,
        repeat: -1,
        ease: 'linear'
      });
    });

    onUnmounted(() => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    });

    return {
      cpuUsage,
      memoryUsage,
      networkSpeed,
      osInfo,
      hostname,
      uptime,
      cpuChartData,
      memoryChartData,
      chartOptions
    };
  }
};
</script>

<style>
.app-container {
  width: 100vw;
  height: 100vh;
  background: #1a1a1a;
  color: #fff;
  font-family: 'Consolas', 'Monaco', monospace;
  position: relative;
  overflow: hidden;
}

.background-animation {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    45deg,
    rgba(97, 175, 239, 0.1) 0%,
    rgba(152, 195, 121, 0.1) 25%,
    rgba(198, 120, 221, 0.1) 50%,
    rgba(152, 195, 121, 0.1) 75%,
    rgba(97, 175, 239, 0.1) 100%
  );
  background-size: 200% 200%;
  z-index: 0;
}

.content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.titlebar {
  height: 40px;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
  -webkit-app-region: drag;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.titlebar-drag {
  display: flex;
  align-items: center;
  gap: 20px;
}

.app-title {
  font-size: 16px;
  font-weight: bold;
  color: #61afef;
}

.system-stats {
  display: flex;
  gap: 15px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.stat-label {
  color: #abb2bf;
  font-size: 12px;
}

.stat-value {
  color: #fff;
  font-size: 12px;
}

.window-controls {
  display: flex;
  -webkit-app-region: no-drag;
}

.window-controls button {
  background: none;
  border: none;
  color: #fff;
  width: 30px;
  height: 30px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.window-controls button:hover {
  background: rgba(255, 255, 255, 0.1);
}

.close:hover {
  background: #e81123 !important;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 300px;
  background: rgba(0, 0, 0, 0.8);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.sidebar-header {
  color: #61afef;
  font-size: 16px;
  font-weight: bold;
}

.system-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  color: #abb2bf;
  font-size: 12px;
}

.info-value {
  color: #fff;
  font-size: 12px;
}

.resource-charts {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.terminal-container {
  flex: 1;
  padding: 20px;
  position: relative;
}

#terminal {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 5px;
  overflow: hidden;
}

.xterm {
  padding: 10px;
}

.xterm-viewport {
  overflow-y: auto !important;
}

::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}
</style>