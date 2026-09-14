frappe.pages["competitor-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "Competitor Dashboard",
		single_column: true,
	});
	new CompetitorDashboard(page);
};

class CompetitorDashboard {
	constructor(page) {
		this.page = page;
		this.selected_competitor = "";
		this.build_shell();
		this.bind_filter();
		this.refresh();
	}

	build_shell() {
		$(this.page.body).html(`
			<div class="competitor-dashboard-root">
				<style>${this.css()}</style>
				<div class="cd-filter-row">
					<label class="cd-filter-label">Competitor</label>
					<select class="cd-competitor-select form-control">
						<option value="">All Competitors</option>
					</select>
				</div>
				<div class="cd-kpi-row"></div>
				<div class="cd-charts-row">
					<div class="cd-card cd-card-wide">
						<div class="cd-card-title">Posts over time</div>
						<div class="cd-chart-posts"></div>
					</div>
					<div class="cd-card">
						<div class="cd-card-title">Posts by AI category</div>
						<div class="cd-chart-categories"></div>
					</div>
				</div>
				<div class="cd-charts-row">
					<div class="cd-card cd-card-wide">
						<div class="cd-card-title">Engagement over time</div>
						<div class="cd-chart-engagement"></div>
					</div>
				</div>
				<div class="cd-card cd-card-wide">
					<div class="cd-card-title">Recent posts</div>
					<div class="cd-table-posts"></div>
				</div>
			</div>
		`);
		this.$root = $(this.page.body).find(".competitor-dashboard-root");
	}

	bind_filter() {
		this.$root.find(".cd-competitor-select").on("change", (e) => {
			this.selected_competitor = e.target.value;
			this.refresh();
		});
	}

	async refresh() {
		const data = await frappe.call({
			method: "competitor_tracking.dashboard_api.get_dashboard_data",
			args: { competitor: this.selected_competitor },
			freeze: false,
		});
		this.data = data.message;
		this.populate_competitor_select();
		this.render_kpis();
		this.render_posts_over_time();
		this.render_category_breakdown();
		this.render_engagement_over_time();
		this.render_table();
	}

	populate_competitor_select() {
		const $select = this.$root.find(".cd-competitor-select");
		if ($select.data("populated")) return;
		(this.data.competitors || []).forEach((c) => {
			$select.append(`<option value="${frappe.utils.escape_html(c.name)}">${frappe.utils.escape_html(c.name)}</option>`);
		});
		$select.data("populated", true);
	}

	render_kpis() {
		const k = this.data.kpi;
		const tiles = [
			{ label: "Total posts", value: this.format_compact(k.total_posts) },
			{ label: "Total reactions", value: this.format_compact(k.total_reactions) },
			{ label: "Top category", value: k.top_category || "—" },
			{ label: "Competitors with posts", value: this.format_compact(k.competitors_with_posts) },
		];
		this.$root.find(".cd-kpi-row").html(
			tiles
				.map(
					(t) => `
				<div class="cd-tile">
					<div class="cd-tile-label">${frappe.utils.escape_html(t.label)}</div>
					<div class="cd-tile-value">${frappe.utils.escape_html(String(t.value))}</div>
				</div>`
				)
				.join("")
		);
	}

	format_compact(n) {
		n = n || 0;
		if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
		if (n >= 1000) return (n / 1000).toFixed(1) + "K";
		return String(n);
	}

	// ---------- Chart: Posts over time (single-series line) ----------
	render_posts_over_time() {
		const el = this.$root.find(".cd-chart-posts")[0];
		const points = (this.data.posts_over_time || []).map((d) => ({ x: d.week, y: d.count }));
		renderLineChart(el, [{ name: "Posts", color: "var(--cd-series-1)", points }], {
			emptyMessage: "No posts scraped yet for this selection.",
			yLabel: "posts",
		});
	}

	// ---------- Chart: Category breakdown (single-hue horizontal bar) ----------
	render_category_breakdown() {
		const el = this.$root.find(".cd-chart-categories")[0];
		const rows = (this.data.category_breakdown || []).map((d) => ({ label: d.category, value: d.count }));
		renderBarChart(el, rows, { emptyMessage: "No classified posts yet." });
	}

	// ---------- Chart: Engagement over time (3-series line) ----------
	render_engagement_over_time() {
		const el = this.$root.find(".cd-chart-engagement")[0];
		const rows = this.data.engagement_over_time || [];
		const series = [
			{ name: "Reactions", color: "var(--cd-series-1)", points: rows.map((d) => ({ x: d.week, y: d.reactions })) },
			{ name: "Comments", color: "var(--cd-series-2)", points: rows.map((d) => ({ x: d.week, y: d.comments })) },
			{ name: "Reposts", color: "var(--cd-series-3)", points: rows.map((d) => ({ x: d.week, y: d.reposts })) },
		];
		renderLineChart(el, series, { emptyMessage: "No engagement data yet for this selection.", yLabel: "count" });
	}

	// ---------- Recent posts table ----------
	render_table() {
		const rows = this.data.recent_posts || [];
		const showCompetitorCol = !this.selected_competitor;
		if (!rows.length) {
			this.$root.find(".cd-table-posts").html(`<div class="cd-empty">No posts to show.</div>`);
			return;
		}
		const head = `
			<tr>
				${showCompetitorCol ? "<th>Competitor</th>" : ""}
				<th>Category</th>
				<th>Posted</th>
				<th class="cd-num">Reactions</th>
				<th class="cd-num">Comments</th>
				<th class="cd-num">Reposts</th>
				<th>Post</th>
			</tr>`;
		const body = rows
			.map((r) => {
				const cells = [];
				if (showCompetitorCol) cells.push(`<td>${frappe.utils.escape_html(r.competitor || "")}</td>`);
				cells.push(`<td><span class="cd-badge">${frappe.utils.escape_html(r.ai_category)}</span></td>`);
				cells.push(`<td class="cd-muted">${frappe.utils.escape_html(r.posted_date || "")}</td>`);
				cells.push(`<td class="cd-num">${r.reactions_count}</td>`);
				cells.push(`<td class="cd-num">${r.comments_count}</td>`);
				cells.push(`<td class="cd-num">${r.reposts_count}</td>`);
				const safe_text = frappe.utils.escape_html(r.post_text || "");
				const link = r.post_url
					? `<a href="${frappe.utils.escape_html(r.post_url)}" target="_blank" rel="noopener">${safe_text}</a>`
					: safe_text;
				cells.push(`<td class="cd-post-text">${link}</td>`);
				return `<tr>${cells.join("")}</tr>`;
			})
			.join("");
		this.$root.find(".cd-table-posts").html(`<table class="cd-table"><thead>${head}</thead><tbody>${body}</tbody></table>`);
	}

	css() {
		return `
		.competitor-dashboard-root {
			--cd-surface:        #fcfcfb;
			--cd-page-plane:     #f9f9f7;
			--cd-text-primary:   #0b0b0b;
			--cd-text-secondary: #52514e;
			--cd-text-muted:     #898781;
			--cd-gridline:       #e1e0d9;
			--cd-baseline:       #c3c2b7;
			--cd-border:         rgba(11,11,11,0.10);
			--cd-series-1:       #2a78d6;
			--cd-series-2:       #eb6834;
			--cd-series-3:       #1baf7a;
			font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
			padding: 4px 4px 24px;
		}
		html[data-theme="dark"] .competitor-dashboard-root {
			--cd-surface:        #1a1a19;
			--cd-page-plane:     #0d0d0d;
			--cd-text-primary:   #ffffff;
			--cd-text-secondary: #c3c2b7;
			--cd-text-muted:     #898781;
			--cd-gridline:       #2c2c2a;
			--cd-baseline:       #383835;
			--cd-border:         rgba(255,255,255,0.10);
			--cd-series-1:       #3987e5;
			--cd-series-2:       #d95926;
			--cd-series-3:       #199e70;
		}
		.cd-filter-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
		.cd-filter-label { color: var(--cd-text-secondary); font-size: 13px; }
		.cd-competitor-select { max-width: 280px; }
		.cd-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
		.cd-tile {
			background: var(--cd-surface);
			border: 1px solid var(--cd-border);
			border-radius: 8px;
			padding: 14px 16px;
		}
		.cd-tile-label { color: var(--cd-text-secondary); font-size: 12px; margin-bottom: 6px; }
		.cd-tile-value { color: var(--cd-text-primary); font-size: 24px; font-weight: 600; }
		.cd-charts-row { display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px; }
		.cd-card {
			background: var(--cd-surface);
			border: 1px solid var(--cd-border);
			border-radius: 8px;
			padding: 16px;
			min-width: 0;
		}
		.cd-card-wide { grid-column: span 1; }
		.cd-card-title { color: var(--cd-text-primary); font-size: 14px; font-weight: 600; margin-bottom: 12px; }
		.cd-empty { color: var(--cd-text-muted); font-size: 13px; padding: 24px 0; text-align: center; }
		.cd-legend { display: flex; gap: 16px; margin-bottom: 8px; flex-wrap: wrap; }
		.cd-legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--cd-text-secondary); }
		.cd-legend-swatch { width: 14px; height: 2px; border-radius: 1px; }
		.cd-legend-value { color: var(--cd-text-primary); font-weight: 600; }
		.cd-tooltip {
			position: absolute;
			background: var(--cd-text-primary);
			color: var(--cd-surface);
			font-size: 12px;
			padding: 6px 10px;
			border-radius: 6px;
			pointer-events: none;
			z-index: 10;
			white-space: nowrap;
			transform: translate(-50%, -100%);
			opacity: 0;
			transition: opacity 0.1s;
		}
		.cd-tooltip-row { display: flex; gap: 8px; align-items: center; }
		.cd-tooltip-key { display: inline-block; width: 10px; height: 2px; border-radius: 1px; }
		.cd-tooltip-value { font-weight: 700; }
		.cd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
		.cd-table th {
			text-align: left;
			color: var(--cd-text-muted);
			font-weight: 500;
			font-size: 12px;
			padding: 6px 10px;
			border-bottom: 1px solid var(--cd-gridline);
		}
		.cd-table td {
			padding: 8px 10px;
			border-bottom: 1px solid var(--cd-gridline);
			color: var(--cd-text-primary);
			vertical-align: top;
		}
		.cd-table .cd-num { text-align: right; font-variant-numeric: tabular-nums; }
		.cd-table .cd-muted { color: var(--cd-text-muted); }
		.cd-post-text { max-width: 420px; color: var(--cd-text-secondary); }
		.cd-post-text a { color: var(--cd-text-secondary); text-decoration: none; }
		.cd-post-text a:hover { text-decoration: underline; }
		.cd-badge {
			display: inline-block;
			background: var(--cd-page-plane);
			border: 1px solid var(--cd-border);
			color: var(--cd-text-primary);
			font-size: 12px;
			padding: 2px 8px;
			border-radius: 12px;
		}
		@media (max-width: 900px) {
			.cd-kpi-row { grid-template-columns: repeat(2, 1fr); }
			.cd-charts-row { grid-template-columns: 1fr; }
		}
		`;
	}
}

// ============================================================
// Reusable hand-built SVG charts, following the dataviz skill's
// mark specs (thin lines, rounded bar ends, hairline gridlines,
// hover crosshair/tooltip, sparing direct labels).
// ============================================================

function renderLineChart(container, series, opts) {
	opts = opts || {};
	container.innerHTML = "";
	const allPoints = series.flatMap((s) => s.points);
	if (!allPoints.length || allPoints.every((p) => p.y == null)) {
		container.innerHTML = `<div class="cd-empty">${frappe.utils.escape_html(opts.emptyMessage || "No data.")}</div>`;
		return;
	}

	const width = container.clientWidth || 480;
	const height = 220;
	const margin = { top: 12, right: 16, bottom: 28, left: 40 };
	const innerW = width - margin.left - margin.right;
	const innerH = height - margin.top - margin.bottom;

	const xLabels = series[0].points.map((p) => p.x);
	const maxY = Math.max(1, ...allPoints.map((p) => p.y || 0));
	const niceMax = niceCeiling(maxY);

	const xPos = (i) => (xLabels.length > 1 ? (i / (xLabels.length - 1)) * innerW : innerW / 2);
	const yPos = (v) => innerH - (v / niceMax) * innerH;

	// legend (>=2 series get one; single series relies on the card title)
	let legendHtml = "";
	if (series.length > 1) {
		legendHtml = `<div class="cd-legend">${series
			.map((s) => {
				const last = s.points[s.points.length - 1];
				return `<div class="cd-legend-item">
					<span class="cd-legend-swatch" style="background:${s.color}"></span>
					${frappe.utils.escape_html(s.name)}
					<span class="cd-legend-value">${last ? last.y : ""}</span>
				</div>`;
			})
			.join("")}</div>`;
	}

	const gridLines = [0, 0.5, 1]
		.map((frac) => {
			const y = margin.top + innerH * (1 - frac);
			const val = Math.round(niceMax * frac);
			return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" class="cd-grid" />
				<text x="${margin.left - 8}" y="${y}" class="cd-axis-label" text-anchor="end" dominant-baseline="middle">${val}</text>`;
		})
		.join("");

	const xTicks = xLabels
		.map((label, i) => {
			if (xLabels.length > 6 && i % Math.ceil(xLabels.length / 6) !== 0) return "";
			const x = margin.left + xPos(i);
			return `<text x="${x}" y="${height - 8}" class="cd-axis-label" text-anchor="middle">${frappe.utils.escape_html(shortLabel(label))}</text>`;
		})
		.join("");

	const seriesSvg = series
		.map((s, si) => {
			const pts = s.points.map((p, i) => [margin.left + xPos(i), margin.top + yPos(p.y || 0)]);
			const pathD = pts.length > 1
				? "M " + pts.map((p) => p.join(",")).join(" L ")
				: null;
			const line = pathD
				? `<path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`
				: "";
			const dots = pts
				.map(
					([x, y], i) => `<circle cx="${x}" cy="${y}" r="4" fill="${s.color}" stroke="var(--cd-surface)" stroke-width="2"
						class="cd-point" data-series="${si}" data-index="${i}" />`
				)
				.join("");
			return line + dots;
		})
		.join("");

	container.innerHTML = `
		${legendHtml}
		<div style="position:relative;">
			<svg width="${width}" height="${height}" class="cd-svg">
				${gridLines}
				<line x1="${margin.left}" x2="${width - margin.right}" y1="${margin.top + innerH}" y2="${margin.top + innerH}" class="cd-baseline" />
				${seriesSvg}
				${xTicks}
			</svg>
			<div class="cd-crosshair"></div>
			<div class="cd-tooltip"></div>
		</div>
		<style>
			.cd-grid { stroke: var(--cd-gridline); stroke-width: 1; }
			.cd-baseline { stroke: var(--cd-baseline); stroke-width: 1; }
			.cd-axis-label { fill: var(--cd-text-muted); font-size: 11px; }
			.cd-point { cursor: pointer; }
			.cd-crosshair { position: absolute; top: ${margin.top}px; bottom: ${margin.bottom}px; width: 1px; background: var(--cd-baseline); opacity: 0; pointer-events: none; }
		</style>
	`;

	attachLineHover(container, { series, margin, innerW, innerH, xLabels, xPos });
}

function attachLineHover(container, ctx) {
	const svg = container.querySelector(".cd-svg");
	const crosshair = container.querySelector(".cd-crosshair");
	const tooltip = container.querySelector(".cd-tooltip");
	if (!svg || !ctx.xLabels.length) return;

	const wrap = container.querySelector("div[style*='relative']");

	function showAt(i) {
		const x = ctx.margin.left + ctx.xPos(i);
		crosshair.style.left = x + "px";
		crosshair.style.opacity = "1";
		const rows = ctx.series
			.map(
				(s) => `<div class="cd-tooltip-row">
					<span class="cd-tooltip-key" style="background:${s.color}"></span>
					${frappe.utils.escape_html(s.name)}:
					<span class="cd-tooltip-value">${s.points[i] ? s.points[i].y : "—"}</span>
				</div>`
			)
			.join("");
		tooltip.innerHTML = `<div>${frappe.utils.escape_html(ctx.xLabels[i])}</div>${rows}`;
		tooltip.style.left = x + "px";
		tooltip.style.top = "0px";
		tooltip.style.opacity = "1";
	}

	function hide() {
		crosshair.style.opacity = "0";
		tooltip.style.opacity = "0";
	}

	wrap.addEventListener("pointermove", (e) => {
		const rect = svg.getBoundingClientRect();
		const relX = e.clientX - rect.left - ctx.margin.left;
		const frac = ctx.innerW > 0 ? relX / ctx.innerW : 0;
		const i = Math.round(frac * (ctx.xLabels.length - 1));
		if (i < 0 || i >= ctx.xLabels.length) {
			hide();
			return;
		}
		showAt(i);
	});
	wrap.addEventListener("pointerleave", hide);
}

function renderBarChart(container, rows, opts) {
	opts = opts || {};
	container.innerHTML = "";
	if (!rows.length) {
		container.innerHTML = `<div class="cd-empty">${frappe.utils.escape_html(opts.emptyMessage || "No data.")}</div>`;
		return;
	}

	const width = container.clientWidth || 280;
	const rowHeight = 32;
	const barHeight = 16;
	const margin = { top: 4, right: 44, bottom: 4, left: 4 };
	const height = rows.length * rowHeight + margin.top + margin.bottom;
	const maxLabelWidth = 120;
	const barAreaX = margin.left + maxLabelWidth;
	const barAreaW = width - barAreaX - margin.right;
	const maxVal = Math.max(1, ...rows.map((r) => r.value));

	const bars = rows
		.map((r, i) => {
			const y = margin.top + i * rowHeight + (rowHeight - barHeight) / 2;
			const barW = Math.max(2, (r.value / maxVal) * barAreaW);
			return `
				<text x="${barAreaX - 8}" y="${y + barHeight / 2}" text-anchor="end" dominant-baseline="middle" class="cd-bar-label">${frappe.utils.escape_html(truncate(r.label, 16))}</text>
				<rect x="${barAreaX}" y="${y}" width="${barW}" height="${barHeight}" rx="4" fill="var(--cd-series-1)"
					class="cd-bar" data-index="${i}" />
				<text x="${barAreaX + barW + 8}" y="${y + barHeight / 2}" dominant-baseline="middle" class="cd-bar-value">${r.value}</text>
			`;
		})
		.join("");

	container.innerHTML = `
		<div style="position:relative;">
			<svg width="${width}" height="${height}" class="cd-bar-svg">${bars}</svg>
			<div class="cd-tooltip"></div>
		</div>
		<style>
			.cd-bar-label { fill: var(--cd-text-secondary); font-size: 12px; }
			.cd-bar-value { fill: var(--cd-text-primary); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
			.cd-bar { cursor: pointer; }
			.cd-bar:hover { opacity: 0.85; }
		</style>
	`;

	const svg = container.querySelector(".cd-bar-svg");
	const tooltip = container.querySelector(".cd-tooltip");
	svg.querySelectorAll(".cd-bar").forEach((bar) => {
		bar.addEventListener("pointermove", (e) => {
			const idx = Number(bar.dataset.index);
			const row = rows[idx];
			const rect = svg.getBoundingClientRect();
			tooltip.textContent = `${row.label}: ${row.value}`;
			tooltip.style.left = e.clientX - rect.left + "px";
			tooltip.style.top = "0px";
			tooltip.style.opacity = "1";
		});
		bar.addEventListener("pointerleave", () => (tooltip.style.opacity = "0"));
	});
}

function niceCeiling(v) {
	if (v <= 5) return 5;
	const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
	const norm = v / magnitude;
	let step;
	if (norm <= 1) step = 1;
	else if (norm <= 2) step = 2;
	else if (norm <= 5) step = 5;
	else step = 10;
	return step * magnitude;
}

function shortLabel(label) {
	// week labels are ISO dates (YYYY-MM-DD); show as "Sep 7"
	const d = new Date(label);
	if (!isNaN(d.getTime())) {
		return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}
	return label;
}

function truncate(str, n) {
	str = str || "";
	return str.length > n ? str.slice(0, n - 1) + "…" : str;
}
