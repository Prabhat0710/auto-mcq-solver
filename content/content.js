// ============================================================
// Content Script - Scrapes MCQs and Video Context from Pages
// ============================================================

(function () {
  "use strict";

  // Avoid double-injection
  if (window.__autoMcqSolverInjected) return;
  window.__autoMcqSolverInjected = true;

  // ---- State ----
  let isProcessing = false;
  let floatingBtn = null;
  let statusPanel = null;

  // ---- Create Floating Action Button ----
  function createFloatingUI() {
    // Main solve button
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
        <button class="amcq-menu-btn" data-action="solve">🧠 Solve Questions</button>
        <button class="amcq-menu-btn" data-action="extract">📋 Extract Only</button>
        <button class="amcq-menu-btn" data-action="video">🎬 Get Video Context</button>
      </div>
    `;
    document.body.appendChild(floatingBtn);

    // Status panel
    statusPanel = document.createElement("div");
    statusPanel.id = "amcq-status";
    statusPanel.style.display = "none";
    document.body.appendChild(statusPanel);

    // Event listeners
    floatingBtn.querySelector(".amcq-fab-btn").addEventListener("click", toggleMenu);

    floatingBtn.querySelectorAll(".amcq-menu-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const action = e.target.dataset.action;
        toggleMenu(); // close menu
        if (action === "solve") startSolving();
        if (action === "extract") extractAndShow();
        if (action === "video") extractVideoContext();
      });
    });
  }

  function toggleMenu() {
    const menu = floatingBtn.querySelector(".amcq-fab-menu");
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
  }

  function showStatus(msg, type = "info") {
    statusPanel.style.display = "block";
    statusPanel.className = `amcq-status-${type}`;
    statusPanel.textContent = msg;
    if (type === "success" || type === "error") {
      setTimeout(() => { statusPanel.style.display = "none"; }, 5000);
    }
  }

  // ---- Question Extraction Engine ----

  /**
   * Main extraction function - tries multiple strategies to find MCQs
   */
  function extractQuestions() {
    let questions = [];

    // Strategy 1: Look for common quiz/form patterns
    questions = extractFromForms();
    if (questions.length > 0) return questions;

    // Strategy 2: Look for radio/checkbox groups
    questions = extractFromInputGroups();
    if (questions.length > 0) return questions;

    // Strategy 3: Look for labeled question blocks (common in LMS)
    questions = extractFromQuestionBlocks();
    if (questions.length > 0) return questions;

    // Strategy 4: Heuristic - look for numbered patterns in text
    questions = extractFromHeuristics();
    return questions;
  }

  /**
   * Strategy 1: Extract from <form> elements with radio/checkbox inputs
   */
  function extractFromForms() {
    const questions = [];
    const forms = document.querySelectorAll("form");

    forms.forEach(form => {
      // Find groups of inputs with the same name (each group = 1 question)
      const inputNames = new Set();
      form.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
        if (input.name) inputNames.add(input.name);
      });

      inputNames.forEach(name => {
        const inputs = form.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
        if (inputs.length < 2) return;

        const type = inputs[0].type === "checkbox" ? "multi-choice" : "single-choice";

        // Find the question text - look for preceding label, heading, or text
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

  /**
   * Strategy 2: Extract from any radio/checkbox input groups (not in forms)
   */
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

  /**
   * Strategy 3: Look for common LMS question block patterns
   * (e.g., div.question, div.quiz-item, li.question-item, etc.)
   */
  function extractFromQuestionBlocks() {
    const questions = [];
    const selectors = [
      ".question", ".quiz-question", ".question-item", ".quiz-item",
      "[class*='question']", "[class*='quiz']", "[data-question]",
      ".assessment-item", ".test-question", ".exam-question",
      // Common LMS selectors
      ".formulation", ".qtext", ".answer", ".que",
      // Google Forms
      "[data-params]", ".freebirdFormviewerViewItemsItemItem",
      // Moodle
      ".que.multichoice", ".que.truefalse",
      // Canvas LMS
      ".question_holder", ".display_question",
      // Coursera / edX
      ".rc-Option", "[data-testid*='question']"
    ];

    const questionContainers = document.querySelectorAll(selectors.join(", "));

    questionContainers.forEach(container => {
      // Skip if too small (likely not a question)
      if (container.textContent.trim().length < 10) return;

      // Find the question text within
      const qTextEl = container.querySelector(
        ".qtext, .question-text, .stem, h3, h4, p, [class*='question-text'], [class*='stem']"
      ) || container;

      const questionText = qTextEl.textContent.trim().split("\n")[0].trim();

      // Find options
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

        // De-duplicate
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

  /**
   * Strategy 4: Heuristic extraction - look for numbered question patterns
   */
  function extractFromHeuristics() {
    const questions = [];

    // Look for elements that look like questions (numbered, ending with ?)
    const allElements = document.querySelectorAll("p, div, span, li, h3, h4, h5, td");
    const questionPattern = /^(?:Q?\d+[\.\):]?\s*|Question\s*\d*[\.\):]?\s*)/i;

    allElements.forEach(el => {
      const text = el.textContent.trim();
      if (text.length < 15 || text.length > 1000) return;
      if (!questionPattern.test(text) && !text.includes("?")) return;

      // Check if this element has nearby radio/checkbox options
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

  // ---- Helper functions ----

  /**
   * Find the question text for a given input element
   */
  function findQuestionText(inputEl) {
    // 1. Check for aria-label
    const ariaLabel = inputEl.closest("[aria-label]");
    if (ariaLabel) return ariaLabel.getAttribute("aria-label");

    // 2. Walk up to find a question container
    let parent = inputEl.parentElement;
    for (let i = 0; i < 8 && parent; i++) {
      // Look for a heading or question text element before the inputs
      const heading = parent.querySelector("h1, h2, h3, h4, h5, h6, .qtext, .question-text, p");
      if (heading && heading.compareDocumentPosition(inputEl) & Node.DOCUMENT_POSITION_FOLLOWING) {
        const text = heading.textContent.trim();
        if (text.length > 5 && text.length < 1000) return text;
      }

      // Check if the parent has relevant class names
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

    // 3. Check preceding siblings
    let sibling = inputEl.parentElement?.previousElementSibling;
    for (let i = 0; i < 5 && sibling; i++) {
      const text = sibling.textContent.trim();
      if (text.length > 5 && text.length < 1000) return text;
      sibling = sibling.previousElementSibling;
    }

    return null;
  }

  /**
   * Find the label text for an input element
   */
  function findLabelForInput(input) {
    // 1. Check for <label for="...">
    if (input.id) {
      const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label) return label.textContent.trim();
    }

    // 2. Check parent <label>
    const parentLabel = input.closest("label");
    if (parentLabel) {
      // Get text content excluding the input itself
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input").forEach(i => i.remove());
      return clone.textContent.trim();
    }

    // 3. Check next sibling
    let nextEl = input.nextElementSibling;
    if (nextEl) {
      const text = nextEl.textContent.trim();
      if (text.length > 0 && text.length < 500) return text;
    }

    // 4. Check adjacent text nodes
    const nextText = input.nextSibling;
    if (nextText && nextText.nodeType === Node.TEXT_NODE) {
      return nextText.textContent.trim();
    }

    return input.value || "";
  }

  // ---- Video Context Extraction ----

  /**
   * Extract video transcript/subtitles from the page
   */
  function extractVideoTranscript() {
    let transcript = "";

    // 1. Look for HTML5 <track> elements (subtitles/captions)
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

    // 2. Look for transcript containers (common in LMS platforms)
    const transcriptSelectors = [
      ".transcript", ".video-transcript", ".caption-text", ".subtitle-text",
      "[class*='transcript']", "[class*='caption']", "[class*='subtitle']",
      ".rc-Transcript", // Coursera
      ".video-transcript-body", // edX
      "#transcript-container",
      ".ytd-transcript-renderer", // YouTube
      "[data-purpose='transcript-cue-container']" // Udemy
    ];

    const transcriptEls = document.querySelectorAll(transcriptSelectors.join(", "));
    transcriptEls.forEach(el => {
      transcript += el.textContent.trim() + "\n";
    });

    // 3. Look for any visible text that might be a transcript/description
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

  // ---- Core Actions ----

  /**
   * Main action: Extract questions, get video context, send to AI, apply answers
   */
  async function startSolving() {
    if (isProcessing) {
      showStatus("Already processing...", "info");
      return;
    }
    isProcessing = true;

    try {
      showStatus("🔍 Extracting questions from page...", "info");
      const questions = extractQuestions();

      if (questions.length === 0) {
        showStatus("❌ No questions found on this page. Try 'Extract Only' to debug.", "error");
        isProcessing = false;
        return;
      }

      showStatus(`📝 Found ${questions.length} question(s). Extracting video context...`, "info");

      // Get video context
      const videoContext = extractVideoTranscript();
      if (videoContext) {
        showStatus(`🎬 Found video context (${videoContext.length} chars). Sending to AI...`, "info");
      } else {
        showStatus(`🧠 No video context found. Sending ${questions.length} question(s) to AI...`, "info");
      }

      // Prepare questions data for API
      const questionsData = questions.map(q => ({
        questionText: q.questionText,
        options: q.options.map(o => ({ text: o.text })),
        type: q.type
      }));

      // Send to background script for AI processing
      const response = await chrome.runtime.sendMessage({
        action: "solveQuestions",
        data: { questions: questionsData, videoContext }
      });

      if (response.error) {
        showStatus(`❌ Error: ${response.error}`, "error");
        isProcessing = false;
        return;
      }

      // Apply answers
      showStatus("✅ Got answers! Applying...", "info");
      applyAnswers(questions, response.answers);

      showStatus(`✅ Done! Solved ${questions.length} question(s).`, "success");

    } catch (err) {
      showStatus(`❌ Error: ${err.message}`, "error");
      console.error("Auto MCQ Solver error:", err);
    }

    isProcessing = false;
  }

  /**
   * Apply AI answers to the page
   */
  function applyAnswers(questions, answers) {
    answers.forEach(answer => {
      const qIdx = answer.questionIndex;
      if (qIdx < 0 || qIdx >= questions.length) return;

      const question = questions[qIdx];
      const selectedOptions = answer.selectedOptions || [0];

      selectedOptions.forEach(optIdx => {
        if (optIdx < 0 || optIdx >= question.options.length) return;
        const option = question.options[optIdx];

        // Click/select the option
        if (option.element) {
          const el = option.element;

          if (el.tagName === "INPUT") {
            // Radio or checkbox
            el.checked = true;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.click();
          } else if (el.getAttribute("role") === "radio" || el.getAttribute("role") === "checkbox") {
            // ARIA role-based
            el.click();
            el.setAttribute("aria-checked", "true");
          } else {
            // Generic clickable element
            el.click();
          }

          // Visual feedback - highlight selected answer
          el.closest("label, .option, .choice, .answer-option, li, div")
            ?.classList.add("amcq-selected");
        }
      });

      // Log reasoning
      console.log(
        `Q${qIdx + 1}: ${question.questionText.substring(0, 60)}...`,
        `\nAnswer: ${selectedOptions.map(i => question.options[i]?.text).join(", ")}`,
        `\nConfidence: ${answer.confidence}`,
        `\nReasoning: ${answer.reasoning}`
      );
    });
  }

  /**
   * Extract and display questions (debug mode)
   */
  function extractAndShow() {
    const questions = extractQuestions();

    if (questions.length === 0) {
      showStatus("❌ No questions found. The page may use an unsupported format.", "error");
      console.log("Auto MCQ Solver: No questions detected. Page HTML structure may not match known patterns.");
      return;
    }

    console.log("=== Auto MCQ Solver: Extracted Questions ===");
    questions.forEach((q, i) => {
      console.log(`\nQ${i + 1}: ${q.questionText}`);
      console.log(`Type: ${q.type}`);
      q.options.forEach((opt, j) => {
        console.log(`  ${String.fromCharCode(65 + j)}) ${opt.text}`);
      });
    });

    showStatus(`📋 Found ${questions.length} question(s). Check browser console (F12) for details.`, "success");
  }

  /**
   * Extract and display video context
   */
  function extractVideoContext() {
    const transcript = extractVideoTranscript();

    if (!transcript) {
      showStatus("🎬 No video transcript/subtitles found on this page.", "error");
      return;
    }

    console.log("=== Auto MCQ Solver: Video Context ===");
    console.log(transcript);

    showStatus(`🎬 Found transcript (${transcript.length} chars). Check console (F12).`, "success");
  }

  // ---- Listen for messages from popup ----
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerSolve") {
      startSolving().then(() => sendResponse({ done: true }));
      return true;
    }
    if (request.action === "triggerExtract") {
      extractAndShow();
      sendResponse({ done: true });
    }
    if (request.action === "triggerVideoContext") {
      extractVideoContext();
      sendResponse({ done: true });
    }
    if (request.action === "getPageInfo") {
      const questions = extractQuestions();
      const transcript = extractVideoTranscript();
      sendResponse({
        questionCount: questions.length,
        hasTranscript: transcript.length > 0,
        transcriptLength: transcript.length,
        url: window.location.href,
        title: document.title
      });
    }
  });

  // ---- Initialize ----
  createFloatingUI();
  console.log("Auto MCQ Solver: Content script loaded on", window.location.href);
})();
