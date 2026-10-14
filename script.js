const stages = ["New", "Screening", "Interview", "Offer", "Hired", "Rejected"];
const avatarColors = ["peach", "blue", "pink", "mint", "lavender", "yellow"];
const pageContent = document.querySelector("#page-content");
const modalRoot = document.querySelector("#modal-root");
const searchInput = document.querySelector("#global-search");
let route = "overview";
let query = "";
let candidateFilter = "All stages";
let toastTimer;
let data = {
  candidates: [],
  jobs: [],
  interviews: [],
  reports: { stage_counts: {}, source_counts: {}, active_jobs: 0, hires: 0, interviews: 0, candidate_total: 0, job_total: 0 },
};

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

async function refreshData() {
  const [candidateResult, jobResult, interviewResult, reports] = await Promise.all([
    apiRequest("/api/candidates"),
    apiRequest("/api/jobs"),
    apiRequest("/api/interviews"),
    apiRequest("/api/reports"),
  ]);
  data = {
    candidates: candidateResult.candidates,
    jobs: jobResult.jobs,
    interviews: interviewResult.interviews,
    reports,
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function avatar(name, color) {
  return `<span class="avatar avatar-${escapeHtml(color)}">${escapeHtml(initials(name))}</span>`;
}

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, "-")}`;
}

function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}">${escapeHtml(status)}</span>`;
}

function statusOptions(selected) {
  return stages.map((stage) => `<option value="${stage}" ${stage === selected ? "selected" : ""}>${stage}</option>`).join("");
}

function filteredCandidates() {
  const normalizedQuery = query.trim().toLowerCase();
  return data.candidates.filter((candidate) => {
    const matchesQuery = !normalizedQuery || [candidate.name, candidate.email, candidate.role, candidate.source]
      .some((value) => value.toLowerCase().includes(normalizedQuery));
    return matchesQuery && (candidateFilter === "All stages" || candidate.status === candidateFilter);
  });
}

function candidateRows(candidates) {
  if (!candidates.length) {
    return `<tr><td colspan="6"><div class="empty-state"><strong>No candidates found</strong>Try adjusting your search or add a new candidate.</div></td></tr>`;
  }
  return candidates.map((candidate) => `
    <tr>
      <td><div class="candidate-cell">${avatar(candidate.name, candidate.color)}<div class="candidate-name"><strong>${escapeHtml(candidate.name)}</strong><span>${escapeHtml(candidate.email)}</span></div></div></td>
      <td>${escapeHtml(candidate.role)}</td>
      <td>${escapeHtml(candidate.experience)}</td>
      <td>${escapeHtml(candidate.applied)}</td>
      <td><label class="sr-only" for="status-${escapeHtml(candidate.id)}">Status for ${escapeHtml(candidate.name)}</label><select class="status-select" id="status-${escapeHtml(candidate.id)}" data-status-id="${escapeHtml(candidate.id)}">${statusOptions(candidate.status)}</select></td>
      <td><button class="row-action" type="button" data-schedule-id="${escapeHtml(candidate.id)}" aria-label="Schedule interview for ${escapeHtml(candidate.name)}">···</button></td>
    </tr>`).join("");
}

function candidatesTable(candidates, includeFilter = true) {
  return `<section class="panel">
    <div class="table-toolbar">
      <label class="table-search"><span aria-hidden="true">⌕</span><input id="table-search" type="search" placeholder="Search by name, role, or email..." value="${escapeHtml(query)}" aria-label="Search candidates" /></label>
      ${includeFilter ? `<select id="candidate-filter" aria-label="Filter candidates by stage"><option>All stages</option>${stages.map((stage) => `<option ${candidateFilter === stage ? "selected" : ""}>${stage}</option>`).join("")}</select>` : `<span class="page-subtitle">${candidates.length} candidate${candidates.length === 1 ? "" : "s"}</span>`}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>CANDIDATE</th><th>ROLE</th><th>EXPERIENCE</th><th>APPLIED</th><th>STAGE</th><th></th></tr></thead>
      <tbody>${candidateRows(candidates)}</tbody>
    </table></div>
  </section>`;
}

function pageHeading(eyebrow, title, subtitle, actions = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}

function actionButton(label, action, primary = false) {
  return `<button class="button ${primary ? "button-primary" : ""}" type="button" data-action="${action}">${primary ? '<span class="button-plus" aria-hidden="true">+</span>' : ""}${label}</button>`;
}

function renderOverview() {
  const activeCandidates = data.candidates.filter((candidate) => !["Hired", "Rejected"].includes(candidate.status)).length;
  const activeJobs = data.jobs.filter((job) => job.status === "Active").length;
  const now = new Date();
  const weekFromNow = new Date(now);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const interviews = data.interviews.filter((item) => new Date(item.date) >= now && new Date(item.date) <= weekFromNow).length;
  const hired = data.candidates.filter((candidate) => candidate.status === "Hired").length;
  const pipeline = stages.map((stage) => [stage, data.candidates.filter((candidate) => candidate.status === stage).length]);
  const maxCount = Math.max(1, ...pipeline.map(([, count]) => count));
  const latest = data.candidates.slice(0, 4);
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return `${pageHeading(today, `${greeting}, Jordan 👋`, "Here’s what’s happening with your hiring pipeline today.", `${actionButton("Add candidate", "candidate", true)}${actionButton("Post a job", "job")}`)}
    <div class="metric-grid">
      <article class="metric-card"><div class="metric-top"><span>Active candidates</span><span class="metric-icon">♙</span></div><div class="metric-value">${activeCandidates}</div><div class="metric-foot"><span class="positive">↑ 12%</span><span>vs. last month</span></div></article>
      <article class="metric-card"><div class="metric-top"><span>Open positions</span><span class="metric-icon">▣</span></div><div class="metric-value">${activeJobs}</div><div class="metric-foot"><span class="positive">${data.jobs.length - activeJobs} paused</span><span>across your team</span></div></article>
      <article class="metric-card"><div class="metric-top"><span>Interviews this week</span><span class="metric-icon">◷</span></div><div class="metric-value">${interviews}</div><div class="metric-foot"><span class="positive">Upcoming</span><span>in the next 7 days</span></div></article>
      <article class="metric-card"><div class="metric-top"><span>Candidates hired</span><span class="metric-icon">✦</span></div><div class="metric-value">${hired}</div><div class="metric-foot"><span class="positive">Current total</span><span>marked as hired</span></div></article>
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header"><div><h2 class="panel-title">Hiring pipeline</h2><p class="panel-caption">Candidate progress across all open roles</p></div><button class="text-button" type="button" data-route="pipeline">View pipeline →</button></div>
        <div class="pipeline-summary">${pipeline.slice(0, 4).map(([stage, count]) => `<div class="stage-summary"><span>${stage}</span><strong>${count}</strong></div>`).join("")}</div>
        <div class="pipeline-bars">${pipeline.map(([, count]) => `<span title="${count} candidates" style="flex:${Math.max(count, .15) / maxCount}"></span>`).join("")}</div>
        <div class="stage-legend">${pipeline.map(([stage, count], index) => `<div class="legend-item"><span class="legend-dot" style="background:${["#7869ed","#9e8df0","#c3b8f8","#f0c66e","#59ba94","#e7a2aa"][index]}"></span>${stage}<strong>${count}</strong></div>`).join("")}</div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h2 class="panel-title">Recent applicants</h2><p class="panel-caption">Your latest candidate activity</p></div><button class="text-button" type="button" data-route="candidates">See all →</button></div>
        <div class="activity-list">${latest.length ? latest.map((candidate, index) => `<div class="activity-item">${avatar(candidate.name, candidate.color)}<div class="activity-copy"><strong>${escapeHtml(candidate.name)}</strong> applied for ${escapeHtml(candidate.role)}<br />${statusPill(candidate.status)}</div><span class="activity-time">${index ? `${index + 1}d ago` : "Today"}</span></div>`).join("") : `<div class="empty-state">No candidates yet.</div>`}</div>
      </section>
    </div>
    <div class="section-row"><h2>Latest candidates</h2><button class="text-button" type="button" data-route="candidates">View all candidates →</button></div>
    ${candidatesTable(filteredCandidates().slice(0, 5), false)}`;
}

function renderCandidates() {
  return `${pageHeading("Talent pool", "Candidates", "Review applicants and keep every application moving.", actionButton("Add candidate", "candidate", true))}
    ${candidatesTable(filteredCandidates())}`;
}

function renderPipeline() {
  const pipelineStages = ["New", "Screening", "Interview", "Offer"];
  return `${pageHeading("Recruitment", "Hiring pipeline", "Move candidates through each step of your hiring process.", actionButton("Add candidate", "candidate", true))}
    <div class="board">${pipelineStages.map((stage) => {
      const candidates = filteredCandidates().filter((candidate) => candidate.status === stage);
      return `<section class="board-column"><div class="board-column-head"><span>${stage}</span><span>${candidates.length}</span></div>${candidates.length ? candidates.map((candidate) => `<article class="board-card"><strong>${escapeHtml(candidate.name)}</strong><p>${escapeHtml(candidate.role)} · ${escapeHtml(candidate.experience)}</p><label class="sr-only" for="board-status-${escapeHtml(candidate.id)}">Update ${escapeHtml(candidate.name)} stage</label><select class="status-select" id="board-status-${escapeHtml(candidate.id)}" data-status-id="${escapeHtml(candidate.id)}">${statusOptions(candidate.status)}</select></article>`).join("") : `<div class="empty-state">No candidates here</div>`}</section>`;
    }).join("")}</div>
    <p class="page-subtitle" style="margin-top:12px">Use each candidate’s stage menu to update their application status.</p>`;
}

function renderJobs() {
  const jobs = data.jobs;
  return `${pageHeading("Open roles", "Jobs", "Manage the positions your team is hiring for.", actionButton("Create job", "job", true))}
    <div class="job-grid">${jobs.length ? jobs.map((job, index) => {
      const count = data.candidates.filter((candidate) => candidate.role.toLowerCase().includes(job.department.toLowerCase()) || candidate.role.toLowerCase().includes(job.title.split(" ")[0].toLowerCase())).length;
      return `<article class="job-card"><div class="job-card-top"><span class="job-icon">${escapeHtml(job.department.slice(0, 1))}</span><button class="job-menu" type="button" aria-label="Job status">${job.status === "Active" ? "···" : "◷"}</button></div><h3>${escapeHtml(job.title)}</h3><div class="job-meta"><span>⌖ ${escapeHtml(job.location)}</span><span>◷ ${escapeHtml(job.type)}</span></div><div class="job-tags">${job.skills.map((skill) => `<span class="job-tag">${escapeHtml(skill)}</span>`).join("")}</div><div class="job-card-footer"><span><strong>${count}</strong> applicants</span><span>${escapeHtml(job.status)} · ${job.openings} opening${job.openings === 1 ? "" : "s"}</span></div></article>`;
    }).join("") : `<div class="panel empty-state"><strong>No jobs posted yet</strong>Create a job to start collecting applications.</div>`}</div>`;
}

function formatInterviewDate(value) {
  const date = new Date(value);
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function renderInterviews() {
  const interviews = [...data.interviews].sort((a, b) => new Date(a.date) - new Date(b.date));
  const rows = interviews.map((interview) => {
    const candidate = data.candidates.find((item) => item.id === interview.candidateId);
    return `<tr><td>${candidate ? `<div class="candidate-cell">${avatar(candidate.name, candidate.color)}<div class="candidate-name"><strong>${escapeHtml(candidate.name)}</strong><span>${escapeHtml(candidate.role)}</span></div></div>` : "Candidate removed"}</td><td>${escapeHtml(formatInterviewDate(interview.date))}</td><td>${escapeHtml(interview.type)}</td><td>${escapeHtml(interview.interviewer)}</td><td><span class="status-pill status-interview">${new Date(interview.date) < new Date() ? "Completed" : "Scheduled"}</span></td></tr>`;
  }).join("");
  return `${pageHeading("Meet the team", "Interviews", "Keep conversations organized and make every candidate feel welcome.", actionButton("Schedule interview", "interview", true))}
    <section class="panel"><div class="panel-header"><div><h2 class="panel-title">Interview schedule</h2><p class="panel-caption">${interviews.length} interview${interviews.length === 1 ? "" : "s"} on the calendar</p></div></div><div class="table-wrap"><table><thead><tr><th>CANDIDATE</th><th>DATE & TIME</th><th>INTERVIEW TYPE</th><th>INTERVIEWER</th><th>STATUS</th></tr></thead><tbody>${rows || `<tr><td colspan="5"><div class="empty-state"><strong>No interviews scheduled</strong>Schedule an interview to see it here.</div></td></tr>`}</tbody></table></div></section>`;
}

function renderReports() {
  const total = Math.max(1, data.reports.candidate_total);
  const stageCounts = stages.map((stage) => [stage, data.reports.stage_counts[stage] || 0]);
  const sources = ["LinkedIn", "Referral", "Careers page", "Other"].map((source) => [source, data.reports.source_counts[source] || 0]);
  return `${pageHeading("Your hiring at a glance", "Reports", "A snapshot of your recruitment activity and candidate sources.", "")}
    <div class="report-grid">
      <section class="report-card"><h3>Applications by stage</h3><p>${data.candidates.length} candidates in your hiring pipeline</p>${stageCounts.map(([stage, count]) => `<div class="report-bar-row"><span>${stage}</span><div class="report-track"><span style="width:${count / total * 100}%"></span></div><strong>${count}</strong></div>`).join("")}</section>
      <section class="report-card"><h3>Candidate sources</h3><p>Where your applicants are finding you</p>${sources.map(([source, count]) => `<div class="report-bar-row"><span>${source}</span><div class="report-track"><span style="width:${count / total * 100}%"></span></div><strong>${count}</strong></div>`).join("")}</section>
      <section class="report-card"><h3>Hiring snapshot</h3><p>Current team activity</p><div class="report-bar-row"><span>Active jobs</span><div class="report-track"><span style="width:${data.reports.active_jobs / Math.max(1, data.reports.job_total) * 100}%"></span></div><strong>${data.reports.active_jobs}</strong></div><div class="report-bar-row"><span>Interviews</span><div class="report-track"><span style="width:${data.reports.interviews ? 100 : 0}%"></span></div><strong>${data.reports.interviews}</strong></div><div class="report-bar-row"><span>Hires</span><div class="report-track"><span style="width:${data.reports.hires / total * 100}%"></span></div><strong>${data.reports.hires}</strong></div></section>
      <section class="report-card"><h3>Hiring tip</h3><p>A little consistency goes a long way</p><div class="empty-state" style="padding:13px 5px;text-align:left"><strong>Keep candidates in the loop</strong>Updating application stages and scheduling interviews promptly creates a smoother, more welcoming experience for everyone.</div></section>
    </div>`;
}

const renderers = {
  overview: renderOverview,
  pipeline: renderPipeline,
  candidates: renderCandidates,
  jobs: renderJobs,
  interviews: renderInterviews,
  reports: renderReports,
};

function render() {
  const labels = { overview: "Overview", pipeline: "Pipeline", candidates: "Candidates", jobs: "Jobs", interviews: "Interviews", reports: "Reports" };
  document.querySelector("#page-crumb").textContent = labels[route];
  document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("is-active", link.dataset.route === route));
  document.querySelector("#pipeline-count").textContent = data.candidates.filter((candidate) => !["Hired", "Rejected"].includes(candidate.status)).length;
  pageContent.innerHTML = renderers[route]();
  const tableSearch = document.querySelector("#table-search");
  if (tableSearch) tableSearch.addEventListener("input", () => {
    query = tableSearch.value;
    searchInput.value = query;
    const cursor = tableSearch.selectionStart;
    pageContent.innerHTML = renderers[route]();
    const nextSearch = document.querySelector("#table-search");
    if (nextSearch) { nextSearch.focus(); nextSearch.setSelectionRange(cursor, cursor); }
    bindPageInputs();
  });
  bindPageInputs();
}

function bindPageInputs() {
  const filter = document.querySelector("#candidate-filter");
  if (filter) filter.addEventListener("change", () => { candidateFilter = filter.value; render(); });
}

function showToast(message) {
  const region = document.querySelector("#toast-region");
  region.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { region.innerHTML = ""; }, 2800);
}

function openModal(kind, candidateId = "") {
  const candidateOptions = data.candidates.map((candidate) => `<option value="${escapeHtml(candidate.id)}" ${candidate.id === candidateId ? "selected" : ""}>${escapeHtml(candidate.name)} · ${escapeHtml(candidate.role)}</option>`).join("");
  const suggestedDate = new Date();
  suggestedDate.setDate(suggestedDate.getDate() + 2);
  const datePart = `${suggestedDate.getFullYear()}-${String(suggestedDate.getMonth() + 1).padStart(2, "0")}-${String(suggestedDate.getDate()).padStart(2, "0")}`;
  const timePart = `${String(suggestedDate.getHours()).padStart(2, "0")}:${String(suggestedDate.getMinutes()).padStart(2, "0")}`;
  const details = {
    candidate: { title: "Add a candidate", description: "Add someone new to your hiring pipeline." },
    job: { title: "Create a job", description: "Share the details of the role you’re hiring for." },
    interview: { title: "Schedule an interview", description: "Add an upcoming conversation to your calendar." },
  }[kind];
  let fields = "";
  if (kind === "candidate") {
    fields = `<div class="form-grid"><div class="form-field"><label for="candidate-name">Full name</label><input id="candidate-name" name="name" required placeholder="e.g. Alex Morgan" /></div><div class="form-field"><label for="candidate-email">Email address</label><input id="candidate-email" name="email" type="email" required placeholder="alex@email.com" /></div></div>
      <div class="form-grid"><div class="form-field"><label for="candidate-role">Role</label><input id="candidate-role" name="role" required placeholder="e.g. Product Designer" /></div><div class="form-field"><label for="candidate-experience">Experience</label><input id="candidate-experience" name="experience" placeholder="e.g. 4 years" /></div></div>
      <div class="form-grid"><div class="form-field"><label for="candidate-source">Source</label><select id="candidate-source" name="source"><option>LinkedIn</option><option>Referral</option><option>Careers page</option><option>Other</option></select></div><div class="form-field"><label for="candidate-status">Stage</label><select id="candidate-status" name="status">${statusOptions("New")}</select></div></div>`;
  } else if (kind === "job") {
    fields = `<div class="form-field"><label for="job-title">Job title</label><input id="job-title" name="title" required placeholder="e.g. Product Designer" /></div>
      <div class="form-grid"><div class="form-field"><label for="job-location">Location</label><input id="job-location" name="location" required placeholder="Remote or city" /></div><div class="form-field"><label for="job-type">Employment type</label><select id="job-type" name="type"><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option></select></div></div>
      <div class="form-grid"><div class="form-field"><label for="job-department">Department</label><input id="job-department" name="department" required placeholder="e.g. Design" /></div><div class="form-field"><label for="job-openings">Open positions</label><input id="job-openings" name="openings" type="number" min="1" value="1" required /></div></div>
      <div class="form-field"><label for="job-skills">Skills (comma separated)</label><input id="job-skills" name="skills" placeholder="Figma, Research, UX" /></div>`;
  } else {
    fields = `<div class="form-field"><label for="interview-candidate">Candidate</label><select id="interview-candidate" name="candidateId" required>${candidateOptions}</select></div>
      <div class="form-grid"><div class="form-field"><label for="interview-date">Date & time</label><input id="interview-date" name="date" type="datetime-local" required value="${datePart}T${timePart}" /></div><div class="form-field"><label for="interview-type">Interview type</label><select id="interview-type" name="type"><option>Recruiter screen</option><option>Technical interview</option><option>Portfolio review</option><option>Team conversation</option><option>Final interview</option></select></div></div>
      <div class="form-field"><label for="interview-interviewer">Interviewer</label><input id="interview-interviewer" name="interviewer" required value="Jordan Davis" /></div>`;
  }
  modalRoot.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><h2 id="modal-title">${details.title}</h2><p>${details.description}</p></div><button class="modal-close" type="button" data-close-modal aria-label="Close dialog">×</button></div><form class="modal-form" data-form-kind="${kind}">${fields}<div class="form-actions"><button class="button" type="button" data-close-modal>Cancel</button><button class="button button-primary" type="submit">${kind === "candidate" ? "Add candidate" : kind === "job" ? "Create job" : "Schedule interview"}</button></div></form></div>`;
  modalRoot.querySelector("input, select")?.focus();
}

async function submitForm(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.dataset.formKind === "candidate") {
      await apiRequest("/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          role: values.role.trim(),
          experience: values.experience.trim() || "Not specified",
          source: values.source,
          status: values.status,
        }),
      });
      candidateFilter = "All stages";
      showToast("Candidate added to your pipeline.");
    } else if (form.dataset.formKind === "job") {
      await apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: values.title.trim(),
          location: values.location.trim(),
          type: values.type,
          department: values.department.trim(),
          skills: values.skills.split(",").map((skill) => skill.trim()).filter(Boolean),
          openings: Number(values.openings),
        }),
      });
      showToast("Job created successfully.");
    } else {
      await apiRequest("/api/interviews", {
        method: "POST",
        body: JSON.stringify({
          candidateId: values.candidateId,
          date: values.date,
          type: values.type,
          interviewer: values.interviewer.trim(),
        }),
      });
      showToast("Interview scheduled.");
    }
    await refreshData();
    modalRoot.innerHTML = "";
    render();
  } catch (error) {
    showToast(error.message);
  }
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const routeButton = target.closest("[data-route]");
  if (routeButton) {
    event.preventDefault();
    route = routeButton.dataset.route;
    document.querySelector("#sidebar").classList.remove("is-open");
    render();
  }
  const action = target.closest("[data-action]");
  if (action) {
    const kind = action.dataset.action;
    if (kind === "interview" && data.candidates.length === 0) {
      showToast("Add a candidate before scheduling an interview.");
    } else {
      openModal(kind);
    }
  }
  const scheduleButton = target.closest("[data-schedule-id]");
  if (scheduleButton) openModal("interview", scheduleButton.dataset.scheduleId);
  if (target.closest("[data-close-modal]") || target === modalRoot) modalRoot.innerHTML = "";
});

document.addEventListener("submit", (event) => {
  if (event.target instanceof HTMLFormElement && event.target.matches("[data-form-kind]")) {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    submitForm(event.target);
  }
});

document.addEventListener("change", async (event) => {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement) || !select.dataset.statusId) return;
  const candidate = data.candidates.find((item) => item.id === select.dataset.statusId);
  if (!candidate) return;
  const nextStatus = select.value;
  try {
    await apiRequest(`/api/candidates/${encodeURIComponent(candidate.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await refreshData();
    render();
    showToast(`${candidate.name} moved to ${nextStatus}.`);
  } catch (error) {
    showToast(error.message);
    select.value = candidate.status;
  }
});

searchInput.addEventListener("input", () => {
  query = searchInput.value;
  render();
});
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { route = "candidates"; render(); }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape") modalRoot.innerHTML = "";
});
document.querySelector("#menu-button").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("is-open");
});

pageContent.innerHTML = `<div class="panel empty-state"><strong>Connecting to TalentFlow</strong>Loading candidates and jobs from the Python server…</div>`;
refreshData()
  .then(render)
  .catch((error) => {
    render();
    showToast(error.message || "Could not connect to the Python server.");
  });
