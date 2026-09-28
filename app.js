"use strict";

const state = {
  data: null,
  filter: "all",
  query: "",
  sort: "classification",
  ascending: true,
  selectedId: null,
};

const labels = {
  robust_candidate: "Robust",
  watchlist: "Watchlist",
  data_quality_reject: "质量拒绝",
  not_candidate: "非候选",
  energy_relative_value: "能源相对价值",
  cross_sector_relative_value: "跨板块相对价值",
  metals_relative_value: "金属相对价值",
  agriculture_relative_value: "农业相对价值",
  cross_asset_overlay: "跨资产参照",
  rates_reference: "利率参照",
};

const classOrder = {
  robust_candidate: 0,
  watchlist: 1,
  data_quality_reject: 2,
  not_candidate: 3,
};

function number(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function valueDigits(value) {
  const absolute = Math.abs(Number(value));
  if (absolute < 0.01) return 4;
  if (absolute < 1) return 3;
  return 2;
}

function valueText(item) {
  if (item.current_value === null || item.current_value === undefined) return "--";
  if (item.id === "us10y_nominal_yield_extreme") return `${number(item.current_value, 2)}%`;
  if (item.kind === "log_ratio") return number(item.current_value, valueDigits(item.current_value));
  return number(item.current_value, Math.abs(item.current_value) < 10 ? 3 : 2);
}

function classificationBadge(item) {
  const css = item.classification === "robust_candidate" ? "robust" :
    item.classification === "watchlist" ? "watchlist" :
      item.classification === "data_quality_reject" ? "reject" : "neutral";
  return `<span class="badge ${css}">${labels[item.classification] || item.classification}</span>`;
}

function directionText(direction) {
  if (!direction) return '<span class="badge neutral">--</span>';
  return `<span class="direction-${direction}">${direction === "high" ? "高" : "低"}</span>`;
}

function filteredRows() {
  const query = state.query.trim().toLowerCase();
  const rows = state.data.relationships.filter((item) => {
    const filterMatch = state.filter === "all" ||
      item.classification === state.filter ||
      (state.filter === "fdr" && item.event_study.fdr_pass_tests > 0);
    const queryMatch = !query || item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query);
    return filterMatch && queryMatch;
  });
  rows.sort((a, b) => {
    let left;
    let right;
    if (state.sort === "classification") {
      left = classOrder[a.classification] ?? 9;
      right = classOrder[b.classification] ?? 9;
    } else if (state.sort === "fdr") {
      left = a.event_study.best_q_value ?? Infinity;
      right = b.event_study.best_q_value ?? Infinity;
    } else {
      left = a[state.sort];
      right = b[state.sort];
    }
    if (typeof left === "string") return left.localeCompare(right) * (state.ascending ? 1 : -1);
    return ((left ?? -Infinity) - (right ?? -Infinity)) * (state.ascending ? 1 : -1);
  });
  return rows;
}

function renderTable() {
  const rows = filteredRows();
  const body = document.getElementById("results-body");
  body.innerHTML = rows.map((item) => `
    <tr class="result-row ${item.id === state.selectedId ? "selected" : ""}" data-id="${item.id}" tabindex="0">
      <td><span class="relationship-name">${item.name}</span><span class="relationship-group">${labels[item.ranking_group] || item.ranking_group}</span></td>
      <td>${valueText(item)}</td>
      <td>${directionText(item.direction)}</td>
      <td>${number(item.daily_10y_percentile, 2)}%</td>
      <td>${number(item.daily_10y_robust_zscore, 2)}</td>
      <td>${classificationBadge(item)}</td>
      <td>${item.event_study.fdr_pass_tests > 0 ? '<span class="badge pass">通过</span>' : '<span class="badge neutral">未通过</span>'}</td>
    </tr>`).join("");
  document.getElementById("empty-state").hidden = rows.length !== 0;
  body.querySelectorAll("tr").forEach((row) => {
    const select = () => selectRelationship(row.dataset.id);
    row.addEventListener("click", select);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
}

function canvasContext(id) {
  const canvas = document.getElementById(id);
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(300, Math.floor(canvas.clientWidth));
  const height = Math.max(120, Math.floor(canvas.clientHeight));
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function drawEmptyChart(id) {
  const { context, width, height } = canvasContext(id);
  context.fillStyle = "#66717d";
  context.font = "12px system-ui";
  context.textAlign = "center";
  context.fillText("无可用数据", width / 2, height / 2);
}

function drawHistory(item) {
  if (!item.history.length) return drawEmptyChart("history-chart");
  const { context: ctx, width, height } = canvasContext("history-chart");
  const pad = { left: 48, right: 16, top: 16, bottom: 28 };
  const values = item.history.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index) => pad.left + index / Math.max(1, values.length - 1) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (max - value) / span * (height - pad.top - pad.bottom);
  ctx.strokeStyle = "#e1e6e9";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#66717d";
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  for (let step = 0; step <= 4; step += 1) {
    const value = max - span * step / 4;
    const lineY = y(value);
    ctx.beginPath(); ctx.moveTo(pad.left, lineY); ctx.lineTo(width - pad.right, lineY); ctx.stroke();
    ctx.fillText(number(value, Math.abs(value) < 10 ? valueDigits(value) : 1), pad.left - 7, lineY + 3);
  }
  ctx.strokeStyle = "#155eef";
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, index) => index === 0 ? ctx.moveTo(x(index), y(value)) : ctx.lineTo(x(index), y(value)));
  ctx.stroke();
  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]);
  ctx.fillStyle = item.direction === "high" ? "#b42318" : item.direction === "low" ? "#175cd3" : "#44505c";
  ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#66717d";
  ctx.textAlign = "left";
  ctx.fillText(item.history[0].date.slice(0, 4), pad.left, height - 9);
  ctx.textAlign = "right";
  ctx.fillText(item.history[item.history.length - 1].date.slice(0, 4), width - pad.right, height - 9);
}

function drawDistribution(item) {
  if (!item.history.length) return drawEmptyChart("distribution-chart");
  const { context: ctx, width, height } = canvasContext("distribution-chart");
  const values = item.history.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const bins = 20;
  const counts = Array(bins).fill(0);
  values.forEach((value) => {
    const index = Math.min(bins - 1, Math.floor((value - min) / span * bins));
    counts[index] += 1;
  });
  const pad = { left: 16, right: 16, top: 14, bottom: 26 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const barWidth = plotWidth / bins;
  const maxCount = Math.max(...counts);
  ctx.fillStyle = "#c8d3dd";
  counts.forEach((count, index) => {
    const barHeight = count / maxCount * plotHeight;
    ctx.fillRect(pad.left + index * barWidth + 1, pad.top + plotHeight - barHeight, Math.max(1, barWidth - 2), barHeight);
  });
  const current = item.current_value;
  const currentX = pad.left + Math.max(0, Math.min(1, (current - min) / span)) * plotWidth;
  ctx.strokeStyle = item.direction === "high" ? "#b42318" : item.direction === "low" ? "#175cd3" : "#44505c";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(currentX, pad.top); ctx.lineTo(currentX, pad.top + plotHeight); ctx.stroke();
  ctx.fillStyle = "#66717d";
  ctx.font = "10px system-ui";
  ctx.textAlign = "left"; ctx.fillText(number(min, valueDigits(min)), pad.left, height - 8);
  ctx.textAlign = "right"; ctx.fillText(number(max, valueDigits(max)), width - pad.right, height - 8);
}

function renderMatrix(item) {
  const matrix = document.getElementById("metric-matrix");
  const cells = ['<div class="matrix-cell header"></div>', ...[3, 5, 10].map((year) => `<div class="matrix-cell header">${year} 年</div>` )];
  ["daily", "weekly"].forEach((frequency) => {
    cells.push(`<div class="matrix-cell header">${frequency === "daily" ? "日频" : "周频"}</div>`);
    [3, 5, 10].forEach((year) => {
      const metric = item.metrics.find((row) => row.frequency === frequency && row.lookback_years === year);
      const confirmed = metric.direction && metric.direction === metric.cleaned_direction;
      const css = confirmed ? "confirmed" : metric.direction ? "trigger" : "";
      cells.push(`<div class="matrix-cell ${css}"><strong>${number(metric.percentile, 1)}%</strong><span>Z ${number(metric.robust_zscore, 2)}</span></div>`);
    });
  });
  matrix.innerHTML = cells.join("");
}

function selectRelationship(id) {
  state.selectedId = id;
  const item = state.data.relationships.find((row) => row.id === id);
  if (!item) return;
  document.getElementById("detail-group").textContent = labels[item.ranking_group] || item.ranking_group;
  document.getElementById("detail-name").textContent = item.name;
  document.getElementById("detail-badge").outerHTML = classificationBadge(item).replace("<span", '<span id="detail-badge"');
  document.getElementById("detail-value").textContent = valueText(item);
  document.getElementById("detail-percentile").textContent = `${number(item.daily_10y_percentile, 2)}%`;
  document.getElementById("detail-zscore").textContent = number(item.daily_10y_robust_zscore, 2);
  document.getElementById("detail-confirmations").textContent = `${item.cleaned_core_confirmations}/4`;
  document.getElementById("history-range").textContent = item.history.length ? `${item.history[0].date} — ${item.history[item.history.length - 1].date}` : "--";
  document.getElementById("distribution-note").textContent = `P10 ${number(item.distribution.p10, valueDigits(item.distribution.p10))} · P90 ${number(item.distribution.p90, valueDigits(item.distribution.p90))}`;
  document.getElementById("eligible-tests").textContent = item.event_study.eligible_tests;
  document.getElementById("best-q").textContent = item.event_study.best_q_value === null ? "--" : number(item.event_study.best_q_value, 4);
  document.getElementById("relationship-fdr").textContent = item.event_study.fdr_pass_tests > 0 ? "通过" : "未通过";
  drawHistory(item);
  drawDistribution(item);
  renderMatrix(item);
  renderTable();
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll(".segment").forEach((button) => button.classList.toggle("active", button.dataset.filter === filter));
  renderTable();
}

function wireControls() {
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => setFilter(button.dataset.filter)));
  document.getElementById("search").addEventListener("input", (event) => { state.query = event.target.value; renderTable(); });
  document.querySelectorAll("th button[data-sort]").forEach((button) => button.addEventListener("click", () => {
    if (state.sort === button.dataset.sort) state.ascending = !state.ascending;
    else { state.sort = button.dataset.sort; state.ascending = true; }
    renderTable();
  }));
  window.addEventListener("resize", () => {
    if (state.selectedId) selectRelationship(state.selectedId);
  });
}

async function init() {
  try {
    const response = await fetch("data/dashboard.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    if (state.data.schema_version !== 2) throw new Error("不支持的数据版本");
    const summary = state.data.summary;
    document.getElementById("analysis-date").textContent = state.data.analysis_as_of;
    document.getElementById("robust-count").textContent = summary.robust_candidates;
    document.getElementById("watchlist-count").textContent = summary.watchlist;
    document.getElementById("fdr-count").textContent = summary.fdr_pass_tests;
    document.getElementById("reject-count").textContent = summary.data_quality_rejects;
    document.getElementById("source-status").textContent = `${state.data.sources.map((item) => item.provider.toUpperCase()).join(" + ")} · ${summary.relationships} 个关系`;
    document.getElementById("generated-at").textContent = `生成于 ${new Date(state.data.generated_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;
    renderTable();
    if (state.data.relationships.length) selectRelationship(state.data.relationships[0].id);
  } catch (error) {
    document.getElementById("source-status").textContent = `数据加载失败：${error.message}`;
    document.querySelector(".status-dot").style.background = "#b42318";
    drawEmptyChart("history-chart");
    drawEmptyChart("distribution-chart");
  }
}

wireControls();
init();
