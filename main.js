/* ═══════════════════════════════════════════
   BLOODLINK TN — MAIN JAVASCRIPT
   Features:
   1. Navbar scroll effect
   2. Mobile menu toggle
   3. Number counter animation
   4. Scroll reveal animation
   5. Active nav link highlight
═══════════════════════════════════════════ */

/* ─── 1. NAVBAR SCROLL EFFECT ──────────── */
const navbar  = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  if (window.scrollY > 20) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

/* ─── 2. MOBILE MENU TOGGLE ────────────── */
const navToggle = document.getElementById('navToggle');
const navMobile = document.getElementById('navMobile');

navToggle.addEventListener('click', () => {
  navMobile.classList.toggle('open');
});

// Close mobile menu when a link is clicked
navMobile.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navMobile.classList.remove('open');
  });
});

/* ─── 3. NUMBER COUNTER ANIMATION ──────── */
// Finds all elements with data-target attribute and counts up to the number
function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-target'));
  if (!target) return; // skip if no target (like "2 min")

  let current = 0;
  const step  = Math.ceil(target / 60); // how much to add each tick
  const timer = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(timer);
    }
    el.textContent = current;
  }, 25); // tick every 25ms
}

/* ─── 4. SCROLL REVEAL (Intersection Observer) ─── */
// IntersectionObserver watches elements and reveals them when they enter the screen
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target); // stop watching after reveal
    }
  });
}, { threshold: 0.12 }); // trigger when 12% of element is visible

document.querySelectorAll('.reveal').forEach(el => {
  revealObserver.observe(el);
});

/* ─── 5. COUNTER: trigger on scroll ────── */
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('[data-target]').forEach(animateCounter);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.3 });

const heroStats = document.querySelector('.hero-stats');
if (heroStats) counterObserver.observe(heroStats);

/* ─── 6. SMOOTH SCROLL for hash links ──── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = document.getElementById('navbar').offsetHeight + 16;
      const top    = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

/* ─── 7. LIVE STATS from API ─────────────── */
async function loadLiveStats() {
  try {
    const res  = await fetch('http://localhost:8000/api/features/stats/public');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;
    const s = data.stats;

    // Update stat counters if they exist on the page
    const map = {
      'stat-banks':    s.banks,
      'stat-patients': s.patients,
      'stat-requests': s.requests,
      'stat-units':    s.totalUnits,
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) {
        el.setAttribute('data-target', val);
        animateCounter(el);
      }
    });
  } catch(e) {
    // Server not running — static numbers already shown
  }
}

// Try loading live stats after page loads
window.addEventListener('load', () => setTimeout(loadLiveStats, 800));
