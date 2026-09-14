import frappe
import requests

CATEGORY_DEFINITIONS = {
	"New Client": "Announcing a new customer, contract win, or deal signed",
	"Publicity & Marketing": "General brand awareness, promotional campaigns, media coverage",
	"New Technology": "Launching or updating a product, app, or technical feature",
	"New Discovery": "R&D findings, patents, research breakthroughs, innovation results",
	"Partnership & Collaboration": "Announcing an alliance, MOU, or joint venture with another company",
	"Hiring & Team Growth": "Job openings, recruiting, welcoming new hires, headcount/office expansion",
	"Award & Recognition": "Winning an award, certification, or industry recognition",
	"Event & Conference": "Participating in or hosting an event, expo, or conference",
	"CSR & Community": "Charity, social responsibility, national days, community service, tributes",
	"Employee Appreciation": "Thanking or praising EXISTING employees/teams for their work, dedication, or achievements (not about recruiting)",
	"Other": "Anything that doesn't clearly fit the above",
}

_LABEL_LINES = "\n".join(f"- {name}: {desc}" for name, desc in CATEGORY_DEFINITIONS.items())

PROMPT_TEMPLATE = """You are classifying a LinkedIn company post into exactly one category.

Categories:
{labels}

Post: "{post_text}"

Respond with ONLY the exact category name from the list above, nothing else."""


def classify_post_text(post_text, settings=None):
	"""Classify a single post's text using a local Ollama model.

	Returns the matched category name, or None if classification is
	disabled, misconfigured, unreachable, or the model's reply doesn't
	match a known category - callers should treat None as "leave blank",
	never as a hard failure.
	"""
	if not post_text or not post_text.strip():
		return None

	if settings is None:
		settings = frappe.get_single("LinkedIn Scraper Settings")

	if not settings.get("enable_ai_classification"):
		return None

	host = (settings.get("ollama_host") or "http://127.0.0.1:11434").rstrip("/")
	model = settings.get("ollama_model") or "qwen2.5:3b"

	prompt = PROMPT_TEMPLATE.format(labels=_LABEL_LINES, post_text=post_text[:2000])

	try:
		response = requests.post(
			f"{host}/api/generate",
			json={
				"model": model,
				"prompt": prompt,
				"stream": False,
				"options": {"temperature": 0},
			},
			timeout=60,
		)
		response.raise_for_status()
		raw = (response.json().get("response") or "").strip()
	except Exception as e:
		frappe.log_error(
			message=f"Ollama classification request failed: {str(e)}",
			title="LinkedIn Post AI Classification",
		)
		return None

	# Exact match first, then a tolerant substring match in case the model
	# added stray punctuation/whitespace around the label.
	if raw in CATEGORY_DEFINITIONS:
		return raw
	for name in CATEGORY_DEFINITIONS:
		if name.lower() in raw.lower():
			return name
	return None


@frappe.whitelist()
def reclassify_competitor_log(competitor_log_name):
	"""Re-run AI classification on every LinkedIn post row in one Competitor
	Log - useful after tweaking labels/model, or to backfill posts scraped
	before this feature existed."""
	doc = frappe.get_doc("Competitor Log", competitor_log_name)
	settings = frappe.get_single("LinkedIn Scraper Settings")

	updated = 0
	for row in doc.linkedin_posts:
		category = classify_post_text(row.post_text, settings=settings)
		if category:
			row.ai_category = category
			updated += 1
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {"success": True, "updated": updated, "total": len(doc.linkedin_posts)}
