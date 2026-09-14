import frappe
from frappe.utils import add_days, get_datetime, getdate

MAX_CATEGORY_SLOTS = 7  # fold the tail into "Other" past this (dataviz series-count ladder)


def _week_bucket(dt):
	"""ISO-week-start (Monday) date string for a datetime, used as the time axis."""
	d = getdate(dt)
	return str(add_days(d, -d.weekday()))


@frappe.whitelist()
def get_dashboard_data(competitor=None):
	competitor = (competitor or "").strip() or None

	log_filters = {}
	if competitor:
		log_filters["competitor"] = competitor

	log_names = frappe.get_all("Competitor Log", filters=log_filters, pluck="name")

	competitors = frappe.get_all(
		"Competitor", fields=["name", "custom_country"], order_by="name asc"
	)

	if not log_names:
		return {
			"competitors": competitors,
			"kpi": {"total_posts": 0, "total_reactions": 0, "top_category": None, "competitors_with_posts": 0},
			"posts_over_time": [],
			"category_breakdown": [],
			"engagement_over_time": [],
			"recent_posts": [],
		}

	rows = frappe.get_all(
		"Competitor LinkedIn Post",
		filters={"parent": ["in", log_names]},
		fields=[
			"parent",
			"post_url",
			"ai_category",
			"posted_date",
			"scraped_on",
			"reactions_count",
			"comments_count",
			"reposts_count",
			"post_text",
		],
		order_by="scraped_on desc",
	)

	# parent (Competitor Log name) -> competitor name, for "All Competitors" grouping
	log_to_competitor = {
		r.name: r.competitor
		for r in frappe.get_all(
			"Competitor Log", filters={"name": ["in", log_names]}, fields=["name", "competitor"]
		)
	}

	# --- KPIs ---
	total_posts = len(rows)
	total_reactions = sum(r.reactions_count or 0 for r in rows)
	category_counts = {}
	competitors_seen = set()
	for r in rows:
		cat = r.ai_category or "Uncategorized"
		category_counts[cat] = category_counts.get(cat, 0) + 1
		competitors_seen.add(log_to_competitor.get(r.parent))

	top_category = max(category_counts, key=category_counts.get) if category_counts else None

	# --- Category breakdown (fold long tail into "Other") ---
	sorted_categories = sorted(category_counts.items(), key=lambda kv: kv[1], reverse=True)
	if len(sorted_categories) > MAX_CATEGORY_SLOTS:
		head = sorted_categories[: MAX_CATEGORY_SLOTS - 1]
		tail_count = sum(c for _, c in sorted_categories[MAX_CATEGORY_SLOTS - 1 :])
		sorted_categories = head + [("Other", tail_count)]
	category_breakdown = [{"category": name, "count": count} for name, count in sorted_categories]

	# --- Posts over time + engagement over time (weekly buckets) ---
	weekly_posts = {}
	weekly_engagement = {}
	for r in rows:
		week = _week_bucket(r.scraped_on or r.posted_date or frappe.utils.now())
		weekly_posts[week] = weekly_posts.get(week, 0) + 1
		bucket = weekly_engagement.setdefault(week, {"reactions": 0, "comments": 0, "reposts": 0})
		bucket["reactions"] += r.reactions_count or 0
		bucket["comments"] += r.comments_count or 0
		bucket["reposts"] += r.reposts_count or 0

	weeks_sorted = sorted(weekly_posts.keys())
	posts_over_time = [{"week": w, "count": weekly_posts[w]} for w in weeks_sorted]
	engagement_over_time = [
		{"week": w, **weekly_engagement[w]} for w in weeks_sorted
	]

	# --- Recent posts table ---
	recent_posts = [
		{
			"competitor": log_to_competitor.get(r.parent),
			"post_url": r.post_url,
			"ai_category": r.ai_category or "Uncategorized",
			"posted_date": r.posted_date,
			"reactions_count": r.reactions_count or 0,
			"comments_count": r.comments_count or 0,
			"reposts_count": r.reposts_count or 0,
			"post_text": (r.post_text or "")[:280],
		}
		for r in rows[:50]
	]

	return {
		"competitors": competitors,
		"kpi": {
			"total_posts": total_posts,
			"total_reactions": total_reactions,
			"top_category": top_category,
			"competitors_with_posts": len(competitors_seen),
		},
		"posts_over_time": posts_over_time,
		"category_breakdown": category_breakdown,
		"engagement_over_time": engagement_over_time,
		"recent_posts": recent_posts,
	}
