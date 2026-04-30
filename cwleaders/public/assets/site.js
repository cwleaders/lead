document.documentElement.classList.add("js");

for (const element of document.querySelectorAll("[data-year]")) {
  element.textContent = String(new Date().getFullYear());
}

const currentPath = window.location.pathname.endsWith("/")
  ? window.location.pathname
  : `${window.location.pathname}/`;

for (const link of document.querySelectorAll("[data-nav-link]")) {
  const linkPath = new URL(link.href, window.location.origin).pathname;
  const normalized = linkPath.endsWith("/") ? linkPath : `${linkPath}/`;
  if (normalized === currentPath) {
    link.setAttribute("aria-current", "page");
  }
}

const submissionTarget = document.querySelector("[data-submission-id]");
if (submissionTarget) {
  const submissionId = new URLSearchParams(window.location.search).get("submission");
  submissionTarget.textContent = submissionId || "pending";
}

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.14 }
  );

  for (const element of document.querySelectorAll("[data-reveal]")) {
    observer.observe(element);
  }
} else {
  for (const element of document.querySelectorAll("[data-reveal]")) {
    element.classList.add("is-visible");
  }
}
