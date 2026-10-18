// ============================================================
// Popup Script - Auto MCQ Solver & Auto-Pilot UI Logic
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleKeyBtn = document.getElementById("toggleKey");
  const saveKeyBtn = document.getElementById("saveKey");
  const testKeyBtn = document.getElementById("testKey");
  const keyStatus = document.getElementById("keyStatus");

  const autoPilotToggle = document.getElementById("autoPilotToggle");
  const videoSpeedSelect = document.getElementById("videoSpeedSelect");

  const solveBtn = document.getElementById("solveBtn");
  const nextBtn = document.getElementById("nextBtn");
  const extractBtn = document.getElementById("extractBtn");
  const videoBtn = document.getElementById("videoBtn");
  const refreshInfoBtn = document.getElementById("refreshInfo");

  const pageTitle = document.getElementById("pageTitle");
  const questionCount = document.getElementById("questionCount");
  const videoInfo = document.getElementById("videoInfo");
  const nextBtnInfo = document.getElementById("nextBtnInfo");

  // ---- Load saved preferences ----
  chrome.storage.local.get(["geminiApiKey", "autoPilotEnabled", "autoPilotVideoSpeed"], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    if (result.autoPilotEnabled !== undefined) {
      autoPilotToggle.checked = !!result.autoPilotEnabled;
    }
    if (result.autoPilotVideoSpeed) {
      videoSpeedSelect.value = result.autoPilotVideoSpeed.toString();
    }
  });

  // ---- Auto-Pilot Toggle ----
  autoPilotToggle.addEventListener("change", async () => {
    const enabled = autoPilotToggle.checked;
    const speed = videoSpeedSelect.value;

    await chrome.storage.local.set({
      autoPilotEnabled: enabled,
      autoPilotVideoSpeed: parseFloat(speed)
    });

    // Notify active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "setAutoPilot",
        enabled,
        speed
      });
    }

    showKeyStatus(
      enabled ? "🚀 Auto-Pilot Started!" : "⏹️ Auto-Pilot Stopped",
      enabled ? "success" : "info"
    );
  });

  // ---- Video Speed Change ----
  videoSpeedSelect.addEventListener("change", async () => {
    const speed = parseFloat(videoSpeedSelect.value);
    await chrome.storage.local.set({ autoPilotVideoSpeed: speed });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "setAutoPilot",
        enabled: autoPilotToggle.checked,
        speed
      });
    }
  });

  // ---- Toggle API Key Visibility ----
  toggleKeyBtn.addEventListener("click", () => {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
    toggleKeyBtn.textContent = apiKeyInput.type === "password" ? "👁️" : "🙈";
  });

  // ---- Save API Key ----
  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showKeyStatus("Please enter an API key", "error");
      return;
    }
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      showKeyStatus("✅ API key saved!", "success");
    });
  });

  // ---- Test API Key ----
  testKeyBtn.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showKeyStatus("Please enter an API key first", "error");
      return;
    }

    testKeyBtn.disabled = true;
    testKeyBtn.textContent = "Testing...";
    showKeyStatus("Testing API key...", "info");

    const response = await chrome.runtime.sendMessage({
      action: "testApiKey",
      apiKey: key
    });

    if (response?.success) {
      showKeyStatus("✅ API key works!", "success");
    } else {
      showKeyStatus(`❌ ${response?.message || "Test failed"}`, "error");
    }

    testKeyBtn.disabled = false;
    testKeyBtn.textContent = "Test";
  });

  // ---- Manual Solve Current Questions ----
  solveBtn.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showKeyStatus("Set your API key first!", "error");
      return;
    }

    await chrome.storage.local.set({ geminiApiKey: key });

    solveBtn.disabled = true;
    solveBtn.textContent = "🔄 Solving...";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "triggerSolve" }, () => {
      solveBtn.disabled = false;
      solveBtn.textContent = "🧠 Solve Current Questions";
      if (chrome.runtime.lastError) {
        showKeyStatus("❌ Cannot reach page. Please refresh the tab.", "error");
      }
    });
  });

  // ---- Manual Next Button ----
  nextBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "triggerNext" }, () => {
      if (chrome.runtime.lastError) {
        showKeyStatus("❌ Cannot reach page.", "error");
      }
    });
  });

  // ---- Extract Questions ----
  extractBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "triggerExtract" });
  });

  // ---- Video Context ----
  videoBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "triggerVideoContext" });
  });

  // ---- Refresh Info ----
  refreshInfoBtn.addEventListener("click", scanPage);

  // Scan immediately
  scanPage();

  // ---- Scan Page ----
  async function scanPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      pageTitle.textContent = tab.title || "Unknown page";

      chrome.tabs.sendMessage(tab.id, { action: "getPageInfo" }, (info) => {
        if (chrome.runtime.lastError || !info) {
          questionCount.textContent = "Unable to scan (refresh page)";
          videoInfo.textContent = "No video scan";
          nextBtnInfo.textContent = "No button scan";
          return;
        }

        // Questions
        questionCount.textContent = info.questionCount > 0
          ? `${info.questionCount} question(s) detected`
          : "No questions on screen";
        questionCount.style.color = info.questionCount > 0 ? "#065f46" : "#64748b";

        // Video
        if (info.hasVideo) {
          videoInfo.textContent = info.hasTranscript
            ? `Video detected + Transcript (${info.transcriptLength} chars)`
            : "Video detected (no transcript)";
          videoInfo.style.color = "#065f46";
        } else {
          videoInfo.textContent = info.hasTranscript
            ? `Transcript found (${info.transcriptLength} chars)`
            : "No video detected";
          videoInfo.style.color = "#64748b";
        }

        // Next Button
        if (info.hasNextButton) {
          nextBtnInfo.textContent = `Found: '${info.nextButtonText || "Next"}'`;
          nextBtnInfo.style.color = "#065f46";
        } else {
          nextBtnInfo.textContent = "No Next/Submit button found";
          nextBtnInfo.style.color = "#64748b";
        }

        // Sync toggle
        if (info.autoPilotEnabled !== undefined) {
          autoPilotToggle.checked = info.autoPilotEnabled;
        }
      });
    } catch (_) {
      pageTitle.textContent = "Error scanning tab";
    }
  }

  function showKeyStatus(msg, type) {
    keyStatus.textContent = msg;
    keyStatus.className = `status-msg status-${type}`;
    keyStatus.style.display = "block";

    if (type === "success" || type === "info") {
      setTimeout(() => { keyStatus.style.display = "none"; }, 3500);
    }
  }
});
