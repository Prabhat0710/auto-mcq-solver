// ============================================================
// Popup Script - Auto MCQ Solver & Cloudflare Proxy Logic
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const backendBadge = document.getElementById("backendBadge");
  const backendBadgeText = document.getElementById("backendBadgeText");

  const proxyUrlInput = document.getElementById("proxyUrl");
  const saveProxyBtn = document.getElementById("saveProxy");
  const testProxyBtn = document.getElementById("testProxy");
  const proxyStatus = document.getElementById("proxyStatus");

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

  // ---- Load Saved Configuration ----
  chrome.storage.local.get(
    ["geminiApiKey", "proxyUrl", "autoPilotEnabled", "autoPilotVideoSpeed"],
    (result) => {
      if (result.proxyUrl) {
        proxyUrlInput.value = result.proxyUrl;
      }
      if (result.geminiApiKey) {
        apiKeyInput.value = result.geminiApiKey;
      }
      if (result.autoPilotEnabled !== undefined) {
        autoPilotToggle.checked = !!result.autoPilotEnabled;
      }
      if (result.autoPilotVideoSpeed) {
        videoSpeedSelect.value = result.autoPilotVideoSpeed.toString();
      }
      updateBackendBadge(result.proxyUrl, result.geminiApiKey);
    }
  );

  function updateBackendBadge(proxyUrl, apiKey) {
    if (apiKey && apiKey.trim()) {
      backendBadge.className = "backend-badge badge-online";
      backendBadgeText.textContent = "🔑 Using Custom Gemini Key";
    } else if (proxyUrl && proxyUrl.trim()) {
      backendBadge.className = "backend-badge badge-online";
      backendBadgeText.textContent = "⚡ Cloudflare Proxy Active (Keyless)";
    } else {
      backendBadge.className = "backend-badge badge-offline";
      backendBadgeText.textContent = "⚠️ Configure Proxy or Key below";
    }
  }

  // ---- Proxy URL Handlers ----
  saveProxyBtn.addEventListener("click", () => {
    const url = proxyUrlInput.value.trim();
    chrome.storage.local.set({ proxyUrl: url }, () => {
      showStatus(proxyStatus, url ? "✅ Proxy URL saved!" : "Proxy cleared", "success");
      chrome.storage.local.get(["geminiApiKey"], (res) => {
        updateBackendBadge(url, res.geminiApiKey);
      });
    });
  });

  testProxyBtn.addEventListener("click", async () => {
    const url = proxyUrlInput.value.trim();
    if (!url) {
      showStatus(proxyStatus, "Please enter a Worker URL first", "error");
      return;
    }

    testProxyBtn.disabled = true;
    testProxyBtn.textContent = "Testing...";
    showStatus(proxyStatus, "Connecting to Cloudflare...", "info");

    const response = await chrome.runtime.sendMessage({
      action: "testProxyUrl",
      proxyUrl: url
    });

    if (response?.success) {
      showStatus(proxyStatus, `✅ ${response.message}`, "success");
    } else {
      showStatus(proxyStatus, `❌ ${response?.message || "Failed to reach proxy"}`, "error");
    }

    testProxyBtn.disabled = false;
    testProxyBtn.textContent = "Test";
  });

  // ---- Custom API Key Handlers ----
  toggleKeyBtn.addEventListener("click", () => {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
    toggleKeyBtn.textContent = apiKeyInput.type === "password" ? "👁️" : "🙈";
  });

  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      showStatus(keyStatus, key ? "✅ API key saved!" : "Key cleared", "success");
      chrome.storage.local.get(["proxyUrl"], (res) => {
        updateBackendBadge(res.proxyUrl, key);
      });
    });
  });

  testKeyBtn.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showStatus(keyStatus, "Please enter an API key first", "error");
      return;
    }

    testKeyBtn.disabled = true;
    testKeyBtn.textContent = "Testing...";
    showStatus(keyStatus, "Testing API key...", "info");

    const response = await chrome.runtime.sendMessage({
      action: "testApiKey",
      apiKey: key
    });

    if (response?.success) {
      showStatus(keyStatus, "✅ Gemini API key works!", "success");
    } else {
      showStatus(keyStatus, `❌ ${response?.message || "Test failed"}`, "error");
    }

    testKeyBtn.disabled = false;
    testKeyBtn.textContent = "Test";
  });

  // ---- Auto-Pilot Toggle ----
  autoPilotToggle.addEventListener("change", async () => {
    const enabled = autoPilotToggle.checked;
    const speed = videoSpeedSelect.value;

    await chrome.storage.local.set({
      autoPilotEnabled: enabled,
      autoPilotVideoSpeed: parseFloat(speed)
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "setAutoPilot",
        enabled,
        speed
      });
    }
  });

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

  // ---- Solve & Navigation Buttons ----
  solveBtn.addEventListener("click", async () => {
    solveBtn.disabled = true;
    solveBtn.textContent = "🔄 Solving...";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: "triggerSolve" }, () => {
      solveBtn.disabled = false;
      solveBtn.textContent = "🧠 Solve Current Questions";
    });
  });

  nextBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { action: "triggerNext" });
  });

  extractBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: "triggerExtract" });
  });

  videoBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: "triggerVideoContext" });
  });

  refreshInfoBtn.addEventListener("click", scanPage);
  scanPage();

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

        questionCount.textContent = info.questionCount > 0
          ? `${info.questionCount} question(s) detected`
          : "No questions on screen";
        questionCount.style.color = info.questionCount > 0 ? "#065f46" : "#64748b";

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

        if (info.hasNextButton) {
          nextBtnInfo.textContent = `Found: '${info.nextButtonText || "Next"}'`;
          nextBtnInfo.style.color = "#065f46";
        } else {
          nextBtnInfo.textContent = "No Next/Submit button found";
          nextBtnInfo.style.color = "#64748b";
        }

        if (info.autoPilotEnabled !== undefined) {
          autoPilotToggle.checked = info.autoPilotEnabled;
        }
      });
    } catch (_) {
      pageTitle.textContent = "Error scanning tab";
    }
  }

  function showStatus(element, msg, type) {
    if (!element) return;
    element.textContent = msg;
    element.className = `status-msg status-${type}`;
    element.style.display = "block";

    if (type === "success" || type === "info") {
      setTimeout(() => { element.style.display = "none"; }, 3500);
    }
  }
});
