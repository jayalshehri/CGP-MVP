"""Exercise the shipped app with genuine login sessions, RLS, RPCs and Storage bytes."""

import hashlib
import json
import re
import struct
import sys
import zlib
from pathlib import Path
from urllib.parse import quote, urlsplit

from playwright.sync_api import expect, sync_playwright


config = json.load(sys.stdin)
api, app = config["api"], config["app"]
assert api == "http://127.0.0.1:54321" and app == "http://127.0.0.1:3847"
target = Path("nudee-real-qa-evidence")
target.mkdir(exist_ok=True)
register = "/data-governance/nudee"
home = register + "-dashboard"
name = "سياسة التصنيف التجريبية"
review_note = "أرفق النسخة المحدثة من سياسة التصنيف."
passed = []


def checkpoint(step, **observations):
    passed.append({"step": step, **observations})
    (target / "observations.json").write_text(json.dumps(passed, ensure_ascii=False, indent=2))
    print("PASS", step, flush=True)


def login(browser, role, width, height):
    credentials = config["personas"][role]
    context = browser.new_context(viewport={"width": width, "height": height}, locale="ar-SA", timezone_id="Asia/Riyadh")
    page = context.new_page()
    page.set_default_timeout(30000)
    page.goto(app + "/login")
    try:
        page.get_by_label("البريد الإلكتروني").fill(credentials["email"])
        page.get_by_label("كلمة المرور").fill(credentials["password"])
        with page.expect_response(lambda r: r.url.startswith(api + "/auth/v1/token?") and r.request.method == "POST") as auth:
            page.get_by_role("button", name="دخول إلى CGP").click()
        assert auth.value.ok
        session = auth.value.json()
        assert session["user"]["id"] == credentials["id"]
    except Exception:
        raise AssertionError(f"{role} could not authenticate against disposable local Auth") from None
    expect(page).to_have_url(app + (home if role == "office" else register), timeout=45000)
    headers = {"apikey": config["publicKey"], "Authorization": "Bearer " + session["access_token"]}
    return page, headers


def rows(page, headers, table, **filters):
    response = page.request.get(api + "/rest/v1/" + table, headers=headers, params=filters)
    assert response.ok, f"{table} read returned {response.status}"
    return response.json()


def screenshot(page, filename):
    page.evaluate("document.fonts.ready")
    page.screenshot(path=target / filename, animations="disabled")


def png(red):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes([0, red, 90, 100]))) + chunk(b"IEND", b"")


with sync_playwright() as driver:
    browser = driver.chromium.launch()
    office, office_headers = login(browser, "office", 1440, 900)
    office.get_by_role("link", name=re.compile("إسناد المتطلبات")).wait_for()
    screenshot(office, "office-before-assignment.png")
    owner, owner_headers = login(browser, "owner", 390, 844)
    other, other_headers = login(browser, "other", 820, 1180)
    for page, headers in [(owner, owner_headers), (other, other_headers)]:
        page.get_by_text("لا توجد متطلبات مسندة إلى حسابك حاليًا.").wait_for()
        assert rows(page, headers, "nudee_requirements", select="id") == []
    checkpoint("Three independent real Auth sessions and correct landing pages")

    office.get_by_role("link", name=re.compile("إسناد المتطلبات")).click()
    office.get_by_role("button", name=name, exact=True).click()
    office.get_by_label("المسؤول عن رفع الدليل").select_option(config["personas"]["owner"]["id"])
    office.get_by_role("button", name="حفظ التكليف").click()
    office.get_by_text("تم إنشاء التكليف", exact=True).wait_for()
    assigned, = rows(owner, owner_headers, "nudee_assignments", select="id,status,assignee_id,assigned_by")
    assert assigned["status"] == "assigned" and assigned["assignee_id"] == config["personas"]["owner"]["id"]
    assert assigned["assigned_by"] == config["personas"]["office"]["id"]
    checkpoint("Office assigned the requirement through the browser")
    assignment_id = f'eq.{assigned["id"]}'
    hashes = []
    for version in (1, 2):
        owner.reload()
        owner.get_by_role("button", name=name, exact=True).click()
        panel = owner.get_by_role("dialog", name=name)
        if version == 2:
            expect(panel.get_by_text(review_note, exact=False)).to_be_visible()
        filename = f"evidence-v{version}.png"
        content = png(40 * version)
        panel.get_by_label("ملف الدليل").set_input_files({"name": filename, "mimeType": "image/png", "buffer": content})
        panel.get_by_role("button", name="رفع وإرسال للمراجعة").click()
        panel.get_by_role("button", name=re.compile(filename)).wait_for()
        record, = rows(office, office_headers, "nudee_assignments", id=assignment_id, select="status")
        assert record["status"] == "submitted"
        evidence = rows(office, office_headers, "nudee_submissions", assignment_id=assignment_id,
                        select="file_name,storage_path,submitted_by", order="id.asc")
        assert len(evidence) == version and evidence[-1]["file_name"] == filename
        assert evidence[-1]["submitted_by"] == config["personas"]["owner"]["id"]
        response = office.request.get(api + "/storage/v1/object/authenticated/nudee-evidence/" +
                                      quote(evidence[-1]["storage_path"], safe="/"), headers=office_headers)
        assert response.ok and response.body() == content, "Authenticated Storage download did not match uploaded bytes"
        digest = hashlib.sha256(content).hexdigest()
        hashes.append(digest)
        assert rows(other, other_headers, "nudee_assignments", select="id") == []
        assert rows(other, other_headers, "nudee_submissions", select="id") == []
        checkpoint(f"Owner sent version {version}; office downloaded identical bytes", sha256=digest, size=len(content))
        screenshot(owner, f"owner-mobile-submitted-v{version}.png")
        office.goto(app + register + "?view=submitted")
        office.get_by_role("button", name=name, exact=True).click()
        review = office.get_by_role("dialog", name=name)
        with office.expect_popup() as opened:
            review.get_by_role("button", name=re.compile(filename)).click()
        popup = opened.value
        popup.wait_for_url(re.compile(r"/storage/v1/object/sign/nudee-evidence/"))
        assert urlsplit(popup.url).netloc == urlsplit(api).netloc
        signed = office.request.get(popup.url)
        assert signed.ok and signed.body() == content, "Signed preview returned different bytes"
        popup.close()
        if version == 1:
            review.get_by_label(re.compile("ملاحظات المراجعة")).fill(review_note)
            review.get_by_role("button", name="إعادة للتعديل").click()
            review.get_by_text("أعيد الدليل للمكلّف", exact=True).wait_for()
            record, = rows(owner, owner_headers, "nudee_assignments", id=assignment_id, select="status,review_notes")
            assert record == {"status": "changes_requested", "review_notes": review_note}
            checkpoint("Reviewer returned the first version with a persisted note")
        else:
            screenshot(office, "office-second-review.png")
            review.get_by_role("button", name="اعتماد الدليل").click()
            review.get_by_text("تم اعتماد الدليل", exact=True).wait_for()
            record, = rows(office, office_headers, "nudee_assignments", id=assignment_id, select="status,reviewer_id")
            assert record["status"] == "approved" and record["reviewer_id"] == config["personas"]["office"]["id"]
    assert hashes[0] != hashes[1]
    history = rows(office, office_headers, "nudee_audit", assignment_id=assignment_id, select="action,actor_id", order="id.asc")
    assert [event["action"] for event in history] == ["assigned", "submitted", "changes_requested", "submitted", "approved"]
    assert [event["actor_id"] for event in history] == [config["personas"][r]["id"] for r in ["office","owner","office","owner","office"]]
    office.goto(app + home)
    metric = office.locator("dl div").filter(has=office.get_by_text("معتمدة", exact=True)).locator("dd")
    expect(metric).to_have_text(re.compile("^[1١]$"))
    expect(office.get_by_text("اعتماد دليل", exact=True)).to_be_visible()
    assert rows(other, other_headers, "nudee_audit", select="id") == []
    screenshot(office, "office-after-approval.png")
    checkpoint("Approval persisted, dashboard reflects one approval, five audit events retain their actors")
    browser.close()
