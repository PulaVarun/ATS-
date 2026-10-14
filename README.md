# TalentFlow ATS

A lightweight Applicant Tracking System built with Python, SQLite, HTML, CSS, and JavaScript. The Python server provides a REST API and serves the dashboard. No third-party Python packages are required.

## Run locally

Install Python 3.10 or newer, then run this command from the project folder:

```bash
python server.py
```

Open <http://127.0.0.1:8000> in your browser. Stop the server with `Ctrl+C`.

On Windows, you can use `py server.py` if `python` is not available on your PATH.

The server creates `talentflow.db` next to `server.py` on first run and adds sample records. The database is ignored by Git; your records stay in that local database between restarts.

To use a different port or database location:

```bash
# PowerShell
$env:ATS_PORT = "8001"
$env:ATS_DATABASE = "C:\data\talentflow.db"
python server.py
```

## Features

- Overview dashboard with hiring metrics and pipeline activity
- Searchable candidates and editable hiring stages
- Visual hiring pipeline board
- Job posting management
- Interview scheduling and schedule list
- Recruitment reports generated from database records
- Responsive desktop and mobile layout
- SQLite persistence across server restarts

## API endpoints

All endpoints are served by the Python app on the same origin.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that the server is running |
| `GET` | `/api/candidates` | List candidates |
| `POST` | `/api/candidates` | Add a candidate |
| `PATCH` | `/api/candidates/{id}` | Update a candidate's hiring stage |
| `GET` | `/api/jobs` | List job postings |
| `POST` | `/api/jobs` | Create a job posting |
| `GET` | `/api/interviews` | List scheduled interviews |
| `POST` | `/api/interviews` | Schedule an interview |
| `GET` | `/api/reports` | Get hiring and source statistics |

## Project files

```text
server.py       Python HTTP server, REST API, SQLite schema, and sample data
test_server.py  API tests using Python's built-in unittest
index.html      Dashboard layout
style.css       Responsive styles
script.js       Frontend interactions and API integration
README.md       Setup guide and API reference
```

## Run tests

```bash
python -m unittest
```

## Scope

This is a learning/demo project. It does not include login/authentication, resume uploads, or real email delivery. Do not put real candidate personal information in a publicly accessible deployment without adding appropriate security, privacy controls, and access restrictions.
