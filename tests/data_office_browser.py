"""Run with a local production build configured for the synthetic API in the fixture."""

import argparse
import json
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from data_office_browser_fixture import APP, NAMES, OWNER, Fixture


REGISTER = "/data-governance/nudee"
HOME = REGISTER + "-dashboard"
SIZES = {"desktop": (1440, 900), "tablet": (820, 1180), "phone": (390, 844)}


def login(browser, fixture, role, width, height):
    context = browser.new_context(viewport={"width": width, "height": height},
                                  locale="ar-SA", timezone_id="Asia/Riyadh", service_workers="block")
    fixture.install(context, role)
    page = context.new_page()
    page.set_default_timeout(15000)
    page.goto(APP + "/login")
    page.get_by_label("البريد الإلكتروني").fill(f"{role}@example.test")
    page.get_by_label("كلمة المرور").fill("fixture-only")
    page.get_by_role("button", name="دخول إلى CGP").click()
    expect(page).to_have_url(re.compile(r"/data-governance/nudee(?:-dashboard)?$"), timeout=20000)
    return page


def snap(page, target, verify_width):
    page.evaluate("document.fonts.ready")
    if verify_width:
        width, content = page.evaluate("() => [innerWidth, document.documentElement.scrollWidth]")
        assert content <= width + 1, f"{target.name}: page width {content} exceeds {width}"
        assert page.locator("html").get_attribute("dir") == "rtl"
    page.screenshot(path=target, animations="disabled")


def check_layout(browser, revision, size, target):
    fixture = Fixture()
    width, height = SIZES[size]
    after = revision == "after"
    office = login(browser, fixture, "office", width, height)
    if after:
        expect(office).to_have_url(APP + HOME)
    else:
        office.goto(APP + HOME)
    new_heading = office.get_by_role("heading", level=1, name="مكتب إدارة البيانات", exact=True)
    old_heading = office.get_by_role("heading", level=1, name="لوحة مؤشر نُضيء", exact=True)
    (new_heading if after else new_heading.or_(old_heading).first).wait_for()
    if new_heading.count():
        office.get_by_text("آخر نشاط للتكليفات", exact=True).wait_for()
        office.get_by_text("تقديم دليل للمراجعة", exact=True).wait_for()
    else:
        office.get_by_role("heading", name="مصفوفة الامتثال حسب المجال").wait_for()
    snap(office, target / f"{size}-office-home.png", after)

    if after:
        summary = office.get_by_text("تقرير نُضيء التفصيلي", exact=True)
        counts = office.locator("dl[aria-label='ملخص متطلبات نُضيء'] dd")
        expect(counts).to_have_count(4)
        initial_counts = counts.all_text_contents()
        assert not any("nudee_final_review" in path for _, _, path in fixture.requests)
        summary.click()
        field = office.get_by_role("combobox", name="المجال", exact=True)
        field.select_option(label="جودة البيانات")
        expect(counts).to_have_text(initial_counts)
        update = office.get_by_role("button", name="تحديث المراجعة الشاملة", exact=True)
        update.click()
        edit = office.get_by_role("dialog", name="تحديث المراجعة الشاملة")
        percent = edit.get_by_role("spinbutton")
        expect(percent).to_have_value("12.5")
        percent.fill("70")
        office.keyboard.press("Escape")
        expect(edit).to_have_count(0)
        expect(update).to_be_focused()
        update.click()
        expect(percent).to_have_value("12.5")
        office.keyboard.press("Escape")
        expect(update).to_be_focused()
        summary.click()
        expect(field).to_be_hidden()
        summary.click()
        expect(field).to_have_value("جودة البيانات")
        summary.click()
        office.get_by_role("link", name=re.compile("متابعة التكليفات المتأخرة")).click()
        expect(office.locator("#nudee-view")).to_have_value("overdue")
        expect(office.locator("tbody tr")).to_have_count(1)
        expect(office.get_by_role("button", name=NAMES[0], exact=True)).to_be_visible()
        office.go_back()
        office.get_by_role("link", name=re.compile("مراجعة الأدلة المقدّمة")).click()
        expect(office.locator("#nudee-view")).to_have_value("submitted")
        expect(office.get_by_role("button", name=NAMES[1], exact=True)).to_be_visible()
        expect(office.get_by_role("button", name=NAMES[0], exact=True)).to_have_count(0)
        office.locator("#nudee-view").select_option("all")
    else:
        office.goto(APP + REGISTER)
    office.locator("#nudee-filter").wait_for()
    snap(office, target / f"{size}-office-register.png", after)

    if after:
        register = office.get_by_role("table", name="سجل متطلبات نُضيء")
        expect(register.locator("tbody tr")).to_have_count(4)
        bulk = office.get_by_role("region", name="الإسناد الجماعي")
        expect(bulk).to_have_count(0)
        office.get_by_role("checkbox", name="تحديد الدليل " + NAMES[2]).check()
        expect(bulk).to_be_visible()
        bulk.get_by_role("button", name="إلغاء التحديد").click()
        expect(bulk).to_have_count(0)
        office.locator("#nudee-filter").fill("missing-test-result")
        office.get_by_text("لا توجد نتائج مطابقة للبحث والحالة.").wait_for()
        office.get_by_role("button", name="عرض كل المتطلبات").click()
        button = office.get_by_role("button", name=NAMES[1], exact=True)
        button.click()
        dialog = office.get_by_role("dialog", name=NAMES[1])
        expect(dialog.get_by_role("button", name="اعتماد الدليل")).to_be_enabled()
        expect(dialog.get_by_role("button", name="إعادة للتعديل")).to_be_disabled()
        snap(office, target / f"{size}-office-review.png", True)
        office.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(button).to_be_focused()
    owner = login(browser, fixture, "owner", width, height)
    expect(owner).to_have_url(APP + REGISTER)
    owner.locator("#nudee-filter").wait_for()
    snap(owner, target / f"{size}-owner-tasks.png", after)
    if after:
        expect(owner.get_by_role("heading", name="مهامي", exact=True)).to_be_visible()
        expect(owner.get_by_role("link", name="عرض المتطلبات")).to_have_count(0)
        expect(owner.get_by_role("checkbox")).to_have_count(0)
        expect(owner.get_by_role("button", name=NAMES[2], exact=True)).to_have_count(0)
        owner.get_by_role("button", name=NAMES[0], exact=True).click()
        dialog = owner.get_by_role("dialog", name=NAMES[0])
        expect(dialog.get_by_label("ملف الدليل")).to_be_enabled()
        expect(dialog.get_by_role("button", name="اعتماد الدليل")).to_have_count(0)
        snap(owner, target / f"{size}-owner-upload.png", True)
    office.context.close()
    owner.context.close()
    assert not fixture.unexpected, fixture.unexpected


def lifecycle(browser, target):
    fixture = Fixture()
    office = login(browser, fixture, "office", *SIZES["desktop"])
    office.get_by_role("link", name=re.compile("إسناد المتطلبات")).click()
    expect(office.locator("#nudee-view")).to_have_value("unassigned")
    office.get_by_role("button", name=NAMES[2], exact=True).click()
    office.get_by_label("المسؤول عن رفع الدليل").select_option(OWNER)
    office.get_by_role("button", name="حفظ التكليف").click()
    office.get_by_text("تم إنشاء التكليف", exact=True).wait_for()
    owner = login(browser, fixture, "owner", *SIZES["phone"])
    for index, decision in enumerate(["changes_requested", "approved"]):
        if index:
            owner.reload()
        owner.get_by_role("button", name=NAMES[2], exact=True).click()
        panel = owner.get_by_role("dialog")
        if index:
            expect(panel.get_by_text("أرفق الإصدار المحدّث.", exact=False)).to_be_visible()
        name = f"example-{index}.pdf"
        panel.locator('input[type="file"]').set_input_files(
            {"name": name, "mimeType": "application/pdf", "buffer": b"%PDF-1.4\n%synthetic fixture\n%%EOF"})
        panel.get_by_role("button", name="رفع وإرسال للمراجعة").click()
        expect(panel.get_by_role("button", name=re.compile(name))).to_be_visible()
        expect(panel.locator('input[type="file"]')).to_have_count(0)
        office.goto(APP + REGISTER + "?view=submitted")
        office.get_by_role("button", name=NAMES[2], exact=True).click()
        review = office.get_by_role("dialog")
        expect(review.get_by_role("button", name=re.compile(name))).to_be_visible()
        if decision == "changes_requested":
            review.get_by_label(re.compile("ملاحظات المراجعة")).fill("أرفق الإصدار المحدّث.")
            review.get_by_role("button", name="إعادة للتعديل").click()
        else:
            review.get_by_role("button", name="اعتماد الدليل").click()
        expect(review.get_by_role("heading", name="قرار المراجعة")).to_have_count(0)
    office.goto(APP + HOME)
    expect(office.locator("dl div").filter(has=office.get_by_text("معتمدة", exact=True)).locator("dd")).to_have_text(re.compile("[2٢]"))
    expect(office.get_by_text("اعتماد دليل", exact=True)).to_be_visible()
    assert [item["action"] for item in reversed(fixture.audit[:5])] == [
        "assigned", "submitted", "changes_requested", "submitted", "approved"]
    assert len(fixture.files) == 3
    assert not fixture.unexpected, fixture.unexpected
    snap(office, target / "office-after-approval.png", True)
    office.goto(APP + "/data-governance")
    expect(office).to_have_url(APP + HOME)
    expect(office.get_by_role("navigation", name="التنقل الرئيسي").get_by_role("link")).to_have_text(
        ["الرئيسية", "المتطلبات والأدلة"])
    owner.goto(APP + "/data-governance")
    expect(owner).to_have_url(APP + REGISTER)
    owner.locator(".cgp-mobile-navigation summary").click()
    mobile_nav = owner.get_by_role("navigation", name="التنقل على الجوال")
    expect(mobile_nav.get_by_role("link", name="مهامي", exact=True)).to_be_visible()
    expect(mobile_nav.get_by_role("link", name="الرئيسية", exact=True)).to_have_count(0)
    office.context.close()
    owner.context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("revision", choices=["before", "after"])
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    results = {}
    with sync_playwright() as runner:
        browser = runner.chromium.launch()
        for size in SIZES:
            try:
                check_layout(browser, args.revision, size, args.output)
            except Exception:
                for index, ctx in enumerate(browser.contexts):
                    for page in ctx.pages:
                        print(page.locator("body").aria_snapshot()[:8000], flush=True)
                        page.screenshot(path=args.output / f"{size}-failure-{index}.png")
                raise
            results[size] = {"viewport": SIZES[size], "office": "passed", "owner": "passed"}
            print(f"PASS {args.revision} desktop/tablet/mobile layout: {size}", flush=True)
        if args.revision == "after":
            lifecycle(browser, args.output)
            results["workflow_with_synthetic_backend"] = "passed"
            print("PASS assignment, upload, return, resubmission, approval, home refresh", flush=True)
        (args.output / "results.json").write_text(json.dumps(results, indent=2))
        browser.close()
