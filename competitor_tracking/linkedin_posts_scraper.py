import asyncio

import frappe
from frappe.utils import cint, now_datetime, nowdate


def get_linkedin_settings():
	return frappe.get_single("LinkedIn Scraper Settings")


async def _authenticate(browser, settings):
	from linkedin_scraper import login_with_cookie, login_with_credentials

	if settings.auth_method == "Cookie":
		cookie = settings.get_password("li_at_cookie", raise_exception=False)
		if not cookie:
			frappe.throw("li_at Cookie Value is not set in LinkedIn Scraper Settings.")
		await login_with_cookie(browser.page, cookie)
	else:
		email = settings.linkedin_email
		password = settings.get_password("linkedin_password", raise_exception=False)
		if not email or not password:
			frappe.throw("LinkedIn Email/Password is not set in LinkedIn Scraper Settings.")
		await login_with_credentials(browser.page, email, password)


async def _scrape_posts_async(linkedin_url, limit):
	from linkedin_scraper import BrowserManager, CompanyPostsScraper

	settings = get_linkedin_settings()
	async with BrowserManager(headless=True) as browser:
		await _authenticate(browser, settings)
		scraper = CompanyPostsScraper(browser.page)
		posts = await scraper.scrape(linkedin_url, limit=limit)
	return posts


def _get_existing_post_urls(competitor_name):
	log_names = frappe.get_all("Competitor Log", filters={"competitor": competitor_name}, pluck="name")
	if not log_names:
		return set()
	return set(
		frappe.get_all(
			"Competitor LinkedIn Post",
			filters={"parent": ["in", log_names]},
			pluck="post_url",
		)
	)


@frappe.whitelist()
def scrape_competitor_linkedin_posts(competitor_name):
	"""Scrape LinkedIn posts for one Competitor and log any not already recorded.

	Whitelisted so it can be triggered manually (e.g. a form button); also
	called per-competitor by the daily scheduler in `scrape_all_competitors`.
	"""
	competitor = frappe.get_doc("Competitor", competitor_name)
	linkedin_url = (competitor.get("custom_linkedin_url") or "").strip()
	if not linkedin_url:
		return {"success": False, "error": "No LinkedIn Company URL set on this Competitor."}

	settings = get_linkedin_settings()
	limit = cint(settings.posts_per_competitor) or 10

	try:
		posts = asyncio.run(_scrape_posts_async(linkedin_url, limit))
	except Exception as e:
		frappe.log_error(
			f"LinkedIn scrape failed for {competitor_name}: {str(e)}", "LinkedIn Posts Scraper"
		)
		return {"success": False, "error": str(e)}

	if not posts:
		return {"success": True, "new_posts": 0, "message": "No posts found."}

	existing_urls = _get_existing_post_urls(competitor_name)
	new_posts = [p for p in posts if p.linkedin_url and p.linkedin_url not in existing_urls]

	if not new_posts:
		return {"success": True, "new_posts": 0, "message": "No new posts since last scrape."}

	from competitor_tracking.ai_classifier import classify_post_text

	log = frappe.new_doc("Competitor Log")
	log.competitor = competitor_name
	log.creation_date = nowdate()
	log.log_source = "LinkedIn Scraper"
	for post in new_posts:
		log.append(
			"linkedin_posts",
			{
				"post_url": post.linkedin_url,
				"ai_category": classify_post_text(post.text, settings=settings),
				"posted_date": post.posted_date,
				"scraped_on": now_datetime(),
				"reactions_count": post.reactions_count or 0,
				"comments_count": post.comments_count or 0,
				"reposts_count": post.reposts_count or 0,
				"post_text": post.text,
				"image_urls": "\n".join(post.image_urls or []),
				"video_url": post.video_url,
				"article_url": post.article_url,
			},
		)
	log.insert(ignore_permissions=True)
	frappe.db.commit()

	return {"success": True, "new_posts": len(new_posts), "log": log.name}


def scrape_all_competitors():
	"""Scheduled (daily): scrape LinkedIn posts for every Competitor that has
	a LinkedIn Company URL set, provided the scraper is enabled in settings."""
	settings = get_linkedin_settings()
	if not cint(settings.enabled):
		return

	competitor_names = frappe.get_all(
		"Competitor",
		filters={"custom_linkedin_url": ["is", "set"]},
		pluck="name",
	)
	for competitor_name in competitor_names:
		try:
			scrape_competitor_linkedin_posts(competitor_name)
		except Exception as e:
			frappe.log_error(
				f"LinkedIn scrape failed for {competitor_name}: {str(e)}", "LinkedIn Posts Scraper"
			)
