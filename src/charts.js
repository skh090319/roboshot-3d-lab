import Chart from 'chart.js/auto';

const COLORS = {
  teal: '#51d6c6', blue: '#71a9ff', orange: '#ffa45b', violet: '#b6a0ff',
  text: '#9cacc2', grid: 'rgba(151, 174, 201, 0.10)',
};

// Chart.js redraws this lightweight overlay without rebuilding any datasets.
const timeCursor = {
  id: 'roboshot-time',
  afterDatasetsDraw(chart) {
    const time = chart.$simulationTime ?? 0;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || time < scales.x.min || time > scales.x.max) return;
    const x = scales.x.getPixelForValue(time);
    ctx.save();
    ctx.beginPath();
    ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
    ctx.clip();
    ctx.strokeStyle = 'rgba(225, 239, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    chart.data.datasets.forEach((dataset, index) => {
      if (!chart.isDatasetVisible(index) || !dataset.data.length) return;
      const points = dataset.data;
      let right = points.findIndex((point) => point.x >= time);
      if (right < 0) right = points.length - 1;
      const a = points[Math.max(0, right - 1)];
      const b = points[right];
      const alpha = b.x === a.x ? 0 : (time - a.x) / (b.x - a.x);
      const y = scales.y.getPixelForValue(a.y + (b.y - a.y) * alpha);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = dataset.borderColor;
      ctx.fill();
      ctx.strokeStyle = '#0d1827';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  },
};

function dataset(label, color) {
  return {
    label, data: [], borderColor: color, backgroundColor: color,
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 4,
    tension: 0, fill: false,
  };
}

function options(yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    normalized: true,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 2, right: 9 } },
    plugins: {
      legend: {
        display: true, position: 'top', align: 'start',
        labels: { color: COLORS.text, usePointStyle: true, pointStyle: 'line', boxWidth: 16, boxHeight: 5, padding: 12, font: { size: 10 } },
      },
      tooltip: {
        backgroundColor: '#19263a', titleColor: '#eff7ff', bodyColor: '#d7e4f3',
        borderColor: '#34465f', borderWidth: 1, padding: 10,
        callbacks: {
          title: (items) => `시간 ${Number(items[0]?.parsed.x ?? 0).toFixed(3)} s`,
          label: (context) => `${context.dataset.label}: ${Number(context.parsed.y).toFixed(3)}`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear', min: 0, max: 2,
        title: { display: true, text: '시간 t (s)', color: COLORS.text, font: { size: 10 } },
        ticks: { color: COLORS.text, maxTicksLimit: 5, font: { size: 10 }, callback: (v) => Number(v).toFixed(1) },
        grid: { color: COLORS.grid, drawTicks: false }, border: { display: false },
      },
      y: {
        type: 'linear', min: 0,
        title: { display: true, text: yTitle, color: COLORS.text, font: { size: 10 } },
        ticks: { color: COLORS.text, maxTicksLimit: 5, font: { size: 10 }, padding: 6 },
        grid: { color: COLORS.grid, drawTicks: false }, border: { display: false },
      },
    },
  };
}

/** Four persistent scientific plots; inputs come directly from the physics module. */
export function createCharts(canvases) {
  const definitions = {
    height: { axis: '높이 y (m)', series: [['y', '높이 (m)', COLORS.teal]] },
    speed: { axis: '속력 |v| (m/s)', series: [['speed', '속력 (m/s)', COLORS.blue]] },
    energy: { axis: '에너지 (J)', series: [['kinetic', '운동 에너지 (J)', COLORS.orange], ['potential', '위치 에너지 (J)', COLORS.teal]] },
    total: { axis: '역학적 에너지 (J)', series: [['total', '전체 에너지 (J)', COLORS.violet]] },
  };
  const charts = {};
  Object.entries(definitions).forEach(([key, definition]) => {
    if (!canvases[key]) throw new Error(`그래프 canvas가 없습니다: ${key}`);
    charts[key] = new Chart(canvases[key], {
      type: 'line',
      data: { datasets: definition.series.map(([, label, color]) => dataset(label, color)) },
      options: options(definition.axis), plugins: [timeCursor],
    });
  });
  let destroyed = false;

  return {
    setTrajectory(samples) {
      if (destroyed || !Array.isArray(samples) || samples.length === 0) return;
      Object.entries(charts).forEach(([key, chart]) => {
        chart.data.datasets.forEach((series, i) => {
          const field = definitions[key].series[i][0];
          series.data = samples.map((sample) => ({ x: sample.t, y: sample[field] }));
        });
        chart.options.scales.x.max = Math.max(0.01, samples.at(-1).t);
        chart.options.scales.y.suggestedMax = key === 'total'
          ? Math.max(1, samples[0].total * 1.15)
          : undefined;
        chart.$simulationTime = 0;
        chart.update('none');
      });
    },
    setTime(time) {
      if (destroyed || !Number.isFinite(time)) return;
      Object.values(charts).forEach((chart) => {
        if (chart.$simulationTime === time) return;
        chart.$simulationTime = time;
        chart.draw();
      });
    },
    resize() {
      if (!destroyed) Object.values(charts).forEach((chart) => chart.resize());
    },
    setExpanded(keyOrNull) {
      if (destroyed) return;
      requestAnimationFrame(() => {
        if (destroyed) return;
        if (keyOrNull && charts[keyOrNull]) charts[keyOrNull].resize();
        else Object.values(charts).forEach((chart) => chart.resize());
      });
    },
    destroy() {
      destroyed = true;
      Object.values(charts).forEach((chart) => chart.destroy());
    },
  };
}

export function createExperimentChart(canvas) {
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['성공', '실패'],
      datasets: [{ label: '가상 슈팅 횟수', data: [0, 0], backgroundColor: [COLORS.teal, COLORS.orange], borderRadius: 5, maxBarThickness: 72 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y}회` } } },
      scales: {
        x: { ticks: { color: COLORS.text }, grid: { display: false }, border: { display: false } },
        y: { min: 0, max: 100, title: { display: true, text: '슈팅 횟수', color: COLORS.text }, ticks: { color: COLORS.text, precision: 0 }, grid: { color: COLORS.grid }, border: { display: false } },
      },
    },
  });
  return {
    update(experiment) {
      chart.data.datasets[0].data = [experiment.successes, experiment.trials - experiment.successes];
      chart.options.scales.y.max = experiment.trials;
      chart.update('none');
    },
    destroy() { chart.destroy(); },
  };
}
