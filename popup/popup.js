// ============================================================
// Popup Script - UI Logic for Extension Popup
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleKeyBtn = document.getElementById("toggleKey");
  const saveKeyBtn = document.getElementById("saveKey");
  const testKeyBtn = document.getElementById("testKey");
  const keyStatus = document.getElementById("keyStatus");
  const solveBtn = document.getElementById("solveBtn");
  const extractBtn = document.getElementById("extractBtn");
  const videoBtn = document.getElementById("videoBtn");
  const refreshInfoBtn = document.getElementById("refreshInfo");
  const pageTitle = document.getElementById("pageTitle");
  const questionCount = document.getElementById("questionCount");
  const videoInfo = document.getElementById("videoInfo");

  // ---- Load saved API key ----
  chrome.storage.local.get(["geminiApiKey"], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
      showKeyStatus("Key loaded from storage", "success");
    }
  });

  // ---- Toggle key visibility ----
  toggleKeyBtn.addEventListener("click", () => {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
    toggleKeyBtn.textContent = apiKeyInput.type === "password" ? "👁️" : "🙈";
  });

  // ---- Save API key ----
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

  // ---- Test API key ----
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

    if (response.success) {
      showKeyStatus("✅ API key works!", "success");
    } else {
      showKeyStatus(`❌ ${response.message}`, "error");
    }

    testKeyBtn.disabled = false;
    testKeyBtn.textContent = "Test";
  });

  // ---- Solve questions ----
  solveBtn.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showKeyStatus("Set your API key first!", "error");
      return;
    }

    // Save key if not already saved
    await chrome.storage.local.set({ geminiApiKey: key });

    solveBtn.disabled = true;
    solveBtn.textContent = "🔄 Solving...";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: "triggerSolve" }, (response) => {
      solveBtn.disabled = false;
      solveBtn.textContent = "🧠 Solve All Questions";
      if (chrome.runtime.lastError) {
        showKeyStatus("❌ Cannot reach page. Try refreshing.", "error");
      }
    });
  });

  // ---- Extract questions ----
  extractBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: "triggerExtract" }, () => {
      if (chrome.runtime.lastError) {
        showKeyStatus("❌ Cannot reach page. Try refreshing.", "error");
      }
    });
  });

  // ---- Video context ----
  videoBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: "triggerVideoContext" }, () => {
      if (chrome.runtime.lastError) {
        showKeyStatus("❌ Cannot reach page. Try refreshing.", "error");
      }
    });
  });

  // ---- Refresh page info ----
  refreshInfoBtn.addEventListener("click", scanPage);

  // ---- Scan page on popup open ----
  scanPage();

  // ---- Helper: Scan current page ----
  async function scanPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      pageTitle.textContent = tab.title || "Unknown page";

      chrome.tabs.sendMessage(tab.id, { action: "getPageInfo" }, (info) => {
        if (chrome.runtime.lastError || !info) {
          questionCount.textContent = "Unable to scan (refresh the page)";
          videoInfo.textContent = "Unable to scan";
          return;
        }

        questionCount.textContent = info.questionCount > 0
          ? `${info.questionCount} question(s) detected`
          : "No questions found";
        questionCount.style.color = info.questionCount > 0 ? "#065f46" : "#6b7280";

        videoInfo.textContent = info.hasTranscript
          ? `Transcript found (${info.transcriptLength} chars)`
          : "No transcript detected";
        videoInfo.style.color = info.hasTranscript ? "#065f46" : "#6b7280";
      });
    } catch (err) {
      pageTitle.textContent = "Error scanning page";
    }
  }

  // ---- Helper: Show key status ----
  function showKeyStatus(msg, type) {
    keyStatus.textContent = msg;
    keyStatus.className = `status-msg status-${type}`;
    keyStatus.style.display = "block";

    if (type === "success") {
      setTimeout(() => { keyStatus.style.display = "none"; }, 3000);
    }
  }
});
