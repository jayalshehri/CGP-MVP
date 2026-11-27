"""Synthetic API contract for browser UI tests. Never connects to Supabase."""

import base64
import json
import time
from email.parser import BytesParser
from email.policy import default
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
             "updated_at": STAMP, "due_date": "2020-01-01", "review_notes": None}
            for n, status in [(1, "assigned"), (2, "submitted"), (4, "approved")]
        ]
        self.files = [{"id": 1, "assignment_id": 2, "file_name": "quality.pdf",
                       "storage_path": "2/fixture/quality.pdf", "submitted_at": STAMP}]
        self.audit = [{"id": 1, "assignment_id": 2, "action": "submitted", "created_at": STAMP}]
        self.objects = {}
        self.decisions = []
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
            elif path == "/rest/v1/rpc/nudee_question_overview" and role == "office":
                result = []
                for req in self.requirements:
                    code = req["standard_code"]
                    d = next((d for d in self.decisions if d["standard_code"] == code and d["domain_name"] == req["domain_name"]), {})
                    a = next((a for a in self.assignments if a["requirement_id"] == req["id"]), {})
                    ready = a.get("status") == "approved" and any(s["assignment_id"] == a["id"] for s in self.files)
                    state = "no_target" if not d else ("confirmed" if d["confirmed"] else "ready") if ready else "blocked"
                    result.append(dict(standard_code=code, domain_name=req["domain_name"], target_level=d.get("target_level"),
                                       question_state=state, missing_count=int(state == "blocked")))
            elif path == "/rest/v1/rpc/nudee_preparation_manifest" and role == "office":
                result = []
                for req in self.requirements:
                    if req["domain_name"] != payload["p_domain"]:
                        continue
                    assignment = next((a for a in self.assignments if a["requirement_id"] == req["id"]), {})
                    status = assignment.get("status", "unassigned")
                    files = [s for s in self.files if s["assignment_id"] == assignment.get("id") and status == "approved"]
                    latest = max(files, key=lambda s: s["id"], default={})
                    result.append(dict(req, requirement_id=req["id"], specification_code=None, status=status,
                                       submission_id=latest.get("id"), storage_path=latest.get("storage_path"),
                                       file_name=latest.get("file_name"), source_locator=latest.get("source_locator")))
            elif path == "/rest/v1/rpc/nudee_question_decide" and role == "office":
                approved = [s["id"] for s in self.files if s["assignment_id"] == 4]
                result = len(self.decisions) + 1
                self.decisions.insert(0, dict(id=result, domain_name=payload["p_domain"], standard_code=payload["p_code"],
                                      target_level=payload["p_level"], confirmed=payload["p_confirm"],
                                      evidence_ids=approved if payload["p_confirm"] else []))
            elif path == "/rest/v1/rpc/nudee_reuse_evidence" and role == "owner":
                source = next(s for s in self.files if s["id"] == payload["p_source"])
                target = next(a for a in self.assignments if a["id"] == payload["p_assignment"])
                result = len(self.files) + 1
                self.files.append(dict(source, id=result, assignment_id=target["id"], source_submission_id=source["id"],
                                       source_locator=payload["p_locator"]))
                target["status"] = "submitted"
            elif path == "/rest/v1/rpc/nudee_assignees" and role == "office":
                result = [profile("owner")]
            elif path == "/rest/v1/nudee_final_review" and role == "office":
                result = {"progress": 0.125}
            elif path.startswith("/storage/v1/object/nudee-evidence/") and request.method == "GET":
                key = path.split("/nudee-evidence/", 1)[1]
                content, mime = self.objects[key]
                return route.fulfill(status=200, body=content, content_type=mime, headers=headers)
            elif path.startswith("/storage/v1/object/nudee-evidence/") and request.method == "POST":
                mime = request.headers["content-type"]
                content = request.post_data_buffer
                if mime.startswith("multipart/form-data"):
                    message = BytesParser(policy=default).parsebytes(f"Content-Type: {mime}\r\n\r\n".encode() + content)
                    part = next(part for part in message.iter_parts() if part.get_filename())
                    mime, content = part.get_content_type(), part.get_payload(decode=True)
                self.objects[path.split("/nudee-evidence/", 1)[1]] = content, mime
                result = {"Key": path.removeprefix("/storage/v1/object/")}
            elif path == "/rest/v1/rpc/nudee_assign" and role == "office":
                n = payload["p_requirement_id"]
                assert n == 3 and payload["p_assignee_id"] == OWNER
                self.assignments.append({"id": n, "requirement_id": n, "assignee_id": OWNER,
                                         "due_date": payload["p_due_date"], "status": "assigned", "review_notes": None})
                self.record(n, "assigned")
                result = n
            elif path in ("/rest/v1/rpc/nudee_submit_evidence", "/rest/v1/rpc/nudee_submit_with_locator") and role == "owner":
                assignment = next(row for row in self.assignments if row["id"] == payload["p_assignment_id"])
                assert assignment["status"] in ("assigned", "changes_requested")
                assignment.update(status="submitted", review_notes=None, updated_at=STAMP)
                self.files.append({"id": len(self.files)+1, "assignment_id": assignment["id"],
                                   "file_name": payload["p_file_name"], "storage_path": payload["p_storage_path"],
                                   "source_locator": payload.get("p_locator"), "submitted_at": STAMP})
                self.record(assignment["id"], "submitted")
                result = self.files[-1]["id"]
            elif path in ("/rest/v1/rpc/nudee_review_evidence", "/rest/v1/rpc/nudee_review_version") and role == "office":
                assignment = next(row for row in self.assignments if row["id"] == payload["p_assignment_id"])
                assert assignment["status"] == "submitted"
                if "p_submission_id" in payload:
                    latest = max(f["id"] for f in self.files if f["assignment_id"] == assignment["id"])
                    assert payload["p_submission_id"] == latest
                assignment.update(status=payload["p_decision"], review_notes=payload["p_notes"])
                self.record(assignment["id"], assignment["status"], payload["p_notes"], payload.get("p_submission_id"))
                result = assignment["id"]
            elif request.method == "GET" and path.startswith("/rest/v1/"):
                assigned = [r for r in self.assignments if role == "office" or r["assignee_id"] == OWNER]
                ids = {r["requirement_id"] for r in assigned}
                tables = {
                    "nudee_requirements": [r for r in self.requirements if role == "office" or r["id"] in ids],
                    "nudee_assignments": assigned, "nudee_submissions": self.files,
                    "nudee_question_decisions": self.decisions if role == "office" else [],
                }
                tables["nudee_audit"] = [a for a in self.audit if any(r["id"] == a["assignment_id"] for r in assigned)]
                table = path.rsplit("/", 1)[1]
                if table not in tables:
                    self.unexpected.append(f"{role} {path}")
                    return route.fulfill(status=403, json={"message": "Fixture scope"}, headers=headers)
                rows = tables[table]
                query = parse_qs(url.query)
                for column, value in query.items():
                    if value[0].startswith("eq."):
                        rows = [r for r in rows if str(r.get(column)) == value[0][3:]]
                    elif value[0].startswith("in.("):
                        rows = [r for r in rows if str(r.get(column)) in value[0][4:-1].split(",")]
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

    def record(self, assignment, action, notes=None, submission_id=None):
        self.audit.insert(0, {"id": len(self.audit)+1, "assignment_id": assignment,
                              "action": action, "reviewer_name": profile("office")["display_name"] if action in ("approved", "changes_requested") else None, "notes": notes, "submission_id": submission_id, "created_at": STAMP})
