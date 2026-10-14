import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server as ats


class QuietATSHandler(ats.ATSHandler):
    def log_message(self, format, *args):
        pass


class ATSAPITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.original_database_path = ats.DATABASE_PATH
        ats.DATABASE_PATH = Path(cls.temp_dir.name) / "test.db"
        ats.initialize_database()
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietATSHandler)
        cls.base_url = f"http://127.0.0.1:{cls.httpd.server_port}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.thread.join()
        cls.httpd.server_close()
        ats.DATABASE_PATH = cls.original_database_path
        cls.temp_dir.cleanup()

    def setUp(self):
        with ats.database() as connection:
            connection.execute("DELETE FROM interviews")
            connection.execute("DELETE FROM jobs")
            connection.execute("DELETE FROM candidates")
        ats.initialize_database()

    def request_json(self, path, method="GET", payload=None):
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"{self.base_url}{path}",
            data=body,
            method=method,
            headers={"Content-Type": "application/json"} if body is not None else {},
        )
        with urlopen(request) as response:
            return response.status, json.loads(response.read())

    def test_sample_data_and_reports_are_served(self):
        status, candidates = self.request_json("/api/candidates")
        self.assertEqual(status, 200)
        self.assertEqual(len(candidates["candidates"]), 7)

        _, reports = self.request_json("/api/reports")
        self.assertEqual(reports["candidate_total"], 7)
        self.assertEqual(reports["hires"], 1)

    def test_candidate_creation_and_stage_update_persist(self):
        status, result = self.request_json(
            "/api/candidates",
            "POST",
            {
                "name": "API Test Candidate",
                "email": "api-test@example.com",
                "role": "QA Engineer",
                "experience": "2 years",
                "source": "Referral",
                "status": "New",
            },
        )
        self.assertEqual(status, 201)
        candidate_id = result["candidate"]["id"]

        _, updated = self.request_json(
            f"/api/candidates/{candidate_id}", "PATCH", {"status": "Interview"}
        )
        self.assertEqual(updated["candidate"]["status"], "Interview")

        _, candidates = self.request_json("/api/candidates")
        saved_candidate = next(
            candidate
            for candidate in candidates["candidates"]
            if candidate["id"] == candidate_id
        )
        self.assertEqual(saved_candidate["status"], "Interview")

    def test_duplicate_email_returns_conflict(self):
        payload = {
            "name": "Another Candidate",
            "email": "olivia.rhye@email.com",
            "role": "Designer",
            "experience": "1 year",
            "source": "Other",
            "status": "New",
        }
        request = Request(
            f"{self.base_url}/api/candidates",
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 409)
        error.exception.close()

    def test_job_and_interview_creation(self):
        status, job_result = self.request_json(
            "/api/jobs",
            "POST",
            {
                "title": "Python Engineer",
                "location": "Remote",
                "type": "Full-time",
                "department": "Engineering",
                "skills": ["Python", "SQLite"],
                "openings": 1,
            },
        )
        self.assertEqual(status, 201)
        self.assertIn("Python", job_result["job"]["skills"])

        _, candidates = self.request_json("/api/candidates")
        candidate_id = candidates["candidates"][0]["id"]
        status, interview_result = self.request_json(
            "/api/interviews",
            "POST",
            {
                "candidateId": candidate_id,
                "date": "2027-01-15T10:30",
                "type": "Technical interview",
                "interviewer": "Jordan Davis",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(interview_result["interview"]["candidateId"], candidate_id)

    def test_static_frontend_is_served_but_database_is_not(self):
        status, result = self.request_json("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "ok")
        with urlopen(f"{self.base_url}/") as response:
            self.assertIn(b"TalentFlow", response.read())
        with self.assertRaises(HTTPError) as error:
            urlopen(f"{self.base_url}/test.db")
        self.assertEqual(error.exception.code, 404)
        error.exception.close()


if __name__ == "__main__":
    unittest.main()
