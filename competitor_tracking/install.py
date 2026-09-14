import frappe

DEFAULT_UPLOAD_TYPES = ["Uploader", "Opportunity"]


def after_install():
	seed_competitor_upload_types()


def seed_competitor_upload_types():
	for upload_type in DEFAULT_UPLOAD_TYPES:
		if not frappe.db.exists("Competitor Upload Type", upload_type):
			frappe.get_doc(
				{"doctype": "Competitor Upload Type", "name": upload_type}
			).insert(ignore_permissions=True)
