"""Synthetic API contract for browser UI tests. Never connects to Supabase."""

import base64
import json
import time
from urllib.parse import parse_qs, urlsplit


APP = "http://127.0.0.1:3847"
API = "https://example.supabase.co"
OFFICE = "00000000-0000-4000-8000-000000000001"
OWNER = "00000000-0000-4000-8000-000000000002"
NAMES = ["سياسة تصنيف البيانات", "سجل مراجعة الجودة", "خطة حوكمة البيانات", "سجل الأدلة المعتمدة"]
STAMP = "2026-01-04T08:00:00Z"


def profile(role):
    office = role == "office"
    return {
        "user_id": OFFICE if office else OWNER,
        "role": "data_governance_team" if office else "nudee_owner",
        "display_name": "مسؤول المكتب التجريبي" if office else "مالك المتطلب التجريبي",
        "is_active": True,
    }


def session(role):
    user = {
        "id": profile(role)["user_id"], "aud": "authenticated", "role": "authenticated",
        "email": f"{role}@example.test", "created_at": STAMP, "updated_at": STAMP,
        "email_confirmed_at": STAMP, "app_metadata": {"provider": "email"}, "user_metadata": {},
    }
    def segment(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()
    expiry = int(time.time()) + 3600
    claims = {"aud": "authenticated", "sub": user["id"], "role": "authenticated", "exp": expiry}
    token = ".".join([segment({"alg": "HS256", "typ": "JWT"}), segment(claims), segment("fixture")])
    return {"access_token": token, "refresh_token": "local-test-only", "expires_at": expiry,
            "expires_in": 3600, "token_type": "bearer", "user": user}


class Fixture:
    def __init__(self):
        self.requirements = [
            {"id": n, "source_row": n, "domain_name": "حوكمة البيانات" if n != 2 else "جودة البيانات",
             "standard_code": f"DG-{n:02}", "requirement_title": name, "evidence_name": name,
             "evidence_description": "وثيقة تجريبية لمراجعة دورة العمل.",
             "maturity_level": "المستوى 1: البناء", "source_compliance": "ممتثل بالكامل",
             "source_review_status": None, "source_progress": 0, "schedule_indicator": None,
             "planned_start": None, "planned_end": None, "actual_end": None, "review_phase": None}
            for n, name in enumerate(NAMES, start=1)
        ]
        self.assignments = [
            {"id": n, "requirement_id": n, "assignee_id": OWNER, "status": status,
             "due_date": "2020-01-01", "review_notes": None}
            for n, status in [(1, "assigned"), (2, "submitted"), (4, "approved")]
        ]
        self.files = [{"id": 1, "assignment_id": 2, "file_name": "quality.pdf",
                       "storage_path": "2/fixture/quality.pdf", "submitted_at": STAMP}]
        self.audit = [{"id": 1, "assignment_id": 2, "action": "submitted", "created_at": STAMP}]
        self.requests = []
        self.unexpected = []

    def install(self, context, role):
        def handle(route):
            request = route.request
            url = urlsplit(request.url)
            origin = f"{url.scheme}://{url.netloc}"
            if origin == APP:
                return route.continue_()
            if origin != API:
                self.unexpected.append(f"external request: {url.netloc}{url.path}")
                return route.abort()
            headers = {
                "access-control-allow-origin": APP, "access-control-allow-methods": "GET,POST,OPTIONS",
                "access-control-allow-headers": request.headers.get("access-control-request-headers", "*"),
                "access-control-expose-headers": "Content-Range",
            }
            if request.method == "OPTIONS":
                return route.fulfill(status=204, headers=headers)
            path = url.path
            self.requests.append((role, request.method, path))
            payload = request.post_data_json if "application/json" in request.headers.get("content-type", "") else {}
            if path == "/auth/v1/token" and payload.get("email") == f"{role}@example.test":
                result = session(role)
            elif path == "/auth/v1/user":
                result = session(role)["user"]
            elif path == "/rest/v1/profiles":
                result = profile(role)
            elif path == "/rest/v1/rpc/nudee_assignees" and role == "office":
                result = [profile("owner")]
            elif path == "/rest/v1/nudee_final_review" and role == "office":
                result = {"progress": 0.125}
            elif path.startswith("/storage/v1/object/nudee-evidence/") and request.method == "POST":
                result = {"Key": path.removeprefix("/storage/v1/object/")}
            elif path == "/rest/v1/rpc/nudee_assign" and role == "office":
                n = payload["p_requirement_id"]
                assert n == 3 and payload["p_assignee_id"] == OWNER
                self.assignments.append({"id": n, "requirement_id": n, "assignee_id": OWNER,
                                         "due_date": payload["p_due_date"], "status": "assigned", "review_notes": None})
                self.record(n, "assigned")
                result = n
            elif path == "/rest/v1/rpc/nudee_submit_evidence" and role == "owner":
                assignment = next(row for row in self.assignments if row["id"] == payload["p_assignment_id"])
                assert assignment["status"] in ("assigned", "changes_requested")
                assignment.update(status="submitted", review_notes=None)
                self.files.append({"id": len(self.files)+1, "assignment_id": assignment["id"],
                                   "file_name": payload["p_file_name"], "storage_path": payload["p_storage_path"],
                                   "submitted_at": STAMP})
                self.record(assignment["id"], "submitted")
                result = self.files[-1]["id"]
            elif path == "/rest/v1/rpc/nudee_review_evidence" and role == "office":
                assignment = next(row for row in self.assignments if row["id"] == payload["p_assignment_id"])
                assert assignment["status"] == "submitted"
                assignment.update(status=payload["p_decision"], review_notes=payload["p_notes"])
                self.record(assignment["id"], assignment["status"])
                result = assignment["id"]
            elif request.method == "GET" and path.startswith("/rest/v1/"):
                assigned = [r for r in self.assignments if role == "office" or r["assignee_id"] == OWNER]
                ids = {r["requirement_id"] for r in assigned}
                tables = {
                    "nudee_requirements": [r for r in self.requirements if role == "office" or r["id"] in ids],
                    "nudee_assignments": assigned, "nudee_submissions": self.files,
                }
                if role == "office":
                    tables["nudee_audit"] = self.audit[:5]
                table = path.rsplit("/", 1)[1]
                if table not in tables:
                    self.unexpected.append(f"{role} {path}")
                    return route.fulfill(status=403, json={"message": "Fixture scope"}, headers=headers)
                rows = tables[table]
                query = parse_qs(url.query)
                for column, value in query.items():
                    if value[0].startswith("eq."):
                        rows = [r for r in rows if str(r.get(column)) == value[0][3:]]
                start = int(query.get("offset", [0])[0])
                limit = int(query.get("limit", [len(rows)])[0])
                result = rows[start:start + limit]
                end = start + len(result) - 1
                headers["content-range"] = f"{start}-{end}/{len(rows)}" if result else f"*/{len(rows)}"
            else:
                self.unexpected.append(f"{role} {request.method} {path}")
                return route.fulfill(status=400, json={"message": "Unknown fixture request"}, headers=headers)
            return route.fulfill(json=result, headers=headers)
        context.route("**/*", handle)

    def record(self, assignment, action):
        self.audit.insert(0, {"id": len(self.audit)+1, "assignment_id": assignment,
                              "action": action, "created_at": STAMP})
