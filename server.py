"""Small, dependency-free Python and SQLite backend for TalentFlow ATS."""

from __future__ import annotations

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(os.environ.get("ATS_DATABASE", str(BASE_DIR / "talentflow.db")))
STATUSES = ("New", "Screening", "Interview", "Offer", "Hired", "Rejected")
SOURCES = ("LinkedIn", "Referral", "Careers page", "Other")
COLORS = ("peach", "blue", "pink", "mint", "lavender", "yellow")


@contextmanager
def database():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def seed_database(connection: sqlite3.Connection) -> None:
    if connection.execute("SELECT 1 FROM candidates LIMIT 1").fetchone():
        return

    today = date.today()
    candidates = [
        ("Olivia Rhye", "olivia.rhye@email.com", "Product Designer", "5 years", "LinkedIn", "Interview"),
        ("Phoenix Baker", "phoenix.baker@email.com", "Senior Engineer", "7 years", "Referral", "Screening"),
        ("Lana Steiner", "lana.steiner@email.com", "Product Designer", "4 years", "Careers page", "New"),
        ("Demi Wilkinson", "demi.wilkinson@email.com", "Marketing Lead", "6 years", "LinkedIn", "Offer"),
        ("Candice Wu", "candice.wu@email.com", "Senior Engineer", "8 years", "Referral", "Interview"),
        ("Natali Craig", "natali.craig@email.com", "Product Designer", "3 years", "Careers page", "New"),
        ("Drew Cano", "drew.cano@email.com", "Marketing Lead", "5 years", "LinkedIn", "Hired"),
    ]
    candidate_ids: list[str] = []
    for index, (name, email, role, experience, source, status) in enumerate(candidates):
        candidate_id = f"c-{101 + index}"
        candidate_ids.append(candidate_id)
        connection.execute(
            """INSERT INTO candidates
               (id, name, email, role, experience, source, status, applied, color)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                candidate_id,
                name,
                email,
                role,
                experience,
                source,
                status,
                (today - timedelta(days=index * 2)).isoformat(),
                COLORS[index % len(COLORS)],
            ),
        )

    jobs = [
        ("Senior Product Designer", "New York, NY", "Full-time", "Design", ["Figma", "Product design", "Research"], 2, "Active"),
        ("Frontend Engineer", "Remote", "Full-time", "Engineering", ["React", "TypeScript", "CSS"], 3, "Active"),
        ("Marketing Manager", "Austin, TX", "Full-time", "Marketing", ["Growth", "Content", "SEO"], 1, "Active"),
        ("People Operations Partner", "Remote", "Contract", "People", ["HR", "Culture", "Operations"], 1, "Paused"),
    ]
    for index, (title, location, job_type, department, skills, openings, status) in enumerate(jobs):
        connection.execute(
            """INSERT INTO jobs
               (id, title, location, type, department, skills, openings, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                f"j-{201 + index}",
                title,
                location,
                job_type,
                department,
                json.dumps(skills),
                openings,
                status,
            ),
        )

    interview_start = datetime.now().replace(second=0, microsecond=0) + timedelta(days=2)
    interviews = [
        (candidate_ids[0], "Portfolio review", "Maya Chen", 0, 10, 30),
        (candidate_ids[4], "Technical interview", "Ethan Brooks", 0, 13, 0),
        (candidate_ids[1], "Recruiter screen", "Jordan Davis", 1, 11, 0),
    ]
    for index, (candidate_id, interview_type, interviewer, day_offset, hour, minute) in enumerate(interviews):
        scheduled_at = (interview_start + timedelta(days=day_offset)).replace(hour=hour, minute=minute)
        connection.execute(
            """INSERT INTO interviews (id, candidate_id, date, type, interviewer)
               VALUES (?, ?, ?, ?, ?)""",
            (
                f"i-{301 + index}",
                candidate_id,
                scheduled_at.isoformat(timespec="minutes"),
                interview_type,
                interviewer,
            ),
        )


def initialize_database() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with database() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS candidates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                role TEXT NOT NULL,
                experience TEXT NOT NULL,
                source TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN
                    ('New', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected')),
                applied TEXT NOT NULL,
                color TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                location TEXT NOT NULL,
                type TEXT NOT NULL,
                department TEXT NOT NULL,
                skills TEXT NOT NULL,
                openings INTEGER NOT NULL CHECK (openings > 0),
                status TEXT NOT NULL CHECK (status IN ('Active', 'Paused'))
            );
            CREATE TABLE IF NOT EXISTS interviews (
                id TEXT PRIMARY KEY,
                candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                type TEXT NOT NULL,
                interviewer TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS interviews_date_idx ON interviews(date);
            """
        )
        seed_database(connection)


def candidate_dict(row: sqlite3.Row) -> dict:
    candidate = dict(row)
    candidate["applied"] = date.fromisoformat(candidate["applied"]).strftime("%b %d, %Y")
    return candidate


def job_dict(row: sqlite3.Row) -> dict:
    job = dict(row)
    job["skills"] = json.loads(job["skills"])
    return job


def interview_dict(row: sqlite3.Row) -> dict:
    interview = dict(row)
    interview["candidateId"] = interview.pop("candidate_id")
    return interview


def required_text(payload: dict, field: str, limit: int = 200) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required.")
    value = value.strip()
    if len(value) > limit:
        raise ValueError(f"{field} must be {limit} characters or fewer.")
    return value


class ATSHandler(BaseHTTPRequestHandler):
    server_version = "TalentFlowATS/1.0"

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid Content-Length header.") from error
        if length <= 0 or length > 1_000_000:
            raise ValueError("Request body must contain valid JSON under 1 MB.")
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise ValueError("Request body must be valid JSON.") from error
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object.")
        return payload

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/api/health":
                self.send_json(200, {"status": "ok"})
            elif path == "/api/candidates":
                with database() as connection:
                    rows = connection.execute(
                        "SELECT * FROM candidates ORDER BY applied DESC, rowid DESC"
                    ).fetchall()
                self.send_json(200, {"candidates": [candidate_dict(row) for row in rows]})
            elif path == "/api/jobs":
                with database() as connection:
                    rows = connection.execute("SELECT * FROM jobs ORDER BY rowid DESC").fetchall()
                self.send_json(200, {"jobs": [job_dict(row) for row in rows]})
            elif path == "/api/interviews":
                with database() as connection:
                    rows = connection.execute(
                        "SELECT * FROM interviews ORDER BY date"
                    ).fetchall()
                self.send_json(200, {"interviews": [interview_dict(row) for row in rows]})
            elif path == "/api/reports":
                self.send_json(200, self.get_reports())
            else:
                self.send_static(path)
        except (sqlite3.Error, ValueError, OSError) as error:
            self.send_json(500, {"error": f"Unable to load data: {error}"})

    def get_reports(self) -> dict:
        with database() as connection:
            stage_rows = connection.execute(
                "SELECT status, COUNT(*) AS count FROM candidates GROUP BY status"
            ).fetchall()
            source_rows = connection.execute(
                "SELECT source, COUNT(*) AS count FROM candidates GROUP BY source"
            ).fetchall()
            active_jobs = connection.execute(
                "SELECT COUNT(*) FROM jobs WHERE status = 'Active'"
            ).fetchone()[0]
            hires = connection.execute(
                "SELECT COUNT(*) FROM candidates WHERE status = 'Hired'"
            ).fetchone()[0]
            interviews = connection.execute("SELECT COUNT(*) FROM interviews").fetchone()[0]
            candidate_total = connection.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
            job_total = connection.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]

        return {
            "stage_counts": {row["status"]: row["count"] for row in stage_rows},
            "source_counts": {row["source"]: row["count"] for row in source_rows},
            "active_jobs": active_jobs,
            "hires": hires,
            "interviews": interviews,
            "candidate_total": candidate_total,
            "job_total": job_total,
        }

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            payload = self.read_json()
            if path == "/api/candidates":
                self.create_candidate(payload)
            elif path == "/api/jobs":
                self.create_job(payload)
            elif path == "/api/interviews":
                self.create_interview(payload)
            else:
                self.send_json(404, {"error": "API endpoint not found."})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except sqlite3.IntegrityError as error:
            message = "A candidate with this email already exists." if "candidates.email" in str(error) else "The request conflicts with existing data."
            self.send_json(409, {"error": message})
        except sqlite3.Error as error:
            self.send_json(500, {"error": f"Unable to save data: {error}"})

    def create_candidate(self, payload: dict) -> None:
        name = required_text(payload, "name", 120)
        email = required_text(payload, "email", 254).lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise ValueError("Enter a valid email address.")
        role = required_text(payload, "role", 120)
        experience = payload.get("experience", "Not specified")
        if not isinstance(experience, str) or len(experience) > 80:
            raise ValueError("experience must be 80 characters or fewer.")
        source = payload.get("source", "Other")
        status = payload.get("status", "New")
        if source not in SOURCES:
            raise ValueError("Select a valid candidate source.")
        if status not in STATUSES:
            raise ValueError("Select a valid candidate stage.")

        with database() as connection:
            count = connection.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
            candidate_id = str(uuid4())
            connection.execute(
                """INSERT INTO candidates
                   (id, name, email, role, experience, source, status, applied, color)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    candidate_id,
                    name,
                    email,
                    role,
                    experience.strip() or "Not specified",
                    source,
                    status,
                    date.today().isoformat(),
                    COLORS[count % len(COLORS)],
                ),
            )
            row = connection.execute(
                "SELECT * FROM candidates WHERE id = ?", (candidate_id,)
            ).fetchone()
        self.send_json(201, {"candidate": candidate_dict(row)})

    def do_PATCH(self) -> None:
        match = re.fullmatch(r"/api/candidates/([^/]+)", urlparse(self.path).path)
        if not match:
            self.send_json(404, {"error": "API endpoint not found."})
            return
        try:
            payload = self.read_json()
            status = payload.get("status")
            if status not in STATUSES:
                raise ValueError("Select a valid candidate stage.")
            with database() as connection:
                cursor = connection.execute(
                    "UPDATE candidates SET status = ? WHERE id = ?", (status, match.group(1))
                )
                if cursor.rowcount == 0:
                    self.send_json(404, {"error": "Candidate not found."})
                    return
                row = connection.execute(
                    "SELECT * FROM candidates WHERE id = ?", (match.group(1),)
                ).fetchone()
            self.send_json(200, {"candidate": candidate_dict(row)})
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
        except sqlite3.Error as error:
            self.send_json(500, {"error": f"Unable to update candidate: {error}"})

    def create_job(self, payload: dict) -> None:
        title = required_text(payload, "title", 160)
        location = required_text(payload, "location", 160)
        job_type = required_text(payload, "type", 40)
        department = required_text(payload, "department", 100)
        openings = payload.get("openings")
        if isinstance(openings, bool) or not isinstance(openings, int) or openings < 1:
            raise ValueError("openings must be a positive whole number.")
        skills = payload.get("skills", [])
        if not isinstance(skills, list) or any(
            not isinstance(skill, str) or len(skill) > 60 for skill in skills
        ):
            raise ValueError("skills must be a list of short text values.")

        job_id = str(uuid4())
        with database() as connection:
            connection.execute(
                """INSERT INTO jobs
                   (id, title, location, type, department, skills, openings, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')""",
                (job_id, title, location, job_type, department, json.dumps(skills), openings),
            )
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        self.send_json(201, {"job": job_dict(row)})

    def create_interview(self, payload: dict) -> None:
        candidate_id = required_text(payload, "candidateId", 80)
        date_value = required_text(payload, "date", 40)
        try:
            scheduled_at = datetime.fromisoformat(date_value)
        except ValueError as error:
            raise ValueError("Enter a valid interview date and time.") from error
        interview_type = required_text(payload, "type", 100)
        interviewer = required_text(payload, "interviewer", 120)
        interview_id = str(uuid4())
        with database() as connection:
            if not connection.execute(
                "SELECT 1 FROM candidates WHERE id = ?", (candidate_id,)
            ).fetchone():
                raise ValueError("Select an existing candidate.")
            connection.execute(
                """INSERT INTO interviews (id, candidate_id, date, type, interviewer)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    interview_id,
                    candidate_id,
                    scheduled_at.isoformat(timespec="minutes"),
                    interview_type,
                    interviewer,
                ),
            )
            row = connection.execute(
                "SELECT * FROM interviews WHERE id = ?", (interview_id,)
            ).fetchone()
        self.send_json(201, {"interview": interview_dict(row)})

    def send_static(self, path: str) -> None:
        relative_path = "index.html" if path in ("", "/") else path.lstrip("/")
        if relative_path not in {"index.html", "style.css", "script.js"}:
            self.send_json(404, {"error": "File not found."})
            return
        requested = (BASE_DIR / relative_path).resolve()
        if BASE_DIR != requested and BASE_DIR not in requested.parents:
            self.send_json(403, {"error": "Forbidden."})
            return
        if not requested.is_file():
            self.send_json(404, {"error": "File not found."})
            return

        content_types = {
            ".css": "text/css; charset=utf-8",
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
        }
        body = requested.read_bytes()
        self.send_response(200)
        self.send_header(
            "Content-Type",
            content_types.get(requested.suffix, "application/octet-stream"),
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        print(f"{self.log_date_time_string()} {self.address_string()} {format % args}")


def main() -> None:
    initialize_database()
    host = os.environ.get("ATS_HOST", "127.0.0.1")
    port = int(os.environ.get("ATS_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), ATSHandler)
    print(f"TalentFlow ATS running at http://{host}:{port}")
    print(f"SQLite database: {DATABASE_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down TalentFlow ATS.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
