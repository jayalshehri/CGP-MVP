"""Run with a local production build configured for the synthetic API in the fixture."""

import argparse
import json
import re
from pathlib import Path
from zipfile import ZipFile

from playwright.sync_api import expect, sync_playwright

from data_office_browser_fixture import APP, NAMES, OWNER, Fixture


REGISTER = "/data-governance/nudee"
HOME = REGISTER + "-dashboard"
INDICATOR = REGISTER + "-indicator"
SIZES = {"desktop": (1440, 900), "tablet": (820, 1180), "phone": (390, 844)}


def login(browser, fixture, role, width, height, revision):
    context = browser.new_context(viewport={"width": width, "height": height},
                                  locale="ar-SA", timezone_id="Asia/Riyadh", service_workers="block")
    fixture.install(context, role)
    page = context.new_page()
    page.set_default_timeout(15000)
    page.goto(APP + ("/" if revision == "after" else "/login"))
    if revision == "after" or page.url.rstrip("/") == APP:
        page.get_by_role("link", name="مكتب إدارة البيانات", exact=True).click()
        expect(page).to_have_url(APP + "/login/data")
        submit_label = "تسجيل الدخول"
    else:
        submit_label = "دخول إلى CGP"
    page.get_by_label("البريد الإلكتروني").fill(f"{role}@example.test")
    page.get_by_label("كلمة المرور").fill("fixture-only")
    page.get_by_role("button", name=submit_label, exact=True).click()
    expect(page).to_have_url(re.compile(r"/data-governance/nudee(?:-dashboard|-indicator|\?view=review)?$"), timeout=20000)
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
    office = login(browser, fixture, "office", width, height, revision)
    if after:
        expect(office).to_have_url(APP + REGISTER + "?view=review")
        expect(office.get_by_role("heading", name="مراجعة الأدلة", exact=True)).to_be_visible()
        expect(office.get_by_role("button", name=NAMES[1], exact=True)).to_be_visible()
        office.goto(APP + HOME)
    else:
        office.goto(APP + HOME)
    new_heading = office.get_by_role("heading", level=1, name="مكتب إدارة البيانات", exact=True)
    old_heading = office.get_by_role("heading", level=1, name="لوحة مؤشر نُضيء", exact=True)
    (new_heading if after else new_heading.or_(old_heading).first).wait_for()
    if after:
        expect(office.get_by_role("region", name="ملخص أعمال المكتب").get_by_role("link")).to_have_count(3)
    elif new_heading.count():
        office.get_by_text("آخر نشاط للتكليفات", exact=True).wait_for()
        office.get_by_text("تقديم دليل للمراجعة", exact=True).wait_for()
    else:
        office.get_by_role("heading", name="مصفوفة الامتثال حسب المجال").wait_for()
    snap(office, target / f"{size}-office-home.png", after)

    if after:
        expect(office.get_by_text("تقرير نُضيء التفصيلي", exact=True)).to_have_count(0)
        expect(office.get_by_role("textbox", name="مساعد المكتب")).to_be_visible()
        assert not any("nudee_final_review" in path for _, _, path in fixture.requests)
        nav_toggle = office.locator(".cgp-mobile-navigation summary")
        if nav_toggle.is_visible():
            nav_toggle.click()
        office.get_by_role("link", name="مؤشر نُضيء", exact=True).click()
        expect(office).to_have_url(APP + INDICATOR)
        expect(office.get_by_role("heading", name="مؤشر نُضيء", exact=True)).to_be_visible()
        readiness = office.get_by_role("region", name="جاهزية الأدلة داخل المكتب")
        expect(readiness.get_by_text(re.compile("[٢2][٥5][٪%]"))).to_be_visible()
        by_domain = office.get_by_role("region", name="جاهزية الأدلة حسب المجال")
        tabs = office.get_by_role("navigation", name="تبويبات مؤشر نُضيء")
        expect(tabs.get_by_role("link")).to_have_count(3)
        expect(tabs.get_by_role("link", name="نظرة عامة")).to_have_attribute("aria-current", "page")
        expect(office.locator("#nudee-view")).to_have_count(0)
        expect(office.get_by_text("ملف التقييم وخطة التحسين", exact=True)).to_have_count(0)
        snap(office, target / f"{size}-indicator.png", True)
        office.get_by_role("region", name="متطلبات تحتاج متابعة").get_by_role("link", name=re.compile(re.escape(NAMES[1]))).click()
        expect(office.get_by_role("dialog", name=NAMES[1])).to_be_visible()
        office.keyboard.press("Escape")
        expect(office.get_by_role("dialog")).to_have_count(0)
        office.go_back()
        domain_card = by_domain.get_by_role("listitem").filter(has=office.get_by_role("link", name="جودة البيانات", exact=True))
        domain_card.get_by_role("link", name=re.compile("بانتظار المراجعة")).click()
        expect(tabs.get_by_role("link", name="المجالات والأدلة")).to_have_attribute("aria-current", "page")
        expect(office.locator("#nudee-view")).to_have_value("submitted")
        expect(readiness).to_have_count(0)
        expect(office.get_by_role("combobox", name="المجال", exact=True)).to_have_value("جودة البيانات")
        expect(office.locator("tbody tr")).to_have_count(1)
        office.reload()
        expect(office.locator("#nudee-view")).to_have_value("submitted")
        expect(office.get_by_role("combobox", name="المجال", exact=True)).to_have_value("جودة البيانات")
        expect(office.get_by_role("button", name=NAMES[1], exact=True)).to_be_visible()
        expect(office.locator("tbody tr")).to_have_count(1)
        office.go_back()
        expect(office).to_have_url(APP + INDICATOR)
        tabs.get_by_role("link", name="دورات التقييم").click()
        expect(tabs.get_by_role("link", name="دورات التقييم")).to_have_attribute("aria-current", "page")
        summary = office.get_by_text("تقرير نُضيء التفصيلي", exact=True)
        summary.click()
        source = office.get_by_role("combobox", name="مصدر التقرير")
        expect(source).to_have_value("original")
        expect(office.get_by_role("button", name="تحديث المراجعة الشاملة", exact=True)).to_have_count(0)
        source.select_option("live")
        field = office.get_by_role("combobox", name="المجال", exact=True)
        field.select_option(label="جودة البيانات")
        expect(readiness).to_have_count(0)
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
        expect(office.get_by_role("combobox", name="دورة التقييم", exact=True)).to_be_visible()
        expect(office.get_by_role("option", name="لا توجد دورة مسجلة")).to_have_count(1)
        office.goto(APP + INDICATOR + "?report=1")
        expect(tabs.get_by_role("link", name="دورات التقييم")).to_have_attribute("aria-current", "page")
        expect(source).to_be_visible()
        office.goto(APP + HOME)
        office.get_by_role("region", name="ملخص أعمال المكتب").get_by_role("link", name=re.compile("تكليفات متأخرة")).click()
        expect(office.locator("#nudee-view")).to_have_value("overdue")
        expect(office.locator("tbody tr")).to_have_count(1)
        expect(office.get_by_role("button", name=NAMES[0], exact=True)).to_be_visible()
        office.go_back()
        office.get_by_role("region", name="ملخص أعمال المكتب").get_by_role("link", name=re.compile("أدلة بانتظار المراجعة")).click()
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
        office.get_by_role("combobox", name="المجال", exact=True).select_option(label="جودة البيانات")
        expect(register.locator("tbody tr")).to_have_count(1)
        office.get_by_role("combobox", name="المجال", exact=True).select_option("")
        office.get_by_role("combobox", name="مالك المتطلب", exact=True).select_option(OWNER)
        expect(register.locator("tbody tr")).to_have_count(3)
        office.get_by_role("combobox", name="مالك المتطلب", exact=True).select_option("")
        bulk = office.get_by_role("region", name="الإسناد الجماعي")
        expect(bulk).to_have_count(0)
        office.get_by_role("checkbox", name="تحديد الدليل " + NAMES[2]).check()
        expect(bulk).to_be_visible()
        bulk.get_by_role("button", name="إلغاء التحديد").click()
        expect(bulk).to_have_count(0)
        office.locator("#nudee-filter").fill("missing-test-result")
        office.get_by_text("لا توجد متطلبات تطابق خيارات البحث والتصفية.").wait_for()
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
    owner = login(browser, fixture, "owner", width, height, revision)
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


def simple_pdf():
    result = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, body in enumerate([b"<< /Type /Catalog /Pages 2 0 R >>",
                              b"<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
                              b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> >>"], 1):
        offsets.append(len(result))
        result.extend(f"{i} 0 obj\n".encode() + body + b"\nendobj\n")
    start = len(result)
    result.extend(b"xref\n0 4\n0000000000 65535 f \n")
    for offset in offsets[1:]:
        result.extend(f"{offset:010d} 00000 n \n".encode())
    result.extend(f"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n{start}\n%%EOF".encode())
    return bytes(result)


def preparation(browser):
    fixture = Fixture()
    original = {"id": 2, "assignment_id": 4, "file_name": "approved.pdf", "storage_path": "4/test/approved.pdf", "submitted_at": "2026-01-04T08:00:00Z"}
    fixture.files.append(original)
    fixture.objects[original["storage_path"]] = simple_pdf(), "application/pdf"
    office = login(browser, fixture, "office", *SIZES["desktop"], revision="after")
    office.goto(APP + INDICATOR + "?tab=evidence")
    office.get_by_text("جاهزية الأسئلة وحزمة المجال", exact=True).click()
    office.get_by_text("مراجعة السؤال وتنزيل الحزمة", exact=True).click()
    office.get_by_label("المستوى المستهدف").select_option("المستوى 1: البناء")
    expect(office.get_by_role("button", name="تأكيد جاهزية السؤال داخليًا")).to_be_disabled()
    office.get_by_role("button", name="حفظ المستوى المستهدف").click()
    expect(office.get_by_text("حُفظ المستوى المستهدف.")).to_be_visible()
    office.get_by_label("السؤال", exact=True).select_option("DG-04")
    office.get_by_label("المستوى المستهدف").select_option("المستوى 1: البناء")
    office.get_by_role("button", name="تأكيد جاهزية السؤال داخليًا").click()
    expect(office.get_by_text("أكد المكتب جاهزية السؤال داخليًا")).to_be_visible()
    with office.expect_download() as download:
        office.get_by_role("button", name="تنزيل حزمة المجال").click()
    with ZipFile(download.value.path()) as archive:
        pdf = next(path for path in archive.namelist() if path.endswith(".pdf"))
        assert archive.read(pdf) == simple_pdf()
        assert NAMES[0] in archive.read("الأدلة غير المعتمدة.csv").decode("utf-8-sig")
        assert NAMES[3] not in archive.read("الأدلة غير المعتمدة.csv").decode("utf-8-sig")
    office.get_by_role("link", name=NAMES[3], exact=True).click()
    expect(office.locator("tbody tr")).to_have_count(1)
    owner = login(browser, fixture, "owner", *SIZES["phone"], revision="after")
    owner.get_by_role("button", name=NAMES[0], exact=True).click()
    expect(owner.get_by_role("heading", name="ما المطلوب في الدليل؟")).to_be_visible()
    owner.get_by_text("استخدام دليل معتمد من تكليفاتي").click()
    owner.get_by_label("الدليل السابق").select_option("2")
    owner.get_by_label("الصفحة أو البند", exact=True).fill("ص ٢")
    owner.get_by_role("button", name="إرسال النسخة لمراجعة المتطلب").click()
    expect(owner.get_by_text("أُرسل الدليل السابق لمراجعة هذا المتطلب.")).to_be_visible()
    assert fixture.assignments[0]["status"] == "submitted"
    assert fixture.files[-1]["source_locator"] == "ص ٢"
    assert not fixture.unexpected, fixture.unexpected
    office.context.close()
    owner.context.close()


def manager_landing(browser):
    fixture = Fixture()
    fixture.cycles = [{"id": 9, "title": "دورة الاختبار"}]
    fixture.cycle_events = [{"id": 15, "cycle_id": 9, "kind": "result", "subject": "maturity",
                             "outcome": "نتيجة تجريبية", "reference": "مرجع تجريبي"}]
    page = login(browser, fixture, "manager", *SIZES["desktop"], revision="after")
    expect(page).to_have_url(APP + HOME)
    field = page.get_by_role("textbox", name="مساعد المكتب")
    field.fill("ما نتيجة النضج الرسمية؟")
    field.press("Enter")
    expect(page.get_by_role("link", name="فتح دورات التقييم")).to_be_visible()
    expect(page.locator("[aria-live=polite]").filter(has_text="نتيجة تجريبية")).to_contain_text("مرجع تجريبي")
    page.get_by_role("link", name="مؤشر نُضيء", exact=True).click()
    summary = page.get_by_role("region", name="آخر دورة تقييم مسجلة")
    expect(summary).to_contain_text("دورة الاختبار")
    expect(summary).to_contain_text("نتيجة تجريبية")
    expect(summary).to_contain_text("مرجع تجريبي")
    page.context.close()


def office_chat(browser):
    from datetime import datetime, timezone, timedelta
    fixture = Fixture()
    today = datetime.now(timezone(timedelta(hours=3))).date()
    fixture.assignments[0]["status"] = "changes_requested"
    fixture.assignments.append(dict(fixture.assignments[0], id=5, requirement_id=3, status="assigned", due_date=today.isoformat()))
    page = login(browser, fixture, "manager", *SIZES["phone"], revision="after")
    field = page.get_by_role("textbox", name="مساعد المكتب")
    field.fill("وش تأخر في حوكمة البيانات؟")
    field.press("Enter")
    reply = page.locator("[aria-live=polite]").filter(has_text="أقدم تكليف متأخر")
    expect(reply).to_contain_text("مالك المتطلب التجريبي")
    field.fill("وأيّها أُعيد للتعديل؟")
    field.press("Enter")
    expect(reply).to_contain_text("أدلة معادة للتعديل")
    reply.get_by_role("link", name="فتح السجل المصفّى").click()
    expect(page.locator("#nudee-view")).to_have_value("overdue")
    expect(page.get_by_role("combobox", name="المجال", exact=True)).to_have_value("حوكمة البيانات")
    expect(page).to_have_url(re.compile("status=changes_requested"))
    expect(page.locator("tbody tr")).to_have_count(1)
    expect(page.get_by_role("button", name=NAMES[0], exact=True)).to_be_visible()
    page.go_back()
    page.get_by_role("region", name="ملخص أعمال المكتب").get_by_role("link", name=re.compile("تستحق هذا الأسبوع")).click()
    expect(page.get_by_role("button", name=NAMES[2], exact=True)).to_be_visible()
    expect(page.locator("tbody tr")).to_have_count(1)
    page.go_back()
    page.get_by_role("button", name="لخّص هذا الأسبوع").click()
    expect(page.get_by_role("link", name="فتح تكليفات الفترة")).to_be_visible()
    field.fill("ما نتيجة النضج الرسمية؟")
    field.press("Enter")
    expect(page.get_by_text("لم تُسجّل دورة تقييم بعد.", exact=True)).to_be_visible()
    assert not fixture.unexpected, fixture.unexpected
    page.context.close()


def evidence_distribution(browser):
    fixture = Fixture()
    new_id = 5
    fixture.requirements.append(dict(fixture.requirements[0], id=new_id, source_row=new_id, evidence_name="الدليل المعاد"))
    fixture.assignments.append(dict(fixture.assignments[0], id=new_id, requirement_id=new_id, status="changes_requested"))
    page = login(browser, fixture, "manager", *SIZES["phone"], revision="after")
    chart = page.get_by_role("region", name="توزيع المتطلبات حسب حالة الدليل")
    legend = chart.get_by_role("list")
    states = ["unassigned", "assigned", "submitted", "changes_requested", "approved"]
    expect(chart.get_by_text("إجمالي المتطلبات").locator("..").locator("strong")).to_have_text("٥")
    expect(legend.get_by_role("link")).to_have_count(5)
    expect(chart.locator("svg path")).to_have_count(5)
    priorities = page.get_by_role("region", name="أولويات اليوم")
    assert priorities.bounding_box()["y"] < chart.bounding_box()["y"]
    expect(chart.locator("details")).not_to_have_attribute("open", "")
    chart.get_by_text("عرض التأخر حسب المجال").click()
    chart.get_by_role("link", name=re.compile("حوكمة البيانات")).click()
    expect(page.locator("#nudee-view")).to_have_value("overdue")
    expect(page.get_by_role("combobox", name="المجال", exact=True)).to_have_value("حوكمة البيانات")
    expect(page.locator("tbody tr")).to_have_count(2)
    page.go_back()
    for state in states:
        row = legend.locator(f'a[href*="view={state}"]')
        expect(row.locator("b")).to_have_text("١")
        expect(row.locator("small")).to_contain_text("٢٠")
        row.focus()
        page.keyboard.press("Enter")
        expect(page.locator("#nudee-view")).to_have_value(state)
        expect(page.locator("tbody tr")).to_have_count(1)
        page.go_back()

    # A change of state shifts exactly one requirement when the dashboard refreshes.
    fixture.assignments[-1]["status"] = "approved"
    page.get_by_role("button", name="تحديث اللوحة").click()
    expect(legend.locator('a[href*="view=approved"] b')).to_have_text("٢")
    expect(legend.locator('a[href*="view=approved"] small')).to_contain_text("٤٠")
    expect(legend.locator('a[href*="view=changes_requested"] b')).to_have_text("٠")
    expect(chart.locator("svg path")).to_have_count(4)

    fixture.assignments.clear()
    page.get_by_role("button", name="تحديث اللوحة").click()
    arc = chart.locator('svg a[href*="view=unassigned"] path')
    expect(chart.locator("svg path")).to_have_count(1)
    expect(legend.locator('a[href*="view=unassigned"] small')).to_contain_text("١٠٠")
    # Click the actual painted ring, outside its transparent center.
    arc.scroll_into_view_if_needed()
    point = arc.evaluate("""path => {
      const point = path.getPointAtLength(path.getTotalLength() / 8).matrixTransform(path.getScreenCTM());
      return [point.x, point.y];
    }""")
    page.mouse.click(*point)
    expect(page.locator("#nudee-view")).to_have_value("unassigned")
    expect(page.locator("tbody tr")).to_have_count(5)
    fixture.requirements.clear()
    page.goto(APP + HOME)
    expect(chart.get_by_text("لا توجد متطلبات مسجّلة لعرض توزيعها.")).to_be_visible()
    expect(chart.locator("svg")).to_have_count(0)
    assert not fixture.unexpected, fixture.unexpected
    page.context.close()


def evidence_center(browser, target):
    fixture = Fixture()
    req = fixture.requirements[0]
    req.update(standard_code="DG.MQ.1", specification_code="DG.1.1", responsible_department="قسم التخطيط", planned_end="2027-01-14")
    office = login(browser, fixture, "office", *SIZES["phone"], revision="after")
    office.goto(APP + REGISTER)
    office.get_by_role("searchbox").fill("DG.1.1")
    group = office.locator(".nr-question-group")
    expect(group).to_have_count(1)
    expect(group.get_by_text("DG.MQ.1")).to_be_visible()
    group.get_by_role("button", name="متابعة التكليف").click()
    dialog = office.get_by_role("dialog")
    expect(dialog.get_by_text("قسم التخطيط")).to_be_visible()
    with office.expect_download() as download:
        dialog.get_by_role("button", name="تنزيل نموذج إعداد داخلي (Word)").click()
    with ZipFile(download.value.path()) as archive:
        doc = archive.read("word/document.xml").decode()
        assert "نموذج إعداد داخلي" in doc and "DG.1.1" in doc and NAMES[0] in doc
    office.goto(APP + INDICATOR + "?tab=evidence")
    office.get_by_text("جاهزية الأسئلة وحزمة المجال", exact=True).click()
    board = office.get_by_role("region", name="جاهزية الأسئلة حسب المجال")
    board.locator("li").filter(has_text="DG.MQ.1").get_by_role("button").click()
    expect(office.get_by_label("السؤال", exact=True)).to_have_value("DG.MQ.1")
    office.get_by_label("المستوى المستهدف").select_option("المستوى 1: البناء")
    office.get_by_role("button", name="حفظ المستوى المستهدف").click()
    board.get_by_role("link", name="عرض الأدلة الناقصة (1)").click()
    expect(office.locator(".nr-level-group li")).to_have_count(1)
    expect(office.get_by_text("قسم التخطيط", exact=False)).to_be_visible()
    snap(office, target / "phone-governance-gap.png", True)
    assert not fixture.unexpected, fixture.unexpected
    office.context.close()


def all_maturity_levels(browser):
    fixture = Fixture()
    q = fixture.requirements[0]
    q["standard_code"] = "DG.MQ.1"
    levels = ["المستوى 0: غياب القدرات", q["maturity_level"], "المستوى 2: التعريف", "المستوى 3: التفعيل",
              "المستوى 4: التمكن", "المستوى 5: الريادة"]
    for rank in range(2, 6):
        fixture.requirements.append(dict(q, id=20+rank, source_row=20+rank, evidence_name=f"دليل مستوى {rank}",
                                         maturity_level=levels[rank], acceptance_pdf_page=92))
    office = login(browser, fixture, "office", *SIZES["phone"], revision="after")
    office.goto(APP + INDICATOR + "?tab=evidence")
    office.get_by_text("جاهزية الأسئلة وحزمة المجال", exact=True).click()
    board = office.get_by_role("region", name="جاهزية الأسئلة حسب المجال")
    board.locator("li").filter(has_text="DG.MQ.1").get_by_role("button").click()
    target = office.get_by_label("المستوى المستهدف")
    expect(target.locator("option")).to_have_count(7)
    target.select_option(levels[0])
    office.get_by_role("button", name="تسجيل المستوى صفر").click()
    expect(board).to_contain_text("غياب القدرات مسجّل")
    expect(office.get_by_role("button", name="تأكيد جاهزية السؤال داخليًا")).to_have_count(0)
    target.select_option(levels[5])
    office.get_by_role("button", name="حفظ المستوى المستهدف").click()
    expect(office.get_by_role("button", name="تأكيد جاهزية السؤال داخليًا")).to_be_disabled()
    board.get_by_role("link", name="عرض الأدلة الناقصة (5)").click()
    group = office.locator(".nr-level-group").filter(has_text="دليل مستوى 5")
    group.get_by_role("button", name="إسناد الدليل").click()
    expect(office.get_by_role("dialog").get_by_role("link", name=re.compile("وثيقة سدايا"))).to_have_attribute("href", re.compile(r"#page=92$"))
    assert not fixture.unexpected, fixture.unexpected
    office.context.close()


def lifecycle(browser, target):
    fixture = Fixture()
    office = login(browser, fixture, "office", *SIZES["desktop"], revision="after")
    office.goto(APP + HOME)
    office.get_by_role("link", name=re.compile("إسناد المتطلبات")).click()
    expect(office.locator("#nudee-view")).to_have_value("unassigned")
    office.get_by_role("button", name=NAMES[2], exact=True).click()
    office.get_by_label("المسؤول عن رفع الدليل").select_option(OWNER)
    office.get_by_role("button", name="حفظ التكليف").click()
    office.get_by_text("تم إنشاء التكليف", exact=True).wait_for()
    owner = login(browser, fixture, "owner", *SIZES["phone"], revision="after")
    for index, decision in enumerate(["changes_requested", "approved"]):
        if index:
            owner.reload()
        owner.get_by_role("button", name=NAMES[2], exact=True).click()
        panel = owner.get_by_role("dialog")
        if index:
            panel.locator(".nr-decisions summary").click()
            expect(panel.locator(".nr-decisions")).to_contain_text("مسؤول المكتب التجريبي")
            expect(panel.locator(".nr-message").filter(has_text="أرفق الإصدار المحدّث.")).to_be_visible()
        name = f"example-{index}.pdf"
        pdf = simple_pdf()
        panel.locator('input[type="file"]').set_input_files(
            {"name": name, "mimeType": "application/pdf", "buffer": pdf})
        expect(panel.get_by_role("button", name="رفع وإرسال للمراجعة")).to_be_disabled()
        panel.locator("#nr-upload-locator").fill("صفحة ٤")
        panel.get_by_role("button", name="رفع وإرسال للمراجعة").click()
        expect(panel.get_by_role("button", name=re.compile(name))).to_be_visible()
        expect(panel.locator('input[type="file"]')).to_have_count(0)
        office.goto(APP + REGISTER + "?view=submitted")
        office.get_by_role("button", name=NAMES[2], exact=True).click()
        review = office.get_by_role("dialog")
        expect(review.get_by_role("button", name=re.compile(name))).to_be_visible()
        expect(review.get_by_text("صفحة ٤", exact=False)).to_be_visible()
        review.get_by_role("button", name="عرض الملف هنا").click()
        expect(review.locator("canvas")).to_be_visible()
        if index:
            expect(review.get_by_text("سبب الإعادة السابقة")).to_be_visible()
            expect(review.locator(".nr-return")).to_contain_text("أرفق الإصدار المحدّث.")
            review.get_by_role("button", name=re.compile("example-0.pdf")).click()
            expect(review.get_by_role("button", name="اعتماد الدليل")).to_be_disabled()
            review.get_by_role("button", name=re.compile(name)).click()
            expect(review.get_by_role("button", name="اعتماد الدليل")).to_be_enabled()
        if decision == "changes_requested":
            review.get_by_label(re.compile("ملاحظات المراجعة")).fill("أرفق الإصدار المحدّث.")
            review.get_by_role("button", name="إعادة للتعديل").click()
        else:
            review.get_by_role("button", name="اعتماد الدليل").click()
        expect(review.get_by_role("heading", name="قرار المراجعة")).to_have_count(0)
    review.get_by_role("button", name=re.compile("مراجعة الدليل التالي")).click()
    expect(office.get_by_role("dialog", name=NAMES[1])).to_be_visible()
    expect(office.locator("#nudee-view")).to_have_value("submitted")
    office.goto(APP + HOME)
    field = office.get_by_role("textbox", name="مساعد المكتب")
    field.fill("كم عدد الأدلة المعتمدة؟")
    field.press("Enter")
    expect(office.locator("[aria-live=polite]").filter(has_text="أدلة معتمدة")).to_contain_text("٢")
    office.get_by_text("سجل النشاط الأخير", exact=True).click()
    expect(office.get_by_text("اعتماد دليل", exact=True)).to_be_visible()
    assert [item["action"] for item in reversed(fixture.audit[:5])] == [
        "assigned", "submitted", "changes_requested", "submitted", "approved"]
    assert len(fixture.files) == 3
    assert not fixture.unexpected, fixture.unexpected
    snap(office, target / "office-after-approval.png", True)
    office.goto(APP + "/data-governance")
    expect(office).to_have_url(APP + HOME)
    expect(office.get_by_role("navigation", name="التنقل الرئيسي").get_by_role("link")).to_have_text(
        ["الرئيسية", "مؤشر نُضيء", "مركز الأدلة"])
    owner.goto(APP + "/data-governance")
    expect(owner).to_have_url(APP + REGISTER)
    owner.locator(".cgp-mobile-navigation summary").click()
    mobile_nav = owner.get_by_role("navigation", name="التنقل على الجوال")
    expect(mobile_nav.get_by_role("link", name="مهامي", exact=True)).to_be_visible()
    expect(mobile_nav.get_by_role("link", name="الرئيسية", exact=True)).to_have_count(0)
    expect(mobile_nav.get_by_role("link", name="مؤشر نُضيء")).to_have_count(0)
    owner.goto(APP + INDICATOR)
    expect(owner).to_have_url(APP + REGISTER)
    expect(owner.get_by_role("heading", name="مهامي")).to_be_visible()
    assert not any(role == "owner" and "nudee_final_review" in path for role, _, path in fixture.requests)
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
            manager_landing(browser)
            office_chat(browser)
            evidence_distribution(browser)
            evidence_center(browser, args.output)
            all_maturity_levels(browser)
            preparation(browser)
            lifecycle(browser, args.output)
            results["workflow_with_synthetic_backend"] = "passed"
            print("PASS assignment, upload, return, resubmission, approval, home refresh", flush=True)
        (args.output / "results.json").write_text(json.dumps(results, indent=2))
        browser.close()
