// ============================================================
// Content Script - Auto MCQ Solver & Auto-Pilot Engine
// ============================================================

(function () {
  "use strict";

  // Avoid double-injection
  if (window.__autoMcqSolverInjected) return;
  window.__autoMcqSolverInjected = true;

  // ---- State ----
  let isProcessing = false;
  let autoPilotEnabled = false;
  let autoPilotVideoSpeed = 2.0;
  let autoPilotTimer = null;
  let consecutiveStallCount = 0;
  let lastProcessedSignature = "";
  let activeCorrectionTarget = null;

  let floatingBtn = null;
  let statusPanel = null;
  let statusTimer = null;
  let autoPilotHUD = null;

  // ---- Initialize from Storage ----
  chrome.storage.local.get(["autoPilotEnabled", "autoPilotVideoSpeed"], (res) => {
    autoPilotEnabled = !!res.autoPilotEnabled;
    if (res.autoPilotVideoSpeed) autoPilotVideoSpeed = parseFloat(res.autoPilotVideoSpeed);
    updateHUD();
    if (autoPilotEnabled) {
      startAutoPilotLoop();
    }
  });

  // ---- Create Floating UI ----
  function createFloatingUI() {
    // 1. Floating Action Button (FAB)
    floatingBtn = document.createElement("div");
    floatingBtn.id = "amcq-fab";
    floatingBtn.innerHTML = `
      <div class="amcq-fab-btn" title="Auto MCQ Solver">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
      </div>
      <div class="amcq-fab-menu" style="display:none;">
        <button class="amcq-menu-btn amcq-menu-autopilot" data-action="toggle-autopilot">
          🚀 <span class="amcq-ap-label">Start Auto-Pilot</span>
        </button>
        <button class="amcq-menu-btn" data-action="solve">🧠 Solve Questions</button>
        <button class="amcq-menu-btn" data-action="next">➡️ Click Next / Submit</button>
        <button class="amcq-menu-btn" data-action="extract">📋 Extract Only</button>
        <button class="amcq-menu-btn" data-action="video">🎬 Get Video Context</button>
      </div>
    `;
    document.body.appendChild(floatingBtn);

    // 2. Status Panel (notifications)
    statusPanel = document.createElement("div");
    statusPanel.id = "amcq-status";
    statusPanel.style.display = "none";
    statusPanel.title = "Click to dismiss";
    statusPanel.addEventListener("click", () => {
      statusPanel.style.display = "none";
      if (statusTimer) {
        clearTimeout(statusTimer);
        statusTimer = null;
      }
    });
    document.body.appendChild(statusPanel);

    // 3. Auto-Pilot Top HUD
    autoPilotHUD = document.createElement("div");
    autoPilotHUD.id = "amcq-autopilot-hud";
    autoPilotHUD.style.display = "none";
    autoPilotHUD.innerHTML = `
      <div class="amcq-hud-content">
        <span class="amcq-hud-pulse"></span>
        <span class="amcq-hud-text">🚀 <b>Auto-Pilot ACTIVE:</b> <span id="amcq-hud-step">Scanning...</span></span>
        <button id="amcq-hud-stop" title="Stop Auto-Pilot">⏹️ Stop</button>
      </div>
    `;
    document.body.appendChild(autoPilotHUD);

    // HUD Stop button event
    autoPilotHUD.querySelector("#amcq-hud-stop").addEventListener("click", () => {
      setAutoPilot(false);
    });

    // FAB Events
    floatingBtn.querySelector(".amcq-fab-btn").addEventListener("click", toggleMenu);

    floatingBtn.querySelectorAll(".amcq-menu-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const action = e.currentTarget.dataset.action;
        toggleMenu();
        if (action === "toggle-autopilot") setAutoPilot(!autoPilotEnabled);
        if (action === "solve") startSolving();
        if (action === "next") manualClickNext();
        if (action === "extract") extractAndShow();
        if (action === "video") extractVideoContext();
      });
    });
  }

  function toggleMenu() {
    const menu = floatingBtn.querySelector(".amcq-fab-menu");
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
  }

  function showStatus(msg, type = "info", duration = 3000) {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    statusPanel.style.display = "block";
    statusPanel.className = `amcq-status-${type}`;
    statusPanel.textContent = msg;
    statusTimer = setTimeout(() => {
      statusPanel.style.display = "none";
      statusTimer = null;
    }, duration);
  }

  function setHUDStep(text) {
    if (autoPilotHUD) {
      const stepEl = autoPilotHUD.querySelector("#amcq-hud-step");
      if (stepEl) stepEl.textContent = text;
    }
  }

  function updateHUD() {
    if (!autoPilotHUD) return;
    autoPilotHUD.style.display = autoPilotEnabled ? "block" : "none";
    const label = floatingBtn?.querySelector(".amcq-ap-label");
    if (label) {
      label.textContent = autoPilotEnabled ? "Stop Auto-Pilot" : "Start Auto-Pilot";
    }
  }

  // ---- Auto-Pilot Control ----

  function setAutoPilot(enable) {
    autoPilotEnabled = enable;
    chrome.storage.local.set({ autoPilotEnabled: enable });
    updateHUD();

    if (enable) {
      showStatus("🚀 Auto-Pilot Started! Sit back and relax.", "success");
      consecutiveStallCount = 0;
      lastProcessedSignature = "";
      startAutoPilotLoop();
    } else {
      if (autoPilotTimer) {
        clearTimeout(autoPilotTimer);
        autoPilotTimer = null;
      }
      showStatus("⏹️ Auto-Pilot Paused.", "info");
      setHUDStep("Paused");
    }
  }

  function startAutoPilotLoop() {
    if (autoPilotTimer) clearTimeout(autoPilotTimer);
    if (!autoPilotEnabled) return;

    autoPilotStep();
  }

  function scheduleNextStep(delayMs = 2500) {
    if (autoPilotTimer) clearTimeout(autoPilotTimer);
    if (!autoPilotEnabled) return;

    autoPilotTimer = setTimeout(() => {
      autoPilotStep();
    }, delayMs);
  }

  /**
   * Main Autonomous Decision Loop with Intelligent Error Recovery
   */
  async function autoPilotStep() {
    if (!autoPilotEnabled) return;

    try {
      // 0. Check for review drawer or list showing wrong/unattended questions
      const problemItem = findProblemQuestionInDrawerOrList();

      // If a problem question is visible in the drawer and it's NOT the currently active question:
      if (problemItem && !problemItem.isActive) {
        setHUDStep(`⚠️ Found ${problemItem.type}: '${problemItem.text}'. Navigating back to fix...`);
        showStatus(`⚠️ Navigating to fix ${problemItem.text}...`, "info", 2500);
        activeCorrectionTarget = {
          type: problemItem.type,
          questionNumber: problemItem.questionNumber,
          text: problemItem.text,
          timestamp: Date.now()
        };
        humanClick(problemItem.element);
        scheduleNextStep(2000);
        return;
      }

      // 1. Check if there are questions on screen
      const questions = extractQuestions();
      
      // A question needs solving if:
      // a) It is unanswered, OR
      // b) It was marked wrong / has wrong options, OR
      // c) We actively navigated here via activeCorrectionTarget to fix a wrong question, OR
      // d) The problem item in the drawer points to this active question as wrong
      const needsSolving = questions.filter(q => {
        if (!isQuestionAnswered(q)) return true;
        if (isQuestionWrong(q)) return true;
        if (activeCorrectionTarget && activeCorrectionTarget.type === "wrong") return true;
        if (problemItem && problemItem.type === "wrong") return true;
        return false;
      });

      if (questions.length > 0 && needsSolving.length > 0) {
        const sig = "mcq_" + questions.map(q => q.questionText.substring(0, 30)).join("|");
        if (sig === lastProcessedSignature) {
          consecutiveStallCount++;
          if (consecutiveStallCount >= 4) {
            setHUDStep("Waiting for page change or user action...");
            scheduleNextStep(3500);
            return;
          }
        } else {
          consecutiveStallCount = 0;
          lastProcessedSignature = sig;
        }

        const isFixing = questions.some(q => isQuestionWrong(q) || (problemItem && problemItem.type === "wrong") || (activeCorrectionTarget && activeCorrectionTarget.type === "wrong"));
        setHUDStep(isFixing ? `Correcting wrong answer for ${questions.length} MCQ...` : `Solving ${questions.length} MCQ(s)...`);
        showStatus(isFixing ? `🧠 Auto-Pilot: Fixing wrong answer...` : `🧠 Auto-Pilot: Solving ${questions.length} question(s)...`, "info");
        
        await startSolving(isFixing);
        activeCorrectionTarget = null; // Clear target after re-solving

        // After solving, wait for DOM update, then click Next/Submit
        setHUDStep("Answer selected. Clicking Next...");
        await sleep(1500);
        const clicked = clickNextOrSubmitButton();
        if (clicked) {
          showStatus("➡️ Auto-Pilot: Clicked Next / Submit!", "info", 2000);
        }
        scheduleNextStep(3000);
        return;
      }

      // 2. If questions exist and are ALREADY answered without errors:
      if (questions.length > 0 && needsSolving.length === 0) {
        consecutiveStallCount++;

        // If we clicked Next multiple times and the page didn't advance:
        if (consecutiveStallCount >= 2) {
          // Check if there is an inactive problem item we can jump to
          if (problemItem) {
            setHUDStep(`Stalled. Jumping to ${problemItem.text}...`);
            humanClick(problemItem.element);
            consecutiveStallCount = 0;
            scheduleNextStep(2000);
            return;
          }

          // Check if there is a retry button
          const retryBtn = findRetryButton();
          if (retryBtn) {
            setHUDStep("Stalled. Clicking Retry...");
            humanClick(retryBtn);
            consecutiveStallCount = 0;
            scheduleNextStep(2000);
            return;
          }

          // Check if there is a previous button to step back and find earlier missed questions
          const prevBtn = findPreviousButton();
          if (prevBtn) {
            setHUDStep("Stalled. Checking previous questions...");
            humanClick(prevBtn);
            consecutiveStallCount = 0;
            scheduleNextStep(2000);
            return;
          }
        }

        setHUDStep("Questions already answered. Advancing...");
        const clicked = clickNextOrSubmitButton();
        if (clicked) {
          showStatus("➡️ Advancing to next...", "info", 2000);
        }
        scheduleNextStep(3000);
        return;
      }

      // 3. Check for HTML5 Video
      const video = document.querySelector("video");
      if (video && isElementVisible(video)) {
        handleVideoAutoPilot(video);
        return;
      }

      // 4. Check for Next Lesson / Continue button on pure reading / completed screens
      const nextBtn = findNextOrSubmitButton();
      if (nextBtn) {
        const btnText = (nextBtn.textContent || "").trim();
        setHUDStep(`Clicking '${btnText || "Next"}'...`);
        showStatus(`➡️ Auto-Pilot: Advancing (${btnText || "Next"})...`, "info", 2000);
        humanClick(nextBtn);
        scheduleNextStep(3500);
        return;
      }

      // 5. Idle / Scanning
      setHUDStep("Scanning for questions or video...");
      scheduleNextStep(3000);

    } catch (err) {
      console.error("[Auto-Pilot Error]", err);
      setHUDStep(`Error: ${err.message}. Retrying...`);
      scheduleNextStep(4000);
    }
  }

  /**
   * Handle video playing, speed up, and auto-next
   */
  function handleVideoAutoPilot(video) {
    // Speed up video
    try {
      if (video.playbackRate !== autoPilotVideoSpeed) {
        video.playbackRate = autoPilotVideoSpeed;
      }
    } catch (_) {}

    // Auto-play if paused
    if (video.paused && !video.ended) {
      video.play().catch(() => {});
    }

    if (video.ended || (video.duration && video.currentTime >= video.duration - 1)) {
      setHUDStep("Video finished! Advancing to next lesson...");
      showStatus("🎬 Video finished! Looking for Next...", "success", 2500);
      setTimeout(() => {
        const clicked = clickNextOrSubmitButton();
        if (!clicked) {
          findAndClickNextLessonLink();
        }
        scheduleNextStep(3500);
      }, 1500);
    } else {
      const remainingSec = Math.round(video.duration ? (video.duration - video.currentTime) / (video.playbackRate || 1) : 0);
      const timeStr = remainingSec > 0 ? `${remainingSec}s left` : "Playing";
      setHUDStep(`Watching video at ${video.playbackRate || 1}x (${timeStr})...`);
      scheduleNextStep(2000);
    }
  }

  // ---- Error Recovery & Question Drawer Helpers ----

  function isRedColor(colorStr) {
    if (!colorStr) return false;
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return r > 180 && g < 110 && b < 110;
    }
    return /red|crimson|firebrick/i.test(colorStr);
  }

  function findWrongOptionsForQuestion(question) {
    const wrong = [];
    if (!question || !question.options) return wrong;

    question.options.forEach(opt => {
      if (!opt.element) return;
      const el = opt.element.closest("label, .option, .choice, .answer-option, li, div") || opt.element;
      if (!el) return;

      const className = ((el.className || "") + " " + (opt.element.className || "")).toLowerCase();
      if (/\b(wrong|incorrect|danger|error|bad|is-invalid)\b/.test(className)) {
        wrong.push(opt.text);
        return;
      }

      // Check if option was selected
      const isSelected = (opt.element.tagName === "INPUT" && opt.element.checked) ||
                         opt.element.getAttribute("aria-checked") === "true" ||
                         opt.element.classList.contains("selected") ||
                         opt.element.classList.contains("active") ||
                         opt.element.classList.contains("amcq-selected") ||
                         el.classList.contains("selected") ||
                         el.classList.contains("active") ||
                         el.classList.contains("amcq-selected");

      if (isSelected) {
        try {
          const style = window.getComputedStyle(el);
          const optStyle = window.getComputedStyle(opt.element);
          if (isRedColor(style.backgroundColor) || isRedColor(style.color) || isRedColor(style.borderColor) ||
              isRedColor(optStyle.backgroundColor) || isRedColor(optStyle.color) || isRedColor(optStyle.borderColor)) {
            wrong.push(opt.text);
            return;
          }
        } catch (_) {}

        // If we actively navigated here to correct a wrong answer, the currently selected option was the wrong one!
        if (activeCorrectionTarget && activeCorrectionTarget.type === "wrong") {
          wrong.push(opt.text);
          return;
        }
      }
    });

    return Array.from(new Set(wrong));
  }

  function isQuestionWrong(question) {
    if (activeCorrectionTarget && activeCorrectionTarget.type === "wrong") return true;
    return findWrongOptionsForQuestion(question).length > 0;
  }

  function findProblemQuestionInDrawerOrList() {
    // Look for items representing wrong or unattended questions in the sidebar/drawer
    const candidates = Array.from(document.querySelectorAll(
      'li, div, a, button, tr, [role="button"], [class*="item"], [class*="question"]'
    ));

    const problemItems = [];

    for (const el of candidates) {
      if (!isElementVisible(el)) continue;
      if (el.children.length > 5) continue; // Skip large container blocks

      const text = (el.innerText || el.textContent || "").trim();
      if (!text) continue;

      const isWrong = /\bwrong\b/i.test(text) || /\bincorrect\b/i.test(text);
      const isUnattended = /not\s*attended/i.test(text) || /\bunattended\b/i.test(text) || /\bunanswered\b/i.test(text) || /\bskipped\b/i.test(text);

      if (isWrong || isUnattended) {
        // Exclude general tab bars or headers like "Wrong Answers" or "All Questions" without a question number
        const isTabHeader = /^(all\s*questions|unanswered|correct\s*answers?|wrong\s*answers?)$/i.test(text);
        if (isTabHeader) continue;

        const clickable = el.closest('li, button, a, [role="button"], tr') || el;
        const numMatch = text.match(/(?:question\s*)?#?\b(\d+)\b/i);
        const isActive = clickable.classList.contains("active") ||
                         clickable.classList.contains("selected") ||
                         clickable.getAttribute("aria-selected") === "true";

        problemItems.push({
          element: clickable,
          type: isWrong ? "wrong" : "unattended",
          text: text.substring(0, 35).replace(/\s+/g, " "),
          hasNumber: !!numMatch,
          questionNumber: numMatch ? numMatch[1] : null,
          isActive
        });
      }
    }

    if (problemItems.length === 0) return null;

    // 1st priority: Inactive question item with number (e.g. "1 Wrong Answer")
    const numberedInactive = problemItems.find(item => item.hasNumber && !item.isActive);
    if (numberedInactive) return numberedInactive;

    // 2nd priority: Any inactive problem item
    const anyInactive = problemItems.find(item => !item.isActive);
    if (anyInactive) return anyInactive;

    // 3rd priority: Numbered active item (if currently on it)
    const numberedActive = problemItems.find(item => item.hasNumber);
    if (numberedActive) return numberedActive;

    return problemItems[0];
  }

  function findPreviousButton() {
    const candidates = document.querySelectorAll(
      'button, input[type="button"], a.btn, a[role="button"], div[role="button"], span[role="button"], .btn'
    );
    for (const el of candidates) {
      if (!isElementVisible(el)) continue;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
      const text = (el.innerText || el.textContent || el.value || "").trim();
      if (/^previous$/i.test(text) || /^prev$/i.test(text) || /^back$/i.test(text)) {
        return el;
      }
    }
    return null;
  }

  function findRetryButton() {
    const candidates = document.querySelectorAll(
      'button, input[type="button"], a.btn, a[role="button"], div[role="button"], span[role="button"], .btn'
    );
    for (const el of candidates) {
      if (!isElementVisible(el)) continue;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
      const text = (el.innerText || el.textContent || el.value || "").trim();
      if (/^try\s*again$/i.test(text) || /^retry$/i.test(text) || /^retake$/i.test(text)) {
        return el;
      }
    }
    return null;
  }

  /**
   * Check if an MCQ is already checked / answered
   */
  function isQuestionAnswered(question) {
    if (!question || !question.options) return false;
    return question.options.some(opt => {
      if (!opt.element) return false;
      if (opt.element.tagName === "INPUT" && opt.element.checked) return true;
      if (opt.element.getAttribute("aria-checked") === "true") return true;
      if (opt.element.classList.contains("selected") || opt.element.classList.contains("active") || opt.element.classList.contains("amcq-selected")) return true;
      const wrapper = opt.element.closest("label, .option, .choice, .answer-option, li, div");
      if (wrapper && (wrapper.classList.contains("selected") || wrapper.classList.contains("active") || wrapper.classList.contains("amcq-selected"))) return true;
      return false;
    });
  }

  // ---- Next / Submit Button Detection & Clicking ----

  /**
   * Denylist: button labels that should NEVER be auto-clicked.
   * Prevents false-positive clicks on destructive or irrelevant actions.
   */
  const BUTTON_DENYLIST = [
    /delete/i, /remove/i, /logout/i, /log\s*out/i, /sign\s*out/i,
    /unenroll/i, /drop\s*course/i, /withdraw/i, /cancel\s*enrollment/i,
    /reset/i, /clear/i, /erase/i, /discard/i,
    /pay/i, /purchase/i, /buy/i, /checkout/i, /subscribe/i,
    /close/i, /dismiss/i, /exit/i, /leave/i,
    /download/i, /export/i, /print/i, /share/i,
    /report/i, /flag/i, /block/i, /mute/i,
    /settings/i, /preferences/i, /profile/i, /account/i,
    /help/i, /support/i, /feedback/i, /contact/i
  ];

  function isDeniedButton(text) {
    return BUTTON_DENYLIST.some(pattern => pattern.test(text));
  }

  /**
   * Comprehensive Next/Submit button finder with safety guards
   */
  function findNextOrSubmitButton() {
    // Priority patterns for button labels (exact matches only)
    const targetTexts = [
      /^next$/i,
      /^next\s*question$/i,
      /^next\s*lesson$/i,
      /^next\s*topic$/i,
      /^next\s*activity$/i,
      /^submit$/i,
      /^submit\s*answer$/i,
      /^submit\s*quiz$/i,
      /^check$/i,
      /^check\s*answer$/i,
      /^continue$/i,
      /^complete\s*(&|and)?\s*continue$/i,
      /^finish$/i,
      /^finish\s*attempt$/i,
      /^proceed$/i,
      /^save\s*(&|and)?\s*next$/i
    ];

    // 1. Search button / a / div role="button" elements
    const candidates = document.querySelectorAll(
      'button, input[type="button"], input[type="submit"], a.btn, a[role="button"], div[role="button"], span[role="button"], .btn'
    );

    // Exact or strong regex matches first
    for (const pattern of targetTexts) {
      for (const el of candidates) {
        if (!isElementVisible(el)) continue;
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
        const text = (el.innerText || el.textContent || el.value || "").trim();
        if (text.length > 50) continue; // Skip elements with excessive text (likely containers)
        if (isDeniedButton(text)) continue;
        if (pattern.test(text)) {
          return el;
        }
      }
    }

    // 2. Partial text matches (with strict denylist)
    const partialDenyPatterns = /previous|back|cancel|all\s*questions|home|menu|overview|dashboard|library/i;
    for (const el of candidates) {
      if (!isElementVisible(el)) continue;
      if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
      const text = (el.innerText || el.textContent || el.value || "").trim();
      if (text.length > 50) continue;
      if (isDeniedButton(text)) continue;

      const lower = text.toLowerCase();
      if (partialDenyPatterns.test(lower)) continue;

      if (lower.includes("next") || lower.includes("submit") || lower.includes("continue")) {
        return el;
      }
    }

    // 3. Search by classes and data attributes (only specific quiz-related)
    const attrSelectors = [
      '[data-testid*="next" i]',
      '[data-testid*="submit" i]',
      '[aria-label*="next" i]',
      '[title*="next" i]',
      '.next-btn',
      '.btn-next',
      '.submit-btn',
      '.btn-submit',
      '.quiz-next',
      '.course-next'
    ];
    for (const sel of attrSelectors) {
      const match = document.querySelector(sel);
      if (match && isElementVisible(match) && !match.disabled) {
        const text = (match.innerText || match.textContent || "").trim();
        if (!isDeniedButton(text)) {
          return match;
        }
      }
    }

    return null;
  }

  function clickNextOrSubmitButton() {
    const btn = findNextOrSubmitButton();
    if (btn) {
      humanClick(btn);
      return true;
    }
    return false;
  }

  function manualClickNext() {
    const btn = findNextOrSubmitButton();
    if (btn) {
      humanClick(btn);
      showStatus("Clicked Next / Submit!", "success");
    } else {
      showStatus("No Next or Submit button detected.", "error");
    }
  }

  /**
   * Find syllabus / playlist next lesson link if on video/summary screen
   */
  function findAndClickNextLessonLink() {
    // Look for active item in course syllabus / playlist and click next sibling
    const activeItems = document.querySelectorAll(
      '.active, .current, [aria-selected="true"], [data-active="true"]'
    );
    for (const item of activeItems) {
      const parent = item.closest("li, div");
      const nextSibling = parent?.nextElementSibling;
      if (nextSibling) {
        const link = nextSibling.querySelector("a, button, [role='button']") || nextSibling;
        if (isElementVisible(link)) {
          humanClick(link);
          return true;
        }
      }
    }
    return false;
  }

  function humanClick(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (_) {}

    el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.click();
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ---- Question Extraction Engine ----

  function extractQuestions() {
    let questions = [];

    // Strategy 1: Look for common quiz/form patterns
    questions = extractFromForms();
    if (questions.length > 0) return questions;

    // Strategy 2: Look for radio/checkbox groups
    questions = extractFromInputGroups();
    if (questions.length > 0) return questions;

    // Strategy 3: Look for labeled question blocks (GUVI, Moodle, Canvas, etc.)
    questions = extractFromQuestionBlocks();
    if (questions.length > 0) return questions;

    // Strategy 4: Heuristic - look for numbered patterns in text
    questions = extractFromHeuristics();
    return questions;
  }

  function extractFromForms() {
    const questions = [];
    const forms = document.querySelectorAll("form");

    forms.forEach(form => {
      const inputNames = new Set();
      form.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
        if (input.name) inputNames.add(input.name);
      });

      inputNames.forEach(name => {
        const inputs = form.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
        if (inputs.length < 2) return;

        const type = inputs[0].type === "checkbox" ? "multi-choice" : "single-choice";
        const questionText = findQuestionText(inputs[0]);

        const options = [];
        inputs.forEach((input, idx) => {
          const label = findLabelForInput(input);
          options.push({
            text: label || `Option ${idx + 1}`,
            element: input,
            value: input.value
          });
        });

        if (questionText && options.length >= 2) {
          questions.push({ questionText, options, type, inputElements: inputs });
        }
      });
    });

    return questions;
  }

  function extractFromInputGroups() {
    const questions = [];
    const allInputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    const nameGroups = {};

    allInputs.forEach(input => {
      const name = input.name || input.getAttribute("data-question") || "";
      if (!name) return;
      if (!nameGroups[name]) nameGroups[name] = [];
      nameGroups[name].push(input);
    });

    Object.values(nameGroups).forEach(inputs => {
      if (inputs.length < 2) return;

      const type = inputs[0].type === "checkbox" ? "multi-choice" : "single-choice";
      const questionText = findQuestionText(inputs[0]);

      const options = inputs.map((input, idx) => ({
        text: findLabelForInput(input) || `Option ${idx + 1}`,
        element: input,
        value: input.value
      }));

      if (questionText && options.length >= 2) {
        questions.push({ questionText, options, type, inputElements: inputs });
      }
    });

    return questions;
  }

  function extractFromQuestionBlocks() {
    const questions = [];
    const selectors = [
      ".question", ".quiz-question", ".question-item", ".quiz-item",
      "[class*='question']", "[class*='quiz']", "[data-question]",
      ".assessment-item", ".test-question", ".exam-question",
      ".formulation", ".qtext", ".answer", ".que",
      "[data-params]", ".freebirdFormviewerViewItemsItemItem",
      ".que.multichoice", ".que.truefalse",
      ".question_holder", ".display_question",
      ".rc-Option", "[data-testid*='question']",
      // GUVI specific containers
      ".quiz-content", ".question-wrapper", "[class*='CoursePlayer']", "[class*='quiz']"
    ];

    const questionContainers = document.querySelectorAll(selectors.join(", "));

    questionContainers.forEach(container => {
      if (container.textContent.trim().length < 10) return;

      const qTextEl = container.querySelector(
        ".qtext, .question-text, .stem, h1, h2, h3, h4, p, [class*='question-text'], [class*='stem']"
      ) || container;

      const questionText = qTextEl.textContent.trim().split("\n")[0].trim();

      const optionElements = container.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], .option, .choice, .answer-option, ' +
        '[class*="option"], [class*="choice"], [role="radio"], [role="checkbox"], ' +
        '.rc-Option, li'
      );

      if (optionElements.length < 2) return;

      const type = optionElements[0].type === "checkbox" ||
                   optionElements[0].getAttribute("role") === "checkbox"
        ? "multi-choice" : "single-choice";

      const options = [];
      const seenText = new Set();

      optionElements.forEach((el, idx) => {
        let text = "";
        if (el.tagName === "INPUT") {
          text = findLabelForInput(el);
        } else {
          text = el.textContent.trim();
        }

        if (text && !seenText.has(text) && text.length > 0 && text.length < 500) {
          seenText.add(text);
          options.push({ text, element: el, value: el.value || text });
        }
      });

      if (questionText && options.length >= 2) {
        questions.push({ questionText, options, type, inputElements: optionElements });
      }
    });

    return questions;
  }

  function extractFromHeuristics() {
    const questions = [];
    const allElements = document.querySelectorAll("p, div, span, li, h3, h4, h5, td");
    const questionPattern = /^(?:Q?\d+[\.\):]?\s*|Question\s*\d*[\.\):]?\s*)/i;

    allElements.forEach(el => {
      const text = el.textContent.trim();
      if (text.length < 15 || text.length > 1000) return;
      if (!questionPattern.test(text) && !text.includes("?")) return;

      const parent = el.parentElement;
      if (!parent) return;

      const nearbyInputs = parent.querySelectorAll('input[type="radio"], input[type="checkbox"]');
      if (nearbyInputs.length < 2) return;

      const options = [];
      nearbyInputs.forEach((input, idx) => {
        options.push({
          text: findLabelForInput(input) || `Option ${idx + 1}`,
          element: input,
          value: input.value
        });
      });

      if (options.length >= 2) {
        questions.push({
          questionText: text,
          options,
          type: nearbyInputs[0].type === "checkbox" ? "multi-choice" : "single-choice",
          inputElements: nearbyInputs
        });
      }
    });

    return questions;
  }

  function findQuestionText(inputEl) {
    const ariaLabel = inputEl.closest("[aria-label]");
    if (ariaLabel) return ariaLabel.getAttribute("aria-label");

    let parent = inputEl.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      const heading = parent.querySelector("h1, h2, h3, h4, h5, h6, .qtext, .question-text, p");
      if (heading && heading.compareDocumentPosition(inputEl) & Node.DOCUMENT_POSITION_FOLLOWING) {
        const text = heading.textContent.trim();
        if (text.length > 5 && text.length < 1000) return text;
      }

      if (parent.className && /question|quiz|item/i.test(parent.className)) {
        const textNodes = [];
        for (const child of parent.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
            textNodes.push(child.textContent.trim());
          }
        }
        if (textNodes.length > 0) return textNodes[0];
      }

      parent = parent.parentElement;
    }

    let sibling = inputEl.parentElement?.previousElementSibling;
    for (let i = 0; i < 5 && sibling; i++) {
      const text = sibling.textContent.trim();
      if (text.length > 5 && text.length < 1000) return text;
      sibling = sibling.previousElementSibling;
    }

    return null;
  }

  function findLabelForInput(input) {
    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label) return label.textContent.trim();
    }

    const parentLabel = input.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input").forEach(i => i.remove());
      return clone.textContent.trim();
    }

    let nextEl = input.nextElementSibling;
    if (nextEl) {
      const text = nextEl.textContent.trim();
      if (text.length > 0 && text.length < 500) return text;
    }

    const nextText = input.nextSibling;
    if (nextText && nextText.nodeType === Node.TEXT_NODE) {
      return nextText.textContent.trim();
    }

    return input.value || "";
  }

  function extractVideoTranscript() {
    let transcript = "";

    const videos = document.querySelectorAll("video");
    videos.forEach(video => {
      const tracks = video.querySelectorAll("track");
      tracks.forEach(track => {
        if (track.track && track.track.cues) {
          const cues = Array.from(track.track.cues);
          cues.forEach(cue => {
            transcript += cue.text + " ";
          });
        }
      });
    });

    const transcriptSelectors = [
      ".transcript", ".video-transcript", ".caption-text", ".subtitle-text",
      "[class*='transcript']", "[class*='caption']", "[class*='subtitle']",
      ".rc-Transcript", ".video-transcript-body", "#transcript-container",
      ".ytd-transcript-renderer", "[data-purpose='transcript-cue-container']"
    ];

    const transcriptEls = document.querySelectorAll(transcriptSelectors.join(", "));
    transcriptEls.forEach(el => {
      transcript += el.textContent.trim() + "\n";
    });

    const descSelectors = [
      ".video-description", ".lesson-content", ".lecture-content",
      ".course-content", "[class*='description']", "[class*='lesson']"
    ];
    const descEls = document.querySelectorAll(descSelectors.join(", "));
    descEls.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > 50) {
        transcript += text + "\n";
      }
    });

    return transcript.trim();
  }

  // ---- Solving & Applying Answers ----

  async function startSolving(isCorrection = false) {
    if (isProcessing) {
      showStatus("Already processing...", "info");
      return;
    }
    isProcessing = true;

    try {
      showStatus(isCorrection ? "🔍 Re-evaluating question to correct error..." : "🔍 Extracting questions...", "info");
      const questions = extractQuestions();

      if (questions.length === 0) {
        showStatus("❌ No questions found on this page.", "error");
        isProcessing = false;
        return;
      }

      showStatus(`📝 Found ${questions.length} question(s). Extracting context...`, "info");
      const videoContext = extractVideoTranscript();

      const questionsData = questions.map(q => {
        let text = q.questionText;
        const wrongOpts = findWrongOptionsForQuestion(q);
        if (wrongOpts.length > 0) {
          text += ` [CRITICAL NOTE: The following choice(s) were previously selected and marked INCORRECT: "${wrongOpts.join('", "')}". Do NOT choose them! You MUST choose the correct answer from the other options.]`;
        }
        return {
          questionText: text,
          options: q.options.map(o => ({ text: o.text })),
          type: q.type
        };
      });

      const response = await chrome.runtime.sendMessage({
        action: "solveQuestions",
        data: { questions: questionsData, videoContext }
      });

      if (response.error) {
        showStatus(`❌ Error: ${response.error}`, "error");
        isProcessing = false;
        return;
      }

      showStatus("✅ Applying AI answers...", "info");
      applyAnswers(questions, response.answers);
      showStatus(`✅ Solved ${questions.length} question(s)!`, "success");

    } catch (err) {
      showStatus(`❌ Error: ${err.message}`, "error");
      console.error("Auto MCQ Solver error:", err);
    }

    isProcessing = false;
  }

  function applyAnswers(questions, answers) {
    answers.forEach(answer => {
      const qIdx = answer.questionIndex;
      if (qIdx < 0 || qIdx >= questions.length) return;

      const question = questions[qIdx];
      const selectedOptions = answer.selectedOptions || [0];

      // Remove previous amcq-selected highlights from all options of this question
      question.options.forEach(opt => {
        if (opt.element) {
          const wrapper = opt.element.closest("label, .option, .choice, .answer-option, li, div") || opt.element;
          wrapper.classList.remove("amcq-selected");
        }
      });

      selectedOptions.forEach(optIdx => {
        if (optIdx < 0 || optIdx >= question.options.length) return;
        const option = question.options[optIdx];

        if (option.element) {
          const el = option.element;
          if (el.tagName === "INPUT") {
            el.checked = true;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.click();
          } else if (el.getAttribute("role") === "radio" || el.getAttribute("role") === "checkbox") {
            el.click();
            el.setAttribute("aria-checked", "true");
          } else {
            el.click();
          }

          const wrapper = el.closest("label, .option, .choice, .answer-option, li, div") || el;
          wrapper.classList.add("amcq-selected");
        }
      });
    });
  }

  function extractAndShow() {
    const questions = extractQuestions();
    if (questions.length === 0) {
      showStatus("❌ No questions found. Page may use custom components.", "error");
      return;
    }
    console.log("=== Extracted Questions ===", questions);
    showStatus(`📋 Found ${questions.length} question(s). Check F12 console.`, "success");
  }

  function extractVideoContext() {
    const transcript = extractVideoTranscript();
    if (!transcript) {
      showStatus("🎬 No video transcript found.", "error");
      return;
    }
    console.log("=== Video Transcript ===", transcript);
    showStatus(`🎬 Found transcript (${transcript.length} chars).`, "success");
  }

  // ---- SPA URL & Navigation Watcher ----
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log("[Auto MCQ] Page/URL changed:", url);
      if (autoPilotEnabled) {
        setHUDStep("Page changed. Scanning in 2s...");
        scheduleNextStep(2000);
      }
    }
  }).observe(document, { subtree: true, childList: true });

  // ---- Message Listener ----
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Ping handler for on-demand injection check
    if (request.action === "ping") {
      sendResponse({ alive: true });
      return;
    }
    if (request.action === "triggerSolve") {
      startSolving().then(() => sendResponse({ done: true }));
      return true;
    }
    if (request.action === "triggerNext") {
      manualClickNext();
      sendResponse({ done: true });
    }
    if (request.action === "setAutoPilot") {
      setAutoPilot(request.enabled);
      if (request.speed) autoPilotVideoSpeed = parseFloat(request.speed);
      sendResponse({ autoPilotEnabled });
    }
    if (request.action === "getPageInfo") {
      const questions = extractQuestions();
      const transcript = extractVideoTranscript();
      const hasVideo = !!document.querySelector("video");
      const nextBtn = findNextOrSubmitButton();

      sendResponse({
        questionCount: questions.length,
        hasTranscript: transcript.length > 0,
        transcriptLength: transcript.length,
        hasVideo,
        hasNextButton: !!nextBtn,
        nextButtonText: nextBtn ? (nextBtn.textContent || "").trim() : null,
        autoPilotEnabled,
        autoPilotVideoSpeed,
        url: window.location.href,
        title: document.title
      });
    }
  });

  // ---- Initialize UI ----
  createFloatingUI();
  console.log("Auto MCQ Solver & Auto-Pilot loaded on", window.location.href);
})();
